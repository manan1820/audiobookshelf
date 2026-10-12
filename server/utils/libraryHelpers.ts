import { createNewSortInstance } from '../libs/fastSort'
import Database from '../Database'
import Logger from '../Logger'
import { getTitlePrefixAtEnd, isNullOrNaN, getTitleIgnorePrefix } from '../utils/index'
import type LibraryItem from '../models/LibraryItem'
import type User from '../models/User'
import type Library from '../models/Library'
import type Series from '../models/Series'
import type Book from '../models/Book'
import type { LibraryItemOldJsonMinifiedObject, BookOldJsonMinifiedObject } from '../types'

const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
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

export interface LibraryItemMinifiedWithSequence extends LibraryItemOldJsonMinifiedObject {
  sequence?: string | null
  filterSeriesSequence?: string | null
}

export interface SeriesBookGroup {
  id: string
  name: string
  nameIgnorePrefix: string | null
  nameIgnorePrefixSort: string
  type: string
  books: LibraryItemMinifiedWithSequence[]
  totalDuration: number
}

export interface CollapseSubseriesPayload {
  sortBy?: string
  sortDesc?: boolean
  limit?: number
  page?: number
  total?: number
}

interface SequenceRange {
  start: string | number
  end: string | number
  isNumber: boolean
}

const libraryHelpers = {
  getSeriesFromBooks(
    libraryItems: LibraryItem[],
    filterSeries?: string | null,
    hideSingleBookSeries?: boolean
  ): SeriesBookGroup[] {
    const _series: { [key: string]: SeriesBookGroup } = {}
    const seriesToFilterOut: { [key: string]: boolean } = {}
    libraryItems.forEach((libraryItem) => {
      const media = libraryItem.media as Book | undefined
      const allBookSeries = (media?.series || []).filter((se: Series) => !seriesToFilterOut[se.id])
      if (!allBookSeries.length) return

      allBookSeries.forEach((bookSeries: Series) => {
        const abJson = libraryItem.toOldJSONMinified() as LibraryItemMinifiedWithSequence
        const bookSeriesRel = bookSeries.bookSeries
        const seriesSeq = Array.isArray(bookSeriesRel) ? bookSeriesRel[0]?.sequence : bookSeriesRel?.sequence
        abJson.sequence = seriesSeq || null
        if (filterSeries) {
          const series = media?.series?.find((se: Series) => se.id === filterSeries)
          const filterBs = series?.bookSeries
          const filterSeq = Array.isArray(filterBs) ? filterBs[0]?.sequence : filterBs?.sequence
          abJson.filterSeriesSequence = filterSeq || null
        }
        const bookMedia = abJson.media as BookOldJsonMinifiedObject
        const duration = isNullOrNaN(bookMedia?.duration) ? 0 : Number(bookMedia?.duration)
        if (!_series[bookSeries.id]) {
          _series[bookSeries.id] = {
            id: bookSeries.id,
            name: bookSeries.name,
            nameIgnorePrefix: getTitlePrefixAtEnd(bookSeries.name),
            nameIgnorePrefixSort: getTitleIgnorePrefix(bookSeries.name),
            type: 'series',
            books: [abJson],
            totalDuration: duration
          }
        } else {
          const group = _series[bookSeries.id]
          if (group) {
            group.books.push(abJson)
            group.totalDuration += duration
          }
        }
      })
    })

    let seriesItems = Object.values(_series)

    // Library setting to hide series with only 1 book
    if (hideSingleBookSeries) {
      seriesItems = seriesItems.filter((se) => se.books.length > 1)
    }

    return seriesItems.map((series) => {
      series.books = naturalSort(series.books).asc((li: LibraryItemMinifiedWithSequence) => li.sequence)
      return series
    })
  },

  collapseBookSeries(
    libraryItems: LibraryItem[],
    filterSeries?: string | null,
    hideSingleBookSeries?: boolean
  ): LibraryItem[] {
    const seriesObjects = this.getSeriesFromBooks(libraryItems, filterSeries, hideSingleBookSeries).filter(
      (s) => s.id !== filterSeries
    )

    const filteredLibraryItems: LibraryItem[] = []

    libraryItems.forEach((li) => {
      if (li.mediaType !== 'book') return

      seriesObjects
        .filter((s) => s.books[0]?.id === li.id)
        .forEach((series) => {
          filteredLibraryItems.push(
            Object.assign(Object.create(Object.getPrototypeOf(li)), li, { collapsedSeries: series })
          )
        })

      if (!seriesObjects.some((s) => s.books.some((b) => b.id === li.id))) {
        filteredLibraryItems.push(li)
      }
    })

    return filteredLibraryItems
  },

  async handleCollapseSubseries(
    payload: CollapseSubseriesPayload,
    seriesId: string,
    user: User,
    library: Library
  ): Promise<LibraryItemOldJsonMinifiedObject[]> {
    if (payload.sortBy && !VALID_COLLAPSE_SUBSERIES_SORTS.has(payload.sortBy)) {
      Logger.warn(`[libraryHelpers] Invalid "sort" query string "${payload.sortBy}"`)
      payload.sortBy = undefined
    }

    const seriesWithBooks = (await Database.seriesModel.findByPk(seriesId, {
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
    })) as (Series & { books?: (Book & { libraryItem?: LibraryItem })[] }) | null

    if (!seriesWithBooks || !seriesWithBooks.books) {
      payload.total = 0
      return []
    }

    const books = seriesWithBooks.books
    payload.total = books.length

    let libraryItems: LibraryItem[] = books
      .map((book) => {
        const libraryItem = book.libraryItem
        delete book.libraryItem
        if (libraryItem) {
          libraryItem.media = book
        }
        return libraryItem
      })
      .filter((li): li is LibraryItem => {
        return !!li && user.checkCanAccessLibraryItem(li)
      })

    const collapsedItems = this.collapseBookSeries(libraryItems, seriesId, library.settings?.hideSingleBookSeries)
    if (!(collapsedItems.length === 1 && collapsedItems[0]?.collapsedSeries)) {
      libraryItems = collapsedItems
      payload.total = libraryItems.length
    }

    const sortingIgnorePrefix = Database.serverSettings?.sortingIgnorePrefix

    let sortArray: { [key: string]: unknown }[] = []
    const direction = payload.sortDesc ? 'desc' : 'asc'
    if (!payload.sortBy || payload.sortBy === 'sequence') {
      sortArray = [
        {
          [direction]: (li: LibraryItem) => {
            const book = li.media as Book | undefined
            const series = book?.series?.find((se: Series) => se.id === seriesId)
            const bs = series?.bookSeries
            return Array.isArray(bs) ? bs[0]?.sequence || null : bs?.sequence || null
          }
        },
        {
          [direction]: (li: LibraryItem) => {
            const book = li.media as Book | undefined
            const coll = li.collapsedSeries as { name?: string; nameIgnorePrefix?: string | null } | undefined
            if (sortingIgnorePrefix) {
              return coll?.nameIgnorePrefix || book?.titleIgnorePrefix || ''
            } else {
              return coll?.name || book?.title || ''
            }
          }
        }
      ]
    } else {
      if (payload.sortBy !== 'media.metadata.title') {
        sortArray.push({
          asc: (li: LibraryItem) => {
            const coll = li.collapsedSeries as { name?: string; nameIgnorePrefix?: string | null } | undefined
            if (coll) {
              return sortingIgnorePrefix ? coll.nameIgnorePrefix || '' : coll.name || ''
            } else {
              return ''
            }
          }
        })
      }
      sortArray.push({
        [direction]: (li: LibraryItem) => {
          const book = li.media as Book | undefined
          const coll = li.collapsedSeries as { name?: string; nameIgnorePrefix?: string | null } | undefined
          if (payload.sortBy === 'media.metadata.title') {
            if (sortingIgnorePrefix) {
              return coll?.nameIgnorePrefix || book?.titleIgnorePrefix || ''
            } else {
              return coll?.name || book?.title || ''
            }
          } else {
            if (payload.sortBy === 'media.metadata.authorName') return li.authorNamesFirstLast ?? ''
            if (payload.sortBy === 'media.metadata.authorNameLF') return li.authorNamesLastFirst ?? ''
            const parts = payload.sortBy ? payload.sortBy.split('.') : []
            return parts.reduce((a: unknown, b: string) => (a && typeof a === 'object' ? (a as { [k: string]: unknown })[b] : undefined), li) ?? ''
          }
        }
      })
    }

    libraryItems = naturalSort(libraryItems).by(sortArray)

    if (payload.limit) {
      const page = payload.page || 0
      const startIndex = page * payload.limit
      libraryItems = libraryItems.slice(startIndex, startIndex + payload.limit)
    }

    return Promise.all(
      libraryItems.map(async (li) => {
        const book = li.media as Book | undefined
        const filteredSeries = book?.series?.find((se: Series) => se.id === seriesId)
        const json = li.toOldJSONMinified() as LibraryItemOldJsonMinifiedObject & {
          collapsedSeries?: {
            id: string
            name: string
            nameIgnorePrefix: string | null
            libraryItemIds: string[]
            numBooks: number
            seriesSequenceList?: string
          }
        }
        const bookMedia = json.media as BookOldJsonMinifiedObject | undefined
        if (bookMedia?.metadata && filteredSeries) {
          bookMedia.metadata.series = {
            id: filteredSeries.id,
            name: filteredSeries.name,
            sequence: filteredSeries.bookSeries?.sequence || null
          }
        }

        if (li.collapsedSeries && 'books' in li.collapsedSeries && Array.isArray(li.collapsedSeries.books)) {
          const coll = li.collapsedSeries as SeriesBookGroup
          json.collapsedSeries = {
            id: coll.id,
            name: coll.name,
            nameIgnorePrefix: coll.nameIgnorePrefix,
            libraryItemIds: coll.books.map((b) => b.id),
            numBooks: coll.books.length
          }

          const filteredBooks = coll.books
            .filter((b) => b.filterSeriesSequence)
            .map((b) => b.filterSeriesSequence as string)

          const ranges = naturalSort(filteredBooks)
            .asc()
            .reduce<SequenceRange[]>((acc, currentSequence) => {
              const lastRange = acc[acc.length - 1]
              const isNumber = /^(\d+|\d+\.\d*|\d*\.\d+)$/.test(currentSequence)
              const seqVal: string | number = isNumber ? parseFloat(currentSequence) : currentSequence

              if (lastRange && isNumber && lastRange.isNumber && typeof lastRange.end === 'number' && typeof seqVal === 'number' && lastRange.end + 1 === seqVal) {
                lastRange.end = seqVal
              } else {
                acc.push({ start: seqVal, end: seqVal, isNumber })
              }

              return acc
            }, [])

          json.collapsedSeries.seriesSequenceList = ranges
            .map((r) => (r.start === r.end ? String(r.start) : `${r.start}-${r.end}`))
            .join(', ')
        }

        return json
      })
    )
  }
}

export default libraryHelpers
