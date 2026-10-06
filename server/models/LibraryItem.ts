import Path from 'path'
import {
  DataTypes,
  Model,
  Sequelize,
  NonAttribute,
  Optional,
  WhereOptions,
  BindOrReplacements,
  IncludeOptions,
  FindOptions
} from 'sequelize'
import fsExtra from '../libs/fsExtra'
import Logger from '../Logger'
import libraryFilters from '../utils/queries/libraryFilters'
import { filePathToPOSIX, getFileTimestampsWithIno } from '../utils/fileUtils'
import LibraryFile from '../objects/files/LibraryFile'
import type Book from './Book'
import type { AudioFileObject, AudioTrack } from './Book'
import type Library from './Library'
import type LibraryFolder from './LibraryFolder'
import type User from './User'
import type Author from './Author'

const filters = libraryFilters

export interface LibraryFileObject {
  ino: string
  isSupplementary?: boolean
  addedAt: number
  updatedAt: number
  metadata: {
    filename: string
    ext: string
    path: string
    relPath: string
    size: number
    mtimeMs: number
    ctimeMs: number
    birthtimeMs: number
  }
}

export interface LibraryItemAttributes {
  id: string
  ino?: string | null
  path: string
  relPath: string
  mediaId: string
  mediaType: string
  isFile?: boolean
  isMissing?: boolean
  isInvalid?: boolean
  mtime?: Date | null
  ctime?: Date | null
  birthtime?: Date | null
  size?: number | bigint | null
  lastScan?: Date | null
  lastScanVersion?: string | null
  libraryFiles?: LibraryFileObject[] | null
  extraData?: Record<string, unknown> | null
  libraryId: string
  libraryFolderId?: string | null
  title?: string | null
  titleIgnorePrefix?: string | null
  authorNamesFirstLast?: string | null
  authorNamesLastFirst?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface LibraryItemCreationAttributes
  extends Optional<
    LibraryItemAttributes,
    | 'id'
    | 'ino'
    | 'isFile'
    | 'isMissing'
    | 'isInvalid'
    | 'mtime'
    | 'ctime'
    | 'birthtime'
    | 'size'
    | 'lastScan'
    | 'lastScanVersion'
    | 'libraryFiles'
    | 'extraData'
    | 'libraryFolderId'
    | 'title'
    | 'titleIgnorePrefix'
    | 'authorNamesFirstLast'
    | 'authorNamesLastFirst'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class LibraryItem
  extends Model<LibraryItemAttributes, LibraryItemCreationAttributes>
  implements LibraryItemAttributes
{
  declare id: string
  declare ino: string | null
  declare path: string
  declare relPath: string
  declare mediaId: string
  declare mediaType: string
  declare isFile: boolean
  declare isMissing: boolean
  declare isInvalid: boolean
  declare mtime: Date | null
  declare ctime: Date | null
  declare birthtime: Date | null
  declare size: number | bigint | null
  declare lastScan: Date | null
  declare lastScanVersion: string | null
  declare libraryFiles: LibraryFileObject[] | null
  declare extraData: Record<string, unknown> | null
  declare libraryId: string
  declare libraryFolderId: string | null
  declare title: string | null
  declare titleIgnorePrefix: string | null
  declare authorNamesFirstLast: string | null
  declare authorNamesLastFirst: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Expanded properties
  declare media?: NonAttribute<Book | Record<string, unknown>>
  declare library?: NonAttribute<Library>
  declare libraryFolder?: NonAttribute<LibraryFolder>
  declare book?: NonAttribute<Book>

  static getLibraryItemsIncrement(
    offset: number,
    limit: number,
    where: WhereOptions | null = null
  ): Promise<LibraryItem[]> {
    const sequelize = this.sequelize
    if (!sequelize) return Promise.resolve([])
    const { book, podcast, author, series, bookAuthor } = sequelize.models
    const whereClause = where ?? undefined
    return this.findAll({
      where: whereClause,
      include: [
        {
          model: book,
          include: [
            {
              model: author,
              through: {
                attributes: ['createdAt']
              }
            },
            {
              model: series,
              through: {
                attributes: ['id', 'sequence', 'createdAt']
              }
            }
          ]
        },
        {
          model: podcast
        }
      ],
      order: [
        ['createdAt', 'ASC'],
        [book, author, bookAuthor, 'createdAt', 'ASC'],
        [book, series, 'bookSeries', 'createdAt', 'ASC']
      ],
      offset,
      limit
    })
  }

  static removeById(libraryItemId: string): Promise<number> {
    return this.destroy({
      where: {
        id: libraryItemId
      },
      individualHooks: true
    })
  }

  static async findAllExpandedWhere(where: WhereOptions | null = null): Promise<LibraryItem[]> {
    const sequelize = this.sequelize
    if (!sequelize) return []
    const { book, podcast, author, series, bookAuthor, podcastEpisode } = sequelize.models
    const whereClause = where ?? undefined
    return this.findAll({
      where: whereClause,
      include: [
        {
          model: book,
          include: [
            {
              model: author,
              through: {
                attributes: []
              }
            },
            {
              model: series,
              through: {
                attributes: ['id', 'sequence']
              }
            }
          ]
        },
        {
          model: podcast,
          include: [
            {
              model: podcastEpisode
            }
          ]
        }
      ],
      order: [
        [book, author, bookAuthor, 'createdAt', 'ASC'],
        [book, series, 'bookSeries', 'createdAt', 'ASC']
      ]
    })
  }

  static async getExpandedById(libraryItemId: string): Promise<LibraryItem | null> {
    if (!libraryItemId) return null

    const libraryItem = await this.findByPk(libraryItemId)
    if (!libraryItem) {
      Logger.error(`[LibraryItem] Library item not found with id "${libraryItemId}"`)
      return null
    }

    const sequelize = this.sequelize
    if (!sequelize) return null
    const { podcastEpisode, author, series, bookAuthor } = sequelize.models

    if (libraryItem.mediaType === 'podcast') {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: podcastEpisode
          }
        ]
      })) as Record<string, unknown>
    } else {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: author,
            through: {
              attributes: []
            }
          },
          {
            model: series,
            through: {
              attributes: ['id', 'sequence']
            }
          }
        ],
        order: [
          [author, bookAuthor, 'createdAt', 'ASC'],
          [series, 'bookSeries', 'createdAt', 'ASC']
        ]
      })) as Book
    }

    if (!libraryItem.media) return null
    return libraryItem
  }

  static async findOneExpanded(
    where: WhereOptions,
    replacements: BindOrReplacements | null = null,
    include: IncludeOptions | null = null
  ): Promise<LibraryItem | null> {
    const libraryItem = await this.findOne({
      where,
      replacements: replacements ?? undefined,
      include: include ? [include] : undefined
    })
    if (!libraryItem) {
      return null
    }

    const sequelize = this.sequelize
    if (!sequelize) return null
    const { podcastEpisode, author, series, bookAuthor } = sequelize.models

    if (libraryItem.mediaType === 'podcast') {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: podcastEpisode
          }
        ]
      })) as Record<string, unknown>
    } else {
      libraryItem.media = (await libraryItem.getMedia({
        include: [
          {
            model: author,
            through: {
              attributes: []
            }
          },
          {
            model: series,
            through: {
              attributes: ['id', 'sequence']
            }
          }
        ],
        order: [
          [author, bookAuthor, 'createdAt', 'ASC'],
          [series, 'bookSeries', 'createdAt', 'ASC']
        ]
      })) as Book
    }

    if (!libraryItem.media) return null
    return libraryItem
  }

  static async getByFilterAndSort(
    library: Library,
    user: User,
    options: Record<string, unknown>
  ): Promise<{ libraryItems: Record<string, unknown>[]; count: number }> {
    const start = Date.now()
    const { libraryItems, count } = await filters.getFilteredLibraryItems(
      library.id,
      user,
      options
    )
    Logger.debug(
      `Loaded ${libraryItems.length} of ${count} items for libary page in ${(
        (Date.now() - start) /
        1000
      ).toFixed(2)}s`
    )

    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        const liAny = li as LibraryItem & {
          collapsedSeries?: unknown
          series?: unknown
          rssFeed?: { toOldJSONMinified: () => unknown }
          mediaItemShare?: unknown
          numEpisodesIncomplete?: number
        }
        if (liAny.collapsedSeries) {
          oldLibraryItem.collapsedSeries = liAny.collapsedSeries
        }
        if (liAny.series && oldLibraryItem.media) {
          const mediaMetadata = (oldLibraryItem.media as { metadata?: Record<string, unknown> }).metadata
          if (mediaMetadata) {
            mediaMetadata.series = liAny.series
          }
        }
        if (liAny.rssFeed) {
          oldLibraryItem.rssFeed = liAny.rssFeed.toOldJSONMinified()
        }
        const mediaAny = li.media as { numEpisodes?: number; size?: number } | undefined
        if (mediaAny?.numEpisodes && oldLibraryItem.media) {
          ;(oldLibraryItem.media as Record<string, unknown>).numEpisodes = mediaAny.numEpisodes
        }
        if (li.size && oldLibraryItem.media && !(oldLibraryItem.media as Record<string, unknown>).size) {
          ;(oldLibraryItem.media as Record<string, unknown>).size = li.size
        }
        if (liAny.numEpisodesIncomplete) {
          oldLibraryItem.numEpisodesIncomplete = liAny.numEpisodesIncomplete
        }
        if (liAny.mediaItemShare) {
          oldLibraryItem.mediaItemShare = liAny.mediaItemShare
        }

        return oldLibraryItem
      }),
      count
    }
  }

  static async getPersonalizedShelves(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<Record<string, unknown>[]> {
    const fullStart = Date.now()
    const shelves: Record<string, unknown>[] = []

    const timed = async <T>(loader: () => Promise<T>): Promise<{ payload: T; elapsedSeconds: string }> => {
      const start = Date.now()
      const payload = await loader()
      return {
        payload,
        elapsedSeconds: ((Date.now() - start) / 1000).toFixed(2)
      }
    }

    const itemsInProgressPayload = await filters.getMediaItemsInProgress(
      library,
      user,
      include,
      limit
    )
    if (itemsInProgressPayload.items.length) {
      const ebookOnlyItemsInProgress = itemsInProgressPayload.items.filter(
        (li) => li.media.ebookFormat && !li.media.numTracks
      )
      const audioItemsInProgress = itemsInProgressPayload.items.filter(
        (li) => li.media.numTracks || li.mediaType === 'podcast'
      )

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
    Logger.debug(
      `Loaded ${itemsInProgressPayload.items.length} of ${itemsInProgressPayload.count} items for "Continue Listening/Reading" in ${(
        (Date.now() - fullStart) /
        1000
      ).toFixed(2)}s`
    )

    if (library.isBook) {
      const [
        continueSeriesResult,
        mostRecentResult,
        seriesMostRecentResult,
        discoverResult,
        mediaFinishedResult,
        newestAuthorsResult
      ] = await Promise.all([
        timed(() => filters.getLibraryItemsContinueSeries(library, user, include, limit)),
        timed(() => filters.getLibraryItemsMostRecentlyAdded(library, user, include, limit)),
        timed(() => filters.getSeriesMostRecentlyAdded(library, user, include, 5)),
        timed(() => filters.getLibraryItemsToDiscover(library, user, include, limit)),
        timed(() => filters.getMediaFinished(library, user, include, limit)),
        timed(() => filters.getNewestAuthors(library, user, limit))
      ])

      const continueSeriesPayload = continueSeriesResult.payload
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

      const mostRecentPayload = mostRecentResult.payload
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

      const seriesMostRecentPayload = seriesMostRecentResult.payload
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

      const discoverLibraryItemsPayload = discoverResult.payload
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

      const mediaFinishedPayload = mediaFinishedResult.payload
      if (mediaFinishedPayload.items.length) {
        const ebookOnly = mediaFinishedPayload.items.filter(
          (li) => li.media.ebookFormat && !li.media.numTracks
        )
        const audioItems = mediaFinishedPayload.items.filter(
          (li) => li.media.numTracks || li.mediaType === 'podcast'
        )

        if (audioItems.length) {
          shelves.push({
            id: 'listen-again',
            label: 'Listen Again',
            labelStringKey: 'LabelListenAgain',
            type: library.isPodcast ? 'episode' : 'book',
            entities: audioItems,
            total: mediaFinishedPayload.count
          })
        }

        if (ebookOnly.length) {
          shelves.push({
            id: 'read-again',
            label: 'Read Again',
            labelStringKey: 'LabelReadAgain',
            type: 'book',
            entities: ebookOnly,
            total: mediaFinishedPayload.count
          })
        }
      }

      const newestAuthorsPayload = newestAuthorsResult.payload
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
    } else if (library.isPodcast) {
      const [newestEpisodesResult, mostRecentResult, mediaFinishedResult] = await Promise.all([
        timed(() => filters.getNewestPodcastEpisodes(library, user, limit)),
        timed(() => filters.getLibraryItemsMostRecentlyAdded(library, user, include, limit)),
        timed(() => filters.getMediaFinished(library, user, include, limit))
      ])

      const newestEpisodesPayload = newestEpisodesResult.payload
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

      const mostRecentPayload = mostRecentResult.payload
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

      const mediaFinishedPayload = mediaFinishedResult.payload
      if (mediaFinishedPayload.items.length) {
        const ebookOnly = mediaFinishedPayload.items.filter(
          (li) => li.media.ebookFormat && !li.media.numTracks
        )
        const audioItems = mediaFinishedPayload.items.filter(
          (li) => li.media.numTracks || li.mediaType === 'podcast'
        )

        if (audioItems.length) {
          shelves.push({
            id: 'listen-again',
            label: 'Listen Again',
            labelStringKey: 'LabelListenAgain',
            type: 'episode',
            entities: audioItems,
            total: mediaFinishedPayload.count
          })
        }

        if (ebookOnly.length) {
          shelves.push({
            id: 'read-again',
            label: 'Read Again',
            labelStringKey: 'LabelReadAgain',
            type: 'book',
            entities: ebookOnly,
            total: mediaFinishedPayload.count
          })
        }
      }
    }

    Logger.debug(
      `Loaded ${shelves.length} personalized shelves in ${(
        (Date.now() - fullStart) /
        1000
      ).toFixed(2)}s`
    )

    return shelves
  }

  static async getForAuthor(author: Author, user: User | null = null): Promise<LibraryItem[]> {
    const { libraryItems } = await filters.getLibraryItemsForAuthor(author, user)
    return libraryItems
  }

  static async checkExistsById(libraryItemId: string): Promise<boolean> {
    return (await this.count({ where: { id: libraryItemId } })) > 0
  }

  static async getCoverPath(libraryItemId: string): Promise<string | null> {
    if (!this.sequelize) return null
    const libraryItem = await this.findByPk(libraryItemId, {
      attributes: ['id', 'mediaType', 'mediaId', 'libraryId'],
      include: [
        {
          model: this.sequelize.models.book,
          attributes: ['id', 'coverPath']
        },
        {
          model: this.sequelize.models.podcast,
          attributes: ['id', 'coverPath']
        }
      ]
    })
    if (!libraryItem) {
      Logger.warn(`[LibraryItem] getCoverPath: Library item "${libraryItemId}" does not exist`)
      return null
    }

    const media = libraryItem.media as { coverPath?: string | null } | undefined
    return media?.coverPath ?? null
  }

  async saveMetadataFile(): Promise<LibraryFileObject | null> {
    const metadataPathBase = (global as { MetadataPath?: string }).MetadataPath ?? ''
    let metadataPath = Path.join(metadataPathBase, 'items', this.id)
    const serverSettings = (
      global as {
        ServerSettings?: { storeMetadataWithItem?: boolean; metadataFileFormat?: string }
      }
    ).ServerSettings

    let storeMetadataWithItem = !!serverSettings?.storeMetadataWithItem
    if (storeMetadataWithItem && !this.isFile) {
      metadataPath = this.path
    } else {
      storeMetadataWithItem = false
      await fsExtra.ensureDir(metadataPath)
    }

    const fileFormat = serverSettings?.metadataFileFormat ?? 'json'
    const metadataFilePath = Path.join(metadataPath, `metadata.${fileFormat}`)

    const mediaExpanded = (this.media || (await this.getMediaExpanded())) as
      | Book
      | Record<string, unknown>

    let jsonObject: Record<string, unknown> = {}
    if (this.mediaType === 'book') {
      const bMedia = mediaExpanded as Book
      jsonObject = {
        tags: bMedia.tags ?? [],
        chapters: bMedia.chapters?.map((c) => ({ ...c })) ?? [],
        title: bMedia.title,
        subtitle: bMedia.subtitle,
        authors: (bMedia.authors ?? []).map((a) => a.name),
        narrators: bMedia.narrators,
        series: (bMedia.series ?? []).map((se) => {
          const sequence = se.bookSeries?.sequence || ''
          if (!sequence) return se.name
          return `${se.name} #${sequence}`
        }),
        genres: bMedia.genres ?? [],
        publishedYear: bMedia.publishedYear,
        publishedDate: bMedia.publishedDate,
        publisher: bMedia.publisher,
        description: bMedia.description,
        isbn: bMedia.isbn,
        asin: bMedia.asin,
        language: bMedia.language,
        explicit: !!bMedia.explicit,
        abridged: !!bMedia.abridged
      }
    } else {
      const pMedia = mediaExpanded as {
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
        tags: pMedia.tags ?? [],
        title: pMedia.title,
        author: pMedia.author,
        description: pMedia.description,
        releaseDate: pMedia.releaseDate,
        genres: pMedia.genres ?? [],
        feedURL: pMedia.feedURL,
        imageURL: pMedia.imageURL,
        itunesPageURL: pMedia.itunesPageURL,
        itunesId: pMedia.itunesId,
        itunesArtistId: pMedia.itunesArtistId,
        asin: pMedia.asin,
        language: pMedia.language,
        explicit: !!pMedia.explicit,
        podcastType: pMedia.podcastType
      }
    }

    try {
      await fsExtra.writeFile(metadataFilePath, JSON.stringify(jsonObject, null, 2))

      if (!this.libraryFiles) {
        this.libraryFiles = []
      }
      let metadataLibraryFile = this.libraryFiles.find(
        (lf) => lf.metadata.path === filePathToPOSIX(metadataFilePath)
      )
      if (storeMetadataWithItem) {
        if (!metadataLibraryFile) {
          const newLibraryFile = new LibraryFile()
          await newLibraryFile.setDataFromPath(metadataFilePath, `metadata.json`)
          metadataLibraryFile = newLibraryFile.toJSON() as LibraryFileObject
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
          this.libraryFiles.forEach((lf) => {
            const s = Number(lf.metadata.size)
            size += !isNaN(s) ? s : 0
          })
          this.size = size
          await this.save()
        }
      }

      Logger.debug(`[LibraryItem] Saved metadata for "${(this.media as { title?: string })?.title}" file to "${metadataFilePath}"`)
      return metadataLibraryFile ?? null
    } catch (error) {
      Logger.error(`Failed to save json file at "${metadataFilePath}"`, error)
      return null
    }
  }

  static initModel(sequelize: Sequelize): typeof LibraryItem {
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
          { fields: ['createdAt'] },
          { fields: ['mediaId'] },
          { fields: ['libraryId', 'mediaType'] },
          { fields: ['libraryId', 'mediaType', 'size'] },
          { fields: ['libraryId', 'mediaType', 'createdAt'] },
          { fields: ['libraryId', 'mediaType', { name: 'title', collate: 'NOCASE' }] },
          { fields: ['libraryId', 'mediaType', { name: 'titleIgnorePrefix', collate: 'NOCASE' }] },
          { fields: ['libraryId', 'mediaType', { name: 'authorNamesFirstLast', collate: 'NOCASE' }] },
          { fields: ['libraryId', 'mediaType', { name: 'authorNamesLastFirst', collate: 'NOCASE' }] },
          { fields: ['libraryId', 'mediaId', 'mediaType'] },
          { fields: ['birthtime'] },
          { fields: ['mtime'] }
        ]
      }
    )

    const { library, libraryFolder, book, podcast } = sequelize.models
    if (library) {
      library.hasMany(LibraryItem)
      LibraryItem.belongsTo(library)
    }

    if (libraryFolder) {
      libraryFolder.hasMany(LibraryItem)
      LibraryItem.belongsTo(libraryFolder)
    }

    if (book) {
      book.hasOne(LibraryItem, {
        foreignKey: 'mediaId',
        constraints: false,
        scope: { mediaType: 'book' }
      })
      LibraryItem.belongsTo(book, { foreignKey: 'mediaId', constraints: false })
    }

    if (podcast) {
      podcast.hasOne(LibraryItem, {
        foreignKey: 'mediaId',
        constraints: false,
        scope: { mediaType: 'podcast' }
      })
      LibraryItem.belongsTo(podcast, { foreignKey: 'mediaId', constraints: false })
    }

    LibraryItem.addHook('afterFind', (findResult) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]
      for (const instance of instances) {
        const inst = instance as LibraryItem & {
          book?: unknown
          podcast?: unknown
          dataValues: Record<string, unknown>
        }
        if (inst.mediaType === 'book' && inst.book !== undefined) {
          inst.media = inst.book as Book
          inst.dataValues.media = inst.dataValues.book
        } else if (inst.mediaType === 'podcast' && inst.podcast !== undefined) {
          inst.media = inst.podcast as Record<string, unknown>
          inst.dataValues.media = inst.dataValues.podcast
        }
        delete inst.book
        delete inst.dataValues.book
        delete inst.podcast
        delete inst.dataValues.podcast
      }
    })

    LibraryItem.addHook('afterDestroy', async (instance) => {
      if (!instance) return
      const li = instance as LibraryItem
      const media = (await li.getMedia()) as { destroy: () => Promise<unknown> } | null
      if (media) {
        await media.destroy()
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

  get hasAudioTracks(): boolean {
    if (!this.media) {
      Logger.error(`[LibraryItem] hasAudioTracks: Library item "${this.id}" does not have media`)
      return false
    }
    const mediaObj = this.media as { hasAudioTracks?: boolean }
    return !!mediaObj.hasAudioTracks
  }

  getMedia(options?: FindOptions): Promise<unknown> {
    if (!this.mediaType) return Promise.resolve(null)
    const uppercaseFirst = (str: string) => (str ? `${str[0]?.toUpperCase() ?? ''}${str.substring(1)}` : '')
    const mixinMethodName = `get${uppercaseFirst(this.mediaType)}`
    const self = this as Record<string, unknown>
    const method = self[mixinMethodName]
    if (typeof method === 'function') {
      return (method as (opts?: FindOptions) => Promise<unknown>).call(this, options)
    }
    return Promise.resolve(null)
  }

  getMediaExpanded(): Promise<unknown> {
    if (this.mediaType === 'podcast') {
      return this.getMedia({
        include: [
          {
            model: this.sequelize.models.podcastEpisode
          }
        ]
      })
    } else {
      return this.getMedia({
        include: [
          {
            model: this.sequelize.models.author,
            through: {
              attributes: []
            }
          },
          {
            model: this.sequelize.models.series,
            through: {
              attributes: ['sequence']
            }
          }
        ],
        order: [
          [this.sequelize.models.author, this.sequelize.models.bookAuthor, 'createdAt', 'ASC'],
          [this.sequelize.models.series, 'bookSeries', 'createdAt', 'ASC']
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
      const bookMedia = this.media as Book
      return bookMedia.audioFiles?.find((af) => af.ino === ino) ?? null
    } else {
      const podcastMedia = this.media as {
        podcastEpisodes?: Array<{ audioFile?: AudioFileObject }>
      }
      return (
        podcastMedia.podcastEpisodes?.find((pe) => pe.audioFile?.ino === ino)?.audioFile ?? null
      )
    }
  }

  getTrackList(episodeId?: string): AudioTrack[] {
    if (!this.media) {
      Logger.error(`[LibraryItem] getTrackList: Library item "${this.id}" does not have media`)
      return []
    }
    const mediaObj = this.media as {
      getTracklist: (itemId: string, epId?: string) => AudioTrack[]
    }
    return mediaObj.getTracklist(this.id, episodeId)
  }

  getLibraryFileWithIno(ino: string): LibraryFile | null {
    const libraryFile = this.libraryFiles?.find((lf) => lf.ino === ino)
    if (!libraryFile) return null
    return new LibraryFile(libraryFile)
  }

  getLibraryFiles(): LibraryFile[] {
    return (this.libraryFiles ?? []).map((lf) => new LibraryFile(lf))
  }

  getLibraryFilesJson(): Record<string, unknown>[] {
    return (this.libraryFiles ?? []).map((lf) => new LibraryFile(lf).toJSON() as Record<string, unknown>)
  }

  toOldJSON(): Record<string, unknown> {
    if (!this.media) {
      throw new Error(`[LibraryItem] Cannot convert to old JSON without media for library item "${this.id}"`)
    }

    const mediaObj = this.media as { toOldJSON: (itemId: string) => unknown }

    return {
      id: this.id,
      ino: this.ino,
      oldLibraryItemId: this.extraData?.oldLibraryItemId ?? null,
      libraryId: this.libraryId,
      folderId: this.libraryFolderId,
      path: this.path,
      relPath: this.relPath,
      isFile: this.isFile,
      mtimeMs: this.mtime?.valueOf(),
      ctimeMs: this.ctime?.valueOf(),
      birthtimeMs: this.birthtime?.valueOf(),
      addedAt: this.createdAt?.valueOf() ?? Date.now(),
      updatedAt: this.updatedAt?.valueOf() ?? Date.now(),
      lastScan: this.lastScan?.valueOf(),
      scanVersion: this.lastScanVersion,
      isMissing: !!this.isMissing,
      isInvalid: !!this.isInvalid,
      mediaType: this.mediaType,
      media: mediaObj.toOldJSON(this.id),
      libraryFiles: this.getLibraryFilesJson()
    }
  }

  toOldJSONMinified(): Record<string, unknown> {
    if (!this.media) {
      throw new Error(`[LibraryItem] Cannot convert to old JSON without media for library item "${this.id}"`)
    }

    const mediaObj = this.media as { toOldJSONMinified: () => unknown }

    return {
      id: this.id,
      ino: this.ino,
      oldLibraryItemId: this.extraData?.oldLibraryItemId ?? null,
      libraryId: this.libraryId,
      folderId: this.libraryFolderId,
      path: this.path,
      relPath: this.relPath,
      isFile: this.isFile,
      mtimeMs: this.mtime?.valueOf(),
      ctimeMs: this.ctime?.valueOf(),
      birthtimeMs: this.birthtime?.valueOf(),
      addedAt: this.createdAt?.valueOf() ?? Date.now(),
      updatedAt: this.updatedAt?.valueOf() ?? Date.now(),
      isMissing: !!this.isMissing,
      isInvalid: !!this.isInvalid,
      mediaType: this.mediaType,
      media: mediaObj.toOldJSONMinified(),
      numFiles: this.libraryFiles?.length ?? 0,
      size: this.size
    }
  }

  toOldJSONExpanded(): Record<string, unknown> {
    const mediaObj = this.media as { toOldJSONExpanded: (itemId: string) => unknown } | undefined
    return {
      ...this.toOldJSONMinified(),
      lastScan: this.lastScan?.valueOf(),
      scanVersion: this.lastScanVersion,
      media: mediaObj?.toOldJSONExpanded(this.id),
      libraryFiles: this.getLibraryFilesJson()
    }
  }
}

export default LibraryItem
