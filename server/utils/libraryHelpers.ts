import { createNewSortInstance } from '../libs/fastSort'
import Database from '../Database'
import Logger from '../Logger'
import { getTitlePrefixAtEnd, isNullOrNaN, getTitleIgnorePrefix, isObject } from './index'
import {
  SeriesGroup,
  LibraryItemLike,
  CollapseSubseriesPayload,
  UserLike,
  LibraryLike
} from '../types'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const naturalSort = createNewSortInstance({
  comparer: (a: unknown, b: unknown) => collator.compare(String(a ?? ''), String(b ?? ''))
})

const VALID_COLLAPSE_SUBSERIES_SORTS = new Set([
  'addedAt',
  'size',
  'birthtimeMs',
  'mtimeMs',
  'media.duration',
  'media.metadata.publishedYear',
  'media.metadata.authorName',
  'media.metadata.authorNameLF',
  'media.metadata.title',
  'sequence',
  'progress',
  'progress.createdAt',
  'progress.finishedAt',
  'random'
])

interface SequenceRange {
  start: number | string
  end: number | string
  isNumber: boolean
}

type SortCriterion<T> = {
  asc?: (item: T) => unknown
  desc?: (item: T) => unknown
}

const libraryHelpers = {
  /**
   * Get series from books
   */
  getSeriesFromBooks(
    libraryItems: LibraryItemLike[],
    filterSeries?: string,
    hideSingleBookSeries?: boolean
  ): SeriesGroup[] {
    const _series: Record<string, SeriesGroup> = {}
    const seriesToFilterOut: Record<string, boolean> = {}

    libraryItems.forEach((libraryItem) => {
      // get all book series for item that is not already filtered out
      const allBookSeries = (libraryItem.media.series || []).filter((se) => !seriesToFilterOut[se.id])
      if (!allBookSeries.length) return

      allBookSeries.forEach((bookSeries) => {
        const abJson = libraryItem.toOldJSONMinified()
        abJson.sequence = bookSeries.bookSeries.sequence
        if (filterSeries) {
          const series = libraryItem.media.series?.find((se) => se.id === filterSeries)
          if (series) {
            abJson.filterSeriesSequence = series.bookSeries.sequence
          }
        }
        if (!_series[bookSeries.id]) {
          _series[bookSeries.id] = {
            id: bookSeries.id,
            name: bookSeries.name,
            nameIgnorePrefix: getTitlePrefixAtEnd(bookSeries.name),
            nameIgnorePrefixSort: getTitleIgnorePrefix(bookSeries.name),
            type: 'series',
            books: [abJson],
            totalDuration: isNullOrNaN(abJson.media.duration) ? 0 : Number(abJson.media.duration)
          }
        } else {
          _series[bookSeries.id].books.push(abJson)
          _series[bookSeries.id].totalDuration += isNullOrNaN(abJson.media.duration) ? 0 : Number(abJson.media.duration)
        }
      })
    })

    let seriesItems = Object.values(_series)

    // Library setting to hide series with only 1 book
    if (hideSingleBookSeries) {
      seriesItems = seriesItems.filter((se) => se.books.length > 1)
    }

    return seriesItems.map((series) => {
      series.books = naturalSort(series.books).asc((li) => li.sequence)
      return series
    })
  },

  /**
   * Collapse book series
   */
  collapseBookSeries(
    libraryItems: LibraryItemLike[],
    filterSeries?: string,
    hideSingleBookSeries?: boolean
  ): LibraryItemLike[] {
    // Get series from the library items. If this list is being collapsed after filtering for a series,
    // don't collapse that series, only books that are in other series.
    const seriesObjects = this.getSeriesFromBooks(libraryItems, filterSeries, hideSingleBookSeries).filter(
      (s) => s.id !== filterSeries
    )

    const filteredLibraryItems: LibraryItemLike[] = []

    libraryItems.forEach((li) => {
      if (li.mediaType !== 'book') return

      // Handle when this is the first book in a series
      seriesObjects
        .filter((s) => s.books[0]?.id === li.id)
        .forEach((series) => {
          // Clone the library item as we need to attach data to it, but don't
          // want to change the global copy of the library item
          filteredLibraryItems.push(
            Object.assign(Object.create(Object.getPrototypeOf(li)), li, { collapsedSeries: series })
          )
        })

      // Only included books not contained in series
      if (!seriesObjects.some((s) => s.books.some((b) => b.id === li.id))) {
        filteredLibraryItems.push(li)
      }
    })

    return filteredLibraryItems
  },

  /**
   * Handle collapse subseries
   */
  async handleCollapseSubseries(
    payload: CollapseSubseriesPayload,
    seriesId: string,
    user: UserLike,
    library: LibraryLike
  ): Promise<Record<string, unknown>[]> {
    if (payload.sortBy && !VALID_COLLAPSE_SUBSERIES_SORTS.has(payload.sortBy)) {
      Logger.warn(`[libraryHelpers] Invalid "sort" query string "${payload.sortBy}"`)
      payload.sortBy = undefined
    }

    interface SeriesQueryModel {
      findByPk(id: string, options?: unknown): Promise<{ books?: unknown[] } | null>
    }
    const seriesModel = Database.seriesModel as unknown as SeriesQueryModel
    const seriesWithBooks = await seriesModel.findByPk(seriesId, {
      include: {
        model: Database.bookModel,
        through: {
          attributes: ['sequence']
        },
        include: [
          {
            model: Database.libraryItemModel
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
      }
    })
    if (!seriesWithBooks) {
      payload.total = 0
      return []
    }

    const books = ((seriesWithBooks.books || []) as unknown) as Array<{
      libraryItem: LibraryItemLike
      [key: string]: unknown
    }>
    payload.total = books.length

    let libraryItems: LibraryItemLike[] = books
      .map((book) => {
        const libraryItem = book.libraryItem
        delete (book as { libraryItem?: unknown }).libraryItem
        libraryItem.media = book as unknown as LibraryItemLike['media']
        return libraryItem
      })
      .filter((li) => {
        return user.checkCanAccessLibraryItem(li)
      })

    const collapsedItems = this.collapseBookSeries(libraryItems, seriesId, library.settings.hideSingleBookSeries)
    if (!(collapsedItems.length === 1 && collapsedItems[0]?.collapsedSeries)) {
      libraryItems = collapsedItems
      payload.total = libraryItems.length
    }

    const sortingIgnorePrefix = Database.serverSettings.sortingIgnorePrefix

    let sortArray: SortCriterion<LibraryItemLike>[] = []
    const direction = payload.sortDesc ? 'desc' : 'asc'
    if (!payload.sortBy || payload.sortBy === 'sequence') {
      const firstCriterion: SortCriterion<LibraryItemLike> = {}
      firstCriterion[direction] = (li: LibraryItemLike) => {
        const series = li.media.series?.find((se) => se.id === seriesId)
        return series?.bookSeries.sequence
      }

      const secondCriterion: SortCriterion<LibraryItemLike> = {}
      secondCriterion[direction] = (li: LibraryItemLike) => {
        if (sortingIgnorePrefix) {
          return li.collapsedSeries?.nameIgnorePrefix || li.media.titleIgnorePrefix
        } else {
          return li.collapsedSeries?.name || li.media.title
        }
      }

      sortArray = [firstCriterion, secondCriterion]
    } else {
      // If series are collapsed and not sorting by title or sequence,
      // sort all collapsed series to the end in alphabetical order
      if (payload.sortBy !== 'media.metadata.title') {
        sortArray.push({
          asc: (li: LibraryItemLike) => {
            if (li.collapsedSeries) {
              return sortingIgnorePrefix ? li.collapsedSeries.nameIgnorePrefix : li.collapsedSeries.name
            } else {
              return ''
            }
          }
        })
      }

      const sortBy = payload.sortBy
      const valCriterion: SortCriterion<LibraryItemLike> = {}
      valCriterion[direction] = (li: LibraryItemLike) => {
        if (sortBy === 'media.metadata.title') {
          if (sortingIgnorePrefix) {
            return li.collapsedSeries?.nameIgnorePrefix || li.media.titleIgnorePrefix
          } else {
            return li.collapsedSeries?.name || li.media.title
          }
        } else {
          if (sortBy === 'media.metadata.authorName') return li.authorNamesFirstLast ?? ''
          if (sortBy === 'media.metadata.authorNameLF') return li.authorNamesLastFirst ?? ''
          return sortBy.split('.').reduce<unknown>((a, b) => (isObject(a) ? (a as Record<string, unknown>)[b] : undefined), li) ?? ''
        }
      }
      sortArray.push(valCriterion)
    }

    libraryItems = naturalSort(libraryItems).by(sortArray)

    if (payload.limit) {
      const startIndex = (payload.page || 0) * payload.limit
      libraryItems = libraryItems.slice(startIndex, startIndex + payload.limit)
    }

    return Promise.all(
      libraryItems.map(async (li) => {
        const filteredSeries = li.media.series?.find((se) => se.id === seriesId)
        const json = li.toOldJSONMinified() as unknown as Record<string, unknown> & {
          media: { metadata: Record<string, unknown> }
          collapsedSeries?: Record<string, unknown>
        }
        json.media.metadata.series = {
          id: filteredSeries?.id,
          name: filteredSeries?.name,
          sequence: filteredSeries?.bookSeries.sequence
        }

        if (li.collapsedSeries) {
          json.collapsedSeries = {
            id: li.collapsedSeries.id,
            name: li.collapsedSeries.name,
            nameIgnorePrefix: li.collapsedSeries.nameIgnorePrefix,
            libraryItemIds: li.collapsedSeries.books.map((b) => b.id),
            numBooks: li.collapsedSeries.books.length
          }

          // If collapsing by series and filtering by a series, generate the list of sequences the collapsed
          // series represents in the filtered series
          const filterSeriesList = li.collapsedSeries.books
            .filter((b) => b.filterSeriesSequence)
            .map((b) => b.filterSeriesSequence as string)

          json.collapsedSeries.seriesSequenceList = (naturalSort(filterSeriesList).asc() as string[])
            .reduce<SequenceRange[]>((ranges, currentSequence) => {
              const lastRange = ranges[ranges.length - 1]
              const isNumber = /^(\d+|\d+\.\d*|\d*\.\d+)$/.test(currentSequence)
              const seqVal: number | string = isNumber ? parseFloat(currentSequence) : currentSequence

              if (lastRange && isNumber && lastRange.isNumber && typeof lastRange.end === 'number' && typeof seqVal === 'number' && lastRange.end + 1 === seqVal) {
                lastRange.end = seqVal
              } else {
                ranges.push({ start: seqVal, end: seqVal, isNumber: isNumber })
              }

              return ranges
            }, [])
            .map((r) => (r.start === r.end ? String(r.start) : `${r.start}-${r.end}`))
            .join(', ')
        }

        return json
      })
    )
  }
}

export = libraryHelpers
