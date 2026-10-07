import type { Request, Response } from 'express'
import Path from 'path'
import Logger from '../Logger'
import { getAudioMimeTypeFromExtname } from '../utils/fileUtils'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'
import fs from '../libs/fsExtra'
import type Feed from '../models/Feed'
import type { FeedOptions } from '../models/Feed'
import type LibraryItem from '../models/LibraryItem'
import type Collection from '../models/Collection'
import type Series from '../models/Series'

class RssFeedManager {
  constructor() {}

  /**
   * Remove invalid feeds (invalid if the entity does not exist)
   */
  async init(): Promise<void> {
    const feeds = await Database.feedModel.findAll({
      attributes: ['id', 'entityId', 'entityType', 'title'],
      include: [
        {
          model: Database.libraryItemModel,
          attributes: ['id']
        },
        {
          model: Database.collectionModel,
          attributes: ['id']
        },
        {
          model: Database.seriesModel,
          attributes: ['id']
        }
      ]
    })

    const feedIdsToRemove: string[] = []
    for (const feed of feeds) {
      if (!feed.entity) {
        Logger.error(`[RssFeedManager] Removing feed "${feed.title}". Entity not found`)
        feedIdsToRemove.push(feed.id)
      }
    }

    if (feedIdsToRemove.length) {
      Logger.info(`[RssFeedManager] Removing ${feedIdsToRemove.length} invalid feeds`)
      await Database.feedModel.destroy({
        where: {
          id: feedIdsToRemove
        }
      })
    }
  }

  /**
   * Find open feed for an entity (e.g. collection id, playlist id, library item id)
   * @param entityId
   * @returns
   */
  findFeedForEntityId(entityId: string): Promise<Feed | null> {
    return Database.feedModel.findOne({
      where: {
        entityId
      }
    })
  }

  /**
   * @param slug
   * @returns
   */
  checkExistsBySlug(slug: string): Promise<boolean> {
    return Database.feedModel
      .count({
        where: {
          slug
        }
      })
      .then((count: number) => count > 0)
  }

  /**
   * Feed requires update if the entity (or child entities) has been updated since the feed was last updated
   *
   * @param feed
   * @returns
   */
  async checkFeedRequiresUpdate(feed: Feed): Promise<boolean> {
    if (feed.entityType === 'libraryItem') {
      const entity = (await feed.getEntity({
        attributes: ['id', 'updatedAt', 'mediaId', 'mediaType']
      })) as LibraryItem | null
      feed.entity = entity

      if (!entity) return false

      let newEntityUpdatedAt = entity.updatedAt ? new Date(entity.updatedAt).getTime() : 0

      if (entity.mediaType === 'podcast') {
        const mostRecentPodcastEpisode = await Database.podcastEpisodeModel.findOne({
          where: {
            podcastId: entity.mediaId
          },
          attributes: ['id', 'updatedAt'],
          order: [['updatedAt', 'DESC']]
        })

        if (mostRecentPodcastEpisode?.updatedAt) {
          const epUpdatedAt = new Date(mostRecentPodcastEpisode.updatedAt).getTime()
          if (epUpdatedAt > newEntityUpdatedAt) {
            newEntityUpdatedAt = epUpdatedAt
          }
        }
      } else {
        const book = await Database.bookModel.findOne({
          where: {
            id: entity.mediaId
          },
          attributes: ['id', 'updatedAt']
        })
        if (book?.updatedAt) {
          const bookUpdatedAt = new Date(book.updatedAt).getTime()
          if (bookUpdatedAt > newEntityUpdatedAt) {
            newEntityUpdatedAt = bookUpdatedAt
          }
        }
      }

      const feedEntityUpdatedAt = feed.entityUpdatedAt ? new Date(feed.entityUpdatedAt).getTime() : 0
      return newEntityUpdatedAt > feedEntityUpdatedAt
    } else if (feed.entityType === 'collection' || feed.entityType === 'series') {
      type EntityWithBooks = {
        id: string
        updatedAt?: Date | string | number
        books?: Array<{
          id: string
          updatedAt?: Date | string | number
          includedAudioFiles?: unknown[]
          libraryItem?: { id: string; updatedAt?: Date | string | number }
        }>
      }

      const entity = (await feed.getEntity({
        attributes: ['id', 'updatedAt'],
        include: {
          model: Database.bookModel,
          attributes: ['id', 'audioFiles', 'updatedAt'],
          through: {
            attributes: []
          },
          include: {
            model: Database.libraryItemModel,
            attributes: ['id', 'updatedAt']
          }
        }
      })) as EntityWithBooks | null
      feed.entity = entity

      if (!entity) return false

      const entityBooks = entity.books ?? []
      const totalBookTracks = entityBooks.reduce(
        (total, book) => total + (book.includedAudioFiles?.length ?? 0),
        0
      )
      if (feed.feedEpisodes && feed.feedEpisodes.length !== totalBookTracks) {
        return true
      }

      let newEntityUpdatedAt = entity.updatedAt ? new Date(entity.updatedAt).getTime() : 0

      const mostRecentItemUpdatedAt = entityBooks.reduce((mostRecent, book) => {
        const bookUpdated = book.updatedAt ? new Date(book.updatedAt).getTime() : 0
        const itemUpdated = book.libraryItem?.updatedAt ? new Date(book.libraryItem.updatedAt).getTime() : 0
        const updatedAt = itemUpdated > bookUpdated ? itemUpdated : bookUpdated
        return updatedAt > mostRecent ? updatedAt : mostRecent
      }, 0)

      if (mostRecentItemUpdatedAt > newEntityUpdatedAt) {
        newEntityUpdatedAt = mostRecentItemUpdatedAt
      }

      const feedEntityUpdatedAt = feed.entityUpdatedAt ? new Date(feed.entityUpdatedAt).getTime() : 0
      return newEntityUpdatedAt > feedEntityUpdatedAt
    } else {
      throw new Error('Invalid feed entity type')
    }
  }

  /**
   * GET: /feed/:slug
   *
   * @param req
   * @param res
   */
  async getFeed(req: Request, res: Response): Promise<void> {
    let feed = await Database.feedModel.findOne({
      where: {
        slug: req.params.slug
      },
      include: {
        model: Database.feedEpisodeModel
      }
    })
    if (!feed) {
      Logger.warn(`[RssFeedManager] Feed not found ${req.params.slug}`)
      res.sendStatus(404)
      return
    }

    const feedRequiresUpdate = await this.checkFeedRequiresUpdate(feed)
    if (feedRequiresUpdate) {
      Logger.info(`[RssFeedManager] Feed "${feed.title}" requires update - updating feed`)
      const updatedFeed = await feed.updateFeedForEntity()
      if (updatedFeed) {
        feed = updatedFeed
      }
    }

    const xml = feed.buildXml(req.originalHostPrefix ?? '')
    res.set('Content-Type', 'text/xml')
    res.send(xml)
  }

  /**
   * GET: /feed/:slug/item/:episodeId/*
   *
   * @param req
   * @param res
   */
  async getFeedItem(req: Request, res: Response): Promise<void> {
    const feed = await Database.feedModel.findOne({
      where: {
        slug: req.params.slug
      },
      attributes: ['id', 'slug'],
      include: {
        model: Database.feedEpisodeModel,
        attributes: ['id', 'filePath']
      }
    })

    if (!feed) {
      Logger.debug(`[RssFeedManager] Feed not found ${req.params.slug}`)
      res.sendStatus(404)
      return
    }
    const episodePath = feed.getEpisodePath(req.params.episodeId)
    if (!episodePath) {
      Logger.error(`[RssFeedManager] Feed episode not found ${req.params.episodeId}`)
      res.sendStatus(404)
      return
    }
    // Express does not set the correct mimetype for m4b files so use our defined mimetypes if available
    const audioMimeType = getAudioMimeTypeFromExtname(Path.extname(episodePath))
    if (audioMimeType) {
      res.setHeader('Content-Type', audioMimeType)
    }
    res.sendFile(episodePath)
  }

  /**
   * GET: /feed/:slug/cover*
   *
   * @param req
   * @param res
   */
  async getFeedCover(req: Request, res: Response): Promise<void> {
    const feed = await Database.feedModel.findOne({
      where: {
        slug: req.params.slug
      },
      attributes: ['coverPath']
    })
    if (!feed || !feed.coverPath) {
      Logger.debug(`[RssFeedManager] Feed not found ${req.params.slug}`)
      res.sendStatus(404)
      return
    }

    const extname = Path.extname(feed.coverPath).toLowerCase().slice(1)
    res.type(`image/${extname}`)
    const readStream = fs.createReadStream(feed.coverPath)

    readStream.on('error', (error: Error) => {
      Logger.error(`[RssFeedManager] Error streaming cover image: ${error.message}`)
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.sendStatus(404)
      }
    })

    readStream.pipe(res)
  }

  /**
   * @param options
   * @returns
   */
  getFeedOptionsFromReqOptions(options: Record<string, unknown>): FeedOptions {
    const metadataDetails =
      options.metadataDetails && typeof options.metadataDetails === 'object'
        ? (options.metadataDetails as Record<string, unknown>)
        : {}

    const preventIndexing = metadataDetails.preventIndexing !== false

    return {
      preventIndexing,
      ownerName: typeof metadataDetails.ownerName === 'string' ? metadataDetails.ownerName : null,
      ownerEmail: typeof metadataDetails.ownerEmail === 'string' ? metadataDetails.ownerEmail : null
    }
  }

  /**
   * @param userId
   * @param libraryItem
   * @param options
   * @returns
   */
  async openFeedForItem(
    userId: string,
    libraryItem: LibraryItem,
    options: { serverAddress?: string; slug?: string; [key: string]: unknown }
  ): Promise<Feed | null> {
    const serverAddress = typeof options.serverAddress === 'string' ? options.serverAddress : ''
    const slug = typeof options.slug === 'string' ? options.slug : ''
    const feedOptions = this.getFeedOptionsFromReqOptions(options)

    const mediaObj = libraryItem.media as { title?: string } | undefined
    Logger.info(`[RssFeedManager] Creating RSS feed for item ${libraryItem.id} "${mediaObj?.title ?? ''}"`)
    const feedExpanded = await Database.feedModel.createFeedForLibraryItem(
      userId,
      libraryItem,
      slug,
      serverAddress,
      feedOptions
    )
    if (feedExpanded) {
      Logger.info(`[RssFeedManager] Opened RSS feed "${feedExpanded.feedURL}"`)
      SocketAuthority.emitter('rss_feed_open', feedExpanded.toOldJSONMinified())
    }
    return feedExpanded
  }

  /**
   * @param userId
   * @param collectionExpanded
   * @param options
   * @returns
   */
  async openFeedForCollection(
    userId: string,
    collectionExpanded: Collection,
    options: { serverAddress?: string; slug?: string; [key: string]: unknown }
  ): Promise<Feed | null> {
    const serverAddress = typeof options.serverAddress === 'string' ? options.serverAddress : ''
    const slug = typeof options.slug === 'string' ? options.slug : ''
    const feedOptions = this.getFeedOptionsFromReqOptions(options)

    Logger.info(`[RssFeedManager] Creating RSS feed for collection "${collectionExpanded.name}"`)
    const feedExpanded = await Database.feedModel.createFeedForCollection(
      userId,
      collectionExpanded,
      slug,
      serverAddress,
      feedOptions
    )
    if (feedExpanded) {
      Logger.info(`[RssFeedManager] Opened RSS feed "${feedExpanded.feedURL}"`)
      SocketAuthority.emitter('rss_feed_open', feedExpanded.toOldJSONMinified())
    }
    return feedExpanded
  }

  /**
   * @param userId
   * @param seriesExpanded
   * @param options
   * @returns
   */
  async openFeedForSeries(
    userId: string,
    seriesExpanded: Series,
    options: { serverAddress?: string; slug?: string; [key: string]: unknown }
  ): Promise<Feed | null> {
    const serverAddress = typeof options.serverAddress === 'string' ? options.serverAddress : ''
    const slug = typeof options.slug === 'string' ? options.slug : ''
    const feedOptions = this.getFeedOptionsFromReqOptions(options)

    Logger.info(`[RssFeedManager] Creating RSS feed for series "${seriesExpanded.name}"`)
    const feedExpanded = await Database.feedModel.createFeedForSeries(
      userId,
      seriesExpanded,
      slug,
      serverAddress,
      feedOptions
    )
    if (feedExpanded) {
      Logger.info(`[RssFeedManager] Opened RSS feed "${feedExpanded.feedURL}"`)
      SocketAuthority.emitter('rss_feed_open', feedExpanded.toOldJSONMinified())
    }
    return feedExpanded
  }

  /**
   * Close Feed and emit Socket event
   *
   * @param feed
   * @returns true if feed was closed
   */
  async handleCloseFeed(feed: Feed | null): Promise<boolean> {
    if (!feed) return false
    const wasRemoved = await Database.feedModel.removeById(feed.id)
    SocketAuthority.emitter('rss_feed_closed', feed.toOldJSONMinified())
    Logger.info(`[RssFeedManager] Closed RSS feed "${feed.feedURL}"`)
    return wasRemoved
  }

  /**
   * @param entityId
   * @returns true if feed was closed
   */
  async closeFeedForEntityId(entityId: string): Promise<boolean> {
    const feed = await Database.feedModel.findOne({
      where: {
        entityId
      }
    })
    if (!feed) {
      return false
    }
    return this.handleCloseFeed(feed)
  }

  /**
   * @param entityIds
   */
  async closeFeedsForEntityIds(entityIds: string[]): Promise<void> {
    const feeds = await Database.feedModel.findAll({
      where: {
        entityId: entityIds
      }
    })
    for (const feed of feeds) {
      await this.handleCloseFeed(feed)
    }
  }

  getFeeds(): Promise<Feed[]> {
    return Database.feedModel.findAll({
      include: {
        model: Database.feedEpisodeModel
      }
    })
  }
}

const rssFeedManager = new RssFeedManager()
export = rssFeedManager
