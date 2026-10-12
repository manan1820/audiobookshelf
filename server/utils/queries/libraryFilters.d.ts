import type Library from '../../models/Library'
import type User from '../../models/User'
import type LibraryItem from '../../models/LibraryItem'
import type Author from '../../models/Author'
import type {
  LibraryFilterOptions,
  LibraryItemOldJsonMinifiedObject,
  SeriesOldJsonObject,
  AuthorOldJsonExpandedObject
} from '../../types'

export interface FilteredLibraryItemsResult {
  libraryItems: LibraryItem[]
  count: number
}

export interface ShelfLibraryItemsResult {
  libraryItems: LibraryItemOldJsonMinifiedObject[]
  count: number
}

export interface ShelfMediaItemsResult {
  items: LibraryItemOldJsonMinifiedObject[]
  count: number
}

export interface ShelfSeriesResult {
  series: SeriesOldJsonObject[]
  count: number
}

export interface ShelfAuthorsResult {
  authors: AuthorOldJsonExpandedObject[]
  count: number
}

export function decode(text: string): string | null

export function getFilteredLibraryItems(
  libraryId: string,
  user: User,
  options: LibraryFilterOptions
): Promise<FilteredLibraryItemsResult>

export function getMediaItemsInProgress(
  library: Library,
  user: User,
  include: string[],
  limit: number,
  includeFinished?: boolean
): Promise<ShelfMediaItemsResult>

export function getLibraryItemsContinueSeries(
  library: Library,
  user: User,
  include: string[],
  limit: number
): Promise<ShelfLibraryItemsResult>

export function getLibraryItemsMostRecentlyAdded(
  library: Library,
  user: User,
  include: string[],
  limit: number
): Promise<ShelfLibraryItemsResult>

export function getSeriesMostRecentlyAdded(
  library: Library,
  user: User,
  include: string[],
  limit: number
): Promise<ShelfSeriesResult>

export function getLibraryItemsToDiscover(
  library: Library,
  user: User,
  include: string[],
  limit: number
): Promise<ShelfLibraryItemsResult>

export function getMediaFinished(
  library: Library,
  user: User,
  include: string[],
  limit: number
): Promise<ShelfMediaItemsResult>

export function getNewestAuthors(
  library: Library,
  user: User,
  limit: number
): Promise<ShelfAuthorsResult>

export function getNewestPodcastEpisodes(
  library: Library,
  user: User,
  limit: number
): Promise<ShelfLibraryItemsResult>

export function getLibraryItemsForAuthor(
  author: Author,
  user: User | null,
  order?: unknown,
  limit?: unknown
): Promise<FilteredLibraryItemsResult>

declare const libraryFilters: {
  decode: typeof decode
  getFilteredLibraryItems: typeof getFilteredLibraryItems
  getMediaItemsInProgress: typeof getMediaItemsInProgress
  getLibraryItemsContinueSeries: typeof getLibraryItemsContinueSeries
  getLibraryItemsMostRecentlyAdded: typeof getLibraryItemsMostRecentlyAdded
  getSeriesMostRecentlyAdded: typeof getSeriesMostRecentlyAdded
  getLibraryItemsToDiscover: typeof getLibraryItemsToDiscover
  getMediaFinished: typeof getMediaFinished
  getNewestAuthors: typeof getNewestAuthors
  getNewestPodcastEpisodes: typeof getNewestPodcastEpisodes
  getLibraryItemsForAuthor: typeof getLibraryItemsForAuthor
}

export default libraryFilters
