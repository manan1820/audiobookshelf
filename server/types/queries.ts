import type LibraryItem from '../models/LibraryItem'
import type Author from '../models/Author'
import type { WhereOptions, BindOrReplacements, WhereAttributeHashValue } from 'sequelize'
import type {
  LibraryItemOldJsonObject,
  LibraryItemOldJsonMinifiedObject,
  LibraryItemOldJsonExpandedObject,
  SeriesOldJsonObject,
  AuthorOldJsonExpandedObject
} from './dto'

// ==========================================
// 1. Author Filter Types
// ==========================================

export interface AuthorWithCount {
  id: string
  name: string
  count: number
}

// ==========================================
// 2. User Stats Types
// ==========================================

export interface MostListenedNarrator {
  time: number
  name: string
}

export interface MostListenedMonth {
  month: number
  time: number
}

export interface TopAuthor {
  name: string
  time: number
}

export interface TopGenre {
  genre: string
  time: number
}

export interface LongestAudiobookFinished {
  id: string
  title: string
  duration: number
  finishedAt: Date | string | number | null
}

export interface UserStatsForYear {
  totalListeningSessions: number
  totalListeningTime: number
  totalBookListeningTime: number
  totalPodcastListeningTime: number
  topAuthors: TopAuthor[]
  topGenres: TopGenre[]
  mostListenedNarrator: MostListenedNarrator | null
  mostListenedMonth: MostListenedMonth | null
  numBooksFinished: number
  numBooksListened: number
  longestAudiobookFinished: LongestAudiobookFinished | null
  booksWithCovers: string[]
  finishedBooksWithCovers: string[]
}

// ==========================================
// 3. Admin Stats Types
// ==========================================

export interface AdminTopAuthor {
  name: string
  time: number
}

export interface AdminTopNarrator {
  name: string
  time: number
}

export interface AdminTopGenre {
  genre: string
  time: number
}

export interface AdminStatsForYear {
  numListeningSessions: number
  numBooksAdded: number
  numAuthorsAdded: number
  totalBooksAddedSize: number
  totalBooksAddedDuration: number
  booksAddedWithCovers: string[]
  totalBooksSize: number
  totalBooksDuration: number
  totalListeningTime: number
  numBooks: number
  topAuthors: AdminTopAuthor[]
  topNarrators: AdminTopNarrator[]
  topGenres: AdminTopGenre[]
}

export interface SizeObject {
  totalSize: number
  numItems: number
}

export interface TotalSizeResult {
  books: SizeObject
  podcasts: SizeObject
  total: SizeObject
}

export interface NumAudioFilesResult {
  numBookAudioFiles: number
  numPodcastAudioFiles: number
  numAudioFiles: number
}

// ==========================================
// 4. Library Item Filter Types
// ==========================================

export interface LargestItem {
  id: string
  title: string
  size: number
}

export interface LongestBookItem {
  id: string
  title: string
  duration: number
}

export interface GenreWithCount {
  genre: string
  count: number
}

export interface TagWithCount {
  name: string
  numItems: number
}

export interface BookLibraryStats {
  totalSize: number
  totalDuration: number
  numAudioFiles: number
  totalItems: number
}

export interface PodcastLibraryStats {
  totalSize: number
  totalDuration: number
  numAudioFiles: number
  totalItems: number
}

export interface UserFilterReplacements {
  userTagsSelected?: string[]
  userId?: string | null
  filterValue?: string | null
  libraryId?: string
  limit?: number
  offset?: number
  [key: string]: string | number | boolean | string[] | null | undefined
}

export interface QueryWhereAttributeHash {
  [key: string]:
    | WhereAttributeHashValue<unknown>
    | WhereOptions
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | (WhereOptions | string | number | boolean | Date | null | undefined)[]
    | symbol
}

export interface UserPermissionBookWhereResult {
  bookWhere: WhereOptions[]
  replacements: UserFilterReplacements
}

export interface UserPermissionPodcastWhereResult {
  podcastWhere: WhereOptions[]
  replacements: UserFilterReplacements
}

export interface BookSearchSeriesMatch {
  series: SeriesOldJsonObject
  books: (LibraryItemOldJsonObject | LibraryItemOldJsonMinifiedObject)[]
}

export interface PodcastSearchEpisodeMatch {
  libraryItem: LibraryItemOldJsonExpandedObject & {
    recentEpisode?: unknown
  }
}

export interface CollapseSeriesBookSeries {
  id: string
  numBooks: number
  libraryItemIds: string[]
}

export interface FilterDataAuthor {
  id: string
  name: string
}

export interface FilterDataSeries {
  id: string
  name: string
}

export interface FilterDataResult {
  authors: FilterDataAuthor[]
  genres: Set<string> | string[]
  tags: Set<string> | string[]
  series: FilterDataSeries[]
  narrators: Set<string> | string[]
  languages: Set<string> | string[]
  publishers: Set<string> | string[]
  publishedDecades: Set<string> | string[]
  bookCount: number
  authorCount: number
  seriesCount: number
  podcastCount: number
  numIssues: number
  loadedAt?: number
}

export interface InternalLibraryFilterOptions {
  filterBy?: string | null
  sortBy?: string | null
  sortDesc?: boolean | null
  limit?: number | null
  offset?: number | null
  collapseseries?: boolean | null
  include: string[]
  mediaType: string
}

export interface BookSearchItemMatch {
  libraryItem: LibraryItemOldJsonExpandedObject
}

export interface BookLibrarySearchResult {
  book: BookSearchItemMatch[]
  narrators: TagWithCount[]
  tags: TagWithCount[]
  genres: TagWithCount[]
  series: BookSearchSeriesMatch[]
  authors: AuthorOldJsonExpandedObject[]
}

export interface PodcastLibrarySearchResult {
  podcast: LibraryItemOldJsonExpandedObject[]
  tags: TagWithCount[]
  genres: TagWithCount[]
  episodes: PodcastSearchEpisodeMatch[]
}

// ==========================================
// 5. Shelf Result Types
// ==========================================

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

export interface LibraryFilterDataStore {
  [libraryId: string]: FilterDataResult | undefined
}

