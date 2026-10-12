import type { Request, Response, NextFunction } from 'express'
import Logger from '../Logger'
import Database from '../Database'

import RssFeedManager from '../managers/RssFeedManager'
import type User from '../models/User'

interface RequestWithUser extends Request {
  user?: User
}

interface OpenFeedRequestBody {
  serverAddress?: string
  slug?: string
  [key: string]: unknown
}

class RSSFeedController {
  constructor() {}

  /**
   * GET: /api/feeds
   */
  async getAll(_req: RequestWithUser, res: Response): Promise<Response | void> {
    const feeds = await RssFeedManager.getFeeds()
    res.json({
      feeds: feeds.map((f) => f.toOldJSON()),
      minified: feeds.map((f) => f.toOldJSONMinified())
    })
  }

  /**
   * POST: /api/feeds/item/:itemId/open
   */
  async openRSSFeedForItem(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user) {
      return res.sendStatus(403)
    }

    const reqBody = (req.body ?? {}) as OpenFeedRequestBody

    const itemExpanded = await Database.libraryItemModel.getExpandedById(req.params.itemId)
    if (!itemExpanded) return res.sendStatus(404)

    // Check user can access this library item
    if (!req.user.checkCanAccessLibraryItem(itemExpanded)) {
      const mediaTitle = (itemExpanded.media as { title?: string } | undefined)?.title ?? ''
      Logger.error(
        `[RSSFeedController] User "${req.user.username}" attempted to open an RSS feed for item "${mediaTitle}" that they don't have access to`
      )
      return res.sendStatus(403)
    }

    // Check request body options exist
    if (
      !reqBody.serverAddress ||
      !reqBody.slug ||
      typeof reqBody.serverAddress !== 'string' ||
      typeof reqBody.slug !== 'string'
    ) {
      Logger.error(`[RSSFeedController] Invalid request body to open RSS feed`)
      return res.status(400).send('Invalid request body')
    }

    // Check item has audio tracks
    if (!itemExpanded.hasAudioTracks) {
      const mediaTitle = (itemExpanded.media as { title?: string } | undefined)?.title ?? ''
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed for item "${mediaTitle}" because it has no audio tracks`
      )
      return res.status(400).send('Item has no audio tracks')
    }

    // Check that this slug is not being used for another feed (slug will also be the Feed id)
    if (await RssFeedManager.checkExistsBySlug(reqBody.slug)) {
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed because slug "${reqBody.slug}" is already in use`
      )
      return res.status(400).send('Slug already in use')
    }

    const feed = await RssFeedManager.openFeedForItem(req.user.id, itemExpanded, reqBody)
    if (!feed) {
      const mediaTitle = (itemExpanded.media as { title?: string } | undefined)?.title ?? ''
      Logger.error(`[RSSFeedController] Failed to open RSS feed for item "${mediaTitle}"`)
      return res.status(500).send('Failed to open RSS feed')
    }

    res.json({
      feed: feed.toOldJSONMinified()
    })
  }

  /**
   * POST: /api/feeds/collection/:collectionId/open
   */
  async openRSSFeedForCollection(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user) {
      return res.sendStatus(403)
    }

    const reqBody = (req.body ?? {}) as OpenFeedRequestBody

    // Check request body options exist
    if (
      !reqBody.serverAddress ||
      !reqBody.slug ||
      typeof reqBody.serverAddress !== 'string' ||
      typeof reqBody.slug !== 'string'
    ) {
      Logger.error(`[RSSFeedController] Invalid request body to open RSS feed`)
      return res.status(400).send('Invalid request body')
    }

    // Check that this slug is not being used for another feed (slug will also be the Feed id)
    if (await RssFeedManager.checkExistsBySlug(reqBody.slug)) {
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed because slug "${reqBody.slug}" is already in use`
      )
      return res.status(400).send('Slug already in use')
    }

    const collection = await Database.collectionModel.getExpandedById(req.params.collectionId)
    if (!collection) return res.sendStatus(404)

    // Check collection has audio tracks
    const books = collection.books ?? []
    const hasAudioTracks = books.some((book) =>
      Boolean(book.includedAudioFiles && book.includedAudioFiles.length > 0)
    )
    if (!hasAudioTracks) {
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed for collection "${collection.name}" because it has no audio tracks`
      )
      return res.status(400).send('Collection has no audio tracks')
    }

    const feed = await RssFeedManager.openFeedForCollection(req.user.id, collection, reqBody)
    if (!feed) {
      Logger.error(
        `[RSSFeedController] Failed to open RSS feed for collection "${collection.name}"`
      )
      return res.status(500).send('Failed to open RSS feed')
    }

    res.json({
      feed: feed.toOldJSONMinified()
    })
  }

  /**
   * POST: /api/feeds/series/:seriesId/open
   */
  async openRSSFeedForSeries(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user) {
      return res.sendStatus(403)
    }

    const reqBody = (req.body ?? {}) as OpenFeedRequestBody

    // Check request body options exist
    if (
      !reqBody.serverAddress ||
      !reqBody.slug ||
      typeof reqBody.serverAddress !== 'string' ||
      typeof reqBody.slug !== 'string'
    ) {
      Logger.error(`[RSSFeedController] Invalid request body to open RSS feed`)
      return res.status(400).send('Invalid request body')
    }

    // Check that this slug is not being used for another feed (slug will also be the Feed id)
    if (await RssFeedManager.checkExistsBySlug(reqBody.slug)) {
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed because slug "${reqBody.slug}" is already in use`
      )
      return res.status(400).send('Slug already in use')
    }

    const series = await Database.seriesModel.getExpandedById(req.params.seriesId)
    if (!series) return res.sendStatus(404)

    // Check series has audio tracks
    const books = series.books ?? []
    const hasAudioTracks = books.some((book) =>
      Boolean(book.includedAudioFiles && book.includedAudioFiles.length > 0)
    )
    if (!hasAudioTracks) {
      Logger.error(
        `[RSSFeedController] Cannot open RSS feed for series "${series.name}" because it has no audio tracks`
      )
      return res.status(400).send('Series has no audio tracks')
    }

    const feed = await RssFeedManager.openFeedForSeries(req.user.id, series, reqBody)
    if (!feed) {
      Logger.error(`[RSSFeedController] Failed to open RSS feed for series "${series.name}"`)
      return res.status(500).send('Failed to open RSS feed')
    }

    res.json({
      feed: feed.toOldJSONMinified()
    })
  }

  /**
   * POST: /api/feeds/:id/close
   */
  async closeRSSFeed(req: RequestWithUser, res: Response): Promise<Response | void> {
    const feed = await Database.feedModel.findByPk(req.params.id)
    if (!feed) {
      Logger.error(
        `[RSSFeedController] Cannot close RSS feed because feed "${req.params.id}" does not exist`
      )
      return res.sendStatus(404)
    }

    await RssFeedManager.handleCloseFeed(feed)

    res.sendStatus(200)
  }

  /**
   * Middleware to check admin access
   */
  middleware(req: RequestWithUser, res: Response, next: NextFunction): Response | void {
    if (!req.user || !req.user.isAdminOrUp) {
      // Only admins can manage rss feeds
      const username = req.user?.username ?? 'Unknown'
      Logger.error(
        `[RSSFeedController] Non-admin user "${username}" attempted to make a request to an RSS feed route`
      )
      return res.sendStatus(403)
    }

    next()
  }
}

const rssFeedController = new RSSFeedController()

namespace rssFeedController {
  export type RequestWithUserType = RequestWithUser
}

export = rssFeedController
