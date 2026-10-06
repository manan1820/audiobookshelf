import Path from 'path'
import {
  DataTypes,
  Model,
  type BindOrReplacements,
  type FindOptions,
  type Includeable,
  type Sequelize,
  type WhereOptions
} from 'sequelize'
import fsExtra from '../libs/fsExtra'
import Logger from '../Logger'
import libraryFilters from '../utils/queries/libraryFilters'
import { filePathToPOSIX, getFileTimestampsWithIno } from '../utils/fileUtils'
import LibraryFile from '../objects/files/LibraryFile'
import type Book from './Book'
import type Podcast from './Podcast'
import type Library from './Library'
import type Author from './Author'
import type User from './User'
import type { AudioFileObject, AudioTrack, LibraryFileJSON, LibraryFileObject } from '../types'

interface ShelfItem {
  id: string
  label: string
  labelStringKey: string
  type: string
  entities: unknown[]
  total: number
}

interface ShelfMediaItem {
  media?: {
    ebookFormat?: string
    numTracks?: number
    [key: string]: unknown
  }
  mediaType: string
  [key: string]: unknown
}

class LibraryItem extends Model {
  declare id: string
  declare ino: string
  declare path: string
  declare relPath: string
  declare mediaId: string
  declare mediaType: 'book' | 'podcast' | string
  declare isFile: boolean
  declare isMissing: boolean
  declare isInvalid: boolean
  declare mtime: Date | null
  declare ctime: Date | null
  declare birthtime: Date | null
  declare size: number | bigint
  declare lastScan: Date | null
  declare lastScanVersion: string | null
  declare libraryFiles: LibraryFileObject[]
  declare extraData: Record<string, unknown> | null
  declare libraryId: string
  declare libraryFolderId: string
  declare createdAt: Date
  declare updatedAt: Date

  declare media?: Book | Podcast | null
  declare book?: Book | null
  declare podcast?: Podcast | null
  declare title?: string
  declare titleIgnorePrefix?: string
  declare authorNamesFirstLast?: string
  declare authorNamesLastFirst?: string

  declare collapsedSeries?: unknown
  declare series?: unknown
  declare rssFeed?: { toOldJSONMinified(): unknown }
  declare numEpisodesIncomplete?: number
  declare mediaItemShare?: unknown

  /**
   * Gets library items partially expanded, not including podcast episodes
   * @todo temporary solution
   */
  static getLibraryItemsIncrement(offset: number, limit: number, where: WhereOptions | null = null): Promise<LibraryItem[]> {
    return this.findAll({
      where: where || undefined,
      include: [
        {
          model: this.sequelize!.models.book,
          include: [
            {
              model: this.sequelize!.models.author,
              through: {
                attributes: ['createdAt']
              }
            },
            {
              model: this.sequelize!.models.series,
              through: {
                attributes: ['id', 'sequence', 'createdAt']
              }
            }
          ]
        },
        {
          model: this.sequelize!.models.podcast
        }
      ],
      order: [
        ['createdAt', 'ASC'],
        // Ensure author & series stay in the same order
        [this.sequelize!.models.book, this.sequelize!.models.author, this.sequelize!.models.bookAuthor, 'createdAt', 'ASC'],
        [this.sequelize!.models.book, this.sequelize!.models.series, 'bookSeries', 'createdAt', 'ASC']
      ],
      offset,
      limit
    }) as Promise<LibraryItem[]>
  }

  /**
   * Remove library item by id
   *
   * @returns The number of destroyed rows
   */
  static removeById(libraryItemId: string): Promise<number> {
    return this.destroy({
      where: {
        id: libraryItemId
      },
      individualHooks: true
    })
  }

  static async findAllExpandedWhere(where: WhereOptions | null = null): Promise<LibraryItem[]> {
    return (await this.findAll({
      where: where || undefined,
      include: [
        {
          model: this.sequelize!.models.book,
          include: [
            {
              model: this.sequelize!.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize!.models.series,
              through: {
                attributes: ['id', 'sequence']
              }
            }
          ]
        },
        {
          model: this.sequelize!.models.podcast,
          include: [
            {
              model: this.sequelize!.models.podcastEpisode
            }
          ]
        }
      ],
      order: [
        // Ensure author & series stay in the same order
        [this.sequelize!.models.book, this.sequelize!.models.author, this.sequelize!.models.bookAuthor, 'createdAt', 'ASC'],
        [this.sequelize!.models.book, this.sequelize!.models.series, 'bookSeries', 'createdAt', 'ASC']
      ]
    })) as LibraryItem[]
  }

  static async getExpandedById(libraryItemId: string): Promise<LibraryItem | null> {
    if (!libraryItemId) return null

    const libraryItem = (await this.findByPk(libraryItemId)) as LibraryItem | null
    if (!libraryItem) {
      Logger.error(`[LibraryItem] Library item not found with id "${libraryItemId}"`)
      return null
    }

    if (libraryItem.mediaType === 'podcast') {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: this.sequelize!.models.podcastEpisode
          }
        ]
      })) as Podcast
    } else {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: this.sequelize!.models.author,
            through: {
              attributes: []
            }
          },
          {
            model: this.sequelize!.models.series,
            through: {
              attributes: ['id', 'sequence']
            }
          }
        ],
        order: [
          [this.sequelize!.models.author, this.sequelize!.models.bookAuthor, 'createdAt', 'ASC'],
          [this.sequelize!.models.series, 'bookSeries', 'createdAt', 'ASC']
        ]
      })) as Book
    }

    if (!libraryItem.media) return null
    return libraryItem
  }

  static async findOneExpanded(
    where: WhereOptions,
    replacements: BindOrReplacements | null = null,
    include: Includeable | Includeable[] | null = null
  ): Promise<LibraryItem | null> {
    const libraryItem = (await this.findOne({
      where,
      replacements: replacements || undefined,
      include: include || undefined
    })) as LibraryItem | null
    if (!libraryItem) {
      return null
    }

    if (libraryItem.mediaType === 'podcast') {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: this.sequelize!.models.podcastEpisode
          }
        ]
      })) as Podcast
    } else {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: this.sequelize!.models.author,
            through: {
              attributes: []
            }
          },
          {
            model: this.sequelize!.models.series,
            through: {
              attributes: ['id', 'sequence']
            }
          }
        ],
        order: [
          [this.sequelize!.models.author, this.sequelize!.models.bookAuthor, 'createdAt', 'ASC'],
          [this.sequelize!.models.series, 'bookSeries', 'createdAt', 'ASC']
        ]
      })) as Book
    }

    if (!libraryItem.media) return null
    return libraryItem
  }

  /**
   * Get library items using filter and sort
   */
  static async getByFilterAndSort(
    library: { id: string },
    user: User,
    options: Record<string, unknown>
  ): Promise<{ libraryItems: Record<string, unknown>[]; count: number }> {
    const start = Date.now()
    const { libraryItems, count } = (await libraryFilters.getFilteredLibraryItems(library.id, user, options)) as {
      libraryItems: LibraryItem[]
      count: number
    }
    Logger.debug(`Loaded ${libraryItems.length} of ${count} items for libary page in ${((Date.now() - start) / 1000).toFixed(2)}s`)

    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        if (li.collapsedSeries) {
          oldLibraryItem.collapsedSeries = li.collapsedSeries
        }
        if (li.series) {
          const media = oldLibraryItem.media as Record<string, unknown> | undefined
          if (media && typeof media === 'object') {
            const metadata = media.metadata as Record<string, unknown> | undefined
            if (metadata && typeof metadata === 'object') {
              metadata.series = li.series
            }
          }
        }
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
        }
        const liMedia = li.media as unknown as { numEpisodes?: number; size?: number } | undefined
        if (liMedia?.numEpisodes) {
          const media = oldLibraryItem.media as Record<string, unknown> | undefined
          if (media && typeof media === 'object') {
            media.numEpisodes = liMedia.numEpisodes
          }
        }
        if (li.size && !(oldLibraryItem.media as Record<string, unknown> | undefined)?.size) {
          const media = oldLibraryItem.media as Record<string, unknown> | undefined
          if (media && typeof media === 'object') {
            media.size = li.size
          }
        }
        if (li.numEpisodesIncomplete) {
          oldLibraryItem.numEpisodesIncomplete = li.numEpisodesIncomplete
        }
        if (li.mediaItemShare) {
          oldLibraryItem.mediaItemShare = li.mediaItemShare
        }

        return oldLibraryItem
      }),
      count
    }
  }

  /**
   * Get home page data personalized shelves
   */
  static async getPersonalizedShelves(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfItem[]> {
    const fullStart = Date.now()

    const shelves: ShelfItem[] = []

    const timed = async <T>(loader: () => Promise<T>): Promise<{ payload: T; elapsedSeconds: string }> => {
      const start = Date.now()
      const payload = await loader()
      return {
        payload,
        elapsedSeconds: ((Date.now() - start) / 1000).toFixed(2)
      }
    }

    // "Continue Listening" shelf
    const itemsInProgressPayload = (await (
      libraryFilters as unknown as { getMediaItemsInProgress: (...args: unknown[]) => Promise<unknown> }
    ).getMediaItemsInProgress(library, user, include, limit, false)) as {
      items: ShelfMediaItem[]
      count: number
    }
    if (itemsInProgressPayload.items.length) {
      const ebookOnlyItemsInProgress = itemsInProgressPayload.items.filter((li) => li.media?.ebookFormat && !li.media?.numTracks)
      const audioItemsInProgress = itemsInProgressPayload.items.filter((li) => li.media?.numTracks || li.mediaType === 'podcast')

      if (audioItemsInProgress.length) {
        shelves.push({
          id: 'continue-listening',
          label: 'Continue Listening',
          labelStringKey: 'LabelContinueListening',
          type: library.isPodcast ? 'episode' : 'book',
          entities: audioItemsInProgress,
          total: itemsInProgressPayload.count
        })
      }

      if (ebookOnlyItemsInProgress.length) {
        // "Continue Reading" shelf
        shelves.push({
          id: 'continue-reading',
          label: 'Continue Reading',
          labelStringKey: 'LabelContinueReading',
          type: 'book',
          entities: ebookOnlyItemsInProgress,
          total: itemsInProgressPayload.count
        })
      }
    }
    Logger.debug(`Loaded ${itemsInProgressPayload.items.length} of ${itemsInProgressPayload.count} items for "Continue Listening/Reading" in ${((Date.now() - fullStart) / 1000).toFixed(2)}s`)

    if (library.isBook) {
      const [continueSeriesResult, mostRecentResult, seriesMostRecentResult, discoverResult, mediaFinishedResult, newestAuthorsResult] = await Promise.all([
        timed(async () => (await libraryFilters.getLibraryItemsContinueSeries(library, user, include, limit)) as { libraryItems: LibraryItem[]; count: number }),
        timed(async () => (await libraryFilters.getLibraryItemsMostRecentlyAdded(library, user, include, limit)) as { libraryItems: LibraryItem[]; count: number }),
        timed(async () => (await libraryFilters.getSeriesMostRecentlyAdded(library, user, include, 5)) as { series: unknown[]; count: number }),
        timed(async () => (await libraryFilters.getLibraryItemsToDiscover(library, user, include, limit)) as { libraryItems: LibraryItem[]; count: number }),
        timed(async () => (await libraryFilters.getMediaFinished(library, user, include, limit)) as { items: ShelfMediaItem[]; count: number }),
        timed(async () => (await libraryFilters.getNewestAuthors(library, user, limit)) as { authors: unknown[]; count: number })
      ])

      const continueSeriesPayload = continueSeriesResult.payload
      // "Continue Series" shelf
      if (continueSeriesPayload.libraryItems.length) {
        shelves.push({
          id: 'continue-series',
          label: 'Continue Series',
          labelStringKey: 'LabelContinueSeries',
          type: 'book',
          entities: continueSeriesPayload.libraryItems,
          total: continueSeriesPayload.count
        })
      }
      Logger.debug(`Loaded ${continueSeriesPayload.libraryItems.length} of ${continueSeriesPayload.count} items for "Continue Series" in ${continueSeriesResult.elapsedSeconds}s`)

      const mostRecentPayload = mostRecentResult.payload
      // "Recently Added" shelf
      if (mostRecentPayload.libraryItems.length) {
        shelves.push({
          id: 'recently-added',
          label: 'Recently Added',
          labelStringKey: 'LabelRecentlyAdded',
          type: library.mediaType,
          entities: mostRecentPayload.libraryItems,
          total: mostRecentPayload.count
        })
      }
      Logger.debug(`Loaded ${mostRecentPayload.libraryItems.length} of ${mostRecentPayload.count} items for "Recently Added" in ${mostRecentResult.elapsedSeconds}s`)

      const seriesMostRecentPayload = seriesMostRecentResult.payload
      // "Recent Series" shelf
      if (seriesMostRecentPayload.series.length) {
        shelves.push({
          id: 'recent-series',
          label: 'Recent Series',
          labelStringKey: 'LabelRecentSeries',
          type: 'series',
          entities: seriesMostRecentPayload.series,
          total: seriesMostRecentPayload.count
        })
      }
      Logger.debug(`Loaded ${seriesMostRecentPayload.series.length} of ${seriesMostRecentPayload.count} series for "Recent Series" in ${seriesMostRecentResult.elapsedSeconds}s`)

      const discoverLibraryItemsPayload = discoverResult.payload
      // "Discover" shelf
      if (discoverLibraryItemsPayload.libraryItems.length) {
        shelves.push({
          id: 'discover',
          label: 'Discover',
          labelStringKey: 'LabelDiscover',
          type: library.mediaType,
          entities: discoverLibraryItemsPayload.libraryItems,
          total: discoverLibraryItemsPayload.count
        })
      }
      Logger.debug(`Loaded ${discoverLibraryItemsPayload.libraryItems.length} of ${discoverLibraryItemsPayload.count} items for "Discover" in ${discoverResult.elapsedSeconds}s`)

      const mediaFinishedPayload = mediaFinishedResult.payload
      // "Listen Again" shelf
      if (mediaFinishedPayload.items.length) {
        const ebookOnlyItemsInProgress = mediaFinishedPayload.items.filter((li) => li.media?.ebookFormat && !li.media?.numTracks)
        const audioItemsInProgress = mediaFinishedPayload.items.filter((li) => li.media?.numTracks || li.mediaType === 'podcast')

        if (audioItemsInProgress.length) {
          shelves.push({
            id: 'listen-again',
            label: 'Listen Again',
            labelStringKey: 'LabelListenAgain',
            type: library.isPodcast ? 'episode' : 'book',
            entities: audioItemsInProgress,
            total: mediaFinishedPayload.count
          })
        }

        if (ebookOnlyItemsInProgress.length) {
          // "Read Again" shelf
          shelves.push({
            id: 'read-again',
            label: 'Read Again',
            labelStringKey: 'LabelReadAgain',
            type: 'book',
            entities: ebookOnlyItemsInProgress,
            total: mediaFinishedPayload.count
          })
        }
      }
      Logger.debug(`Loaded ${mediaFinishedPayload.items.length} of ${mediaFinishedPayload.count} items for "Listen/Read Again" in ${mediaFinishedResult.elapsedSeconds}s`)

      const newestAuthorsPayload = newestAuthorsResult.payload
      // "Newest Authors" shelf
      if (newestAuthorsPayload.authors.length) {
        shelves.push({
          id: 'newest-authors',
          label: 'Newest Authors',
          labelStringKey: 'LabelNewestAuthors',
          type: 'authors',
          entities: newestAuthorsPayload.authors,
          total: newestAuthorsPayload.count
        })
      }
      Logger.debug(`Loaded ${newestAuthorsPayload.authors.length} of ${newestAuthorsPayload.count} authors for "Newest Authors" in ${newestAuthorsResult.elapsedSeconds}s`)
    } else if (library.isPodcast) {
      const [newestEpisodesResult, mostRecentResult, mediaFinishedResult] = await Promise.all([
        timed(async () => (await libraryFilters.getNewestPodcastEpisodes(library, user, limit)) as { libraryItems: LibraryItem[]; count: number }),
        timed(async () => (await libraryFilters.getLibraryItemsMostRecentlyAdded(library, user, include, limit)) as { libraryItems: LibraryItem[]; count: number }),
        timed(async () => (await libraryFilters.getMediaFinished(library, user, include, limit)) as { items: ShelfMediaItem[]; count: number })
      ])

      const newestEpisodesPayload = newestEpisodesResult.payload
      // "Newest Episodes" shelf
      if (newestEpisodesPayload.libraryItems.length) {
        shelves.push({
          id: 'newest-episodes',
          label: 'Newest Episodes',
          labelStringKey: 'LabelNewestEpisodes',
          type: 'episode',
          entities: newestEpisodesPayload.libraryItems,
          total: newestEpisodesPayload.count
        })
      }
      Logger.debug(`Loaded ${newestEpisodesPayload.libraryItems.length} of ${newestEpisodesPayload.count} episodes for "Newest Episodes" in ${newestEpisodesResult.elapsedSeconds}s`)

      const mostRecentPayload = mostRecentResult.payload
      // "Recently Added" shelf
      if (mostRecentPayload.libraryItems.length) {
        shelves.push({
          id: 'recently-added',
          label: 'Recently Added',
          labelStringKey: 'LabelRecentlyAdded',
          type: library.mediaType,
          entities: mostRecentPayload.libraryItems,
          total: mostRecentPayload.count
        })
      }
      Logger.debug(`Loaded ${mostRecentPayload.libraryItems.length} of ${mostRecentPayload.count} items for "Recently Added" in ${mostRecentResult.elapsedSeconds}s`)

      const mediaFinishedPayload = mediaFinishedResult.payload
      // "Listen Again" shelf
      if (mediaFinishedPayload.items.length) {
        const ebookOnlyItemsInProgress = mediaFinishedPayload.items.filter((li) => li.media?.ebookFormat && !li.media?.numTracks)
        const audioItemsInProgress = mediaFinishedPayload.items.filter((li) => li.media?.numTracks || li.mediaType === 'podcast')

        if (audioItemsInProgress.length) {
          shelves.push({
            id: 'listen-again',
            label: 'Listen Again',
            labelStringKey: 'LabelListenAgain',
            type: 'episode',
            entities: audioItemsInProgress,
            total: mediaFinishedPayload.count
          })
        }

        if (ebookOnlyItemsInProgress.length) {
          // "Read Again" shelf
          shelves.push({
            id: 'read-again',
            label: 'Read Again',
            labelStringKey: 'LabelReadAgain',
            type: 'book',
            entities: ebookOnlyItemsInProgress,
            total: mediaFinishedPayload.count
          })
        }
      }
      Logger.debug(`Loaded ${mediaFinishedPayload.items.length} of ${mediaFinishedPayload.count} items for "Listen/Read Again" in ${mediaFinishedResult.elapsedSeconds}s`)
    }

    Logger.debug(`Loaded ${shelves.length} personalized shelves in ${((Date.now() - fullStart) / 1000).toFixed(2)}s`)

    return shelves
  }

  /**
   * Get book library items for author, optional use user permissions
   */
  static async getForAuthor(author: Author, user: User | null = null): Promise<LibraryItem[]> {
    const { libraryItems } = (await (
      libraryFilters as unknown as { getLibraryItemsForAuthor: (a: unknown, u: unknown, l?: unknown, o?: unknown) => Promise<unknown> }
    ).getLibraryItemsForAuthor(author, user, undefined, undefined)) as {
      libraryItems: LibraryItem[]
    }
    return libraryItems
  }

  /**
   * Check if library item exists
   */
  static async checkExistsById(libraryItemId: string): Promise<boolean> {
    return (await this.count({ where: { id: libraryItemId } })) > 0
  }

  static async getCoverPath(libraryItemId: string): Promise<string | null> {
    const libraryItem = (await this.findByPk(libraryItemId, {
      attributes: ['id', 'mediaType', 'mediaId', 'libraryId'],
      include: [
        {
          model: this.sequelize!.models.book,
          attributes: ['id', 'coverPath']
        },
        {
          model: this.sequelize!.models.podcast,
          attributes: ['id', 'coverPath']
        }
      ]
    })) as (LibraryItem & { media?: { coverPath?: string | null } }) | null
    if (!libraryItem) {
      Logger.warn(`[LibraryItem] getCoverPath: Library item "${libraryItemId}" does not exist`)
      return null
    }

    return libraryItem.media?.coverPath || null
  }

  async saveMetadataFile(): Promise<LibraryFileObject | null> {
    let metadataPath = Path.join(global.MetadataPath || '', 'items', this.id)
    let storeMetadataWithItem = global.ServerSettings.storeMetadataWithItem
    if (storeMetadataWithItem && !this.isFile) {
      metadataPath = this.path
    } else {
      // Make sure metadata book dir exists
      storeMetadataWithItem = false
      await fsExtra.ensureDir(metadataPath)
    }

    const metadataFilePath = Path.join(metadataPath, `metadata.${global.ServerSettings.metadataFileFormat}`)

    // Expanded with series, authors, podcastEpisodes
    const mediaExpanded = (this.media || (await this.getMediaExpanded())) as (Book & Podcast) | null

    let jsonObject: Record<string, unknown> = {}
    if (this.mediaType === 'book') {
      const bookMedia = mediaExpanded as unknown as {
        tags?: string[]
        chapters?: Array<Record<string, unknown>>
        title?: string
        subtitle?: string
        authors?: Array<{ name: string }>
        narrators?: string[]
        series?: Array<{ name: string; bookSeries?: { sequence?: string } }>
        genres?: string[]
        publishedYear?: string | number
        publishedDate?: string
        publisher?: string
        description?: string
        isbn?: string
        asin?: string
        language?: string
        explicit?: boolean
        abridged?: boolean
      }
      jsonObject = {
        tags: bookMedia?.tags || [],
        chapters: bookMedia?.chapters?.map((c) => ({ ...c })) || [],
        title: bookMedia?.title,
        subtitle: bookMedia?.subtitle,
        authors: bookMedia?.authors?.map((a) => a.name) || [],
        narrators: bookMedia?.narrators,
        series: (bookMedia?.series || []).map((se) => {
          const sequence = se.bookSeries?.sequence || ''
          if (!sequence) return se.name
          return `${se.name} #${sequence}`
        }),
        genres: bookMedia?.genres || [],
        publishedYear: bookMedia?.publishedYear,
        publishedDate: bookMedia?.publishedDate,
        publisher: bookMedia?.publisher,
        description: bookMedia?.description,
        isbn: bookMedia?.isbn,
        asin: bookMedia?.asin,
        language: bookMedia?.language,
        explicit: !!bookMedia?.explicit,
        abridged: !!bookMedia?.abridged
      }
    } else {
      const podcastMedia = mediaExpanded as unknown as {
        tags?: string[]
        title?: string
        author?: string
        description?: string
        releaseDate?: string
        genres?: string[]
        feedURL?: string
        imageURL?: string
        itunesPageURL?: string
        itunesId?: string
        itunesArtistId?: string
        asin?: string
        language?: string
        explicit?: boolean
        podcastType?: string
      }
      jsonObject = {
        tags: podcastMedia?.tags || [],
        title: podcastMedia?.title,
        author: podcastMedia?.author,
        description: podcastMedia?.description,
        releaseDate: podcastMedia?.releaseDate,
        genres: podcastMedia?.genres || [],
        feedURL: podcastMedia?.feedURL,
        imageURL: podcastMedia?.imageURL,
        itunesPageURL: podcastMedia?.itunesPageURL,
        itunesId: podcastMedia?.itunesId,
        itunesArtistId: podcastMedia?.itunesArtistId,
        asin: podcastMedia?.asin,
        language: podcastMedia?.language,
        explicit: !!podcastMedia?.explicit,
        podcastType: podcastMedia?.podcastType
      }
    }

    return fsExtra
      .writeFile(metadataFilePath, JSON.stringify(jsonObject, null, 2))
      .then(async () => {
        // Add metadata.json to libraryFiles array if it is new
        let metadataLibraryFile = this.libraryFiles.find((lf) => lf.metadata.path === filePathToPOSIX(metadataFilePath))
        if (storeMetadataWithItem) {
          if (!metadataLibraryFile) {
            const newLibraryFile = new LibraryFile()
            await newLibraryFile.setDataFromPath(metadataFilePath, `metadata.json`)
            metadataLibraryFile = newLibraryFile.toJSON() as unknown as LibraryFileObject
            this.libraryFiles.push(metadataLibraryFile)
          } else {
            const fileTimestamps = await getFileTimestampsWithIno(metadataFilePath)
            if (fileTimestamps) {
              metadataLibraryFile.metadata.mtimeMs = fileTimestamps.mtimeMs
              metadataLibraryFile.metadata.ctimeMs = fileTimestamps.ctimeMs
              metadataLibraryFile.metadata.size = fileTimestamps.size
              metadataLibraryFile.ino = fileTimestamps.ino
            }
          }
          const libraryItemDirTimestamps = await getFileTimestampsWithIno(this.path)
          if (libraryItemDirTimestamps) {
            this.mtime = new Date(libraryItemDirTimestamps.mtimeMs)
            this.ctime = new Date(libraryItemDirTimestamps.ctimeMs)
            let size = 0
            this.libraryFiles.forEach((lf) => (size += !isNaN(Number(lf.metadata.size)) ? Number(lf.metadata.size) : 0))
            this.size = size
            await this.save()
          }
        }

        Logger.debug(`[LibraryItem] Saved metadata for "${this.media?.title}" file to "${metadataFilePath}"`)

        return metadataLibraryFile || null
      })
      .catch((error: Error) => {
        Logger.error(`Failed to save json file at "${metadataFilePath}"`, error)
        return null
      })
  }

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof LibraryItem
  static override init(attributes: unknown, options: unknown): typeof LibraryItem
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof LibraryItem {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof LibraryItem
    }
    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        ino: DataTypes.STRING,
        path: DataTypes.STRING,
        relPath: DataTypes.STRING,
        mediaId: DataTypes.UUID,
        mediaType: DataTypes.STRING,
        isFile: DataTypes.BOOLEAN,
        isMissing: DataTypes.BOOLEAN,
        isInvalid: DataTypes.BOOLEAN,
        mtime: DataTypes.DATE(6),
        ctime: DataTypes.DATE(6),
        birthtime: DataTypes.DATE(6),
        size: DataTypes.BIGINT,
        lastScan: DataTypes.DATE,
        lastScanVersion: DataTypes.STRING,
        libraryFiles: DataTypes.JSON,
        extraData: DataTypes.JSON,
        title: DataTypes.STRING,
        titleIgnorePrefix: DataTypes.STRING,
        authorNamesFirstLast: DataTypes.STRING,
        authorNamesLastFirst: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'libraryItem',
        indexes: [
          {
            fields: ['createdAt']
          },
          {
            fields: ['mediaId']
          },
          {
            fields: ['libraryId', 'mediaType']
          },
          {
            fields: ['libraryId', 'mediaType', 'size']
          },
          {
            fields: ['libraryId', 'mediaType', 'createdAt']
          },
          {
            fields: ['libraryId', 'mediaType', { name: 'title', collate: 'NOCASE' }]
          },
          {
            fields: ['libraryId', 'mediaType', { name: 'titleIgnorePrefix', collate: 'NOCASE' }]
          },
          {
            fields: ['libraryId', 'mediaType', { name: 'authorNamesFirstLast', collate: 'NOCASE' }]
          },
          {
            fields: ['libraryId', 'mediaType', { name: 'authorNamesLastFirst', collate: 'NOCASE' }]
          },
          {
            fields: ['libraryId', 'mediaId', 'mediaType']
          },
          {
            fields: ['birthtime']
          },
          {
            fields: ['mtime']
          }
        ]
      }
    )

    const { library, libraryFolder, book, podcast } = sequelize.models
    library.hasMany(LibraryItem)
    LibraryItem.belongsTo(library)

    libraryFolder.hasMany(LibraryItem)
    LibraryItem.belongsTo(libraryFolder)

    book.hasOne(LibraryItem, {
      foreignKey: 'mediaId',
      constraints: false,
      scope: {
        mediaType: 'book'
      }
    })
    LibraryItem.belongsTo(book, { foreignKey: 'mediaId', constraints: false })

    podcast.hasOne(LibraryItem, {
      foreignKey: 'mediaId',
      constraints: false,
      scope: {
        mediaType: 'podcast'
      }
    })
    LibraryItem.belongsTo(podcast, { foreignKey: 'mediaId', constraints: false })

    LibraryItem.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      let results: unknown[]
      if (!Array.isArray(findResult)) {
        results = [findResult]
      } else {
        results = findResult
      }
      for (const inst of results) {
        const instance = inst as Record<string, unknown> & { dataValues: Record<string, unknown> }
        if (instance.mediaType === 'book' && instance.book !== undefined) {
          instance.media = instance.book
          instance.dataValues.media = instance.dataValues.book
        } else if (instance.mediaType === 'podcast' && instance.podcast !== undefined) {
          instance.media = instance.podcast
          instance.dataValues.media = instance.dataValues.podcast
        }
        // To prevent mistakes:
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcast
        delete instance.dataValues.podcast
      }
    })

    LibraryItem.addHook('afterDestroy', async (instance: LibraryItem) => {
      if (!instance) return
      const media = await instance.getMedia()
      if (media) {
        media.destroy()
      }
    })

    return LibraryItem
  }

  get isBook(): boolean {
    return this.mediaType === 'book'
  }

  get isPodcast(): boolean {
    return this.mediaType === 'podcast'
  }

  /**
   * Check if book or podcast library item has audio tracks.
   * Requires expanded library item (media loaded).
   */
  get hasAudioTracks(): boolean {
    if (!this.media) {
      Logger.error(`[LibraryItem] hasAudioTracks: Library item "${this.id}" does not have media`)
      return false
    }
    return (this.media as Book | Podcast).hasAudioTracks
  }

  getMedia(options?: FindOptions): Promise<Book | Podcast | null> {
    if (!this.mediaType) return Promise.resolve(null)
    const uppercaseFirst =
      (this.sequelize as unknown as { uppercaseFirst?: (str: string) => string })?.uppercaseFirst ||
      ((str: string) => (str ? `${str[0].toUpperCase()}${str.substring(1)}` : ''))
    const mixinMethodName = `get${uppercaseFirst(this.mediaType)}`
    const self = this as unknown as Record<string, (opts?: unknown) => Promise<Book | Podcast | null>>
    if (typeof self[mixinMethodName] === 'function') {
      return self[mixinMethodName](options)
    }
    return Promise.resolve(null)
  }

  getMediaExpanded(): Promise<Book | Podcast | null> {
    if (this.mediaType === 'podcast') {
      return this.getMedia({
        include: [
          {
            model: this.sequelize!.models.podcastEpisode
          }
        ]
      })
    } else {
      return this.getMedia({
        include: [
          {
            model: this.sequelize!.models.author,
            through: {
              attributes: []
            }
          },
          {
            model: this.sequelize!.models.series,
            through: {
              attributes: ['sequence']
            }
          }
        ],
        order: [
          [this.sequelize!.models.author, this.sequelize!.models.bookAuthor, 'createdAt', 'ASC'],
          [this.sequelize!.models.series, 'bookSeries', 'createdAt', 'ASC']
        ]
      })
    }
  }

  getAudioFileWithIno(ino: string): AudioFileObject | null {
    if (!this.media) {
      Logger.error(`[LibraryItem] getAudioFileWithIno: Library item "${this.id}" does not have media`)
      return null
    }
    if (this.isBook) {
      return (this.media as Book).audioFiles?.find((af) => af.ino === ino) || null
    } else {
      return (this.media as Podcast).podcastEpisodes?.find((pe) => pe.audioFile?.ino === ino)?.audioFile || null
    }
  }

  /**
   * Get the track list to be used in client audio players
   * AudioTrack is the AudioFile with startOffset and contentUrl
   * Podcasts must have an episodeId to get the track list
   */
  getTrackList(episodeId?: string): AudioTrack[] {
    if (!this.media) {
      Logger.error(`[LibraryItem] getTrackList: Library item "${this.id}" does not have media`)
      return []
    }
    if (this.isBook) {
      return (this.media as Book).getTracklist(this.id)
    } else {
      return (this.media as Podcast).getTracklist(this.id, episodeId || '')
    }
  }

  getLibraryFileWithIno(ino: string): InstanceType<typeof LibraryFile> | null {
    const libraryFile = this.libraryFiles?.find((lf) => lf.ino === ino)
    if (!libraryFile) return null
    return new LibraryFile(libraryFile as Partial<LibraryFileJSON>)
  }

  getLibraryFiles(): InstanceType<typeof LibraryFile>[] {
    return (this.libraryFiles || []).map((lf) => new LibraryFile(lf as Partial<LibraryFileJSON>))
  }

  getLibraryFilesJson(): LibraryFileJSON[] {
    return (this.libraryFiles || []).map((lf) => new LibraryFile(lf as Partial<LibraryFileJSON>).toJSON())
  }

  toOldJSON(): Record<string, unknown> {
    if (!this.media) {
      throw new Error(`[LibraryItem] Cannot convert to old JSON without media for library item "${this.id}"`)
    }

    return {
      id: this.id,
      ino: this.ino,
      oldLibraryItemId: (this.extraData as { oldLibraryItemId?: string } | null)?.oldLibraryItemId || null,
      libraryId: this.libraryId,
      folderId: this.libraryFolderId,
      path: this.path,
      relPath: this.relPath,
      isFile: this.isFile,
      mtimeMs: this.mtime?.valueOf(),
      ctimeMs: this.ctime?.valueOf(),
      birthtimeMs: this.birthtime?.valueOf(),
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
      lastScan: this.lastScan?.valueOf(),
      scanVersion: this.lastScanVersion,
      isMissing: !!this.isMissing,
      isInvalid: !!this.isInvalid,
      mediaType: this.mediaType,
      media: this.media.toOldJSON(this.id),
      // LibraryFile JSON includes a fileType property that may not be saved in libraryFiles column in the database
      libraryFiles: this.getLibraryFilesJson()
    }
  }

  /**
   * Minified library item JSON for list/shelf endpoints.
   * `toOldJSONExpanded()` must be a strict superset: every key here must exist in expanded
   * with the same value semantics. Only additive changes to expanded; never remove or rename keys.
   */
  toOldJSONMinified(): Record<string, unknown> {
    if (!this.media) {
      throw new Error(`[LibraryItem] Cannot convert to old JSON without media for library item "${this.id}"`)
    }

    return {
      id: this.id,
      ino: this.ino,
      oldLibraryItemId: (this.extraData as { oldLibraryItemId?: string } | null)?.oldLibraryItemId || null,
      libraryId: this.libraryId,
      folderId: this.libraryFolderId,
      path: this.path,
      relPath: this.relPath,
      isFile: this.isFile,
      mtimeMs: this.mtime?.valueOf(),
      ctimeMs: this.ctime?.valueOf(),
      birthtimeMs: this.birthtime?.valueOf(),
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
      isMissing: !!this.isMissing,
      isInvalid: !!this.isInvalid,
      mediaType: this.mediaType,
      media: this.media.toOldJSONMinified(),
      numFiles: this.libraryFiles ? this.libraryFiles.length : 0,
      size: this.size
    }
  }

  /**
   * Expanded library item JSON for item detail and socket events.
   * Must be a strict superset of `toOldJSONMinified()` — built by spreading minified, then adding expanded-only fields.
   */
  toOldJSONExpanded(): Record<string, unknown> {
    return {
      ...this.toOldJSONMinified(),
      lastScan: this.lastScan?.valueOf(),
      scanVersion: this.lastScanVersion,
      media: (this.media as Book | Podcast).toOldJSONExpanded(this.id),
      // LibraryFile JSON includes a fileType property that may not be saved in libraryFiles column in the database
      libraryFiles: this.getLibraryFilesJson()
    }
  }
}

export = LibraryItem
