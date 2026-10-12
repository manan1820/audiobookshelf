import { Sequelize, Op, Order, Includeable, WhereOptions, ProjectionAlias } from 'sequelize'
import Logger from '../../Logger'
import Database from '../../Database'
import libraryItemsBookFilters from './libraryItemsBookFilters'
import type Library from '../../models/Library'
import type User from '../../models/User'
import type Feed from '../../models/Feed'
import type Book from '../../models/Book'
import type LibraryItem from '../../models/LibraryItem'
import type { SeriesOldJsonObject, LibraryItemOldJsonMinifiedObject } from '../../types'

interface SeriesFilterReplacements {
  filterValue?: string | null
  userId?: string | null
  userTagsSelected?: string[]
  [key: string]: string | number | boolean | string[] | null | undefined
}

const seriesFilters = {
  decode(text: string): string | null {
    try {
      return Buffer.from(decodeURIComponent(text), 'base64').toString()
    } catch (error) {
      Logger.warn(`[seriesFilters] Failed to decode filter value "${text}": ${(error as Error).message}`)
      return null
    }
  },

  /**
   * Get series filtered and sorted
   */
  async getFilteredSeries(
    library: Library,
    user: User,
    filterBy: string,
    sortBy: string,
    sortDesc: boolean,
    include: string[],
    limit: number,
    offset: number
  ): Promise<{ series: SeriesOldJsonObject[]; count: number }> {
    let filterValue: string | null = null
    let filterGroup: string | null = null
    if (filterBy) {
      const searchGroups = ['genres', 'tags', 'authors', 'progress', 'narrators', 'publishers', 'languages']
      const group = searchGroups.find((_group) => filterBy.startsWith(_group + '.'))
      filterGroup = group || filterBy
      filterValue = group ? this.decode(filterBy.replace(`${group}.`, '')) : null
    }

    const seriesIncludes: Includeable[] = []
    if (include.includes('rssfeed')) {
      seriesIncludes.push({
        model: Database.feedModel
      })
    }

    const userPermissionBookWhere = libraryItemsBookFilters.getUserPermissionBookWhereQuery(user)
    const replacements = userPermissionBookWhere.replacements as SeriesFilterReplacements

    const seriesWhere: WhereOptions[] = [
      {
        libraryId: library.id
      }
    ]

    // Handle library setting to hide single book series
    // TODO: Merge with existing query
    if (library.settings?.hideSingleBookSeries) {
      seriesWhere.push(
        Sequelize.where(
          Sequelize.literal(
            `(SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id)`
          ),
          {
            [Op.gt]: 1
          }
        )
      )
    }

    // Handle filters
    // TODO: Simplify and break-out
    let attrQuery: string | null = null
    if (filterGroup && ['genres', 'tags', 'narrators'].includes(filterGroup)) {
      attrQuery = `SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id AND (SELECT count(*) FROM json_each(b.${filterGroup}) WHERE json_valid(b.${filterGroup}) AND json_each.value = :filterValue) > 0`
      replacements.filterValue = filterValue
    } else if (filterGroup === 'authors') {
      attrQuery =
        'SELECT count(*) FROM books b, bookSeries bs, bookAuthors ba WHERE bs.seriesId = series.id AND bs.bookId = b.id AND ba.bookId = b.id AND ba.authorId = :filterValue'
      replacements.filterValue = filterValue
    } else if (filterGroup === 'publishers') {
      attrQuery =
        'SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id AND b.publisher = :filterValue'
      replacements.filterValue = filterValue
    } else if (filterGroup === 'languages') {
      attrQuery =
        'SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id AND b.language = :filterValue'
      replacements.filterValue = filterValue
    } else if (filterGroup === 'progress') {
      if (filterValue === 'not-finished') {
        attrQuery =
          'SELECT count(*) FROM books b, bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = b.id AND mp.userId = :userId WHERE bs.seriesId = series.id AND bs.bookId = b.id AND (mp.isFinished IS NULL OR mp.isFinished = 0)'
        replacements.userId = user.id
      } else if (filterValue === 'finished') {
        const progQuery =
          'SELECT count(*) FROM books b, bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = b.id AND mp.userId = :userId WHERE bs.seriesId = series.id AND bs.bookId = b.id AND (mp.isFinished IS NULL OR mp.isFinished = 0)'
        seriesWhere.push(Sequelize.where(Sequelize.literal(`(${progQuery})`), 0))
        replacements.userId = user.id
      } else if (filterValue === 'not-started') {
        const progQuery =
          'SELECT count(*) FROM books b, bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = b.id AND mp.userId = :userId WHERE bs.seriesId = series.id AND bs.bookId = b.id AND (mp.isFinished = 1 OR mp.currentTime > 0)'
        seriesWhere.push(Sequelize.where(Sequelize.literal(`(${progQuery})`), 0))
        replacements.userId = user.id
      } else if (filterValue === 'in-progress') {
        attrQuery =
          'SELECT count(*) FROM books b, bookSeries bs LEFT OUTER JOIN mediaProgresses mp ON mp.mediaItemId = b.id AND mp.userId = :userId WHERE bs.seriesId = series.id AND bs.bookId = b.id AND (mp.currentTime > 0 OR mp.ebookProgress > 0) AND mp.isFinished = 0'
        replacements.userId = user.id
      }
    }

    // Handle user permissions to only include series with at least 1 book
    // TODO: Simplify to a single query
    if (userPermissionBookWhere.bookWhere.length) {
      if (!attrQuery)
        attrQuery =
          'SELECT count(*) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND bs.bookId = b.id'

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
    }

    if (attrQuery) {
      seriesWhere.push(
        Sequelize.where(Sequelize.literal(`(${attrQuery})`), {
          [Op.gt]: 0
        })
      )
    }

    const order: Order = []
    const seriesAttributes: { include: ProjectionAlias[] } = {
      include: []
    }

    // Handle sort order
    const dir = sortDesc ? 'DESC' : 'ASC'
    if (sortBy === 'numBooks') {
      seriesAttributes.include.push([
        Sequelize.literal('(SELECT count(*) FROM bookSeries bs WHERE bs.seriesId = series.id)'),
        'numBooks'
      ])
      order.push(['numBooks', dir])
    } else if (sortBy === 'addedAt') {
      order.push(['createdAt', dir])
    } else if (sortBy === 'name') {
      if (global.ServerSettings?.sortingIgnorePrefix) {
        order.push([Sequelize.literal('nameIgnorePrefix COLLATE NOCASE'), dir])
      } else {
        order.push([Sequelize.literal('`series`.`name` COLLATE NOCASE'), dir])
      }
    } else if (sortBy === 'totalDuration') {
      seriesAttributes.include.push([
        Sequelize.literal(
          '(SELECT SUM(b.duration) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND b.id = bs.bookId)'
        ),
        'totalDuration'
      ])
      order.push(['totalDuration', dir])
    } else if (sortBy === 'lastBookAdded') {
      seriesAttributes.include.push([
        Sequelize.literal(
          '(SELECT MAX(b.createdAt) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND b.id = bs.bookId)'
        ),
        'mostRecentBookAdded'
      ])
      order.push(['mostRecentBookAdded', dir])
    } else if (sortBy === 'lastBookUpdated') {
      seriesAttributes.include.push([
        Sequelize.literal(
          '(SELECT MAX(b.updatedAt) FROM books b, bookSeries bs WHERE bs.seriesId = series.id AND b.id = bs.bookId)'
        ),
        'mostRecentBookUpdated'
      ])
      order.push(['mostRecentBookUpdated', dir])
    } else if (sortBy === 'random') {
      if (Database.sequelize) {
        order.push(Database.sequelize.random())
      } else {
        order.push(Sequelize.literal('RANDOM()'))
      }
    }

    const { rows: series, count } = await Database.seriesModel.findAndCountAll({
      where: {
        [Op.and]: seriesWhere
      },
      limit,
      offset,
      distinct: true,
      subQuery: false,
      attributes: seriesAttributes,
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
                },
                {
                  model: Database.authorModel
                },
                {
                  model: Database.seriesModel
                }
              ]
            }
          ],
          separate: true
        },
        ...seriesIncludes
      ],
      order
    })

    // Map series to old series
    const allOldSeries: SeriesOldJsonObject[] = []
    for (const s of series) {
      const oldSeries = s.toOldJSON()

      const totalDuration = s.get('totalDuration')
      if (typeof totalDuration === 'number') {
        oldSeries.totalDuration = totalDuration
      }

      const feeds = (s as typeof s & { feeds?: Feed[] }).feeds
      if (feeds?.length) {
        oldSeries.rssFeed = feeds[0].toOldJSONMinified()
      }

      // TODO: Sort books by sequence in query
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
          if (!bs.book) return null
          const bookWithLibraryItem = bs.book as Book & { libraryItem?: LibraryItem }
          const libraryItem = bookWithLibraryItem.libraryItem
          delete bookWithLibraryItem.libraryItem
          if (libraryItem) {
            libraryItem.media = bs.book
            return libraryItem.toOldJSONMinified()
          }
          return bs.book.toOldJSONMinified()
        })
        .filter((b): b is LibraryItemOldJsonMinifiedObject => b !== null)
      allOldSeries.push(oldSeries)
    }

    return {
      series: allOldSeries,
      count
    }
  }
}

export = seriesFilters
