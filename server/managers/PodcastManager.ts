import Path from 'path'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'
import Watcher from '../Watcher'

import fs from '../libs/fsExtra'

import { getPodcastFeed } from '../utils/podcastUtils'
import { removeFile, downloadFile, sanitizeFilename, filePathToPOSIX, getFileTimestampsWithIno } from '../utils/fileUtils'
import { levenshteinDistance } from '../utils/index'
import * as opmlParser from '../utils/parsers/parseOPML'
import * as opmlGenerator from '../utils/generators/opmlGenerator'
import prober from '../utils/prober'
import * as ffmpegHelpers from '../utils/ffmpegHelpers'

import TaskManager from './TaskManager'
import CoverManager from '../managers/CoverManager'
import NotificationManager from '../managers/NotificationManager'

import LibraryFile from '../objects/files/LibraryFile'
import PodcastEpisodeDownload from '../objects/PodcastEpisodeDownload'
import AudioFile from '../objects/files/AudioFile'

import type { RssPodcast, RssPodcastEpisode, AudioFileObject, ChapterObject, LibraryFileObject, PodcastEpisodeDownloadLike } from '../types'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type PodcastEpisode from '../models/PodcastEpisode'
import type LibraryFolder from '../models/LibraryFolder'
import type { ParsedOpmlFeed } from '../utils/parsers/parseOPML'

interface ICronManager {
  checkUpdatePodcastCron(libraryItem: LibraryItem): void
  [key: string]: unknown
}

interface EpisodeMatch {
  episode: RssPodcastEpisode
  levenshtein: number
}

class PodcastManager {
  downloadQueue: PodcastEpisodeDownload[]
  currentDownload: PodcastEpisodeDownload | null
  failedCheckMap: Record<string, number>
  MaxFailedEpisodeChecks: number | undefined

  constructor() {
    this.downloadQueue = []
    this.currentDownload = null

    this.failedCheckMap = {}
    this.MaxFailedEpisodeChecks = global.MaxFailedEpisodeChecks
  }

  getEpisodeDownloadsInQueue(libraryItemId: string): PodcastEpisodeDownload[] {
    return this.downloadQueue.filter((d) => d.libraryItemId === libraryItemId)
  }

  clearDownloadQueue(libraryItemId: string | null = null): void {
    if (!this.downloadQueue.length) return

    if (!libraryItemId) {
      Logger.info(`[PodcastManager] Clearing all downloads in queue (${this.downloadQueue.length})`)
      this.downloadQueue = []
    } else {
      const itemDownloads = this.getEpisodeDownloadsInQueue(libraryItemId)
      Logger.info(`[PodcastManager] Clearing downloads in queue for item "${libraryItemId}" (${itemDownloads.length})`)
      this.downloadQueue = this.downloadQueue.filter((d) => d.libraryItemId !== libraryItemId)
      SocketAuthority.emitter('episode_download_queue_cleared', libraryItemId)
    }
  }

  /**
   * @param {LibraryItem} libraryItem
   * @param {RssPodcastEpisode[]} episodesToDownload
   * @param {boolean} isAutoDownload - If this download was triggered by auto download
   */
  async downloadPodcastEpisodes(libraryItem: LibraryItem, episodesToDownload: RssPodcastEpisode[], isAutoDownload: boolean): Promise<void> {
    for (const ep of episodesToDownload) {
      const newPeDl = new PodcastEpisodeDownload()
      newPeDl.setData(ep, libraryItem, isAutoDownload, libraryItem.libraryId)
      void this.startPodcastEpisodeDownload(newPeDl)
    }
  }

  /**
   * @param {PodcastEpisodeDownload} podcastEpisodeDownload
   */
  async startPodcastEpisodeDownload(podcastEpisodeDownload: PodcastEpisodeDownload): Promise<void> {
    if (this.currentDownload) {
      // Prevent downloading episodes from the same URL for the same library item.
      // Allow downloading for different library items in case of the same podcast existing in multiple libraries (e.g. different folders)
      if (this.downloadQueue.some((d) => d.url === podcastEpisodeDownload.url && d.libraryItem.id === podcastEpisodeDownload.libraryItem.id)) {
        Logger.warn(`[PodcastManager] Episode already in queue: "${this.currentDownload.episodeTitle}"`)
        return
      } else if (this.currentDownload.url === podcastEpisodeDownload.url && this.currentDownload.libraryItem.id === podcastEpisodeDownload.libraryItem.id) {
        Logger.warn(`[PodcastManager] Episode download already in progress for "${podcastEpisodeDownload.episodeTitle}"`)
        return
      }
      this.downloadQueue.push(podcastEpisodeDownload)
      SocketAuthority.emitter('episode_download_queued', podcastEpisodeDownload.toJSONForClient())
      return
    }

    const taskData = {
      libraryId: podcastEpisodeDownload.libraryId,
      libraryItemId: podcastEpisodeDownload.libraryItemId
    }
    const taskTitleString = {
      text: 'Downloading episode',
      key: 'MessageDownloadingEpisode'
    }
    const taskDescriptionString = {
      text: `Downloading episode "${podcastEpisodeDownload.episodeTitle}".`,
      key: 'MessageTaskDownloadingEpisodeDescription',
      subs: [podcastEpisodeDownload.episodeTitle || '']
    }
    const task = TaskManager.createAndAddTask('download-podcast-episode', taskTitleString, taskDescriptionString, false, taskData)

    SocketAuthority.emitter('episode_download_started', podcastEpisodeDownload.toJSONForClient())
    this.currentDownload = podcastEpisodeDownload

    // If this file already exists then append a uuid to the filename
    //  e.g. "/tagesschau 20 Uhr.mp3" becomes "/tagesschau 20 Uhr (ep_asdfasdf).mp3"
    //  this handles podcasts where every title is the same (ref https://github.com/advplyr/audiobookshelf/issues/1802)
    if (await fs.pathExists(this.currentDownload.targetPath)) {
      this.currentDownload.setAppendRandomId(true)
    }

    // Ignores all added files to this dir
    Watcher.addIgnoreDir(this.currentDownload.libraryItem.path)
    Watcher.ignoreFilePathsDownloading.add(this.currentDownload.targetPath)

    // Make sure podcast library item folder exists
    if (!(await fs.pathExists(this.currentDownload.libraryItem.path))) {
      Logger.warn(`[PodcastManager] Podcast episode download: Podcast folder no longer exists at "${this.currentDownload.libraryItem.path}" - Creating it`)
      await fs.mkdir(this.currentDownload.libraryItem.path)
    }

    // Download episode and tag it
    const ffmpegDownloadResponse = await ffmpegHelpers
      .downloadPodcastEpisode(this.currentDownload as unknown as PodcastEpisodeDownloadLike)
      .catch((error: unknown) => {
        Logger.error(`[PodcastManager] Podcast Episode download failed`, error)
        return null
      })
    let success = !!ffmpegDownloadResponse?.success

    if (success) {
      // Attempt to ffprobe and add podcast episode audio file
      success = await this.scanAddPodcastEpisodeAudioFile()
      if (!success) {
        Logger.error(`[PodcastManager] Failed to scan and add podcast episode audio file - removing file`)
        await fs.remove(this.currentDownload.targetPath)
      }
    }

    // If failed due to ffmpeg or ffprobe error, retry without tagging
    // e.g. RSS feed may have incorrect file extension and file type
    // See https://github.com/advplyr/audiobookshelf/issues/3837
    // e.g. Ffmpeg may be download the file without streams causing the ffprobe to fail
    if (!success && !ffmpegDownloadResponse?.isRequestError) {
      Logger.info(`[PodcastManager] Retrying episode download without tagging`)
      // Download episode only
      success = await downloadFile(this.currentDownload.url || '', this.currentDownload.targetPath)
        .then(() => true)
        .catch((error: unknown) => {
          Logger.error(`[PodcastManager] Podcast Episode download failed`, error)
          return false
        })

      if (success) {
        success = await this.scanAddPodcastEpisodeAudioFile()
        if (!success) {
          Logger.error(`[PodcastManager] Failed to scan and add podcast episode audio file - removing file`)
          await fs.remove(this.currentDownload.targetPath)
        }
      }
    }

    if (success) {
      Logger.info(`[PodcastManager] Successfully downloaded podcast episode "${this.currentDownload.episodeTitle}"`)
      this.currentDownload.setFinished(true)
      task.setFinished()
    } else {
      const taskFailedString = {
        text: 'Failed',
        key: 'MessageTaskFailed'
      }
      task.setFailed(taskFailedString)
      this.currentDownload.setFinished(false)
    }

    TaskManager.taskFinished(task)

    SocketAuthority.emitter('episode_download_finished', this.currentDownload.toJSONForClient())

    Watcher.removeIgnoreDir(this.currentDownload.libraryItem.path)

    Watcher.ignoreFilePathsDownloading.delete(this.currentDownload.targetPath)
    this.currentDownload = null
    if (this.downloadQueue.length) {
      const nextDownload = this.downloadQueue.shift()
      if (nextDownload) {
        void this.startPodcastEpisodeDownload(nextDownload)
      }
    }
  }

  /**
   * Scans the downloaded audio file, create the podcast episode, remove oldest episode if necessary
   * @returns {Promise<boolean>} - Returns true if added
   */
  async scanAddPodcastEpisodeAudioFile(): Promise<boolean> {
    if (!this.currentDownload) return false

    const libraryFile = new LibraryFile()
    await libraryFile.setDataFromPath(this.currentDownload.targetPath, this.currentDownload.targetRelPath || '')

    const audioFile = await this.probeAudioFile(libraryFile)
    if (!audioFile) {
      return false
    }

    const libraryItem = await Database.libraryItemModel.getExpandedById(this.currentDownload.libraryItem.id)
    if (!libraryItem) {
      Logger.error(`[PodcastManager] Podcast Episode finished but library item was not found ${this.currentDownload.libraryItem.id}`)
      return false
    }

    const podcast = libraryItem.media as Podcast
    const podcastEpisode = await Database.podcastEpisodeModel.createFromRssPodcastEpisode(
      this.currentDownload.rssPodcastEpisode,
      podcast.id,
      audioFile as unknown as { toJSON(): AudioFileObject; chapters?: ChapterObject[] }
    )

    libraryItem.libraryFiles.push(libraryFile.toJSON() as unknown as LibraryFileObject)
    // Re-calculating library item size because this wasnt being updated properly for podcasts in v2.20.0 and below
    let libraryItemSize = 0
    libraryItem.libraryFiles.forEach((lf: { metadata?: { size?: number | string | null } }) => {
      if (lf.metadata?.size && !isNaN(Number(lf.metadata.size))) {
        libraryItemSize += Number(lf.metadata.size)
      }
    })
    libraryItem.size = libraryItemSize
    libraryItem.changed('libraryFiles', true)

    if (!podcast.podcastEpisodes) podcast.podcastEpisodes = []
    podcast.podcastEpisodes.push(podcastEpisode)

    if (this.currentDownload.isAutoDownload) {
      // Check setting maxEpisodesToKeep and remove episode if necessary
      const numEpisodesWithPubDate = podcast.podcastEpisodes.filter((ep) => !!ep.publishedAt).length
      if (podcast.maxEpisodesToKeep && numEpisodesWithPubDate > podcast.maxEpisodesToKeep) {
        Logger.info(`[PodcastManager] # of episodes (${numEpisodesWithPubDate}) exceeds max episodes to keep (${podcast.maxEpisodesToKeep})`)
        const episodeToRemove = await this.getRemoveOldestEpisode(libraryItem, podcastEpisode.id)
        if (episodeToRemove) {
          // Remove episode from playlists
          await Database.playlistModel.removeMediaItemsFromPlaylists([episodeToRemove.id])
          // Remove media progress for this episode
          await Database.mediaProgressModel.destroy({
            where: {
              mediaItemId: episodeToRemove.id
            }
          })
          await episodeToRemove.destroy()
          podcast.podcastEpisodes = podcast.podcastEpisodes.filter((ep) => ep.id !== episodeToRemove.id)

          // Remove library file
          libraryItem.libraryFiles = libraryItem.libraryFiles.filter((lf: { ino?: string | null }) => lf.ino !== episodeToRemove.audioFile?.ino)
        }
      }
    }

    await libraryItem.save()

    if (podcast.numEpisodes !== podcast.podcastEpisodes.length) {
      podcast.numEpisodes = podcast.podcastEpisodes.length
      await podcast.save()
    }

    SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
    const podcastEpisodeExpanded = podcastEpisode.toOldJSONExpanded(libraryItem.id) as unknown as Record<string, unknown>
    podcastEpisodeExpanded.libraryItem = libraryItem.toOldJSONExpanded()
    SocketAuthority.emitter('episode_added', podcastEpisodeExpanded)

    if (this.currentDownload.isAutoDownload) {
      // Notifications only for auto downloaded episodes
      NotificationManager.onPodcastEpisodeDownloaded(libraryItem, podcastEpisode)
    }

    return true
  }

  /**
   * Find oldest episode publishedAt and delete the audio file
   *
   * @param {LibraryItem} libraryItem
   * @param {string} episodeIdJustDownloaded
   * @returns {Promise<PodcastEpisode|null>} - Returns the episode to remove
   */
  async getRemoveOldestEpisode(libraryItem: LibraryItem, episodeIdJustDownloaded: string): Promise<PodcastEpisode | null> {
    let smallestPublishedAt = 0
    let oldestEpisode: PodcastEpisode | null = null

    const podcast = libraryItem.media as Podcast
    const podcastEpisodes = podcast.podcastEpisodes || []

    for (const ep of podcastEpisodes) {
      if (ep.id === episodeIdJustDownloaded || !ep.publishedAt) continue

      const pubTime = typeof ep.publishedAt === 'number' ? ep.publishedAt : new Date(ep.publishedAt).getTime()
      if (!smallestPublishedAt || pubTime < smallestPublishedAt) {
        smallestPublishedAt = pubTime
        oldestEpisode = ep
      }
    }

    if (oldestEpisode?.audioFile) {
      Logger.info(`[PodcastManager] Deleting oldest episode "${oldestEpisode.title}"`)
      const successfullyDeleted = await removeFile(oldestEpisode.audioFile.metadata.path)
      if (successfullyDeleted) {
        return oldestEpisode
      } else {
        Logger.warn(`[PodcastManager] Failed to remove oldest episode "${oldestEpisode.title}"`)
      }
    }
    return null
  }

  /**
   * @param {LibraryFile} libraryFile
   * @returns {Promise<AudioFile|null>}
   */
  async probeAudioFile(libraryFile: LibraryFile): Promise<AudioFile | null> {
    const path = libraryFile.metadata?.path
    if (!path) return null
    const mediaProbeData = await prober.probe(path)
    if ('error' in mediaProbeData) {
      Logger.error(`[PodcastManager] Podcast Episode downloaded but failed to probe "${path}"`, mediaProbeData.error)
      return null
    }
    const newAudioFile = new AudioFile()
    newAudioFile.setDataFromProbe(libraryFile, mediaProbeData)
    newAudioFile.index = 1
    return newAudioFile
  }

  /**
   * @param {LibraryItem} libraryItem
   * @returns {Promise<boolean>} - Returns false if auto download episodes was disabled (disabled if reaches max failed checks)
   */
  async runEpisodeCheck(libraryItem: LibraryItem): Promise<boolean> {
    const podcast = libraryItem.media as Podcast
    const lastEpisodeCheck = podcast.lastEpisodeCheck?.valueOf() || 0
    const latestEpisodePublishedAt = podcast.getLatestEpisodePublishedAt()

    Logger.info(`[PodcastManager] runEpisodeCheck: "${podcast.title}" | Last check: ${new Date(lastEpisodeCheck)} | ${latestEpisodePublishedAt ? `Latest episode pubDate: ${new Date(latestEpisodePublishedAt)}` : 'No latest episode'}`)

    // Use latest episode pubDate if exists OR fallback to using lastEpisodeCheck
    //    lastEpisodeCheck will be the current time when adding a new podcast
    const dateToCheckForEpisodesAfter = latestEpisodePublishedAt || lastEpisodeCheck
    Logger.debug(`[PodcastManager] runEpisodeCheck: "${podcast.title}" checking for episodes after ${new Date(dateToCheckForEpisodesAfter)}`)

    const newEpisodes = await this.checkPodcastForNewEpisodes(libraryItem, dateToCheckForEpisodesAfter, podcast.maxNewEpisodesToDownload || 3)
    Logger.debug(`[PodcastManager] runEpisodeCheck: ${newEpisodes?.length || 'N/A'} episodes found`)

    if (!newEpisodes) {
      // Failed
      // Allow up to MaxFailedEpisodeChecks failed attempts before disabling auto download
      if (!this.failedCheckMap[libraryItem.id]) this.failedCheckMap[libraryItem.id] = 0
      this.failedCheckMap[libraryItem.id]++
      if (this.MaxFailedEpisodeChecks !== 0 && this.failedCheckMap[libraryItem.id] >= (this.MaxFailedEpisodeChecks || 0)) {
        Logger.error(`[PodcastManager] runEpisodeCheck ${this.failedCheckMap[libraryItem.id]} failed attempts at checking episodes for "${podcast.title}" - disabling auto download`)
        void NotificationManager.onRSSFeedDisabled(podcast.feedURL || '', this.failedCheckMap[libraryItem.id], podcast.title || '')
        podcast.autoDownloadEpisodes = false
        delete this.failedCheckMap[libraryItem.id]
      } else {
        Logger.warn(`[PodcastManager] runEpisodeCheck ${this.failedCheckMap[libraryItem.id]} failed attempts at checking episodes for "${podcast.title}"`)
        void NotificationManager.onRSSFeedFailed(podcast.feedURL || '', this.failedCheckMap[libraryItem.id], podcast.title || '')
      }
    } else if (newEpisodes.length) {
      delete this.failedCheckMap[libraryItem.id]
      Logger.info(`[PodcastManager] Found ${newEpisodes.length} new episodes for podcast "${podcast.title}" - starting download`)
      void this.downloadPodcastEpisodes(libraryItem, newEpisodes, true)
    } else {
      delete this.failedCheckMap[libraryItem.id]
      Logger.debug(`[PodcastManager] No new episodes for "${podcast.title}"`)
    }

    podcast.lastEpisodeCheck = new Date()
    await podcast.save()

    libraryItem.changed('updatedAt', true)
    await libraryItem.save()

    SocketAuthority.libraryItemEmitter('item_updated', libraryItem)

    return podcast.autoDownloadEpisodes
  }

  /**
   * @param {LibraryItem} podcastLibraryItem
   * @param {number} dateToCheckForEpisodesAfter - Unix timestamp
   * @param {number} [maxNewEpisodes]
   * @returns {Promise<RssPodcastEpisode[]|null>}
   */
  async checkPodcastForNewEpisodes(podcastLibraryItem: LibraryItem, dateToCheckForEpisodesAfter: number, maxNewEpisodes = 3): Promise<RssPodcastEpisode[] | null> {
    const podcast = podcastLibraryItem.media as Podcast
    if (!podcast.feedURL) {
      Logger.error(`[PodcastManager] checkPodcastForNewEpisodes no feed url for ${podcast.title} (ID: ${podcastLibraryItem.id})`)
      return null
    }
    const timeoutMs = (global.PodcastDownloadTimeout || 30000) + 1000
    const feed = await Promise.race([
      getPodcastFeed(podcast.feedURL),
      new Promise<null>((_, reject) =>
        // The added second is to make sure that axios can fail first and only falls back later
        setTimeout(() => reject(new Error('Timeout. getPodcastFeed seemed to timeout but not triggering the timeout.')), timeoutMs)
      )
    ]).catch((error: unknown) => {
      Logger.error(`[PodcastManager] checkPodcastForNewEpisodes failed to fetch feed for ${podcast.title} (ID: ${podcastLibraryItem.id}):`, error)
      return null
    })

    if (!feed?.episodes) {
      Logger.error(`[PodcastManager] checkPodcastForNewEpisodes invalid feed payload for ${podcast.title} (ID: ${podcastLibraryItem.id})`, feed)
      return null
    }

    // Filter new and not already has
    let newEpisodes = feed.episodes.filter((ep) => ep.publishedAt && ep.publishedAt > dateToCheckForEpisodesAfter && !podcast.checkHasEpisodeByFeedEpisode(ep))

    if (maxNewEpisodes > 0) {
      newEpisodes = newEpisodes.slice(0, maxNewEpisodes)
    }

    return newEpisodes
  }

  /**
   * @param {LibraryItem} libraryItem
   * @param {number} maxEpisodesToDownload
   * @returns {Promise<RssPodcastEpisode[]>}
   */
  async checkAndDownloadNewEpisodes(libraryItem: LibraryItem, maxEpisodesToDownload: number): Promise<RssPodcastEpisode[]> {
    const podcast = libraryItem.media as Podcast
    const lastEpisodeCheck = podcast.lastEpisodeCheck?.valueOf() || 0
    const lastEpisodeCheckDate = lastEpisodeCheck > 0 ? podcast.lastEpisodeCheck : 'Never'
    Logger.info(`[PodcastManager] checkAndDownloadNewEpisodes for "${podcast.title}" - Last episode check: ${lastEpisodeCheckDate}`)

    const newEpisodes = await this.checkPodcastForNewEpisodes(libraryItem, lastEpisodeCheck, maxEpisodesToDownload)
    if (newEpisodes?.length) {
      Logger.info(`[PodcastManager] Found ${newEpisodes.length} new episodes for podcast "${podcast.title}" - starting download`)
      void this.downloadPodcastEpisodes(libraryItem, newEpisodes, false)
    } else {
      Logger.info(`[PodcastManager] No new episodes found for podcast "${podcast.title}"`)
    }

    podcast.lastEpisodeCheck = new Date()
    await podcast.save()

    libraryItem.changed('updatedAt', true)
    await libraryItem.save()

    SocketAuthority.libraryItemEmitter('item_updated', libraryItem)

    return newEpisodes || []
  }

  async findEpisode(rssFeedUrl: string, searchTitle: string): Promise<EpisodeMatch[] | null> {
    const feed = await getPodcastFeed(rssFeedUrl).catch(() => null)
    if (!feed || !feed.episodes) {
      return null
    }

    const matches: EpisodeMatch[] = []
    feed.episodes.forEach((ep) => {
      if (!ep.title) return

      const epTitle = ep.title.toLowerCase().trim()
      if (epTitle === searchTitle) {
        matches.push({
          episode: ep,
          levenshtein: 0
        })
      } else {
        const levenshtein = levenshteinDistance(searchTitle, epTitle, true)
        if (levenshtein <= 6 && epTitle.length > levenshtein) {
          matches.push({
            episode: ep,
            levenshtein
          })
        }
      }
    })
    return matches.sort((a, b) => a.levenshtein - b.levenshtein)
  }

  getParsedOPMLFileFeeds(opmlText: string): ParsedOpmlFeed[] {
    return opmlParser.parse(opmlText)
  }

  async getOPMLFeeds(opmlText: string): Promise<{ feeds: RssPodcast[] } | { error: string }> {
    const extractedFeeds = opmlParser.parse(opmlText)
    if (!extractedFeeds?.length) {
      Logger.error('[PodcastManager] getOPMLFeeds: No RSS feeds found in OPML')
      return {
        error: 'No RSS feeds found in OPML'
      }
    }

    const rssFeedData: RssPodcast[] = []

    for (const feed of extractedFeeds) {
      const feedData = await getPodcastFeed(feed.feedUrl, true)
      if (feedData) {
        feedData.metadata.feedUrl = feed.feedUrl
        rssFeedData.push(feedData)
      }
    }

    return {
      feeds: rssFeedData
    }
  }

  /**
   * OPML file string for podcasts in a library
   * @param {Podcast[]} podcasts
   * @returns {string} XML string
   */
  generateOPMLFileText(podcasts: Podcast[]): string {
    return opmlGenerator.generate(podcasts)
  }

  getDownloadQueueDetails(libraryId: string | null = null): {
    currentDownload: Record<string, unknown> | null | undefined
    queue: Record<string, unknown>[]
  } {
    let _currentDownload = this.currentDownload
    if (libraryId && _currentDownload?.libraryId !== libraryId) _currentDownload = null

    return {
      currentDownload: _currentDownload?.toJSONForClient(),
      queue: this.downloadQueue.filter((item) => !libraryId || item.libraryId === libraryId).map((item) => item.toJSONForClient())
    }
  }

  /**
   * @param {string[]} rssFeedUrls
   * @param {LibraryFolder} folder
   * @param {boolean} autoDownloadEpisodes
   * @param {ICronManager} cronManager
   */
  async createPodcastsFromFeedUrls(rssFeedUrls: string[], folder: LibraryFolder, autoDownloadEpisodes: boolean, cronManager: ICronManager): Promise<void> {
    const taskTitleString = {
      text: 'OPML import',
      key: 'MessageTaskOpmlImport'
    }
    const taskDescriptionString = {
      text: `Creating podcasts from ${rssFeedUrls.length} RSS feeds`,
      key: 'MessageTaskOpmlImportDescription',
      subs: [String(rssFeedUrls.length)]
    }
    const task = TaskManager.createAndAddTask('opml-import', taskTitleString, taskDescriptionString, true, undefined)
    let numPodcastsAdded = 0
    Logger.info(`[PodcastManager] createPodcastsFromFeedUrls: Importing ${rssFeedUrls.length} RSS feeds to folder "${folder.path}"`)
    for (const feedUrl of rssFeedUrls) {
      const feed = await getPodcastFeed(feedUrl).catch(() => null)
      if (!feed?.episodes) {
        const taskTitleStringFeed = {
          text: 'OPML import feed',
          key: 'MessageTaskOpmlImportFeed'
        }
        const taskDescriptionStringFeed = {
          text: `Importing RSS feed "${feedUrl}"`,
          key: 'MessageTaskOpmlImportFeedDescription',
          subs: [feedUrl]
        }
        const taskErrorString = {
          text: 'Failed to get podcast feed',
          key: 'MessageTaskOpmlImportFeedFailed'
        }
        TaskManager.createAndEmitFailedTask('opml-import-feed', taskTitleStringFeed, taskDescriptionStringFeed, taskErrorString)
        Logger.error(`[PodcastManager] createPodcastsFromFeedUrls: Failed to get podcast feed for "${feedUrl}"`)
        continue
      }

      const podcastFilename = sanitizeFilename(feed.metadata.title || '')
      const podcastPath = filePathToPOSIX(`${folder.path}/${podcastFilename}`)
      // Check if a library item with this podcast folder exists already
      const existingLibraryItem =
        (await Database.libraryItemModel.count({
          where: {
            path: podcastPath
          }
        })) > 0
      if (existingLibraryItem) {
        Logger.error(`[PodcastManager] createPodcastsFromFeedUrls: Podcast already exists at path "${podcastPath}"`)
        const taskTitleStringFeed = {
          text: 'OPML import feed',
          key: 'MessageTaskOpmlImportFeed'
        }
        const taskDescriptionStringPodcast = {
          text: `Creating podcast "${feed.metadata.title}"`,
          key: 'MessageTaskOpmlImportFeedPodcastDescription',
          subs: [feed.metadata.title || '']
        }
        const taskErrorString = {
          text: 'Podcast already exists at path',
          key: 'MessageTaskOpmlImportFeedPodcastExists'
        }
        TaskManager.createAndEmitFailedTask('opml-import-feed', taskTitleStringFeed, taskDescriptionStringPodcast, taskErrorString)
        continue
      }

      const successCreatingPath = await fs
        .ensureDir(podcastPath)
        .then(() => true)
        .catch((error: unknown) => {
          Logger.error(`[PodcastManager] Failed to ensure podcast dir "${podcastPath}"`, error)
          return false
        })
      if (!successCreatingPath) {
        Logger.error(`[PodcastManager] createPodcastsFromFeedUrls: Failed to create podcast folder at "${podcastPath}"`)
        const taskTitleStringFeed = {
          text: 'OPML import feed',
          key: 'MessageTaskOpmlImportFeed'
        }
        const taskDescriptionStringPodcast = {
          text: `Creating podcast "${feed.metadata.title}"`,
          key: 'MessageTaskOpmlImportFeedPodcastDescription',
          subs: [feed.metadata.title || '']
        }
        const taskErrorString = {
          text: 'Failed to create podcast folder',
          key: 'MessageTaskOpmlImportFeedPodcastFailed'
        }
        TaskManager.createAndEmitFailedTask('opml-import-feed', taskTitleStringFeed, taskDescriptionStringPodcast, taskErrorString)
        continue
      }

      let newLibraryItem: LibraryItem | null = null
      if (!Database.sequelize) {
        throw new Error('Database is not initialized')
      }
      const transaction = await Database.sequelize.transaction()
      try {
        const libraryItemFolderStats = await getFileTimestampsWithIno(podcastPath)
        if (!libraryItemFolderStats) {
          throw new Error(`Failed to get timestamps and ino for "${podcastPath}"`)
        }

        const podcastPayload = {
          autoDownloadEpisodes,
          metadata: {
            title: feed.metadata.title,
            author: feed.metadata.author,
            description: feed.metadata.description,
            releaseDate: '',
            genres: [...feed.metadata.categories],
            feedUrl: feed.metadata.feedUrl,
            imageUrl: feed.metadata.image,
            itunesPageUrl: '',
            itunesId: '',
            itunesArtistId: '',
            language: '',
            numEpisodes: feed.numEpisodes
          }
        }
        const podcast = await Database.podcastModel.createFromRequest(podcastPayload, transaction)

        newLibraryItem = await Database.libraryItemModel.create(
          {
            ino: libraryItemFolderStats.ino,
            path: podcastPath,
            relPath: podcastFilename,
            mediaId: podcast.id,
            mediaType: 'podcast',
            isFile: false,
            isMissing: false,
            isInvalid: false,
            mtime: libraryItemFolderStats.mtimeMs || 0,
            ctime: libraryItemFolderStats.ctimeMs || 0,
            birthtime: libraryItemFolderStats.birthtimeMs || 0,
            size: 0,
            libraryFiles: [],
            extraData: {},
            libraryId: folder.libraryId,
            libraryFolderId: folder.id,
            title: podcast.title,
            titleIgnorePrefix: podcast.titleIgnorePrefix
          },
          { transaction }
        )

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        Logger.error(`[PodcastManager] createPodcastsFromFeedUrls: Failed to create podcast library item for "${feed.metadata.title}"`, error)
        const taskTitleStringFeed = {
          text: 'OPML import feed',
          key: 'MessageTaskOpmlImportFeed'
        }
        const taskDescriptionStringPodcast = {
          text: `Creating podcast "${feed.metadata.title}"`,
          key: 'MessageTaskOpmlImportFeedPodcastDescription',
          subs: [feed.metadata.title || '']
        }
        const taskErrorString = {
          text: 'Failed to create podcast library item',
          key: 'MessageTaskOpmlImportFeedPodcastFailed'
        }
        TaskManager.createAndEmitFailedTask('opml-import-feed', taskTitleStringFeed, taskDescriptionStringPodcast, taskErrorString)
        continue
      }

      newLibraryItem.media = await newLibraryItem.getMediaExpanded()

      // Download and save cover image
      if (typeof feed.metadata.image === 'string' && feed.metadata.image.startsWith('http')) {
        // Podcast cover will always go into library item folder
        const coverResponse = await CoverManager.downloadCoverFromUrlNew(feed.metadata.image, newLibraryItem.id, newLibraryItem.path, true)
        if ('error' in coverResponse && coverResponse.error) {
          Logger.error(`[PodcastManager] Download cover error from "${feed.metadata.image}": ${coverResponse.error}`)
        } else if ('cover' in coverResponse && coverResponse.cover) {
          const coverImageFileStats = await getFileTimestampsWithIno(coverResponse.cover)
          if (!coverImageFileStats) {
            Logger.error(`[PodcastManager] Failed to get cover image stats for "${coverResponse.cover}"`)
          } else {
            // Add libraryFile to libraryItem and coverPath to podcast
            const newLibraryFile = {
              ino: coverImageFileStats.ino,
              fileType: 'image',
              addedAt: Date.now(),
              updatedAt: Date.now(),
              metadata: {
                filename: Path.basename(coverResponse.cover),
                ext: Path.extname(coverResponse.cover).slice(1),
                path: coverResponse.cover,
                relPath: Path.basename(coverResponse.cover),
                size: coverImageFileStats.size,
                mtimeMs: coverImageFileStats.mtimeMs || 0,
                ctimeMs: coverImageFileStats.ctimeMs || 0,
                birthtimeMs: coverImageFileStats.birthtimeMs || 0
              }
            }
            newLibraryItem.libraryFiles.push(newLibraryFile as unknown as LibraryFileObject)
            newLibraryItem.changed('libraryFiles', true)
            await newLibraryItem.save()

            if (newLibraryItem.media) {
              (newLibraryItem.media as Podcast).coverPath = coverResponse.cover
              await (newLibraryItem.media as Podcast).save()
            }
          }
        }
      }

      SocketAuthority.libraryItemEmitter('item_added', newLibraryItem)

      // Turn on podcast auto download cron if not already on
      if ((newLibraryItem.media as Podcast).autoDownloadEpisodes) {
        cronManager.checkUpdatePodcastCron(newLibraryItem)
      }

      numPodcastsAdded++
    }

    const taskFinishedString = {
      text: `Added ${numPodcastsAdded} podcasts`,
      key: 'MessageTaskOpmlImportFinished',
      subs: [String(numPodcastsAdded)]
    }
    task.setFinished(taskFinishedString)
    TaskManager.taskFinished(task)
    Logger.info(`[PodcastManager] createPodcastsFromFeedUrls: Finished OPML import. Created ${numPodcastsAdded} podcasts out of ${rssFeedUrls.length} RSS feed URLs`)
  }
}

export = PodcastManager

