import Path from 'path'
import { DataTypes, Model, Sequelize, type Transaction } from 'sequelize'
import Logger from '../Logger'
import RSS from '../libs/rss'
import type FeedEpisode from './FeedEpisode'
import type LibraryItem from './LibraryItem'
import type Collection from './Collection'
import type Series from './Series'
import type Playlist from './Playlist'
import type Book from './Book'
import type Author from './Author'
import type { AudioFileObject, AudioTrack, FeedOptions } from '../types'

interface FeedData {
  slug: string
  entityType: string
  entityId: string
  entityUpdatedAt: Date
  serverAddress: string
  feedURL: string
  imageURL: string
  siteURL: string
  title: string
  description: string | null
  author: string
  podcastType: string
  language?: string | null
  explicit: boolean
  coverPath: string | null
  userId: string
  preventIndexing?: boolean
  ownerName?: string | null
  ownerEmail?: string | null
}

class Feed extends Model {
  declare id: string
  declare slug: string
  declare entityType: string
  declare entityId: string
  declare entityUpdatedAt: Date | null
  declare serverAddress: string
  declare feedURL: string
  declare imageURL: string
  declare siteURL: string
  declare title: string
  declare description: string | null
  declare author: string
  declare podcastType: string
  declare language: string | null
  declare ownerName: string | null
  declare ownerEmail: string | null
  declare explicit: boolean
  declare preventIndexing: boolean
  declare coverPath: string | null
  declare userId: string
  declare createdAt: Date
  declare updatedAt: Date

  // Expanded properties
  declare feedEpisodes?: FeedEpisode[]
  declare entity?: LibraryItem | Collection | Series | Playlist

  /**
   * @param {string} feedId
   * @returns {Promise<boolean>} - true if feed was removed
   */
  static async removeById(feedId: string): Promise<boolean> {
    return (
      (await this.destroy({
        where: {
          id: feedId
        }
      })) > 0
    )
  }

  static getFeedImageURL(slug: string, coverPath?: string | null, entityUpdatedAt?: Date | null): string {
    if (!coverPath) return '/Logo.png'
    const cacheBuster = entityUpdatedAt != null ? `?ts=${entityUpdatedAt.valueOf()}` : ''
    return `/feed/${slug}/cover${Path.extname(coverPath)}${cacheBuster}`
  }

  static getFeedObjForLibraryItem(
    userId: string,
    libraryItem: {
      id: string
      mediaType: string
      updatedAt: Date
      media: {
        coverPath: string | null
        title: string
        description: string | null
        author?: string | null
        authorName?: string
        podcastType?: string | null
        language?: string | null
        explicit: boolean
        updatedAt: Date
        podcastEpisodes?: Array<{ updatedAt: Date }>
      }
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions | null = null
  ): FeedData {
    const media = libraryItem.media

    let entityUpdatedAt = libraryItem.updatedAt

    // Podcast feeds should use the most recent episode updatedAt if more recent
    if (libraryItem.mediaType === 'podcast' && media.podcastEpisodes?.length) {
      entityUpdatedAt = media.podcastEpisodes.reduce((mostRecent, episode) => {
        return episode.updatedAt > mostRecent ? episode.updatedAt : mostRecent
      }, entityUpdatedAt)
    } else if (media.updatedAt > entityUpdatedAt) {
      // Book feeds will use Book.updatedAt if more recent
      entityUpdatedAt = media.updatedAt
    }

    const feedObj: FeedData = {
      slug,
      entityType: 'libraryItem',
      entityId: libraryItem.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, media.coverPath, entityUpdatedAt),
      siteURL: `/item/${libraryItem.id}`,
      title: media.title,
      description: media.description,
      author: (libraryItem.mediaType === 'podcast' ? media.author : media.authorName) || '',
      podcastType: (libraryItem.mediaType === 'podcast' ? media.podcastType : 'serial') || 'serial',
      language: media.language,
      explicit: media.explicit,
      coverPath: media.coverPath,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = feedOptions.preventIndexing
      feedObj.ownerName = feedOptions.ownerName
      feedObj.ownerEmail = feedOptions.ownerEmail
    }

    return feedObj
  }

  static async createFeedForLibraryItem(
    userId: string,
    libraryItem: {
      id: string
      mediaType: string
      createdAt: Date
      updatedAt: Date
      media: Book & { podcastEpisodes?: unknown[]; includedAudioFiles?: AudioFileObject[] }
      getTrackList: () => AudioTrack[]
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const feedObj = this.getFeedObjForLibraryItem(userId, libraryItem as never, slug, serverAddress, feedOptions)

    const feedEpisodeModel = this.sequelize!.models.feedEpisode as unknown as typeof FeedEpisode

    const transaction = await this.sequelize!.transaction()
    try {
      const feed = (await this.create(feedObj as never, { transaction })) as Feed

      if (libraryItem.mediaType === 'podcast') {
        feed.feedEpisodes = await feedEpisodeModel.createFromPodcastEpisodes(libraryItem as never, feed as never, slug, transaction)
      } else {
        feed.feedEpisodes = await feedEpisodeModel.createFromAudiobookTracks(libraryItem as never, feed as never, slug, transaction)
      }

      await transaction.commit()

      return feed
    } catch (error) {
      Logger.error(`[Feed] Error creating feed for library item ${libraryItem.id}`, error)
      await transaction.rollback()
      return null
    }
  }

  static getFeedObjForCollection(
    userId: string,
    collectionExpanded: {
      id: string
      name: string
      description: string | null
      updatedAt: Date
      books: Array<Book & { libraryItem: { id: string; updatedAt: Date }; authors: Author[]; includedAudioFiles: AudioFileObject[] }>
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions | null = null
  ): { feedObj: FeedData; booksWithTracks: Array<Book & { libraryItem: { id: string; createdAt: Date; updatedAt: Date }; authors: Author[]; getTracklist: (id: string) => AudioTrack[]; includedAudioFiles?: AudioFileObject[] }> } {
    const booksWithTracks = collectionExpanded.books.filter((book) => book.includedAudioFiles.length)

    const entityUpdatedAt = booksWithTracks.reduce((mostRecent, book) => {
      const updatedAt = book.libraryItem.updatedAt > book.updatedAt ? book.libraryItem.updatedAt : book.updatedAt
      return updatedAt > mostRecent ? updatedAt : mostRecent
    }, collectionExpanded.updatedAt)

    const firstBookWithCover = booksWithTracks.find((book) => book.coverPath)

    const allBookAuthorNames = booksWithTracks.reduce((authorNames: string[], book) => {
      const bookAuthorsToAdd = book.authors.filter((author) => !authorNames.includes(author.name)).map((author) => author.name)
      return authorNames.concat(bookAuthorsToAdd)
    }, [])
    let author = allBookAuthorNames.slice(0, 3).join(', ')
    if (allBookAuthorNames.length > 3) {
      author += ' & more'
    }

    const feedObj: FeedData = {
      slug,
      entityType: 'collection',
      entityId: collectionExpanded.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, firstBookWithCover?.coverPath, entityUpdatedAt),
      siteURL: `/collection/${collectionExpanded.id}`,
      title: collectionExpanded.name,
      description: collectionExpanded.description || '',
      author,
      podcastType: 'serial',
      explicit: booksWithTracks.some((book) => book.explicit), // If any book is explicit, the feed is explicit
      coverPath: firstBookWithCover?.coverPath || null,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = feedOptions.preventIndexing
      feedObj.ownerName = feedOptions.ownerName
      feedObj.ownerEmail = feedOptions.ownerEmail
    }

    return {
      feedObj,
      booksWithTracks: booksWithTracks as never
    }
  }

  static async createFeedForCollection(
    userId: string,
    collectionExpanded: {
      id: string
      name: string
      description: string | null
      updatedAt: Date
      books: Array<Book & { libraryItem: { id: string; updatedAt: Date }; authors: Author[]; includedAudioFiles: AudioFileObject[] }>
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const { feedObj, booksWithTracks } = this.getFeedObjForCollection(userId, collectionExpanded, slug, serverAddress, feedOptions)

    const feedEpisodeModel = this.sequelize!.models.feedEpisode as unknown as typeof FeedEpisode

    const transaction = await this.sequelize!.transaction()
    try {
      const feed = (await this.create(feedObj as never, { transaction })) as Feed
      feed.feedEpisodes = await feedEpisodeModel.createFromBooks(booksWithTracks as never, feed, slug, transaction)

      await transaction.commit()

      return feed
    } catch (error) {
      Logger.error(`[Feed] Error creating feed for collection ${collectionExpanded.id}`, error)
      await transaction.rollback()
      return null
    }
  }

  static getFeedObjForSeries(
    userId: string,
    seriesExpanded: {
      id: string
      name: string
      description: string | null
      updatedAt: Date
      books: Array<Book & { libraryItem: { id: string; libraryId: string; updatedAt: Date }; authors: Author[]; includedAudioFiles: AudioFileObject[] }>
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions | null = null
  ): { feedObj: FeedData; booksWithTracks: Array<Book & { libraryItem: { id: string; libraryId: string; createdAt: Date; updatedAt: Date }; authors: Author[]; getTracklist: (id: string) => AudioTrack[]; includedAudioFiles?: AudioFileObject[] }> } {
    const booksWithTracks = seriesExpanded.books.filter((book) => book.includedAudioFiles.length)
    const entityUpdatedAt = booksWithTracks.reduce((mostRecent, book) => {
      const updatedAt = book.libraryItem.updatedAt > book.updatedAt ? book.libraryItem.updatedAt : book.updatedAt
      return updatedAt > mostRecent ? updatedAt : mostRecent
    }, seriesExpanded.updatedAt)

    const firstBookWithCover = booksWithTracks.find((book) => book.coverPath)

    const allBookAuthorNames = booksWithTracks.reduce((authorNames: string[], book) => {
      const bookAuthorsToAdd = book.authors.filter((author) => !authorNames.includes(author.name)).map((author) => author.name)
      return authorNames.concat(bookAuthorsToAdd)
    }, [])
    let author = allBookAuthorNames.slice(0, 3).join(', ')
    if (allBookAuthorNames.length > 3) {
      author += ' & more'
    }

    const feedObj: FeedData = {
      slug,
      entityType: 'series',
      entityId: seriesExpanded.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, firstBookWithCover?.coverPath, entityUpdatedAt),
      siteURL: `/library/${booksWithTracks[0]?.libraryItem?.libraryId}/series/${seriesExpanded.id}`,
      title: seriesExpanded.name,
      description: seriesExpanded.description || '',
      author,
      podcastType: 'serial',
      explicit: booksWithTracks.some((book) => book.explicit), // If any book is explicit, the feed is explicit
      coverPath: firstBookWithCover?.coverPath || null,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = feedOptions.preventIndexing
      feedObj.ownerName = feedOptions.ownerName
      feedObj.ownerEmail = feedOptions.ownerEmail
    }

    return {
      feedObj,
      booksWithTracks: booksWithTracks as never
    }
  }

  static async createFeedForSeries(
    userId: string,
    seriesExpanded: {
      id: string
      name: string
      description: string | null
      updatedAt: Date
      books: Array<Book & { libraryItem: { id: string; libraryId: string; updatedAt: Date }; authors: Author[]; includedAudioFiles: AudioFileObject[] }>
    },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const { feedObj, booksWithTracks } = this.getFeedObjForSeries(userId, seriesExpanded, slug, serverAddress, feedOptions)

    const feedEpisodeModel = this.sequelize!.models.feedEpisode as unknown as typeof FeedEpisode

    const transaction = await this.sequelize!.transaction()
    try {
      const feed = (await this.create(feedObj as never, { transaction })) as Feed
      feed.feedEpisodes = await feedEpisodeModel.createFromBooks(booksWithTracks as never, feed, slug, transaction)

      await transaction.commit()

      return feed
    } catch (error) {
      Logger.error(`[Feed] Error creating feed for series ${seriesExpanded.id}`, error)
      await transaction.rollback()
      return null
    }
  }

  /**
   * Initialize model
   *
   * Polymorphic association: Feeds can be created from LibraryItem, Collection, Playlist or Series
   */
  static override init(sequelize: Sequelize): typeof Feed
  static override init(attributes: unknown, options: unknown): typeof Feed
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Feed {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Feed
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        slug: DataTypes.STRING,
        entityType: DataTypes.STRING,
        entityId: DataTypes.UUID,
        entityUpdatedAt: DataTypes.DATE,
        serverAddress: DataTypes.STRING,
        feedURL: DataTypes.STRING,
        imageURL: DataTypes.STRING,
        siteURL: DataTypes.STRING,
        title: DataTypes.STRING,
        description: DataTypes.TEXT,
        author: DataTypes.STRING,
        podcastType: DataTypes.STRING,
        language: DataTypes.STRING,
        ownerName: DataTypes.STRING,
        ownerEmail: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN,
        preventIndexing: DataTypes.BOOLEAN,
        coverPath: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'feed'
      }
    )

    const { user, libraryItem, collection, series, playlist } = sequelize.models

    user.hasMany(Feed)
    Feed.belongsTo(user)

    libraryItem.hasMany(Feed, {
      foreignKey: 'entityId',
      constraints: false,
      scope: {
        entityType: 'libraryItem'
      }
    })
    Feed.belongsTo(libraryItem, { foreignKey: 'entityId', constraints: false })

    collection.hasMany(Feed, {
      foreignKey: 'entityId',
      constraints: false,
      scope: {
        entityType: 'collection'
      }
    })
    Feed.belongsTo(collection, { foreignKey: 'entityId', constraints: false })

    series.hasMany(Feed, {
      foreignKey: 'entityId',
      constraints: false,
      scope: {
        entityType: 'series'
      }
    })
    Feed.belongsTo(series, { foreignKey: 'entityId', constraints: false })

    playlist.hasMany(Feed, {
      foreignKey: 'entityId',
      constraints: false,
      scope: {
        entityType: 'playlist'
      }
    })
    Feed.belongsTo(playlist, { foreignKey: 'entityId', constraints: false })

    Feed.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      let results: unknown[]
      if (!Array.isArray(findResult)) {
        results = [findResult]
      } else {
        results = findResult
      }
      for (const inst of results) {
        const instance = inst as Record<string, unknown> & { dataValues: Record<string, unknown> }
        if (instance.entityType === 'libraryItem' && instance.libraryItem !== undefined) {
          instance.entity = instance.libraryItem
          instance.dataValues.entity = instance.dataValues.libraryItem
        } else if (instance.entityType === 'collection' && instance.collection !== undefined) {
          instance.entity = instance.collection
          instance.dataValues.entity = instance.dataValues.collection
        } else if (instance.entityType === 'series' && instance.series !== undefined) {
          instance.entity = instance.series
          instance.dataValues.entity = instance.dataValues.series
        } else if (instance.entityType === 'playlist' && instance.playlist !== undefined) {
          instance.entity = instance.playlist
          instance.dataValues.entity = instance.dataValues.playlist
        }

        // To prevent mistakes:
        delete instance.libraryItem
        delete instance.dataValues.libraryItem
        delete instance.collection
        delete instance.dataValues.collection
        delete instance.series
        delete instance.dataValues.series
        delete instance.playlist
        delete instance.dataValues.playlist
      }
    })

    return Feed
  }

  async updateFeedForEntity(): Promise<Feed | null> {
    const feedEpisodeModel = this.sequelize!.models.feedEpisode as unknown as typeof FeedEpisode

    let feedObj: Record<string, unknown> | null = null
    let feedEpisodeCreateFunc: ((entity: unknown, feed: Feed, slug: string, transaction: Transaction) => Promise<FeedEpisode[]>) | null = null
    let feedEpisodeCreateFuncEntity: unknown = null

    if (this.entityType === 'libraryItem') {
      const libraryItemModel = this.sequelize!.models.libraryItem as unknown as { getExpandedById: (id: string) => Promise<unknown> }

      const itemExpanded = (await libraryItemModel.getExpandedById(this.entityId)) as { mediaType: string } & Parameters<typeof Feed.getFeedObjForLibraryItem>[1]
      feedObj = Feed.getFeedObjForLibraryItem(this.userId, itemExpanded, this.slug, this.serverAddress) as unknown as Record<string, unknown>

      feedEpisodeCreateFuncEntity = itemExpanded
      if (itemExpanded.mediaType === 'podcast') {
        feedEpisodeCreateFunc = (ent, fd, slg, tx) => feedEpisodeModel.createFromPodcastEpisodes(ent as never, fd as never, slg, tx)
      } else {
        feedEpisodeCreateFunc = (ent, fd, slg, tx) => feedEpisodeModel.createFromAudiobookTracks(ent as never, fd as never, slg, tx)
      }
    } else if (this.entityType === 'collection') {
      const collectionModel = this.sequelize!.models.collection as unknown as { getExpandedById: (id: string) => Promise<unknown> }

      const collectionExpanded = (await collectionModel.getExpandedById(this.entityId)) as Parameters<typeof Feed.getFeedObjForCollection>[1]
      const feedObjData = Feed.getFeedObjForCollection(this.userId, collectionExpanded, this.slug, this.serverAddress)
      feedObj = feedObjData.feedObj as unknown as Record<string, unknown>
      feedEpisodeCreateFuncEntity = feedObjData.booksWithTracks
      feedEpisodeCreateFunc = (ent, fd, slg, tx) => feedEpisodeModel.createFromBooks(ent as never, fd as never, slg, tx)
    } else if (this.entityType === 'series') {
      const seriesModel = this.sequelize!.models.series as unknown as { getExpandedById: (id: string) => Promise<unknown> }

      const seriesExpanded = (await seriesModel.getExpandedById(this.entityId)) as Parameters<typeof Feed.getFeedObjForSeries>[1]
      const feedObjData = Feed.getFeedObjForSeries(this.userId, seriesExpanded, this.slug, this.serverAddress)
      feedObj = feedObjData.feedObj as unknown as Record<string, unknown>
      feedEpisodeCreateFuncEntity = feedObjData.booksWithTracks
      feedEpisodeCreateFunc = (ent, fd, slg, tx) => feedEpisodeModel.createFromBooks(ent as never, fd as never, slg, tx)
    } else {
      Logger.error(`[Feed] Invalid entity type ${this.entityType} for feed ${this.id}`)
      return null
    }

    const transaction = await this.sequelize!.transaction()
    try {
      const updatedFeed = (await this.update(feedObj, { transaction })) as Feed

      const existingFeedEpisodeIds = this.feedEpisodes?.map((ep) => ep.id) || []

      // Create new feed episodes
      const createdEpisodes = await feedEpisodeCreateFunc!(feedEpisodeCreateFuncEntity, updatedFeed, this.slug, transaction)
      updatedFeed.feedEpisodes = createdEpisodes

      const newFeedEpisodeIds = createdEpisodes.map((ep) => ep.id)
      const feedEpisodeIdsToRemove = existingFeedEpisodeIds.filter((epid) => !newFeedEpisodeIds.includes(epid))

      if (feedEpisodeIdsToRemove.length) {
        Logger.info(`[Feed] Removing ${feedEpisodeIdsToRemove.length} episodes from feed ${this.id}`)
        await feedEpisodeModel.destroy({
          where: {
            id: feedEpisodeIdsToRemove
          },
          transaction
        })
      }

      await transaction.commit()

      return updatedFeed
    } catch (error) {
      Logger.error(`[Feed] Error updating feed ${this.entityId}`, error)
      await transaction.rollback()

      return null
    }
  }

  getEntity(options?: unknown): Promise<unknown> {
    if (!this.entityType) return Promise.resolve(null)
    const sequelize = this.sequelize as (Sequelize & { uppercaseFirst?: (str: string) => string }) | undefined
    const uppercaseFirst = sequelize?.uppercaseFirst || ((str: string) => str.charAt(0).toUpperCase() + str.slice(1))
    const mixinMethodName = `get${uppercaseFirst(this.entityType)}`
    const self = this as unknown as Record<string, (opts?: unknown) => Promise<unknown>>
    if (typeof self[mixinMethodName] === 'function') {
      return self[mixinMethodName](options)
    }
    return Promise.resolve(null)
  }

  buildXml(hostPrefix: string): string {
    const customElements: Array<Record<string, unknown>> = [
      { language: this.language || 'en' },
      { author: this.author || 'advplyr' },
      { 'itunes:author': this.author || 'advplyr' },
      { 'itunes:type': this.podcastType || 'serial' },
      {
        'itunes:image': {
          _attr: {
            href: `${hostPrefix}${this.imageURL}`
          }
        }
      },
      { 'itunes:explicit': !!this.explicit }
    ]

    if (this.description) {
      customElements.push({ 'itunes:summary': { _cdata: this.description } })
    }

    const itunesOwnersData: Array<Record<string, unknown>> = []
    if (this.ownerName || this.author) {
      itunesOwnersData.push({ 'itunes:name': this.ownerName || this.author })
    }
    if (this.ownerEmail) {
      itunesOwnersData.push({ 'itunes:email': this.ownerEmail })
    }
    if (itunesOwnersData.length) {
      customElements.push({
        'itunes:owner': itunesOwnersData
      })
    }

    if (this.preventIndexing) {
      customElements.push({ 'itunes:block': 'yes' }, { 'googleplay:block': 'yes' })
    }

    const rssData = {
      title: this.title,
      description: this.description || '',
      generator: 'Audiobookshelf',
      feed_url: `${hostPrefix}${this.feedURL}`,
      site_url: `${hostPrefix}${this.siteURL}`,
      image_url: `${hostPrefix}${this.imageURL}`,
      custom_namespaces: {
        itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
        podcast: 'https://podcastindex.org/namespace/1.0',
        googleplay: 'http://www.google.com/schemas/play-podcasts/1.0'
      },
      custom_elements: customElements
    }

    const rssfeed = new RSS(rssData)
    this.feedEpisodes?.forEach((ep) => {
      rssfeed.item(ep.getRSSData(hostPrefix) as never)
    })
    return rssfeed.xml()
  }

  getEpisodePath(id: string): string | null {
    const episode = this.feedEpisodes?.find((ep) => ep.id === id)
    if (!episode) return null
    return episode.filePath
  }

  toOldJSON(): Record<string, unknown> {
    const episodes = this.feedEpisodes?.map((feedEpisode) => feedEpisode.getOldEpisode())
    return {
      id: this.id,
      slug: this.slug,
      userId: this.userId,
      entityType: this.entityType,
      entityId: this.entityId,
      entityUpdatedAt: this.entityUpdatedAt?.valueOf() || null,
      coverPath: this.coverPath || null,
      meta: {
        title: this.title,
        description: this.description,
        author: this.author,
        imageUrl: this.imageURL,
        feedUrl: this.feedURL,
        link: this.siteURL,
        explicit: this.explicit,
        type: this.podcastType,
        language: this.language,
        preventIndexing: this.preventIndexing,
        ownerName: this.ownerName,
        ownerEmail: this.ownerEmail
      },
      serverAddress: this.serverAddress,
      feedUrl: this.feedURL,
      episodes: episodes || [],
      createdAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONMinified(): Record<string, unknown> {
    return {
      id: this.id,
      entityType: this.entityType,
      entityId: this.entityId,
      feedUrl: this.feedURL,
      meta: {
        title: this.title,
        description: this.description,
        preventIndexing: this.preventIndexing,
        ownerName: this.ownerName,
        ownerEmail: this.ownerEmail
      }
    }
  }
}

export = Feed
