import {
  Sequelize,
  Op,
  Order,
  WhereOptions,
  FindOptions,
  Includeable,
  ProjectionAlias,
  CountOptions
} from 'sequelize'

type Literal = ReturnType<typeof Sequelize.literal>
import Database from '../../Database'
import Logger from '../../Logger'
import authorFilters from './authorFilters'
import ShareManager from '../../managers/ShareManager'
import { profile } from '../profiler'
import stringifySequelizeQuery from '../stringifySequelizeQuery'
import type User from '../../models/User'
import type Library from '../../models/Library'
import type LibraryItem from '../../models/LibraryItem'
import type Book from '../../models/Book'
import type { BookAttributes, SeriesExpandedItem } from '../../models/Book'
import type Series from '../../models/Series'
import type BookSeries from '../../models/BookSeries'
import type BookAuthor from '../../models/BookAuthor'
import type Author from '../../models/Author'
import type {
  UserPermissionBookWhereResult,
  UserFilterReplacements,
  CollapseSeriesBookSeries,
  FilteredLibraryItemsResult,
  GenreWithCount,
  BookLibraryStats,
  LongestBookItem,
  BookLibrarySearchResult,
  CollectionOldJsonObject,
  QueryWhereAttributeHash,
  TagWithCount
} from '../../types'

const countCache = new Map<string, number>()

interface RawCountRow {
  value: string
  numBooks?: number
  numItems?: number
}

interface BookStatRow {
  totalSize: number
  totalDuration: number
  numAudioFiles: number
  totalItems: number
}

const libraryItemsBookFilters = {
  /**
   * User permissions to restrict books for explicit content & tags
   */
  getUserPermissionBookWhereQuery(user?: User | null): UserPermissionBookWhereResult {
    const bookWhere: WhereOptions[] = []
    const replacements: UserFilterReplacements = {}
    if (!user) return { bookWhere, replacements }

    if (!user.canAccessExplicitContent) {
      bookWhere.push({
        explicit: false
      })
    }
    if (!user.permissions?.accessAllTags && user.permissions?.itemTagsSelected?.length) {
      replacements.userTagsSelected = user.permissions.itemTagsSelected
      if (user.permissions.selectedTagsNotAccessible) {
        bookWhere.push(
          Sequelize.where(
            Sequelize.literal(
              '(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))'
            ),
            0
          )
        )
      } else {
        bookWhere.push(
          Sequelize.where(
            Sequelize.literal(
              '(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))'
            ),
            {
              [Op.gte]: 1
            }
          )
        )
      }
    }
    return {
      bookWhere,
      replacements
    }
  },

  /**
   * When collapsing series and filtering by progress
   * different where options are required
   */
  getCollapseSeriesMediaProgressFilter(value?: string | null): WhereOptions {
    if (value === 'not-finished') {
      return {
        '$books.mediaProgresses.isFinished$': {
          [Op.or]: [null, false]
        }
      }
    } else if (value === 'not-started') {
      return {
        [Op.and]: [
          {
            '$books.mediaProgresses.currentTime$': {
              [Op.or]: [null, 0]
            }
          },
          {
            '$books.mediaProgresses.isFinished$': {
              [Op.or]: [null, false]
            }
          }
        ]
      }
    } else if (value === 'finished') {
      return {
        '$books.mediaProgresses.isFinished$': true
      }
    } else if (value === 'in-progress') {
      return {
        [Op.and]: [
          {
            [Op.or]: [
              {
                '$books.mediaProgresses.currentTime$': {
                  [Op.gt]: 0
                }
              },
              {
                '$books.mediaProgresses.ebookProgress$': {
                  [Op.gt]: 0
                }
              }
            ]
          },
          {
            '$books.mediaProgresses.isFinished$': false
          }
        ]
      }
    }
    return {}
  },

  /**
   * Get where options for Book model
   */
  getMediaGroupQuery(
    group?: string | null,
    value?: string | null
  ): { mediaWhere: WhereOptions | WhereOptions[]; replacements: UserFilterReplacements } {
    if (!group) return { mediaWhere: {}, replacements: {} }

    let mediaWhere: WhereOptions | WhereOptions[] = {}
    const replacements: UserFilterReplacements = {}

    if (group === 'progress') {
      if (value === 'not-finished') {
        mediaWhere = {
          '$mediaProgresses.isFinished$': {
            [Op.or]: [null, false]
          }
        }
      } else if (value === 'not-started') {
        mediaWhere = {
          [Op.and]: [
            {
              '$mediaProgresses.currentTime$': {
                [Op.or]: [null, 0]
              }
            },
            {
              '$mediaProgresses.isFinished$': {
                [Op.or]: [null, false]
              }
            }
          ]
        }
      } else if (value === 'finished') {
        mediaWhere = {
          '$mediaProgresses.isFinished$': true
        }
      } else if (value === 'in-progress') {
        mediaWhere = {
          [Op.and]: [
            {
              [Op.or]: [
                {
                  '$mediaProgresses.currentTime$': {
                    [Op.gt]: 0
                  }
                },
                {
                  '$mediaProgresses.ebookProgress$': {
                    [Op.gt]: 0
                  }
                }
              ]
            },
            {
              '$mediaProgresses.isFinished$': false
            }
          ]
        }
      } else if (value === 'audio-in-progress') {
        mediaWhere = {
          [Op.and]: [
            {
              '$mediaProgresses.currentTime$': {
                [Op.gt]: 0
              }
            },
            {
              '$mediaProgresses.isFinished$': false
            }
          ]
        }
      } else if (value === 'ebook-in-progress') {
        // Filters for ebook only
        mediaWhere = [
          Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('audioFiles')), 0),
          {
            '$mediaProgresses.ebookProgress$': {
              [Op.gt]: 0
            }
          },
          {
            '$mediaProgresses.isFinished$': false
          }
        ]
      } else if (value === 'ebook-finished') {
        // Filters for ebook only
        mediaWhere = [
          Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('audioFiles')), 0),
          {
            '$mediaProgresses.isFinished$': true,
            ebookFile: {
              [Op.not]: null
            }
          }
        ]
      }
    } else if (group === 'series' && value === 'no-series') {
      mediaWhere = {
        '$series.id$': null
      }
    } else if (group === 'abridged') {
      mediaWhere = {
        abridged: true
      }
    } else if (group === 'explicit') {
      mediaWhere = {
        explicit: true
      }
    } else if (['genres', 'tags', 'narrators'].includes(group)) {
      mediaWhere = {
        [group]: Sequelize.where(
          Sequelize.literal(
            `(SELECT count(*) FROM json_each(${group}) WHERE json_valid(${group}) AND json_each.value = :filterValue)`
          ),
          {
            [Op.gte]: 1
          }
        )
      }
      replacements.filterValue = value
    } else if (group === 'publishers') {
      mediaWhere = {
        publisher: value
      }
    } else if (group === 'languages') {
      mediaWhere = {
        language: value
      }
    } else if (group === 'tracks') {
      if (value === 'none') {
        mediaWhere = Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('audioFiles')), 0)
      } else if (value === 'multi') {
        mediaWhere = Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('audioFiles')), {
          [Op.gt]: 1
        })
      } else {
        mediaWhere = Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col('audioFiles')), 1)
      }
    } else if (group === 'ebooks') {
      if (value === 'ebook') {
        mediaWhere = {
          ebookFile: {
            [Op.not]: null
          }
        }
      } else if (value === 'no-ebook') {
        mediaWhere = {
          ebookFile: {
            [Op.eq]: null
          }
        }
      }
    } else if (group === 'missing') {
      if (
        ['asin', 'isbn', 'subtitle', 'publishedYear', 'description', 'publisher', 'language', 'cover'].includes(
          value || ''
        )
      ) {
        let key = value || ''
        if (value === 'cover') key = 'coverPath'
        mediaWhere = {
          [key]: {
            [Op.or]: [null, '']
          }
        }
      } else if (['genres', 'tags', 'narrators', 'chapters'].includes(value || '')) {
        mediaWhere = {
          [value as string]: {
            [Op.or]: [null, Sequelize.where(Sequelize.fn('json_array_length', Sequelize.col(value as string)), 0)]
          }
        }
      } else if (value === 'authors') {
        mediaWhere = {
          '$authors.id$': null
        }
      } else if (value === 'series') {
        mediaWhere = {
          '$series.id$': null
        }
      }
    } else if (group === 'publishedDecades') {
      const startYear = parseInt(value || '0', 10)
      const endYear = startYear + 9
      mediaWhere = Sequelize.where(Sequelize.literal('CAST(publishedYear AS INTEGER)'), {
        [Op.between]: [startYear, endYear]
      })
    }

    return { mediaWhere, replacements }
  },

  /**
   * Get sequelize order
   */
  getOrder(sortBy?: string | null, sortDesc?: boolean | null, collapseseries?: boolean | null): Order {
    const dir = sortDesc ? 'DESC' : 'ASC'

    const getTitleOrder = (): [Literal, string] => {
      if (global.ServerSettings?.sortingIgnorePrefix) {
        return [Sequelize.literal('`libraryItem`.`titleIgnorePrefix` COLLATE NOCASE'), dir]
      } else {
        return [Sequelize.literal('`libraryItem`.`title` COLLATE NOCASE'), dir]
      }
    }

    if (sortBy === 'addedAt') {
      return [[Sequelize.literal('libraryItem.createdAt'), dir]]
    } else if (sortBy === 'size') {
      return [[Sequelize.literal('libraryItem.size'), dir]]
    } else if (sortBy === 'birthtimeMs') {
      return [[Sequelize.literal('libraryItem.birthtime'), dir]]
    } else if (sortBy === 'mtimeMs') {
      return [[Sequelize.literal('libraryItem.mtime'), dir]]
    } else if (sortBy === 'media.duration') {
      return [['duration', dir]]
    } else if (sortBy === 'media.metadata.publishedYear') {
      return [[Sequelize.literal('CAST(`book`.`publishedYear` AS INTEGER)'), dir]]
    } else if (sortBy === 'media.metadata.authorNameLF') {
      return [[Sequelize.literal('`libraryItem`.`authorNamesLastFirst` COLLATE NOCASE'), dir], getTitleOrder()]
    } else if (sortBy === 'media.metadata.authorName') {
      return [[Sequelize.literal('`libraryItem`.`authorNamesFirstLast` COLLATE NOCASE'), dir], getTitleOrder()]
    } else if (sortBy === 'media.metadata.title') {
      if (collapseseries) {
        return [[Sequelize.literal('display_title COLLATE NOCASE'), dir]]
      }
      return [getTitleOrder()]
    } else if (sortBy === 'sequence') {
      const nullDir = sortDesc ? 'DESC NULLS FIRST' : 'ASC NULLS LAST'
      return [Sequelize.literal(`CAST(\`series.bookSeries.sequence\` AS FLOAT) ${nullDir}`)]
    } else if (sortBy === 'progress') {
      return [Sequelize.literal(`mediaProgresses.updatedAt ${dir} NULLS LAST`)]
    } else if (sortBy === 'progress.createdAt') {
      return [Sequelize.literal(`mediaProgresses.createdAt ${dir} NULLS LAST`)]
    } else if (sortBy === 'progress.finishedAt') {
      return [Sequelize.literal(`mediaProgresses.finishedAt ${dir} NULLS LAST`)]
    } else if (sortBy === 'random') {
      return [Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')]
    }
    return []
  },

  /**
   * When collapsing series get first book in each series
   * to know which books to exclude from primary query.
   */
  async getCollapseSeriesBooksToExclude(
    bookFindOptions: { where?: WhereOptions; include?: Includeable[] },
    seriesWhere: WhereOptions | null,
    replacements: UserFilterReplacements = {}
  ): Promise<{ booksToExclude: string[]; bookSeriesToInclude: CollapseSeriesBookSeries[] }> {
    const allSeries = await Database.seriesModel.findAll({
      attributes: [
        'id',
        'name',
        [Sequelize.literal('(SELECT count(*) FROM bookSeries bs WHERE bs.seriesId = series.id)'), 'numBooks']
      ],
      subQuery: false,
      replacements,
      where: seriesWhere || undefined,
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title'],
          through: {
            attributes: ['id', 'seriesId', 'bookId', 'sequence']
          },
          ...bookFindOptions,
          required: true
        }
      ],
      order: [Sequelize.literal('CAST(`books.bookSeries.sequence` AS FLOAT) ASC NULLS LAST')]
    })
    const bookSeriesToInclude: CollapseSeriesBookSeries[] = []
    const booksToInclude: string[] = []
    let booksToExclude: string[] = []
    allSeries.forEach((s) => {
      let found = false
      const books = s.books || []
      for (const book of books) {
        const bookExpanded = book as Book & {
          bookSeries?: { id: string }
          libraryItem?: LibraryItem
        }
        if (!found && !booksToInclude.includes(book.id)) {
          booksToInclude.push(book.id)
          const numBooksVal = s.get('numBooks')
          const numBooks = typeof numBooksVal === 'number' ? numBooksVal : 0
          bookSeriesToInclude.push({
            id: bookExpanded.bookSeries?.id || '',
            numBooks,
            libraryItemIds:
              s.books
                ?.map((b) => (b as Book & { libraryItem?: LibraryItem }).libraryItem?.id || '')
                .filter(Boolean) || []
          })
          booksToExclude = booksToExclude.filter((bid) => bid !== book.id)
          found = true
        } else if (!booksToExclude.includes(book.id) && !booksToInclude.includes(book.id)) {
          booksToExclude.push(book.id)
        }
      }
    })
    return { booksToExclude, bookSeriesToInclude }
  },

  clearCountCache(hook: string): void {
    Logger.debug(`[LibraryItemsBookFilters] book.${hook}: Clearing count cache`)
    countCache.clear()
  },

  async findAndCountAll(
    findOptions: FindOptions<BookAttributes> & { distinct?: boolean },
    limit?: number | null,
    offset?: number | null,
    useCountCache?: boolean
  ): Promise<{ rows: Book[]; count: number }> {
    const model = Database.bookModel
    if (useCountCache) {
      const countCacheKey = stringifySequelizeQuery(findOptions)
      Logger.debug(`[LibraryItemsBookFilters] countCacheKey: ${countCacheKey}`)
      if (!countCache.has(countCacheKey)) {
        const count = await model.count(findOptions)
        countCache.set(countCacheKey, count)
      }

      findOptions.limit = limit || undefined
      findOptions.offset = offset || undefined

      const rows = await model.findAll(findOptions)

      return { rows, count: countCache.get(countCacheKey) || 0 }
    }

    findOptions.limit = limit || undefined
    findOptions.offset = offset || undefined

    return await model.findAndCountAll(findOptions)
  },

  /**
   * Get library items for book media type using filter and sort
   */
  async getFilteredLibraryItems(
    libraryId: string,
    user: User,
    filterGroup: string | null,
    filterValue: string | null,
    sortBy: string | null,
    sortDesc: boolean | null,
    collapseseries: boolean | null,
    include: string[],
    limit?: number | null,
    offset?: number | null,
    isHomePage = false
  ): Promise<FilteredLibraryItemsResult> {
    let collapseSeriesEnabled = collapseseries || false
    if (filterGroup === 'series' && collapseSeriesEnabled) {
      collapseSeriesEnabled = false
    }
    let effectiveSortBy = sortBy || ''
    if (filterGroup !== 'series' && effectiveSortBy === 'sequence') {
      effectiveSortBy = 'media.metadata.title'
    }
    const includeRSSFeed = include.includes('rssfeed')
    const includeMediaItemShare = !!user?.isAdminOrUp && include.includes('share')

    let bookAttributes: { include: ProjectionAlias[] } | null = null

    const libraryItemWhere: QueryWhereAttributeHash = {
      libraryId
    }

    let seriesInclude: Includeable = {
      model: Database.bookSeriesModel,
      attributes: ['id', 'seriesId', 'sequence', 'createdAt'],
      include: [
        {
          model: Database.seriesModel,
          attributes: ['id', 'name', 'nameIgnorePrefix']
        }
      ],
      order: [['createdAt', 'ASC']],
      separate: true
    }

    let authorInclude: Includeable = {
      model: Database.bookAuthorModel,
      attributes: ['authorId', 'createdAt'],
      include: [
        {
          model: Database.authorModel,
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'ASC']],
      separate: true
    }

    const sortOrder = this.getOrder(effectiveSortBy, sortDesc, collapseSeriesEnabled)

    const libraryItemIncludes: Includeable[] = []
    const bookIncludes: Includeable[] = []

    if (filterGroup === 'feed-open' || includeRSSFeed) {
      const rssFeedRequired = filterGroup === 'feed-open'
      libraryItemIncludes.push({
        model: Database.feedModel,
        required: rssFeedRequired,
        separate: !rssFeedRequired
      })
    }

    if (filterGroup === 'share-open') {
      bookIncludes.push({
        model: Database.mediaItemShareModel,
        required: true
      })
    } else if (filterGroup === 'ebooks' && filterValue === 'supplementary') {
      libraryItemWhere.libraryFiles = {
        [Op.substring]: '"isSupplementary":true'
      }
    } else if (filterGroup === 'ebooks' && filterValue === 'no-supplementary') {
      libraryItemWhere.libraryFiles = {
        [Op.notLike]: Sequelize.literal('\'%"isSupplementary":true%\'')
      }
    } else if (filterGroup === 'missing' && filterValue === 'authors') {
      authorInclude = {
        model: Database.authorModel,
        attributes: ['id'],
        through: {
          attributes: []
        }
      }
    } else if (
      (filterGroup === 'series' && filterValue === 'no-series') ||
      (filterGroup === 'missing' && filterValue === 'series')
    ) {
      seriesInclude = {
        model: Database.seriesModel,
        attributes: ['id'],
        through: {
          attributes: []
        }
      }
    } else if (filterGroup === 'authors') {
      bookIncludes.push({
        model: Database.authorModel,
        attributes: ['id', 'name'],
        where: {
          id: filterValue
        },
        through: {
          attributes: []
        }
      })
    } else if (filterGroup === 'series') {
      bookIncludes.push({
        model: Database.seriesModel,
        attributes: ['id', 'name'],
        where: {
          id: filterValue
        },
        through: {
          attributes: ['sequence']
        }
      })
      if (effectiveSortBy !== 'sequence') {
        const orderArray = Array.isArray(sortOrder) ? sortOrder : [sortOrder]
        orderArray.push(Sequelize.literal('CAST(`series.bookSeries.sequence` AS FLOAT) ASC NULLS LAST'))
      }
    } else if (filterGroup === 'issues') {
      libraryItemWhere[Op.or as unknown as string] = [
        {
          isMissing: true
        },
        {
          isInvalid: true
        }
      ]
    } else if (filterGroup === 'progress' && user) {
      const mediaProgressWhere: QueryWhereAttributeHash = {
        userId: user.id
      }
      if (isHomePage) {
        mediaProgressWhere.hideFromContinueListening = false
      }
      bookIncludes.push({
        model: Database.mediaProgressModel,
        attributes: ['id', 'isFinished', 'currentTime', 'ebookProgress', 'updatedAt', 'createdAt', 'finishedAt'],
        where: mediaProgressWhere,
        required: false
      })
    } else if (filterGroup === 'recent') {
      libraryItemWhere.createdAt = {
        [Op.gte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      }
    }

    if (
      filterGroup !== 'progress' &&
      ['progress.createdAt', 'progress.finishedAt', 'progress'].includes(effectiveSortBy)
    ) {
      bookIncludes.push({
        model: Database.mediaProgressModel,
        attributes: ['id', 'isFinished', 'currentTime', 'ebookProgress', 'updatedAt', 'createdAt', 'finishedAt'],
        where: {
          userId: user.id
        },
        required: false
      })
    }

    const { mediaWhere, replacements: mediaReplacements } = this.getMediaGroupQuery(filterGroup, filterValue)
    let replacements: UserFilterReplacements = { ...mediaReplacements }
    const bookWhere: WhereOptions[] = Array.isArray(mediaWhere) ? [...mediaWhere] : [mediaWhere]

    const userPermissionBookWhere = this.getUserPermissionBookWhereQuery(user)
    replacements = { ...replacements, ...userPermissionBookWhere.replacements }
    bookWhere.push(...userPermissionBookWhere.bookWhere)

    let collapseSeriesBookSeries: CollapseSeriesBookSeries[] = []
    if (collapseSeriesEnabled) {
      let seriesBookWhere: WhereOptions | null = null
      let seriesWhere: WhereOptions | null = null
      if (filterGroup === 'progress') {
        seriesWhere = this.getCollapseSeriesMediaProgressFilter(filterValue)
      } else if (filterGroup === 'missing' && filterValue === 'authors') {
        seriesWhere = {
          '$books.authors.id$': null
        }
      } else {
        seriesBookWhere = bookWhere.length ? { [Op.and]: bookWhere } : null
      }

      const bookFindOptions: { where?: WhereOptions; include?: Includeable[] } = {
        where: seriesBookWhere || undefined,
        include: [
          {
            model: Database.libraryItemModel,
            required: true,
            where: libraryItemWhere as WhereOptions,
            include: libraryItemIncludes
          },
          authorInclude,
          ...bookIncludes
        ]
      }
      const { booksToExclude, bookSeriesToInclude } = await this.getCollapseSeriesBooksToExclude(
        bookFindOptions,
        seriesWhere,
        replacements
      )
      if (booksToExclude.length) {
        bookWhere.push({
          id: {
            [Op.notIn]: booksToExclude
          }
        })
      }
      collapseSeriesBookSeries = bookSeriesToInclude
      if (!bookAttributes) bookAttributes = { include: [] }

      if (global.ServerSettings?.sortingIgnorePrefix) {
        bookAttributes.include.push([
          Sequelize.literal(
            `IFNULL((SELECT s.nameIgnorePrefix FROM bookSeries AS bs, series AS s WHERE bs.seriesId = s.id AND bs.bookId = book.id AND bs.id IN (${bookSeriesToInclude.map((v) => `"${v.id}"`).join(', ')})), \`libraryItem\`.\`titleIgnorePrefix\`)`
          ),
          'display_title'
        ])
      } else {
        bookAttributes.include.push([
          Sequelize.literal(
            `IFNULL((SELECT s.name FROM bookSeries AS bs, series AS s WHERE bs.seriesId = s.id AND bs.bookId = book.id AND bs.id IN (${bookSeriesToInclude.map((v) => `"${v.id}"`).join(', ')})), \`libraryItem\`.\`title\`)`
          ),
          'display_title'
        ])
      }
    }

    const findOptions: FindOptions<BookAttributes> & { distinct?: boolean } = {
      where: bookWhere.length ? { [Op.and]: bookWhere } : undefined,
      distinct: true,
      attributes: bookAttributes || undefined,
      replacements,
      include: [
        {
          model: Database.libraryItemModel,
          required: true,
          where: libraryItemWhere as WhereOptions,
          include: libraryItemIncludes
        },
        seriesInclude,
        authorInclude,
        ...bookIncludes
      ],
      order: sortOrder,
      subQuery: false
    }

    const findAndCountAllFn: (
      options: FindOptions<BookAttributes> & { distinct?: boolean },
      limit: number | null,
      offset: number | null,
      useOptimizedCount?: boolean
    ) => Promise<{ rows: Book[]; count: number }> = process.env.QUERY_PROFILING
      ? profile(this.findAndCountAll.bind(this))
      : this.findAndCountAll.bind(this)
    const { rows: books, count } = await findAndCountAllFn(
      findOptions,
      limit ?? null,
      offset ?? null,
      !filterGroup && !userPermissionBookWhere.bookWhere.length
    )

    const libraryItems = books.map((bookExpanded: Book) => {
      const bookWithLi = bookExpanded as Book & {
        libraryItem?: LibraryItem
        bookSeries?: (BookSeries & { series?: Series })[]
        bookAuthors?: (BookAuthor & { author?: Author })[]
      }
      const libraryItem = bookWithLi.libraryItem as LibraryItem
      const book = bookExpanded

      if (filterGroup === 'series' && book.series?.length) {
        libraryItem.series = {
          id: book.series[0].id,
          name: book.series[0].name,
          sequence:
            (book.series[0] as Series & { bookSeries?: { sequence?: string | null } }).bookSeries?.sequence || null
        }
      }

      delete (book as { libraryItem?: unknown }).libraryItem

      book.series =
        bookWithLi.bookSeries?.map((bs) => {
          const series = bs.series as SeriesExpandedItem
          delete (bs as { series?: unknown }).series
          series.bookSeries = bs
          return series
        }) || []
      delete (book as { bookSeries?: unknown }).bookSeries

      book.authors = bookWithLi.bookAuthors?.map((ba) => ba.author as Author).filter(Boolean) || []
      delete (book as { bookAuthors?: unknown }).bookAuthors

      if (collapseSeriesEnabled && book.series?.length) {
        const collapsedSeries = book.series.find((bs: SeriesExpandedItem) =>
          collapseSeriesBookSeries.some(
            (cbs) => cbs.id === bs.bookSeries?.id
          )
        )
        if (collapsedSeries) {
          const collapseSeriesObj = collapseSeriesBookSeries.find(
            (csbs) => csbs.id === collapsedSeries.bookSeries?.id
          )
          libraryItem.collapsedSeries = {
            id: collapsedSeries.id,
            name: collapsedSeries.name,
            nameIgnorePrefix: collapsedSeries.nameIgnorePrefix || null,
            sequence:
              (collapsedSeries as Series & { bookSeries?: { sequence?: string | null } }).bookSeries?.sequence || null,
            numBooks: collapseSeriesObj?.numBooks || 0,
            libraryItemIds: collapseSeriesObj?.libraryItemIds || []
          }
        }
      }

      if (libraryItem.feeds?.length) {
        libraryItem.rssFeed = libraryItem.feeds[0]
      }

      if (includeMediaItemShare) {
        libraryItem.mediaItemShare = ShareManager.findByMediaItemId(libraryItem.mediaId)
      }

      libraryItem.media = book

      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Get library items for continue series shelf
   */
  async getContinueSeriesLibraryItems(
    library: Library,
    user: User,
    include: string[],
    limit: number,
    offset: number
  ): Promise<FilteredLibraryItemsResult> {
    const libraryId = library.id
    const libraryItemIncludes: Includeable[] = []
    if (include.includes('rssfeed')) {
      libraryItemIncludes.push({
        model: Database.feedModel
      })
    }

    const bookWhere: WhereOptions[] = []
    const userPermissionBookWhere = this.getUserPermissionBookWhereQuery(user)
    bookWhere.push(...userPermissionBookWhere.bookWhere)

    const includeAttributes: ProjectionAlias[] = [
      [
        Sequelize.literal(
          '(SELECT max(mp.updatedAt) FROM bookSeries bs, mediaProgresses mp WHERE mp.mediaItemId = bs.bookId AND mp.userId = :userId AND bs.seriesId = series.id)'
        ),
        'recent_progress'
      ]
    ]
    let booksNotFinishedQuery =
      'SELECT count(*) FROM bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = bs.bookId AND mp.userId = :userId WHERE bs.seriesId = series.id AND (mp.isFinished = 0 OR mp.isFinished IS NULL)'

    if (library.settings?.onlyShowLaterBooksInContinueSeries) {
      const maxSequenceQuery =
        '(SELECT CAST(max(bs.sequence) as FLOAT) FROM bookSeries bs, mediaProgresses mp WHERE mp.mediaItemId = bs.bookId AND mp.isFinished = 1 AND mp.userId = :userId AND bs.seriesId = series.id)'
      includeAttributes.push([Sequelize.literal(maxSequenceQuery), 'maxSequence'])

      booksNotFinishedQuery = booksNotFinishedQuery + ` AND CAST(bs.sequence as FLOAT) > ${maxSequenceQuery}`
    }

    const { rows: series, count } = await Database.seriesModel.findAndCountAll({
      where: {
        [Op.and]: [
          {
            id: {
              [Op.notIn]: user.extraData?.seriesHideFromContinueListening || []
            },
            libraryId
          },
          Sequelize.where(
            Sequelize.literal(
              '(SELECT count(*) FROM mediaProgresses mp, bookSeries bs WHERE bs.seriesId = series.id AND mp.mediaItemId = bs.bookId AND mp.userId = :userId AND mp.isFinished = 1)'
            ),
            {
              [Op.gte]: 1
            }
          ),
          Sequelize.where(Sequelize.literal(`(${booksNotFinishedQuery})`), {
            [Op.gte]: 1
          }),
          Sequelize.where(
            Sequelize.literal(
              '(SELECT count(*) FROM mediaProgresses mp, bookSeries bs WHERE mp.mediaItemId = bs.bookId AND mp.userId = :userId AND bs.seriesId = series.id AND mp.isFinished = 0 AND mp.currentTime > 0)'
            ),
            0
          )
        ]
      },
      attributes: {
        include: includeAttributes
      },
      replacements: {
        userId: user.id,
        ...userPermissionBookWhere.replacements
      },
      include: [
        {
          model: Database.bookSeriesModel,
          attributes: ['bookId', 'sequence'],
          separate: true,
          subQuery: false,
          order: [Sequelize.literal('CAST(sequence AS FLOAT) ASC NULLS LAST')],
          where: {
            '$book.mediaProgresses.isFinished$': {
              [Op.or]: [null, 0]
            }
          },
          include: [
            {
              model: Database.bookModel,
              where: bookWhere.length ? { [Op.and]: bookWhere } : undefined,
              include: [
                {
                  model: Database.libraryItemModel,
                  include: libraryItemIncludes
                },
                {
                  model: Database.authorModel,
                  through: {
                    attributes: []
                  }
                },
                {
                  model: Database.mediaProgressModel,
                  where: {
                    userId: user.id
                  },
                  required: false
                }
              ]
            }
          ]
        }
      ],
      order: [[Sequelize.literal('recent_progress'), 'DESC']],
      distinct: true,
      subQuery: false,
      limit,
      offset
    })

    const libraryItems: LibraryItem[] = []
    for (const s of series) {
      const bookSeriesList = Array.isArray(s.bookSeries) ? s.bookSeries : []
      if (!bookSeriesList.length) continue

      let bookIndex = 0
      if (library.settings?.onlyShowLaterBooksInContinueSeries) {
        const maxSeqVal = s.get('maxSequence')
        const maxSequence = typeof maxSeqVal === 'number' ? maxSeqVal : 0
        bookIndex = bookSeriesList.findIndex((b) => {
          const seq = b.sequence ? parseFloat(b.sequence) : 0
          return seq > maxSequence
        })
        if (bookIndex === -1) {
          continue
        }
      }

      const bsItem = bookSeriesList[bookIndex] as BookSeries & {
        book?: Book & { libraryItem?: LibraryItem }
      }
      if (!bsItem?.book?.libraryItem) continue

      const libraryItem = bsItem.book.libraryItem
      const book = bsItem.book
      delete (book as { libraryItem?: unknown }).libraryItem

      book.series = []

      libraryItem.series = {
        id: s.id,
        name: s.name,
        sequence: bsItem.sequence || null
      }
      if (libraryItem.feeds?.length) {
        libraryItem.rssFeed = libraryItem.feeds[0]
      }
      libraryItem.media = book
      libraryItems.push(libraryItem)
    }

    return {
      libraryItems,
      count
    }
  },

  /**
   * Get book library items for the "Discover" shelf
   */
  async getDiscoverLibraryItems(
    libraryId: string,
    user: User,
    include: string[],
    limit: number
  ): Promise<FilteredLibraryItemsResult> {
    const userPermissionBookWhere = this.getUserPermissionBookWhereQuery(user)

    const seriesNotStarted = await Database.seriesModel.findAll({
      where: {
        [Op.and]: [
          {
            libraryId
          },
          Sequelize.where(
            Sequelize.literal(
              '(SELECT count(*) FROM bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = bs.bookId WHERE bs.seriesId = series.id AND mp.userId = :userId AND (mp.isFinished = 1 OR mp.currentTime > 0))'
            ),
            0
          )
        ]
      },
      replacements: {
        userId: user.id,
        ...userPermissionBookWhere.replacements
      },
      attributes: ['id'],
      include: [
        {
          model: Database.bookSeriesModel,
          attributes: ['bookId', 'sequence'],
          separate: true,
          required: true,
          include: [
            {
              model: Database.bookModel,
              where: userPermissionBookWhere.bookWhere.length
                ? { [Op.and]: userPermissionBookWhere.bookWhere }
                : undefined
            }
          ],
          order: [Sequelize.literal('CAST(sequence AS FLOAT) ASC NULLS LAST')],
          limit: 1
        }
      ],
      subQuery: false,
      limit,
      order: Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')
    })

    const booksFromSeriesToInclude = seriesNotStarted
      .map((se) => (Array.isArray(se.bookSeries) ? se.bookSeries[0]?.bookId : undefined))
      .filter((bid): bid is string => Boolean(bid))

    const libraryItemIncludes: Includeable[] = []
    if (include.includes('rssfeed')) {
      libraryItemIncludes.push({
        model: Database.feedModel
      })
    }

    const discoverWhere: WhereOptions[] = [
      {
        '$mediaProgresses.isFinished$': {
          [Op.or]: [null, 0]
        },
        '$mediaProgresses.currentTime$': {
          [Op.or]: [null, 0]
        },
        [Op.or]: [
          Sequelize.where(Sequelize.literal('(SELECT COUNT(*) FROM bookSeries bs where bs.bookId = book.id)'), 0),
          {
            id: {
              [Op.in]: booksFromSeriesToInclude
            }
          }
        ]
      },
      ...userPermissionBookWhere.bookWhere
    ]

    const baseDiscoverInclude: Includeable[] = [
      {
        model: Database.libraryItemModel,
        where: {
          libraryId
        }
      },
      {
        model: Database.mediaProgressModel,
        where: {
          userId: user.id
        },
        required: false
      }
    ]

    const count = await Database.bookModel.count({
      where: discoverWhere.length ? { [Op.and]: discoverWhere } : undefined,
      include: baseDiscoverInclude,
      distinct: true,
      col: 'id'
    })

    const randomSelection = await Database.bookModel.findAll({
      attributes: ['id'],
      where: discoverWhere.length ? { [Op.and]: discoverWhere } : undefined,
      replacements: userPermissionBookWhere.replacements,
      include: baseDiscoverInclude,
      subQuery: false,
      limit,
      order: Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')
    })

    const selectedIds = randomSelection.map((b) => b.id).filter((id): id is string => Boolean(id))
    if (!selectedIds.length) {
      return {
        libraryItems: [],
        count
      }
    }

    const books = await Database.bookModel.findAll({
      where: {
        id: {
          [Op.in]: selectedIds
        }
      },
      include: [
        {
          model: Database.libraryItemModel,
          where: {
            libraryId
          },
          include: libraryItemIncludes
        },
        {
          model: Database.bookAuthorModel,
          attributes: ['authorId'],
          include: [
            {
              model: Database.authorModel
            }
          ],
          separate: true
        },
        {
          model: Database.bookSeriesModel,
          attributes: ['seriesId', 'sequence'],
          include: [
            {
              model: Database.seriesModel
            }
          ],
          separate: true
        }
      ],
      subQuery: false
    })

    const booksById = new Map(books.map((b) => [b.id, b]))
    const orderedBooks = selectedIds.map((id) => booksById.get(id)).filter((b): b is Book => Boolean(b))

    const libraryItems = orderedBooks.map((bookExpanded) => {
      const bookWithLi = bookExpanded as Book & {
        libraryItem?: LibraryItem
        bookSeries?: (BookSeries & { series?: Series })[]
        bookAuthors?: (BookAuthor & { author?: Author })[]
      }
      const libraryItem = bookWithLi.libraryItem as LibraryItem
      const book = bookExpanded
      delete (book as { libraryItem?: unknown }).libraryItem

      book.series =
        bookWithLi.bookSeries?.map((bs) => {
          const series = bs.series as SeriesExpandedItem
          delete (bs as { series?: unknown }).series
          series.bookSeries = bs
          return series
        }) || []
      delete (book as { bookSeries?: unknown }).bookSeries

      book.authors = bookWithLi.bookAuthors?.map((ba) => ba.author as Author).filter(Boolean) || []
      delete (book as { bookAuthors?: unknown }).bookAuthors

      libraryItem.media = book

      if (libraryItem.feeds?.length) {
        libraryItem.rssFeed = libraryItem.feeds[0]
      }

      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Get book library items in a collection
   */
  async getLibraryItemsForCollection(collection: CollectionOldJsonObject): Promise<LibraryItem[]> {
    if (!collection?.books?.length) {
      Logger.error('[libraryItemsBookFilters] Invalid collection', collection)
      return []
    }

    const books = await Database.bookModel.findAll({
      include: [
        {
          model: Database.libraryItemModel,
          where: {
            id: {
              [Op.in]: collection.books
            }
          }
        },
        {
          model: Database.authorModel,
          through: {
            attributes: []
          }
        },
        {
          model: Database.seriesModel,
          through: {
            attributes: ['sequence']
          }
        }
      ]
    })

    return books.map((book) => {
      const bookWithLi = book as Book & { libraryItem?: LibraryItem }
      const libraryItem = bookWithLi.libraryItem as LibraryItem
      delete (bookWithLi as { libraryItem?: unknown }).libraryItem
      libraryItem.media = book
      return libraryItem
    })
  },

  /**
   * Get library items for series
   */
  async getLibraryItemsForSeries(series: Series, user?: User): Promise<LibraryItem[]> {
    const { libraryItems } = await this.getFilteredLibraryItems(
      series.libraryId,
      user as User,
      'series',
      series.id,
      null,
      null,
      false,
      [],
      null,
      null
    )
    return libraryItems
  },

  /**
   * Search books, authors, series
   */
  async search(
    user: User,
    library: Library,
    query: string,
    limit: number,
    offset: number
  ): Promise<BookLibrarySearchResult> {
    const userPermissionBookWhere = this.getUserPermissionBookWhereQuery(user)

    const textSearchQuery = await Database.createTextSearchQuery(query)

    const matchTitle = textSearchQuery.matchExpression('book.title')
    const matchSubtitle = textSearchQuery.matchExpression('book.subtitle')

    const books = await Database.bookModel.findAll({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              Sequelize.literal(matchTitle),
              Sequelize.literal(matchSubtitle),
              {
                asin: {
                  [Op.substring]: query
                }
              },
              {
                isbn: {
                  [Op.substring]: query
                }
              }
            ]
          },
          ...userPermissionBookWhere.bookWhere
        ]
      },
      replacements: userPermissionBookWhere.replacements,
      include: [
        {
          model: Database.libraryItemModel,
          where: {
            libraryId: library.id
          }
        },
        {
          model: Database.bookSeriesModel,
          include: [
            {
              model: Database.seriesModel
            }
          ],
          separate: true
        },
        {
          model: Database.bookAuthorModel,
          include: [
            {
              model: Database.authorModel
            }
          ],
          separate: true
        }
      ],
      subQuery: false,
      limit,
      offset
    })

    const itemMatches = []

    for (const book of books) {
      const bookWithLi = book as Book & {
        libraryItem?: LibraryItem
        bookSeries?: (BookSeries & { series?: Series })[]
        bookAuthors?: (BookAuthor & { author?: Author })[]
      }
      const libraryItem = bookWithLi.libraryItem as LibraryItem
      delete (book as { libraryItem?: unknown }).libraryItem

      book.series =
        bookWithLi.bookSeries?.map((bs) => {
          const series = bs.series as SeriesExpandedItem
          delete (bs as { series?: unknown }).series
          series.bookSeries = bs
          return series
        }) || []
      delete (book as { bookSeries?: unknown }).bookSeries

      book.authors = bookWithLi.bookAuthors?.map((ba) => ba.author as Author).filter(Boolean) || []
      delete (book as { bookAuthors?: unknown }).bookAuthors

      libraryItem.media = book
      itemMatches.push({
        libraryItem: libraryItem.toOldJSONExpanded()
      })
    }

    const matchJsonValue = textSearchQuery.matchExpression('json_each.value')

    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }

    // Search narrators
    const narratorMatches: TagWithCount[] = []
    const [narratorResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numBooks FROM books b, libraryItems li, json_each(b.narrators) WHERE json_valid(b.narrators) AND ${matchJsonValue} AND b.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value LIMIT :limit OFFSET :offset;`,
      {
        replacements: {
          libraryId: library.id,
          limit,
          offset
        },
        raw: true
      }
    )) as [RawCountRow[], unknown]
    for (const row of narratorResults) {
      narratorMatches.push({
        name: row.value,
        numItems: row.numBooks || 0
      })
    }

    // Search tags
    const tagMatches: TagWithCount[] = []
    const [tagResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM books b, libraryItems li, json_each(b.tags) WHERE json_valid(b.tags) AND ${matchJsonValue} AND b.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`,
      {
        replacements: {
          libraryId: library.id,
          limit,
          offset
        },
        raw: true
      }
    )) as [RawCountRow[], unknown]
    for (const row of tagResults) {
      tagMatches.push({
        name: row.value,
        numItems: row.numItems || 0
      })
    }

    // Search genres
    const genreMatches: TagWithCount[] = []
    const [genreResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM books b, libraryItems li, json_each(b.genres) WHERE json_valid(b.genres) AND ${matchJsonValue} AND b.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`,
      {
        replacements: {
          libraryId: library.id,
          limit,
          offset
        },
        raw: true
      }
    )) as [RawCountRow[], unknown]
    for (const row of genreResults) {
      genreMatches.push({
        name: row.value,
        numItems: row.numItems || 0
      })
    }

    // Search series
    const matchName = textSearchQuery.matchExpression('name')
    const allSeries = await Database.seriesModel.findAll({
      where: {
        [Op.and]: [
          Sequelize.literal(matchName),
          {
            libraryId: library.id
          }
        ]
      },
      replacements: userPermissionBookWhere.replacements,
      include: [
        {
          separate: true,
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
          ]
        }
      ],
      subQuery: false,
      limit,
      offset
    })
    const seriesMatches = []
    for (const series of allSeries) {
      const bookSeriesList = Array.isArray(series.bookSeries) ? series.bookSeries : []
      const matchedBooks = bookSeriesList
        .map((bs) => {
          const bsBook = bs.book as (Book & { libraryItem?: LibraryItem }) | undefined
          if (!bsBook?.libraryItem) return null
          const libraryItem = bsBook.libraryItem
          libraryItem.media = bsBook
          libraryItem.media.authors = []
          libraryItem.media.series = []
          return libraryItem.toOldJSON()
        })
        .filter((b): b is ReturnType<LibraryItem['toOldJSON']> => Boolean(b))
      if (matchedBooks.length) {
        seriesMatches.push({
          series: series.toOldJSON(),
          books: matchedBooks
        })
      }
    }

    // Search authors
    const authorMatches = await authorFilters.search(library.id, textSearchQuery, limit, offset)

    return {
      book: itemMatches,
      narrators: narratorMatches,
      tags: tagMatches,
      genres: genreMatches,
      series: seriesMatches,
      authors: authorMatches
    }
  },

  /**
   * Genres with num books
   */
  async getGenresWithCount(libraryId: string): Promise<GenreWithCount[]> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const genres: GenreWithCount[] = []
    const [genreResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM books b, libraryItems li, json_each(b.genres) WHERE json_valid(b.genres) AND b.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC;`,
      {
        replacements: {
          libraryId
        },
        raw: true
      }
    )) as [RawCountRow[], unknown]
    for (const row of genreResults) {
      genres.push({
        genre: row.value,
        count: row.numItems || 0
      })
    }
    return genres
  },

  /**
   * Get stats for book library
   */
  async getBookLibraryStats(libraryId: string): Promise<BookLibraryStats> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const [statResults] = (await Database.sequelize.query(
      `SELECT SUM(li.size) AS totalSize, SUM(b.duration) AS totalDuration, SUM(json_array_length(b.audioFiles)) AS numAudioFiles, COUNT(*) AS totalItems FROM libraryItems li, books b WHERE b.id = li.mediaId AND li.libraryId = :libraryId;`,
      {
        replacements: {
          libraryId
        }
      }
    )) as [BookStatRow[], unknown]
    return {
      totalSize: statResults?.[0]?.totalSize || 0,
      totalDuration: statResults?.[0]?.totalDuration || 0,
      numAudioFiles: statResults?.[0]?.numAudioFiles || 0,
      totalItems: statResults?.[0]?.totalItems || 0
    }
  },

  /**
   * Get longest books in library
   */
  async getLongestBooks(libraryId: string, limit: number): Promise<LongestBookItem[]> {
    const books = await Database.bookModel.findAll({
      attributes: ['id', 'title', 'duration'],
      include: [
        {
          model: Database.libraryItemModel,
          attributes: ['id', 'libraryId'],
          where: {
            libraryId
          }
        }
      ],
      order: [['duration', 'DESC']],
      limit
    })
    return books.map((book) => {
      const bookWithLi = book as Book & { libraryItem?: LibraryItem }
      return {
        id: bookWithLi.libraryItem?.id || '',
        title: book.title,
        duration: book.duration || 0
      }
    })
  }
}

export = libraryItemsBookFilters
