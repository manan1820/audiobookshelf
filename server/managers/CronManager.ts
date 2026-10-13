import { Op } from 'sequelize'
import cron from '../libs/nodeCron'
import Logger from '../Logger'
import Database from '../Database'
import LibraryScanner from '../scanner/LibraryScanner'
import ShareManager from './ShareManager'
import type PodcastManager from './PodcastManager'
import type PlaybackSessionManager from './PlaybackSessionManager'
import type Library from '../models/Library'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'

function isPodcastMedia(media: LibraryItem['media']): media is Podcast {
  return !!media && 'autoDownloadEpisodes' in media
}

interface CronTask {
  stop?: () => void
}

interface LibraryScanCron {
  libraryId: string
  expression: string
  task: CronTask
}

interface PodcastCron {
  libraryItemIds: string[]
  expression: string
  task: CronTask
}

class CronManager {
  podcastManager: PodcastManager
  playbackSessionManager: PlaybackSessionManager
  libraryScanCrons: LibraryScanCron[]
  podcastCrons: PodcastCron[]
  podcastCronExpressionsExecuting: string[]

  constructor(podcastManager: PodcastManager, playbackSessionManager: PlaybackSessionManager) {
    this.podcastManager = podcastManager
    this.playbackSessionManager = playbackSessionManager
    this.libraryScanCrons = []
    this.podcastCrons = []
    this.podcastCronExpressionsExecuting = []
  }

  async init(libraries: Library[]): Promise<void> {
    this.initOpenSessionCleanupCron()
    this.initLibraryScanCrons(libraries)
    await this.initPodcastCrons()
  }

  initOpenSessionCleanupCron(): void {
    cron.schedule('30 0 * * *', async () => {
      Logger.debug('[CronManager] Open session cleanup cron executing')
      ShareManager.closeStaleOpenShareSessions()
      await this.playbackSessionManager.closeStaleOpenSessions()
      await Database.cleanupExpiredSessions()
      await Database.deactivateExpiredApiKeys()
    })
  }

  initLibraryScanCrons(libraries: Library[]): void {
    for (const library of libraries) {
      if (library.settings?.autoScanCronExpression) {
        this.startCronForLibrary(library)
      }
    }
  }

  startCronForLibrary(_library: Library): void {
    const expression = _library.settings?.autoScanCronExpression
    if (!expression) return

    Logger.debug(`[CronManager] Init library scan cron for ${_library.name} on schedule ${expression}`)
    const libScanCron = cron.schedule(expression, async () => {
      const library = await Database.libraryModel.findByIdWithFolders(_library.id)
      if (!library) {
        Logger.error(`[CronManager] Library not found for scan cron ${_library.id}`)
      } else {
        Logger.debug(`[CronManager] Library scan cron executing for ${library.name}`)
        void LibraryScanner.scan(library)
      }
    }) as CronTask

    this.libraryScanCrons.push({
      libraryId: _library.id,
      expression,
      task: libScanCron
    })
  }

  removeCronForLibrary(library: Library): void {
    Logger.debug(`[CronManager] Removing library scan cron for ${library.name}`)
    this.libraryScanCrons = this.libraryScanCrons.filter((lsc) => lsc.libraryId !== library.id)
  }

  updateLibraryScanCron(library: Library): void {
    const expression = library.settings?.autoScanCronExpression
    const existingCron = this.libraryScanCrons.find((lsc) => lsc.libraryId === library.id)

    if (!expression && existingCron) {
      if (existingCron.task.stop) existingCron.task.stop()
      this.removeCronForLibrary(library)
    } else if (!existingCron && expression) {
      this.startCronForLibrary(library)
    } else if (existingCron && existingCron.expression !== expression) {
      if (existingCron.task.stop) existingCron.task.stop()
      this.removeCronForLibrary(library)
      this.startCronForLibrary(library)
    }
  }

  async initPodcastCrons(): Promise<void> {
    const cronExpressionMap: { [key: string]: { expression: string; libraryItemIds: string[] } } = {}

    const podcastsWithAutoDownload = await Database.podcastModel.findAll({
      where: {
        autoDownloadEpisodes: true,
        autoDownloadSchedule: {
          [Op.not]: null
        }
      },
      include: {
        model: Database.libraryItemModel
      }
    })

    for (const podcast of podcastsWithAutoDownload) {
      if (!podcast.autoDownloadSchedule || !podcast.libraryItem) continue
      if (!cronExpressionMap[podcast.autoDownloadSchedule]) {
        cronExpressionMap[podcast.autoDownloadSchedule] = {
          expression: podcast.autoDownloadSchedule,
          libraryItemIds: []
        }
      }
      cronExpressionMap[podcast.autoDownloadSchedule].libraryItemIds.push(podcast.libraryItem.id)
    }

    const expressions = Object.keys(cronExpressionMap)
    if (!expressions.length) return

    Logger.debug(`[CronManager] Found ${expressions.length} podcast episode schedules to start`)
    for (const expression of expressions) {
      this.startPodcastCron(expression, cronExpressionMap[expression].libraryItemIds)
    }
  }

  startPodcastCron(expression: string, libraryItemIds: string[]): void {
    try {
      if (!cron.validate(expression)) {
        Logger.error(`[CronManager] Invalid auto download schedule cron expression "${expression}" - not starting podcast episode check cron`)
        return
      }

      Logger.debug(`[CronManager] Scheduling podcast episode check cron "${expression}" for ${libraryItemIds.length} item(s)`)
      const task = cron.schedule(expression, () => {
        if (this.podcastCronExpressionsExecuting.includes(expression)) {
          Logger.warn(`[CronManager] Podcast cron "${expression}" is already executing`)
        } else {
          void this.executePodcastCron(expression)
        }
      }) as CronTask

      this.podcastCrons.push({
        libraryItemIds,
        expression,
        task
      })
    } catch (error: unknown) {
      Logger.error(`[PodcastManager] Failed to schedule podcast cron ${expression}`, error)
    }
  }

  async executePodcastCron(expression: string): Promise<void> {
    const podcastCron = this.podcastCrons.find((c) => c.expression === expression)
    if (!podcastCron) {
      Logger.error(`[CronManager] Podcast cron not found for expression ${expression}`)
      return
    }
    this.podcastCronExpressionsExecuting.push(expression)

    const libraryItemIds = [...podcastCron.libraryItemIds]
    Logger.debug(`[CronManager] Start executing podcast cron ${expression} for ${libraryItemIds.length} item(s)`)

    // Get podcast library items to check
    const libraryItems: LibraryItem[] = []
    for (const libraryItemId of libraryItemIds) {
      const libraryItem = await Database.libraryItemModel.getExpandedById(libraryItemId)
      if (!libraryItem) {
        Logger.error(`[CronManager] Library item ${libraryItemId} not found for episode check cron ${expression}`)
        podcastCron.libraryItemIds = podcastCron.libraryItemIds.filter((lid) => lid !== libraryItemId)
      } else {
        libraryItems.push(libraryItem)
      }
    }

    // Run episode checks
    for (const libraryItem of libraryItems) {
      const keepAutoDownloading = await this.podcastManager.runEpisodeCheck(libraryItem)
      if (!keepAutoDownloading) {
        // auto download was disabled
        podcastCron.libraryItemIds = podcastCron.libraryItemIds.filter((lid) => lid !== libraryItem.id)
      }
    }

    // Stop and remove cron if no more library items
    if (!podcastCron.libraryItemIds.length) {
      this.removePodcastEpisodeCron(podcastCron)
      return
    }

    Logger.debug(`[CronManager] Finished executing podcast cron ${expression} for ${libraryItems.length} item(s)`)
    this.podcastCronExpressionsExecuting = this.podcastCronExpressionsExecuting.filter((exp) => exp !== expression)
  }

  removePodcastEpisodeCron(podcastCron: PodcastCron): void {
    Logger.info(`[CronManager] Stopping & removing podcast episode cron for ${podcastCron.expression}`)
    if (podcastCron.task?.stop) podcastCron.task.stop()
    this.podcastCrons = this.podcastCrons.filter((pc) => pc.expression !== podcastCron.expression)
  }

  checkUpdatePodcastCron(libraryItem: LibraryItem): void {
    // Remove from old cron by library item id
    const existingCron = this.podcastCrons.find((pc) => pc.libraryItemIds.includes(libraryItem.id))
    if (existingCron) {
      existingCron.libraryItemIds = existingCron.libraryItemIds.filter((lid) => lid !== libraryItem.id)
      if (!existingCron.libraryItemIds.length) {
        this.removePodcastEpisodeCron(existingCron)
      }
    }

    // Add to cron or start new cron
    if (isPodcastMedia(libraryItem.media) && libraryItem.media.autoDownloadEpisodes && typeof libraryItem.media.autoDownloadSchedule === 'string') {
      const podcast = libraryItem.media
      const autoDownloadSchedule = libraryItem.media.autoDownloadSchedule
      const cronMatchingExpression = this.podcastCrons.find((pc) => pc.expression === autoDownloadSchedule)
      if (cronMatchingExpression) {
        cronMatchingExpression.libraryItemIds.push(libraryItem.id)

        const podcastTitle = podcast.title || 'Unknown'
        Logger.info(`[CronManager] Added podcast "${podcastTitle}" to auto dl episode cron "${cronMatchingExpression.expression}"`)
      } else {
        this.startPodcastCron(autoDownloadSchedule, [libraryItem.id])
      }
    }
  }
}

namespace CronManager {
  export type CronManagerInstance = CronManager
}

export = CronManager
