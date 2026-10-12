import Path from 'path'
import { DataTypes, Model, NonAttribute, Optional, Sequelize, Transaction } from 'sequelize'
import Logger from '../Logger'
import RSS from '../libs/rss'
import FeedEpisode from './FeedEpisode'
import type User from './User'
import LibraryItem from './LibraryItem'
import Series from './Series'
import Collection from './Collection'
import type Playlist from './Playlist'
import type { Book, AudioFileObject, AudioTrack } from './Book'
import type {
  FeedMetaJsonObject,
  FeedMinifiedMetaJsonObject,
  FeedOldJsonObject,
  FeedOldJsonMinifiedObject
} from '../types'

export type {
  FeedMetaJsonObject,
  FeedMinifiedMetaJsonObject,
  FeedOldJsonObject,
  FeedOldJsonMinifiedObject
}

export interface FeedOptions {
  preventIndexing?: boolean
  ownerName?: string | null
  ownerEmail?: string | null
}

export interface FeedAttributes {
  id: string
  slug: string
  entityType: string
  entityId: string
  entityUpdatedAt: Date | null
  serverAddress: string
  feedURL: string
  imageURL: string | null
  siteURL: string | null
  title: string
  description: string | null
  author: string | null
  podcastType: string | null
  language: string | null
  ownerName: string | null
  ownerEmail: string | null
  explicit: boolean
  preventIndexing: boolean
  coverPath: string | null
  userId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface FeedCreationAttributes
  extends Optional<
    FeedAttributes,
    | 'id'
    | 'entityUpdatedAt'
    | 'imageURL'
    | 'siteURL'
    | 'description'
    | 'author'
    | 'podcastType'
    | 'language'
    | 'ownerName'
    | 'ownerEmail'
    | 'explicit'
    | 'preventIndexing'
    | 'coverPath'
    | 'userId'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class Feed
  extends Model<FeedAttributes, FeedCreationAttributes>
  implements FeedAttributes
{
  declare id: string
  declare slug: string
  declare entityType: string
  declare entityId: string
  declare entityUpdatedAt: Date | null
  declare serverAddress: string
  declare feedURL: string
  declare imageURL: string | null
  declare siteURL: string | null
  declare title: string
  declare description: string | null
  declare author: string | null
  declare podcastType: string | null
  declare language: string | null
  declare ownerName: string | null
  declare ownerEmail: string | null
  declare explicit: boolean
  declare preventIndexing: boolean
  declare coverPath: string | null
  declare userId: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Expanded properties
  declare feedEpisodes?: NonAttribute<FeedEpisode[]>
  declare user?: NonAttribute<User>
  declare entity?: NonAttribute<LibraryItem | Collection | Series | object> | null
  declare libraryItem?: NonAttribute<LibraryItem>
  declare collection?: NonAttribute<Collection>
  declare series?: NonAttribute<Series>
  declare playlist?: NonAttribute<Playlist>

  static async removeById(feedId: string): Promise<boolean> {
    const deletedCount = await this.destroy({
      where: {
        id: feedId
      }
    })
    return deletedCount > 0
  }

  static getFeedImageURL(
    slug: string,
    coverPath?: string | null,
    entityUpdatedAt?: Date | null
  ): string {
    if (!coverPath) return '/Logo.png'
    const cacheBuster = entityUpdatedAt != null ? `?ts=${entityUpdatedAt.valueOf()}` : ''
    return `/feed/${slug}/cover${Path.extname(coverPath)}${cacheBuster}`
  }

  static getFeedObjForLibraryItem(
    userId: string,
    libraryItem: LibraryItem,
    slug: string,
    serverAddress: string,
    feedOptions?: FeedOptions | null
  ): FeedCreationAttributes {
    const media = libraryItem.media as {
      coverPath?: string | null
      updatedAt?: Date
      title?: string
      description?: string | null
      author?: string | null
      authorName?: string | null
      podcastType?: string | null
      language?: string | null
      explicit?: boolean
      podcastEpisodes?: Array<{ updatedAt: Date }>
    } | undefined

    let entityUpdatedAt: Date | null = libraryItem.updatedAt ?? null

    if (libraryItem.mediaType === 'podcast' && Array.isArray(media?.podcastEpisodes)) {
      const episodes = media.podcastEpisodes
      entityUpdatedAt = episodes.reduce((mostRecent, episode) => {
        if (!mostRecent) return episode.updatedAt
        return episode.updatedAt > mostRecent ? episode.updatedAt : mostRecent
      }, entityUpdatedAt)
    } else if (media?.updatedAt && (!entityUpdatedAt || media.updatedAt > entityUpdatedAt)) {
      entityUpdatedAt = media.updatedAt
    }

    const feedObj: FeedCreationAttributes = {
      slug,
      entityType: 'libraryItem',
      entityId: libraryItem.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, media?.coverPath ?? null, entityUpdatedAt),
      siteURL: `/item/${libraryItem.id}`,
      title: media?.title ?? '',
      description: media?.description ?? null,
      author:
        libraryItem.mediaType === 'podcast'
          ? (media?.author ?? null)
          : (media?.authorName ?? null),
      podcastType: libraryItem.mediaType === 'podcast' ? (media?.podcastType ?? null) : 'serial',
      language: media?.language ?? null,
      explicit: Boolean(media?.explicit),
      coverPath: media?.coverPath ?? null,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = Boolean(feedOptions.preventIndexing)
      feedObj.ownerName = feedOptions.ownerName ?? null
      feedObj.ownerEmail = feedOptions.ownerEmail ?? null
    }

    return feedObj
  }

  static async createFeedForLibraryItem(
    userId: string,
    libraryItem: LibraryItem,
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const feedObj = this.getFeedObjForLibraryItem(
      userId,
      libraryItem,
      slug,
      serverAddress,
      feedOptions
    )

    if (!this.sequelize) return null
    const transaction = await this.sequelize.transaction()
    try {
      const feed = await this.create(feedObj, { transaction })

      if (libraryItem.mediaType === 'podcast') {
        feed.feedEpisodes = await FeedEpisode.createFromPodcastEpisodes(
          libraryItem as Parameters<typeof FeedEpisode.createFromPodcastEpisodes>[0],
          feed,
          slug,
          transaction
        )
      } else {
        feed.feedEpisodes = await FeedEpisode.createFromAudiobookTracks(
          libraryItem as Parameters<typeof FeedEpisode.createFromAudiobookTracks>[0],
          feed,
          slug,
          transaction
        )
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
      updatedAt?: Date
      books: Array<
        Book & {
          libraryItem: { id: string; libraryId: string; updatedAt?: Date }
          includedAudioFiles: AudioFileObject[]
          updatedAt?: Date
          coverPath?: string | null
          authors: Array<{ name: string }>
          explicit: boolean
          getTracklist(libraryItemId: string): AudioTrack[]
        }
      >
      name: string
      description?: string | null
    },
    slug: string,
    serverAddress: string,
    feedOptions?: FeedOptions | null
  ): {
    feedObj: FeedCreationAttributes
    booksWithTracks: Array<
      Book & {
        libraryItem: { id: string; libraryId: string; updatedAt?: Date; createdAt: Date }
        includedAudioFiles: AudioFileObject[]
        updatedAt?: Date
        coverPath?: string | null
        authors: Array<{ name: string }>
        explicit: boolean
        title: string
        description: string | null
        getTracklist(libraryItemId: string): AudioTrack[]
      }
    >
  } {
    const booksWithTracks = collectionExpanded.books.filter(
      (book) => book.includedAudioFiles?.length
    ) as Array<
      Book & {
        libraryItem: { id: string; libraryId: string; updatedAt?: Date; createdAt: Date }
        includedAudioFiles: AudioFileObject[]
        updatedAt?: Date
        coverPath?: string | null
        authors: Array<{ name: string }>
        explicit: boolean
        title: string
        description: string | null
        getTracklist(libraryItemId: string): AudioTrack[]
      }
    >

    const entityUpdatedAt = booksWithTracks.reduce((mostRecent, book) => {
      const updatedAt =
        book.libraryItem.updatedAt && book.updatedAt && book.libraryItem.updatedAt > book.updatedAt
          ? book.libraryItem.updatedAt
          : (book.updatedAt ?? null)
      if (!mostRecent) return updatedAt
      if (updatedAt && updatedAt > mostRecent) return updatedAt
      return mostRecent
    }, collectionExpanded.updatedAt ?? null)

    const firstBookWithCover = booksWithTracks.find((book) => book.coverPath)

    const allBookAuthorNames = booksWithTracks.reduce((authorNames: string[], book) => {
      const bookAuthorsToAdd = book.authors
        .filter((author) => !authorNames.includes(author.name))
        .map((author) => author.name)
      return authorNames.concat(bookAuthorsToAdd)
    }, [])

    let author = allBookAuthorNames.slice(0, 3).join(', ')
    if (allBookAuthorNames.length > 3) {
      author += ' & more'
    }

    const feedObj: FeedCreationAttributes = {
      slug,
      entityType: 'collection',
      entityId: collectionExpanded.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, firstBookWithCover?.coverPath, entityUpdatedAt),
      siteURL: `/collection/${collectionExpanded.id}`,
      title: collectionExpanded.name,
      description: collectionExpanded.description ?? '',
      author,
      podcastType: 'serial',
      explicit: booksWithTracks.some((book) => book.explicit),
      coverPath: firstBookWithCover?.coverPath ?? null,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = Boolean(feedOptions.preventIndexing)
      feedObj.ownerName = feedOptions.ownerName ?? null
      feedObj.ownerEmail = feedOptions.ownerEmail ?? null
    }

    return {
      feedObj,
      booksWithTracks
    }
  }

  static async createFeedForCollection(
    userId: string,
    collectionExpanded:
      | Collection
      | {
          id: string
          updatedAt?: Date
          books: Array<
            Book & {
              libraryItem: { id: string; libraryId: string; updatedAt?: Date }
              includedAudioFiles: AudioFileObject[]
              updatedAt?: Date
              coverPath?: string | null
              authors: Array<{ name: string }>
              explicit: boolean
              getTracklist(libraryItemId: string): AudioTrack[]
            }
          >
          name: string
          description?: string | null
        },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const { feedObj, booksWithTracks } = this.getFeedObjForCollection(
      userId,
      collectionExpanded as Parameters<typeof this.getFeedObjForCollection>[1],
      slug,
      serverAddress,
      feedOptions
    )

    if (!this.sequelize) return null
    const transaction = await this.sequelize.transaction()
    try {
      const feed = await this.create(feedObj, { transaction })
      feed.feedEpisodes = await FeedEpisode.createFromBooks(
        booksWithTracks,
        feed,
        slug,
        transaction
      )

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
      updatedAt?: Date
      books: Array<
        Book & {
          libraryItem: { id: string; libraryId: string; updatedAt?: Date }
          includedAudioFiles: AudioFileObject[]
          updatedAt?: Date
          coverPath?: string | null
          authors: Array<{ name: string }>
          explicit: boolean
          getTracklist(libraryItemId: string): AudioTrack[]
        }
      >
      name: string
      description?: string | null
    },
    slug: string,
    serverAddress: string,
    feedOptions?: FeedOptions | null
  ): {
    feedObj: FeedCreationAttributes
    booksWithTracks: Array<
      Book & {
        libraryItem: { id: string; libraryId: string; updatedAt?: Date; createdAt: Date }
        includedAudioFiles: AudioFileObject[]
        updatedAt?: Date
        coverPath?: string | null
        authors: Array<{ name: string }>
        explicit: boolean
        title: string
        description: string | null
        getTracklist(libraryItemId: string): AudioTrack[]
      }
    >
  } {
    const booksWithTracks = seriesExpanded.books.filter(
      (book) => book.includedAudioFiles?.length
    ) as Array<
      Book & {
        libraryItem: { id: string; libraryId: string; updatedAt?: Date; createdAt: Date }
        includedAudioFiles: AudioFileObject[]
        updatedAt?: Date
        coverPath?: string | null
        authors: Array<{ name: string }>
        explicit: boolean
        title: string
        description: string | null
        getTracklist(libraryItemId: string): AudioTrack[]
      }
    >

    const entityUpdatedAt = booksWithTracks.reduce((mostRecent, book) => {
      const updatedAt =
        book.libraryItem.updatedAt && book.updatedAt && book.libraryItem.updatedAt > book.updatedAt
          ? book.libraryItem.updatedAt
          : (book.updatedAt ?? null)
      if (!mostRecent) return updatedAt
      if (updatedAt && updatedAt > mostRecent) return updatedAt
      return mostRecent
    }, seriesExpanded.updatedAt ?? null)

    const firstBookWithCover = booksWithTracks.find((book) => book.coverPath)

    const allBookAuthorNames = booksWithTracks.reduce((authorNames: string[], book) => {
      const bookAuthorsToAdd = book.authors
        .filter((author) => !authorNames.includes(author.name))
        .map((author) => author.name)
      return authorNames.concat(bookAuthorsToAdd)
    }, [])

    let author = allBookAuthorNames.slice(0, 3).join(', ')
    if (allBookAuthorNames.length > 3) {
      author += ' & more'
    }

    const firstLibraryId = booksWithTracks[0]?.libraryItem?.libraryId ?? ''

    const feedObj: FeedCreationAttributes = {
      slug,
      entityType: 'series',
      entityId: seriesExpanded.id,
      entityUpdatedAt,
      serverAddress,
      feedURL: `/feed/${slug}`,
      imageURL: Feed.getFeedImageURL(slug, firstBookWithCover?.coverPath, entityUpdatedAt),
      siteURL: `/library/${firstLibraryId}/series/${seriesExpanded.id}`,
      title: seriesExpanded.name,
      description: seriesExpanded.description ?? '',
      author,
      podcastType: 'serial',
      explicit: booksWithTracks.some((book) => book.explicit),
      coverPath: firstBookWithCover?.coverPath ?? null,
      userId
    }

    if (feedOptions) {
      feedObj.preventIndexing = Boolean(feedOptions.preventIndexing)
      feedObj.ownerName = feedOptions.ownerName ?? null
      feedObj.ownerEmail = feedOptions.ownerEmail ?? null
    }

    return {
      feedObj,
      booksWithTracks
    }
  }

  static async createFeedForSeries(
    userId: string,
    seriesExpanded:
      | Series
      | {
          id: string
          updatedAt?: Date
          books: Array<
            Book & {
              libraryItem: { id: string; libraryId: string; updatedAt?: Date }
              includedAudioFiles: AudioFileObject[]
              updatedAt?: Date
              coverPath?: string | null
              authors: Array<{ name: string }>
              explicit: boolean
              getTracklist(libraryItemId: string): AudioTrack[]
            }
          >
          name: string
          description?: string | null
        },
    slug: string,
    serverAddress: string,
    feedOptions: FeedOptions
  ): Promise<Feed | null> {
    const { feedObj, booksWithTracks } = this.getFeedObjForSeries(
      userId,
      seriesExpanded as Parameters<typeof this.getFeedObjForSeries>[1],
      slug,
      serverAddress,
      feedOptions
    )

    if (!this.sequelize) return null
    const transaction = await this.sequelize.transaction()
    try {
      const feed = await this.create(feedObj, { transaction })
      feed.feedEpisodes = await FeedEpisode.createFromBooks(
        booksWithTracks,
        feed,
        slug,
        transaction
      )

      await transaction.commit()
      return feed
    } catch (error) {
      Logger.error(`[Feed] Error creating feed for series ${seriesExpanded.id}`, error)
      await transaction.rollback()
      return null
    }
  }

  static initModel(sequelize: Sequelize): typeof Feed {
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

    if (user) {
      user.hasMany(Feed)
      Feed.belongsTo(user)
    }

    if (libraryItem) {
      libraryItem.hasMany(Feed, {
        foreignKey: 'entityId',
        constraints: false,
        scope: {
          entityType: 'libraryItem'
        }
      })
      Feed.belongsTo(libraryItem, { foreignKey: 'entityId', constraints: false })
    }

    if (collection) {
      collection.hasMany(Feed, {
        foreignKey: 'entityId',
        constraints: false,
        scope: {
          entityType: 'collection'
        }
      })
      Feed.belongsTo(collection, { foreignKey: 'entityId', constraints: false })
    }

    if (series) {
      series.hasMany(Feed, {
        foreignKey: 'entityId',
        constraints: false,
        scope: {
          entityType: 'series'
        }
      })
      Feed.belongsTo(series, { foreignKey: 'entityId', constraints: false })
    }

    if (playlist) {
      playlist.hasMany(Feed, {
        foreignKey: 'entityId',
        constraints: false,
        scope: {
          entityType: 'playlist'
        }
      })
      Feed.belongsTo(playlist, { foreignKey: 'entityId', constraints: false })
    }

    Feed.addHook('afterFind', (findResult) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]
      for (const instance of instances) {
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
    if (!this.sequelize) return null

    let feedObj: FeedCreationAttributes | null = null
    let feedEpisodeCreateFunc:
      | ((entity: unknown, updatedFeed: Feed, slug: string, tx?: Transaction) => Promise<FeedEpisode[]>)
      | null = null
    let feedEpisodeCreateFuncEntity: unknown = null

    if (this.entityType === 'libraryItem') {
      const itemExpanded = (await LibraryItem.getExpandedById(this.entityId)) as
        | (LibraryItem & {
            media: {
              coverPath?: string | null
              updatedAt?: Date
              title?: string
              description?: string | null
              author?: string | null
              authorName?: string | null
              podcastType?: string | null
              language?: string | null
              explicit?: boolean
              podcastEpisodes?: Array<{ updatedAt: Date }>
            }
            mediaType: string
          })
        | null
      if (!itemExpanded) return null
      feedObj = Feed.getFeedObjForLibraryItem(
        this.userId ?? '',
        itemExpanded,
        this.slug,
        this.serverAddress
      )
      feedEpisodeCreateFuncEntity = itemExpanded
      if (itemExpanded.mediaType === 'podcast') {
        feedEpisodeCreateFunc = (ent, f, s, tx) =>
          FeedEpisode.createFromPodcastEpisodes(ent as Parameters<typeof FeedEpisode.createFromPodcastEpisodes>[0], f, s, tx)
      } else {
        feedEpisodeCreateFunc = (ent, f, s, tx) =>
          FeedEpisode.createFromAudiobookTracks(ent as Parameters<typeof FeedEpisode.createFromAudiobookTracks>[0], f, s, tx)
      }
    } else if (this.entityType === 'collection') {
      const collectionExpanded = (await Collection.getExpandedById(this.entityId)) as Parameters<
        typeof Feed.getFeedObjForCollection
      >[1] | null
      if (!collectionExpanded) return null
      const feedObjData = Feed.getFeedObjForCollection(
        this.userId ?? '',
        collectionExpanded,
        this.slug,
        this.serverAddress
      )
      feedObj = feedObjData.feedObj
      feedEpisodeCreateFuncEntity = feedObjData.booksWithTracks
      feedEpisodeCreateFunc = (ent, f, s, tx) =>
        FeedEpisode.createFromBooks(ent as Parameters<typeof FeedEpisode.createFromBooks>[0], f, s, tx)
    } else if (this.entityType === 'series') {
      const seriesExpanded = (await Series.getExpandedById(this.entityId)) as Parameters<
        typeof Feed.getFeedObjForSeries
      >[1] | null
      if (!seriesExpanded) return null
      const feedObjData = Feed.getFeedObjForSeries(
        this.userId ?? '',
        seriesExpanded,
        this.slug,
        this.serverAddress
      )
      feedObj = feedObjData.feedObj
      feedEpisodeCreateFuncEntity = feedObjData.booksWithTracks
      feedEpisodeCreateFunc = (ent, f, s, tx) =>
        FeedEpisode.createFromBooks(ent as Parameters<typeof FeedEpisode.createFromBooks>[0], f, s, tx)
    } else {
      Logger.error(`[Feed] Invalid entity type ${this.entityType} for feed ${this.id}`)
      return null
    }

    if (!feedObj || !feedEpisodeCreateFunc) return null

    const transaction = await this.sequelize.transaction()
    try {
      const updatedFeed = await this.update(feedObj, { transaction })

      const existingFeedEpisodeIds = this.feedEpisodes ? this.feedEpisodes.map((ep) => ep.id) : []

      updatedFeed.feedEpisodes = await feedEpisodeCreateFunc(
        feedEpisodeCreateFuncEntity,
        updatedFeed,
        this.slug,
        transaction
      )

      const newFeedEpisodeIds = updatedFeed.feedEpisodes.map((ep) => ep.id)
      const feedEpisodeIdsToRemove = existingFeedEpisodeIds.filter(
        (epid) => !newFeedEpisodeIds.includes(epid)
      )

      if (feedEpisodeIdsToRemove.length) {
        Logger.info(
          `[Feed] Removing ${feedEpisodeIdsToRemove.length} episodes from feed ${this.id}`
        )
        await FeedEpisode.destroy({
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
    const self = this as {
      getLibraryItem?: (options?: unknown) => Promise<unknown>
      getCollection?: (options?: unknown) => Promise<unknown>
      getSeries?: (options?: unknown) => Promise<unknown>
      getPlaylist?: (options?: unknown) => Promise<unknown>
    }
    if (this.entityType === 'libraryItem' && typeof self.getLibraryItem === 'function') {
      return self.getLibraryItem(options)
    }
    if (this.entityType === 'collection' && typeof self.getCollection === 'function') {
      return self.getCollection(options)
    }
    if (this.entityType === 'series' && typeof self.getSeries === 'function') {
      return self.getSeries(options)
    }
    if (this.entityType === 'playlist' && typeof self.getPlaylist === 'function') {
      return self.getPlaylist(options)
    }
    return Promise.resolve(null)
  }

  buildXml(hostPrefix: string): string {
    return this.buildXML(hostPrefix)
  }

  buildXML(hostPrefix: string): string {
    const customElements: unknown[] = []

    if (this.podcastType) {
      customElements.push({ 'itunes:type': this.podcastType })
    }
    if (this.author) {
      customElements.push({ 'itunes:author': this.author })
    }
    if (this.explicit) {
      customElements.push({ 'itunes:explicit': 'yes' })
    }

    const itunesOwnersData: Array<Record<string, string>> = []
    if (this.ownerName) {
      itunesOwnersData.push({ 'itunes:name': this.ownerName })
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
      description: this.description ?? '',
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
    if (this.feedEpisodes) {
      this.feedEpisodes.forEach((ep) => {
        rssfeed.item(ep.getRSSData(hostPrefix))
      })
    }
    return rssfeed.xml()
  }

  getEpisodePath(id: string): string | null {
    const episode = this.feedEpisodes?.find((ep) => ep.id === id)
    if (!episode) return null
    return episode.filePath
  }

  toOldJSON(): FeedOldJsonObject {
    const episodes = this.feedEpisodes?.map((feedEpisode) => feedEpisode.getOldEpisode())
    return {
      id: this.id,
      slug: this.slug,
      userId: this.userId,
      entityType: this.entityType,
      entityId: this.entityId,
      entityUpdatedAt: this.entityUpdatedAt?.valueOf() ?? null,
      coverPath: this.coverPath ?? null,
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
      episodes: episodes ?? [],
      createdAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONMinified(): FeedOldJsonMinifiedObject {
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

export default Feed
