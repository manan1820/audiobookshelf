import type { Request, Response, NextFunction } from 'express'
import Path from 'path'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'

import fs from '../libs/fsExtra'
import cron from '../libs/nodeCron'

import { getPodcastFeed, findMatchingEpisodes } from '../utils/podcastUtils'
import { getFileTimestampsWithIno, filePathToPOSIX, isSameOrSubPath } from '../utils/fileUtils'
import { validateUrl } from '../utils/index'
import htmlSanitizer from '../utils/htmlSanitizer'

import Scanner from '../scanner/Scanner'
import CoverManager from '../managers/CoverManager'
import type User from '../models/User'
import type LibraryItem from '../models/LibraryItem'
import type { LibraryFileObject } from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type { PodcastCreateRequestPayload } from '../models/Podcast'
import type PodcastManager from '../managers/PodcastManager'

interface RequestWithUser extends Request {
  user?: User
}

interface RequestWithLibraryItem extends RequestWithUser {
  libraryItem?: LibraryItem | null
}

interface CronManagerLike {
  checkUpdatePodcastCron: (libraryItem: LibraryItem) => void
  [key: string]: unknown
}

interface ApiRouterContext {
  podcastManager?: PodcastManager
  cronManager?: CronManagerLike
  [key: string]: unknown
}

class PodcastController {
  podcastManager?: PodcastManager
  cronManager?: CronManagerLike

  /**
   * POST /api/podcasts
   * Create podcast
   */
  async create(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(`[PodcastController] Non-admin user "${username}" attempted to create podcast`)
      return res.sendStatus(403)
    }
    const payload = (req.body ?? {}) as {
      media?: PodcastCreateRequestPayload
      libraryId?: string
      folderId?: string
      path?: string
      [key: string]: unknown
    }
    if (!payload.media || !payload.media.metadata) {
      return res.status(400).send('Invalid request body. "media" and "media.metadata" are required')
    }

    if (payload.media.autoDownloadSchedule && !cron.validate(payload.media.autoDownloadSchedule)) {
      Logger.error(
        `[PodcastController] Invalid auto download schedule cron expression "${payload.media.autoDownloadSchedule}"`
      )
      return res.status(400).send('Invalid auto download schedule cron expression')
    }

    const libraryId = typeof payload.libraryId === 'string' ? payload.libraryId : ''
    const library = await Database.libraryModel.findByIdWithFolders(libraryId)
    if (!library) {
      Logger.error(`[PodcastController] Create: Library not found "${libraryId}"`)
      return res.status(404).send('Library not found')
    }

    const folder = library.libraryFolders?.find((fold) => fold.id === payload.folderId)
    if (!folder) {
      Logger.error(`[PodcastController] Create: Folder not found "${payload.folderId ?? ''}"`)
      return res.status(404).send('Folder not found')
    }

    if (typeof payload.path !== 'string' || !payload.path.trim()) {
      return res.status(400).send('Invalid request body. "path" must be a non-empty string')
    }

    const libraryFolderPath = filePathToPOSIX(folder.path)
    const podcastPath = filePathToPOSIX(payload.path)

    if (!isSameOrSubPath(libraryFolderPath, podcastPath)) {
      Logger.error(
        `[PodcastController] Create: Podcast path is outside library folder "${libraryFolderPath}": "${podcastPath}"`
      )
      return res.status(400).send('Podcast path must be inside the selected library folder')
    }

    // Check if a library item with this podcast folder exists already
    const existingLibraryItem =
      (await Database.libraryItemModel.count({
        where: {
          path: podcastPath
        }
      })) > 0
    if (existingLibraryItem) {
      Logger.error(`[PodcastController] Podcast already exists at path "${podcastPath}"`)
      return res.status(400).send('Podcast already exists')
    }

    const success = await fs
      .ensureDir(podcastPath)
      .then(() => true)
      .catch((error: unknown) => {
        Logger.error(`[PodcastController] Failed to ensure podcast dir "${podcastPath}"`, error)
        return false
      })
    if (!success) return res.status(400).send('Invalid podcast path')

    const libraryItemFolderStats = await getFileTimestampsWithIno(podcastPath)
    if (!libraryItemFolderStats) {
      Logger.error(`[PodcastController] Failed to get stats for podcast dir "${podcastPath}"`)
      return res.status(500).send('Failed to get podcast directory stats')
    }

    let relPath = podcastPath.replace(libraryFolderPath, '')
    if (relPath.startsWith('/')) relPath = relPath.slice(1)

    if (!Database.sequelize) {
      return res.status(500).send('Database not initialized')
    }

    let newLibraryItem: LibraryItem | null = null
    const transaction = await Database.sequelize.transaction()
    try {
      const podcast = await Database.podcastModel.createFromRequest(payload.media, transaction)

      newLibraryItem = await Database.libraryItemModel.create(
        {
          ino: libraryItemFolderStats.ino,
          path: podcastPath,
          relPath,
          mediaId: podcast.id,
          mediaType: 'podcast',
          isFile: false,
          isMissing: false,
          isInvalid: false,
          mtime: new Date(libraryItemFolderStats.mtimeMs || 0),
          ctime: new Date(libraryItemFolderStats.ctimeMs || 0),
          birthtime: new Date(libraryItemFolderStats.birthtimeMs || 0),
          size: 0,
          libraryFiles: [],
          extraData: {},
          libraryId: library.id,
          libraryFolderId: folder.id,
          title: podcast.title,
          titleIgnorePrefix: podcast.titleIgnorePrefix
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error: unknown) {
      Logger.error(`[PodcastController] Failed to create podcast: ${String(error)}`)
      await transaction.rollback()
      return res.status(500).send('Failed to create podcast')
    }

    if (!newLibraryItem) {
      return res.status(500).send('Failed to create podcast item')
    }

    const expandedMedia = await newLibraryItem.getMediaExpanded()
    newLibraryItem.media = expandedMedia ?? undefined

    // Download and save cover image
    const imageUrl = payload.media.metadata.imageUrl
    if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      // Podcast cover will always go into library item folder
      const coverResponse = await CoverManager.downloadCoverFromUrlNew(
        imageUrl,
        newLibraryItem.id,
        newLibraryItem.path,
        true
      )
      if ('error' in coverResponse && coverResponse.error) {
        Logger.error(
          `[PodcastController] Download cover error from "${imageUrl}": ${coverResponse.error}`
        )
      } else if ('cover' in coverResponse && coverResponse.cover) {
        const coverPath = coverResponse.cover
        const coverImageFileStats = await getFileTimestampsWithIno(coverPath)
        if (!coverImageFileStats) {
          Logger.error(
            `[PodcastController] Failed to get cover image stats for "${coverPath}"`
          )
        } else {
          // Add libraryFile to libraryItem and coverPath to podcast
          const newLibraryFile: LibraryFileObject = {
            ino: coverImageFileStats.ino,
            addedAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {
              filename: Path.basename(coverPath),
              ext: Path.extname(coverPath).slice(1),
              path: coverPath,
              relPath: Path.basename(coverPath),
              size: coverImageFileStats.size,
              mtimeMs: coverImageFileStats.mtimeMs || 0,
              ctimeMs: coverImageFileStats.ctimeMs || 0,
              birthtimeMs: coverImageFileStats.birthtimeMs || 0
            }
          }
          if (!newLibraryItem.libraryFiles) {
            newLibraryItem.libraryFiles = []
          }
          newLibraryItem.libraryFiles.push(newLibraryFile)
          newLibraryItem.changed('libraryFiles', true)
          await newLibraryItem.save()

          const podcastMedia = newLibraryItem.media as Podcast | undefined
          if (podcastMedia) {
            podcastMedia.coverPath = coverPath
            await podcastMedia.save()
          }
        }
      }
    }

    SocketAuthority.libraryItemEmitter('item_added', newLibraryItem)

    res.json(newLibraryItem.toOldJSONExpanded())

    // Turn on podcast auto download cron if not already on
    const podcastMedia = newLibraryItem.media as Podcast | undefined
    if (podcastMedia?.autoDownloadEpisodes) {
      this.cronManager?.checkUpdatePodcastCron(newLibraryItem)
    }
  }

  /**
   * POST: /api/podcasts/feed
   */
  async getPodcastFeed(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(`[PodcastController] Non-admin user "${username}" attempted to get podcast feed`)
      return res.sendStatus(403)
    }

    const body = (req.body ?? {}) as { rssFeed?: unknown }
    const rssFeed = typeof body.rssFeed === 'string' ? body.rssFeed : ''
    const url = validateUrl(rssFeed)
    if (!url) {
      return res.status(400).send('Invalid request body. "rssFeed" must be a valid URL')
    }

    const podcast = await getPodcastFeed(url)
    if (!podcast) {
      return res.status(404).send('Podcast RSS feed request failed or invalid response data')
    }
    res.json({ podcast })
  }

  /**
   * POST: /api/podcasts/opml
   */
  async getFeedsFromOPMLText(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(`[PodcastController] Non-admin user "${username}" attempted to get feeds from opml`)
      return res.sendStatus(403)
    }

    const body = (req.body ?? {}) as { opmlText?: unknown }
    if (typeof body.opmlText !== 'string' || !body.opmlText) {
      return res.sendStatus(400)
    }

    res.json({
      feeds: this.podcastManager?.getParsedOPMLFileFeeds(body.opmlText) ?? []
    })
  }

  /**
   * POST: /api/podcasts/opml/create
   */
  async bulkCreatePodcastsFromOpmlFeedUrls(
    req: RequestWithUser,
    res: Response
  ): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(`[PodcastController] Non-admin user "${username}" attempted to bulk create podcasts`)
      return res.sendStatus(403)
    }

    const body = (req.body ?? {}) as {
      feeds?: unknown
      libraryId?: unknown
      folderId?: unknown
      autoDownloadEpisodes?: unknown
    }
    const rssFeeds = body.feeds
    if (
      !Array.isArray(rssFeeds) ||
      !rssFeeds.length ||
      rssFeeds.some((feed) => typeof feed !== 'string' || !validateUrl(feed))
    ) {
      return res.status(400).send('Invalid request body. "feeds" must be an array of RSS feed URLs')
    }

    const libraryId = typeof body.libraryId === 'string' ? body.libraryId : null
    const folderId = typeof body.folderId === 'string' ? body.folderId : null
    if (!libraryId || !folderId) {
      return res.status(400).send('Invalid request body. "libraryId" and "folderId" are required')
    }

    const folder = await Database.libraryFolderModel.findByPk(folderId)
    if (!folder || folder.libraryId !== libraryId) {
      return res.status(404).send('Folder not found')
    }
    const autoDownloadEpisodes = Boolean(body.autoDownloadEpisodes)
    this.podcastManager?.createPodcastsFromFeedUrls(
      rssFeeds as string[],
      folder,
      autoDownloadEpisodes,
      this.cronManager
    )

    res.sendStatus(200)
  }

  /**
   * GET: /api/podcasts/:id/checknew
   */
  async checkNewEpisodes(req: RequestWithLibraryItem, res: Response): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(
        `[PodcastController] Non-admin user "${username}" attempted to check/download episodes`
      )
      return res.sendStatus(403)
    }

    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }

    const podcast = libraryItem.media as Podcast | undefined
    if (!podcast?.feedURL) {
      Logger.error(`[PodcastController] checkNewEpisodes no feed url for item ${libraryItem.id}`)
      return res.status(400).send('Podcast has no rss feed url')
    }

    const limitQuery = typeof req.query.limit === 'string' ? req.query.limit : undefined
    const maxEpisodesToDownload =
      limitQuery && !isNaN(Number(limitQuery)) ? Number(limitQuery) : 3

    const newEpisodes = this.podcastManager
      ? await this.podcastManager.checkAndDownloadNewEpisodes(libraryItem, maxEpisodesToDownload)
      : []
    res.json({
      episodes: newEpisodes ?? []
    })
  }

  /**
   * GET: /api/podcasts/:id/clear-queue
   */
  clearEpisodeDownloadQueue(req: RequestWithUser, res: Response): Response | void {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(
        `[PodcastController] Non-admin user "${username}" attempting to clear download queue`
      )
      return res.sendStatus(403)
    }
    this.podcastManager?.clearDownloadQueue(req.params.id)
    res.sendStatus(200)
  }

  /**
   * GET: /api/podcasts/:id/downloads
   */
  getEpisodeDownloads(req: RequestWithLibraryItem, res: Response): Response | void {
    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }
    const downloadsInQueue = this.podcastManager?.getEpisodeDownloadsInQueue(libraryItem.id) ?? []
    res.json({
      downloads: downloadsInQueue.map((d) => d.toJSONForClient())
    })
  }

  /**
   * GET: /api/podcasts/:id/search-episode
   * Search for an episode in a podcast
   */
  async findEpisode(req: RequestWithLibraryItem, res: Response): Promise<Response | void> {
    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }
    const podcast = libraryItem.media as Podcast | undefined
    const rssFeedUrl = podcast?.feedURL
    if (!rssFeedUrl) {
      Logger.error(`[PodcastController] findEpisode: Podcast has no feed url`)
      return res.status(400).send('Podcast does not have an RSS feed URL')
    }

    const searchTitle = req.query.title
    if (!searchTitle || typeof searchTitle !== 'string') {
      return res.sendStatus(500)
    }
    const episodes = await findMatchingEpisodes(rssFeedUrl, searchTitle)
    res.json({
      episodes: episodes ?? []
    })
  }

  /**
   * POST: /api/podcasts/:id/download-episodes
   */
  async downloadEpisodes(
    req: RequestWithLibraryItem,
    res: Response
  ): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(
        `[PodcastController] Non-admin user "${username}" attempted to download episodes`
      )
      return res.sendStatus(403)
    }

    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }

    const episodes = req.body
    if (!Array.isArray(episodes) || !episodes.length) {
      return res.sendStatus(400)
    }

    this.podcastManager?.downloadPodcastEpisodes(libraryItem, episodes)
    res.sendStatus(200)
  }

  /**
   * POST: /api/podcasts/:id/match-episodes
   */
  async quickMatchEpisodes(
    req: RequestWithLibraryItem,
    res: Response
  ): Promise<Response | void> {
    if (!req.user || !req.user.isAdminOrUp) {
      const username = req.user?.username ?? 'Unknown'
      Logger.error(
        `[PodcastController] Non-admin user "${username}" attempted to download episodes`
      )
      return res.sendStatus(403)
    }

    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }

    const overrideDetails = req.query.override === '1'
    const episodesUpdated = await Scanner.quickMatchPodcastEpisodes(libraryItem, {
      overrideDetails
    })
    if (episodesUpdated) {
      SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
    }

    res.json({
      numEpisodesUpdated: episodesUpdated
    })
  }

  /**
   * PATCH: /api/podcasts/:id/episode/:episodeId
   */
  async updateEpisode(req: RequestWithLibraryItem, res: Response): Promise<Response | void> {
    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }
    const podcast = libraryItem.media as Podcast | undefined
    const podcastEpisodes = podcast?.podcastEpisodes ?? []
    const episode = podcastEpisodes.find((ep) => ep.id === req.params.episodeId)
    if (!episode) {
      return res.status(404).send('Episode not found')
    }

    const updatePayload: Record<string, unknown> = {}
    const body = (req.body ?? {}) as Record<string, unknown>
    const supportedStringKeys = [
      'title',
      'subtitle',
      'description',
      'pubDate',
      'episode',
      'season',
      'episodeType'
    ]
    for (const key in body) {
      const val = body[key]
      if (supportedStringKeys.includes(key) && typeof val === 'string') {
        let finalVal = val
        // Sanitize description HTML
        if (key === 'description' && finalVal) {
          const sanitizedDescription = htmlSanitizer.sanitize(finalVal)
          if (sanitizedDescription !== finalVal) {
            Logger.debug(
              `[PodcastController] Sanitized description from "${finalVal}" to "${sanitizedDescription}"`
            )
            finalVal = sanitizedDescription
          }
        } else if (key === 'subtitle' && finalVal) {
          const sanitizedSubtitle = htmlSanitizer.sanitize(finalVal)
          if (sanitizedSubtitle !== finalVal) {
            Logger.debug(
              `[PodcastController] Sanitized subtitle from "${finalVal}" to "${sanitizedSubtitle}"`
            )
            finalVal = sanitizedSubtitle
          }
        }

        updatePayload[key] = finalVal
      } else if (key === 'enclosure') {
        const enclosure = val as
          | { url?: unknown; type?: unknown; length?: unknown }
          | null
          | undefined
        if (enclosure === null) {
          updatePayload.enclosureURL = null
          updatePayload.enclosureSize = null
          updatePayload.enclosureType = null
        } else if (
          typeof enclosure === 'object' &&
          enclosure !== null &&
          typeof enclosure.url === 'string'
        ) {
          updatePayload.enclosureURL = enclosure.url
          updatePayload.enclosureType =
            typeof enclosure.type === 'string' ? enclosure.type : null
          updatePayload.enclosureSize =
            enclosure.length !== undefined && enclosure.length !== null
              ? enclosure.length
              : null
        }
      } else if (
        key === 'chapters' &&
        Array.isArray(val) &&
        val.every((ch) => typeof ch === 'object' && ch !== null && 'title' in ch && 'start' in ch)
      ) {
        updatePayload[key] = val
      } else if (key === 'publishedAt' && typeof val === 'number') {
        updatePayload[key] = val
      }
    }

    if (Object.keys(updatePayload).length) {
      episode.set(updatePayload)
      if (episode.changed()) {
        Logger.info(
          `[PodcastController] Updated episode "${episode.title}" keys`,
          episode.changed()
        )
        await episode.save()

        SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
      } else {
        Logger.info(`[PodcastController] No changes to episode "${episode.title}"`)
      }
    }

    res.json(libraryItem.toOldJSONExpanded())
  }

  /**
   * GET: /api/podcasts/:id/episode/:episodeId
   */
  async getEpisode(req: RequestWithLibraryItem, res: Response): Promise<Response | void> {
    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }
    const episodeId = req.params.episodeId

    const podcast = libraryItem.media as Podcast | undefined
    const podcastEpisodes = podcast?.podcastEpisodes ?? []
    const episode = podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(
        `[PodcastController] getEpisode episode ${episodeId} not found for item ${libraryItem.id}`
      )
      return res.sendStatus(404)
    }

    res.json(episode.toOldJSON(libraryItem.id))
  }

  /**
   * DELETE: /api/podcasts/:id/episode/:episodeId
   */
  async removeEpisode(req: RequestWithLibraryItem, res: Response): Promise<Response | void> {
    const libraryItem = req.libraryItem
    if (!libraryItem) {
      return res.sendStatus(404)
    }
    const episodeId = req.params.episodeId
    const hardDelete = req.query.hard === '1'

    const podcast = libraryItem.media as Podcast | undefined
    const podcastEpisodes = podcast?.podcastEpisodes ?? []
    const episode = podcastEpisodes.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(
        `[PodcastController] removeEpisode episode ${episodeId} not found for item ${libraryItem.id}`
      )
      return res.sendStatus(404)
    }

    // Remove it from the podcastEpisodes array
    if (podcast) {
      podcast.podcastEpisodes = podcastEpisodes.filter((ep) => ep.id !== episodeId)
    }

    if (hardDelete && episode.audioFile?.metadata?.path) {
      const audioPath = episode.audioFile.metadata.path
      // TODO: this will trigger the watcher. should maybe handle this gracefully
      await fs
        .remove(audioPath)
        .then(() => {
          Logger.info(`[PodcastController] Hard deleted episode file at "${audioPath}"`)
        })
        .catch((error: unknown) => {
          Logger.error(
            `[PodcastController] Failed to hard delete episode file at "${audioPath}"`,
            error
          )
        })
    }

    // Remove episode from playlists
    await Database.playlistModel.removeMediaItemsFromPlaylists([episodeId])

    // Remove media progress for this episode
    const mediaProgressRemoved = await Database.mediaProgressModel.destroy({
      where: {
        mediaItemId: episode.id
      }
    })
    if (mediaProgressRemoved) {
      Logger.info(
        `[PodcastController] Removed ${mediaProgressRemoved} media progress for episode ${episode.id}`
      )
    }

    // Remove episode
    await episode.destroy()

    // Remove library file
    const episodeAudioIno = episode.audioFile?.ino
    if (episodeAudioIno && libraryItem.libraryFiles) {
      libraryItem.libraryFiles = libraryItem.libraryFiles.filter(
        (file) => file.ino !== episodeAudioIno
      )
      libraryItem.changed('libraryFiles', true)
      await libraryItem.save()
    }

    // update number of episodes
    if (podcast) {
      podcast.numEpisodes = podcast.podcastEpisodes?.length ?? 0
      await podcast.save()
    }

    SocketAuthority.libraryItemEmitter('item_updated', libraryItem)
    res.json(libraryItem.toOldJSON())
  }

  /**
   * Middleware for podcast routes
   */
  async middleware(
    req: RequestWithLibraryItem,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    const libraryItem = await Database.libraryItemModel.getExpandedById(req.params.id)
    if (!libraryItem?.media) return res.sendStatus(404)

    if (!libraryItem.isPodcast) {
      return res.sendStatus(500)
    }

    if (!req.user) {
      return res.sendStatus(403)
    }

    // Check user can access this library item
    if (!req.user.checkCanAccessLibraryItem(libraryItem)) {
      return res.sendStatus(403)
    }

    if (req.method === 'DELETE' && !req.user.canDelete) {
      Logger.warn(
        `[PodcastController] User "${req.user.username}" attempted to delete without permission`
      )
      return res.sendStatus(403)
    } else if (
      (req.method === 'PATCH' || req.method === 'POST') &&
      !req.user.canUpdate
    ) {
      Logger.warn(
        `[PodcastController] User "${req.user.username}" attempted to update without permission`
      )
      return res.sendStatus(403)
    }

    req.libraryItem = libraryItem
    next()
  }
}

const podcastController = new PodcastController()

namespace podcastController {
  export type RequestWithUserType = RequestWithUser
  export type RequestWithLibraryItemType = RequestWithLibraryItem
  export type CronManagerLikeType = CronManagerLike
  export type ApiRouterContextType = ApiRouterContext
}

export = podcastController
