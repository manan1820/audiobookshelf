import { Sequelize, Op, WhereOptions, Includeable, FindOptions } from 'sequelize'
import Logger from '../../Logger'
import Database from '../../Database'
import libraryItemsBookFilters from './libraryItemsBookFilters'
import libraryItemsPodcastFilters from './libraryItemsPodcastFilters'
import { createNewSortInstance } from '../../libs/fastSort'
import { profile } from '../profiler'
import type Library from '../../models/Library'
import type User from '../../models/User'
import type LibraryItem from '../../models/LibraryItem'
import type Author from '../../models/Author'
import type Book from '../../models/Book'
import type Feed from '../../models/Feed'
import type { PodcastAttributes } from '../../models/Podcast'
import type {
  LibraryFilterOptions,
  FilteredLibraryItemsResult,
  ShelfMediaItemsResult,
  ShelfLibraryItemsResult,
  ShelfSeriesResult,
  ShelfAuthorsResult,
  CollectionOldJsonObject,
  FilterDataResult,
  FilterDataAuthor,
  FilterDataSeries,
  SeriesOldJsonObject,
  LibraryItemOldJsonMinifiedObject,
  LibraryFilterDataStore
} from '../../types'

interface Sortable<T> {
  asc(getter?: ((item: T) => unknown) | string): T[]
}

const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

const libraryFilters = {
  decode(text: string): string | null {
    try {
      return Buffer.from(decodeURIComponent(text), 'base64').toString()
    } catch (error) {
      Logger.warn(`[libraryFilters] Failed to decode filter value "${text}": ${(error as Error).message}`)
      return null
    }
  },

  /**
   * Get library items using filter and sort
   */
  async getFilteredLibraryItems(
    libraryId: string,
    user: User,
    options: LibraryFilterOptions
  ): Promise<FilteredLibraryItemsResult> {
    const filterBy = typeof options.filterBy === 'string' ? options.filterBy : (typeof options.filter === 'string' ? options.filter : null)
    const sortBy = typeof options.sortBy === 'string' ? options.sortBy : (typeof options.sort === 'string' ? options.sort : null)
    const sortDesc = typeof options.sortDesc === 'boolean' ? options.sortDesc : Boolean(options.desc)
    const limit = options.limit ?? null
    const offset = options.offset ?? null
    const collapseseries = options.collapseseries ?? (typeof options.collapseSeries === 'boolean' ? options.collapseSeries : null)
    const include = Array.isArray(options.include) ? (options.include as string[]) : (typeof options.include === 'string' ? [options.include] : [])
    const mediaType = typeof options.mediaType === 'string' ? options.mediaType : 'book'

    let filterValue: string | null = null
    let filterGroup: string | null = null
    if (filterBy) {
      const searchGroups = [
        'genres',
        'tags',
        'series',
        'authors',
        'progress',
        'narrators',
        'publishers',
        'publishedDecades',
        'missing',
        'languages',
        'tracks',
        'ebooks'
      ]
      const group = searchGroups.find((_group) => filterBy.startsWith(_group + '.'))
      filterGroup = group || filterBy
      filterValue = group ? this.decode(filterBy.replace(`${group}.`, '')) : null
    }

    if (mediaType === 'book') {
      return libraryItemsBookFilters.getFilteredLibraryItems(
        libraryId,
        user,
        filterGroup,
        filterValue,
        sortBy || null,
        sortDesc ?? null,
        collapseseries ?? null,
        include,
        limit,
        offset
      )
    } else {
      return libraryItemsPodcastFilters.getFilteredLibraryItems(
        libraryId,
        user,
        filterGroup,
        filterValue,
        sortBy || null,
        sortDesc ?? null,
        include,
        limit,
        offset
      )
    }
  },

  /**
   * Get library items for continue listening & continue reading shelves
   */
  async getMediaItemsInProgress(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfMediaItemsResult> {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(
        library.id,
        user,
        'progress',
        'in-progress',
        'progress',
        true,
        false,
        include,
        limit,
        0,
        true
      )
      return {
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(
        library.id,
        user,
        'progress',
        'in-progress',
        'progress',
        true,
        limit,
        0,
        true
      )
      return {
        count,
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          oldLibraryItem.recentEpisode = (li as LibraryItem & { recentEpisode?: unknown }).recentEpisode
          return oldLibraryItem
        })
      }
    }
  },

  /**
   * Get library items for most recently added shelf
   */
  async getLibraryItemsMostRecentlyAdded(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfLibraryItemsResult> {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(
        library.id,
        user,
        'recent',
        null,
        'addedAt',
        true,
        false,
        include,
        limit,
        0
      )
      return {
        libraryItems: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.size && oldLibraryItem.media && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = Number(li.size)
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredLibraryItems(
        library.id,
        user,
        'recent',
        null,
        'addedAt',
        true,
        include,
        limit,
        0
      )
      return {
        libraryItems: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.size && oldLibraryItem.media && !oldLibraryItem.media.size) {
            oldLibraryItem.media.size = Number(li.size)
          }
          if ((li as LibraryItem & { numEpisodesIncomplete?: number }).numEpisodesIncomplete !== undefined) {
            oldLibraryItem.numEpisodesIncomplete = (
              li as LibraryItem & { numEpisodesIncomplete?: number }
            ).numEpisodesIncomplete
          }
          return oldLibraryItem
        }),
        count
      }
    }
  },

  /**
   * Get library items for continue series shelf
   */
  async getLibraryItemsContinueSeries(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfLibraryItemsResult> {
    const { libraryItems, count } = await libraryItemsBookFilters.getContinueSeriesLibraryItems(
      library,
      user,
      include,
      limit,
      0
    )
    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
        }
        if (
          li.series &&
          oldLibraryItem.media &&
          'metadata' in oldLibraryItem.media &&
          oldLibraryItem.media.metadata &&
          'series' in oldLibraryItem.media.metadata
        ) {
          oldLibraryItem.media.metadata.series = [li.series]
        }
        if (li.mediaItemShare) {
          oldLibraryItem.mediaItemShare = li.mediaItemShare
        }
        return oldLibraryItem
      }),
      count
    }
  },

  /**
   * Get library items or podcast episodes for the "Listen Again" and "Read Again" shelf
   */
  async getMediaFinished(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfMediaItemsResult> {
    if (library.isBook) {
      const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(
        library.id,
        user,
        'progress',
        'finished',
        'progress',
        true,
        false,
        include,
        limit,
        0
      )
      return {
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          if (li.rssFeed) {
            oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
          }
          if (li.mediaItemShare) {
            oldLibraryItem.mediaItemShare = li.mediaItemShare
          }
          return oldLibraryItem
        }),
        count
      }
    } else {
      const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(
        library.id,
        user,
        'progress',
        'finished',
        'progress',
        true,
        limit,
        0
      )
      return {
        count,
        items: libraryItems.map((li) => {
          const oldLibraryItem = li.toOldJSONMinified()
          oldLibraryItem.recentEpisode = (li as LibraryItem & { recentEpisode?: unknown }).recentEpisode
          return oldLibraryItem
        })
      }
    }
  },

  /**
   * Get series for recent series shelf
   */
  async getSeriesMostRecentlyAdded(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfSeriesResult> {
    if (!library.isBook) return { series: [], count: 0 }

    const seriesIncludes: Includeable[] = []
    if (include.includes('rssfeed')) {
      seriesIncludes.push({
        model: Database.feedModel
      })
    }

    const userPermissionBookWhere = libraryItemsBookFilters.getUserPermissionBookWhereQuery(user)

    const seriesWhere: WhereOptions[] = [
      {
        libraryId: library.id,
        createdAt: {
          [Op.gte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        }
      }
    ]

    if (library.settings?.hideSingleBookSeries) {
      seriesWhere.push(
        Sequelize.where(
          Sequelize.literal(
            '(SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id)'
          ),
          {
            [Op.gt]: 1
          }
        )
      )
    }

    if (userPermissionBookWhere.bookWhere.length) {
      let attrQuery = 'SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id'
      if (!user.canAccessExplicitContent) {
        attrQuery += ' AND b.explicit = 0'
      }
      if (!user.permissions?.accessAllTags && user.permissions?.itemTagsSelected?.length) {
        if (user.permissions.selectedTagsNotAccessible) {
          attrQuery +=
            ' AND (SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected)) = 0'
        } else {
          attrQuery +=
            ' AND (SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected)) > 0'
        }
      }
      seriesWhere.push(
        Sequelize.where(Sequelize.literal(`(${attrQuery})`), {
          [Op.gt]: 0
        })
      )
    }

    const { rows: series, count } = await Database.seriesModel.findAndCountAll({
      where: seriesWhere.length ? { [Op.and]: seriesWhere } : undefined,
      limit,
      offset: 0,
      distinct: true,
      subQuery: false,
      replacements: userPermissionBookWhere.replacements,
      include: [
        {
          model: Database.bookSeriesModel,
          include: [
            {
              model: Database.bookModel,
              where: userPermissionBookWhere.bookWhere.length
                ? { [Op.and]: userPermissionBookWhere.bookWhere }
                : undefined,
              include: [
                {
                  model: Database.libraryItemModel
                }
              ]
            }
          ],
          separate: true
        },
        ...seriesIncludes
      ],
      order: [['createdAt', 'DESC']]
    })

    const allOldSeries: SeriesOldJsonObject[] = []
    for (const s of series) {
      const oldSeries = s.toOldJSON()

      const feeds = (s as typeof s & { feeds?: Feed[] }).feeds
      if (feeds?.length) {
        oldSeries.rssFeed = feeds[0].toOldJSONMinified()
      }

      const bookSeriesList = Array.isArray(s.bookSeries) ? s.bookSeries : []
      bookSeriesList.sort((a, b) => {
        if (!a.sequence) return 1
        if (!b.sequence) return -1
        return a.sequence.localeCompare(b.sequence, undefined, {
          numeric: true,
          sensitivity: 'base'
        })
      })
      oldSeries.books = bookSeriesList
        .map((bs) => {
          const bsBook = bs.book as (Book & { libraryItem?: LibraryItem }) | undefined
          const libraryItem = bsBook?.libraryItem
          if (!libraryItem || !bsBook) {
            Logger.warn('Book series book has no libraryItem', bs, bs.book, 'series=', series)
            return null
          }

          delete (bsBook as { libraryItem?: unknown }).libraryItem
          bsBook.authors = []
          bsBook.series = []
          libraryItem.media = bsBook
          const oldLibraryItem = libraryItem.toOldJSONMinified()
          return oldLibraryItem
        })
        .filter((b): b is LibraryItemOldJsonMinifiedObject => b !== null)
      allOldSeries.push(oldSeries)
    }

    return {
      series: allOldSeries,
      count
    }
  },

  /**
   * Get most recently created authors for "Newest Authors" shelf
   */
  async getNewestAuthors(library: Library, user: User, limit: number): Promise<ShelfAuthorsResult> {
    if (library.mediaType !== 'book') return { authors: [], count: 0 }

    const { bookWhere, replacements } = libraryItemsBookFilters.getUserPermissionBookWhereQuery(user)

    const { rows: authors, count } = await Database.authorModel.findAndCountAll({
      where: {
        libraryId: library.id,
        createdAt: {
          [Op.gte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        }
      },
      replacements,
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'tags', 'explicit'],
          where: bookWhere.length ? { [Op.and]: bookWhere } : undefined,
          required: true,
          through: {
            attributes: []
          }
        }
      ],
      limit,
      distinct: true,
      order: [['createdAt', 'DESC']]
    })

    return {
      authors: authors.map((au) => {
        const numBooks = au.books?.length || 0
        return au.toOldJSONExpanded(numBooks)
      }),
      count
    }
  },

  /**
   * Get book library items for the "Discover" shelf
   */
  async getLibraryItemsToDiscover(
    library: Library,
    user: User,
    include: string[],
    limit: number
  ): Promise<ShelfLibraryItemsResult> {
    if (library.mediaType !== 'book') return { libraryItems: [], count: 0 }

    const { libraryItems, count } = await libraryItemsBookFilters.getDiscoverLibraryItems(
      library.id,
      user,
      include,
      limit
    )
    return {
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        if (li.rssFeed) {
          oldLibraryItem.rssFeed = li.rssFeed.toOldJSONMinified()
        }
        if (li.mediaItemShare) {
          oldLibraryItem.mediaItemShare = li.mediaItemShare
        }
        return oldLibraryItem
      }),
      count
    }
  },

  /**
   * Get podcast episodes most recently added
   */
  async getNewestPodcastEpisodes(library: Library, user: User, limit: number): Promise<ShelfLibraryItemsResult> {
    if (library.mediaType !== 'podcast') return { libraryItems: [], count: 0 }

    const { libraryItems, count } = await libraryItemsPodcastFilters.getFilteredPodcastEpisodes(
      library.id,
      user,
      'recent',
      null,
      'createdAt',
      true,
      limit,
      0
    )
    return {
      count,
      libraryItems: libraryItems.map((li) => {
        const oldLibraryItem = li.toOldJSONMinified()
        oldLibraryItem.recentEpisode = (li as LibraryItem & { recentEpisode?: unknown }).recentEpisode
        return oldLibraryItem
      })
    }
  },

  /**
   * Get library items for an author, optional use user permissions
   */
  async getLibraryItemsForAuthor(
    author: Author,
    user: User | null,
    limit: number | null = null,
    offset: number | null = null
  ): Promise<FilteredLibraryItemsResult> {
    const { libraryItems, count } = await libraryItemsBookFilters.getFilteredLibraryItems(
      author.libraryId,
      user as User,
      'authors',
      author.id,
      'addedAt',
      true,
      false,
      [],
      limit,
      offset
    )
    return {
      count,
      libraryItems
    }
  },

  /**
   * Get book library items in a collection
   */
  getLibraryItemsForCollection(collection: CollectionOldJsonObject): Promise<LibraryItem[]> {
    return libraryItemsBookFilters.getLibraryItemsForCollection(collection)
  },

  /**
   * Get filter data used in filter menus
   */
  async getFilterData(mediaType: string, libraryId: string): Promise<FilterDataResult> {
    const filterDataStore = Database.libraryFilterData as LibraryFilterDataStore
    const cachedFilterData = filterDataStore[libraryId]
    if (cachedFilterData?.loadedAt) {
      const cacheElapsed = Date.now() - cachedFilterData.loadedAt
      if (cacheElapsed < 1000 * 60 * 30) {
        return cachedFilterData
      }
    }
    const start = Date.now()

    const data: FilterDataResult = {
      authors: [],
      genres: new Set<string>(),
      tags: new Set<string>(),
      series: [],
      narrators: new Set<string>(),
      languages: new Set<string>(),
      publishers: new Set<string>(),
      publishedDecades: new Set<string>(),
      bookCount: 0,
      authorCount: 0,
      seriesCount: 0,
      podcastCount: 0,
      numIssues: 0
    }

    const lastLoadedAt = cachedFilterData?.loadedAt || 0

    if (mediaType === 'podcast') {
      const podcastModelCount = process.env.QUERY_PROFILING
        ? profile(Database.podcastModel.count.bind(Database.podcastModel))
        : Database.podcastModel.count.bind(Database.podcastModel)
      const podcastCountFromDatabase = (await podcastModelCount({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId
          }
        }
      })) as number

      const changedPodcasts = (await podcastModelCount({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId,
            updatedAt: {
              [Op.gt]: new Date(lastLoadedAt)
            }
          }
        },
        where: {
          updatedAt: {
            [Op.gt]: new Date(lastLoadedAt)
          }
        }
      })) as number

      if (changedPodcasts === 0) {
        if (podcastCountFromDatabase === filterDataStore[libraryId]?.podcastCount) {
          Logger.debug(
            `Filter data for ${libraryId} has not changed, returning cached data and updating cache time after ${((Date.now() - start) / 1000).toFixed(2)}s`
          )
          if (cachedFilterData) {
            cachedFilterData.loadedAt = Date.now()
            return cachedFilterData
          }
        }
      }

      const findAll = process.env.QUERY_PROFILING
        ? profile((options?: FindOptions<PodcastAttributes>) => Database.podcastModel.findAll(options))
        : (options?: FindOptions<PodcastAttributes>) => Database.podcastModel.findAll(options)
      const podcasts = await findAll({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId
          }
        },
        attributes: ['tags', 'genres', 'language']
      })
      for (const podcast of podcasts) {
        if (podcast.tags?.length) {
          podcast.tags.forEach((tag: string) => (data.tags as Set<string>).add(tag))
        }
        if (podcast.genres?.length) {
          podcast.genres.forEach((genre: string) => (data.genres as Set<string>).add(genre))
        }
        if (podcast.language) {
          ;(data.languages as Set<string>).add(podcast.language)
        }
      }

      data.podcastCount = podcastCountFromDatabase
    } else {
      const bookCountFromDatabase = (await Database.bookModel.count({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId
          }
        }
      })) as number

      const seriesCountFromDatabase = (await Database.seriesModel.count({
        where: {
          libraryId
        }
      })) as number

      const authorCountFromDatabase = (await Database.authorModel.count({
        where: {
          libraryId
        }
      })) as number

      const changedBooks = (await Database.bookModel.count({
        include: {
          model: Database.libraryItemModel,
          attributes: [],
          where: {
            libraryId,
            updatedAt: {
              [Op.gt]: new Date(lastLoadedAt)
            }
          }
        },
        where: {
          updatedAt: {
            [Op.gt]: new Date(lastLoadedAt)
          }
        }
      })) as number

      const changedSeries = (await Database.seriesModel.count({
        where: {
          libraryId,
          updatedAt: {
            [Op.gt]: new Date(lastLoadedAt)
          }
        }
      })) as number

      const changedAuthors = (await Database.authorModel.count({
        where: {
          libraryId,
          updatedAt: {
            [Op.gt]: new Date(lastLoadedAt)
          }
        }
      })) as number

      if (changedBooks + changedSeries + changedAuthors === 0) {
        if (
          bookCountFromDatabase === filterDataStore[libraryId]?.bookCount &&
          seriesCountFromDatabase === filterDataStore[libraryId]?.seriesCount &&
          authorCountFromDatabase === filterDataStore[libraryId]?.authorCount
        ) {
          Logger.debug(
            `Filter data for ${libraryId} has not changed, returning cached data and updating cache time after ${((Date.now() - start) / 1000).toFixed(2)}s`
          )
          if (cachedFilterData) {
            cachedFilterData.loadedAt = Date.now()
            return cachedFilterData
          }
        }
      }

      data.bookCount = bookCountFromDatabase
      data.seriesCount = seriesCountFromDatabase
      data.authorCount = authorCountFromDatabase

      const books = await Database.bookModel.findAll({
        include: {
          model: Database.libraryItemModel,
          attributes: ['isMissing', 'isInvalid'],
          where: {
            libraryId
          }
        },
        attributes: ['tags', 'genres', 'publisher', 'publishedYear', 'narrators', 'language']
      })
      for (const book of books) {
        const bookWithLi = book as Book & { libraryItem?: LibraryItem }
        if (bookWithLi.libraryItem?.isMissing || bookWithLi.libraryItem?.isInvalid) data.numIssues++
        if (book.tags?.length) {
          book.tags.forEach((tag: string) => (data.tags as Set<string>).add(tag))
        }
        if (book.genres?.length) {
          book.genres.forEach((genre: string) => (data.genres as Set<string>).add(genre))
        }
        if (book.narrators?.length) {
          book.narrators.forEach((narrator: string) => (data.narrators as Set<string>).add(narrator))
        }
        if (book.publisher) (data.publishers as Set<string>).add(book.publisher)
        if (book.publishedYear) {
          const yearNum = Number(book.publishedYear)
          if (!isNaN(yearNum) && yearNum > 0 && yearNum < 3000) {
            const decade = (Math.floor(yearNum / 10) * 10).toString()
            ;(data.publishedDecades as Set<string>).add(decade)
          }
        }
        if (book.language) (data.languages as Set<string>).add(book.language)
      }

      const series = await Database.seriesModel.findAll({
        where: {
          libraryId
        },
        attributes: ['id', 'name']
      })
      series.forEach((s) => data.series.push({ id: s.id, name: s.name || 'No Title' }))

      const authors = await Database.authorModel.findAll({
        where: {
          libraryId
        },
        attributes: ['id', 'name']
      })
      authors.forEach((a) => data.authors.push({ id: a.id, name: a.name }))
    }

    data.authors = (naturalSort(data.authors) as Sortable<FilterDataAuthor>).asc((au) => au.name)
    data.genres = (naturalSort([...(data.genres as Set<string>)]) as Sortable<string>).asc()
    data.tags = (naturalSort([...(data.tags as Set<string>)]) as Sortable<string>).asc()
    data.series = (naturalSort(data.series) as Sortable<FilterDataSeries>).asc((se) => se.name)
    data.narrators = (naturalSort([...(data.narrators as Set<string>)]) as Sortable<string>).asc()
    data.publishers = (naturalSort([...(data.publishers as Set<string>)]) as Sortable<string>).asc()
    data.publishedDecades = (naturalSort([...(data.publishedDecades as Set<string>)]) as Sortable<string>).asc()
    data.languages = (naturalSort([...(data.languages as Set<string>)]) as Sortable<string>).asc()
    data.loadedAt = Date.now()
    filterDataStore[libraryId] = data

    Logger.debug(`Loaded filterdata in ${((Date.now() - start) / 1000).toFixed(2)}s`)
    return data
  }
}

export = libraryFilters
