/**
 * Data Transfer Objects (DTO) and rigid JSON serialization contracts
 * for the Audiobookshelf Server.
 */

// ==========================================
// 1. Author DTOs
// ==========================================

export interface AuthorOldJsonObject {
  id: string
  asin: string | null
  name: string
  description: string | null
  imagePath: string | null
  libraryId: string
  addedAt: number
  updatedAt: number
}

export interface AuthorOldJsonExpandedObject extends AuthorOldJsonObject {
  numBooks: number
  series?: unknown[]
  libraryItems?: unknown[]
}

export interface AuthorMinimalJsonObject {
  id: string
  name: string
}

// ==========================================
// 2. Series DTOs
// ==========================================

export interface SeriesOldJsonObject {
  id: string
  name: string
  nameIgnorePrefix: string
  description: string | null
  addedAt: number
  updatedAt: number
  libraryId: string
  totalDuration?: number
  rssFeed?: unknown
  books?: unknown[]
}

export interface SeriesMinimalJsonObject {
  id: string
  name: string
  sequence?: string | null
}

// ==========================================
// 3. Library & LibraryFolder DTOs
// ==========================================

export interface LibrarySettingsObject {
  coverAspectRatio: number
  disableWatcher: boolean
  skipMatchingMediaWithAsin?: boolean
  skipMatchingMediaWithIsbn?: boolean
  autoScanCronExpression?: string | null
  audiobooksOnly?: boolean
  epubsAllowScriptedContent?: boolean
  hideSingleBookSeries?: boolean
  onlyShowLaterBooksInContinueSeries?: boolean
  metadataPrecedence?: string[]
  podcastSearchRegion?: string
  markAsFinishedTimeRemaining?: number
  markAsFinishedPercentComplete?: number | null
}

export interface LibraryFolderOldJsonObject {
  id: string
  fullPath: string
  libraryId: string
  addedAt: number
}

export interface LibraryExtraData {
  lastScanMetadataPrecedence?: string[] | null
}

export interface LibraryOldJsonObject {
  id: string
  name: string
  folders: LibraryFolderOldJsonObject[]
  displayOrder: number
  icon: string | null
  mediaType: string
  provider: string | null
  settings: Partial<LibrarySettingsObject>
  lastScan: number | null
  lastScanVersion: string | null
  createdAt: number
  lastUpdate: number
}

// ==========================================
// 4. Book & Audio Media DTOs
// ==========================================

export interface ChapterObject {
  id: number
  start: number
  end: number
  title: string
}

export interface AudioFileObject {
  index: number
  ino: string
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
  addedAt: number
  updatedAt: number
  trackNumFromMeta?: number
  discNumFromMeta?: number
  trackNumFromFilename?: number
  discNumFromFilename?: number
  manuallyVerified?: boolean
  format?: string
  duration: number
  bitRate?: number
  language?: string
  codec?: string
  timeBase?: string
  channels?: number
  channelLayout?: string
  chapters?: ChapterObject[]
  metaTags?: AudioFileMetaTags | null
  mimeType: string
  exclude?: boolean
}

export interface AudioTrack extends AudioFileObject {
  title: string
  contentUrl: string
  startOffset: number
}

export interface EBookFileObject {
  ino: string
  ebookFormat: string
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

export interface AudioFileMetaTags {
  tagAlbum?: string
  tagArtist?: string
  tagGenre?: string
  tagTitle?: string
  tagSeries?: string
  tagSeriesPart?: string
  tagTrack?: string
  tagDisc?: string
  tagSubtitle?: string
  tagYear?: string
  tagComposer?: string
  tagPublisher?: string
  tagComment?: string
  tagDescription?: string
  tagEncoder?: string
  tagLanguage?: string
  tagAsin?: string
  tagOverdriveMediaMarker?: string
  [key: string]: string | number | boolean | null | undefined
}

export interface BookAuthorMetadataObject {
  id: string
  name: string
}

export interface BookSeriesMetadataObject {
  id: string
  name: string
  sequence: string | null
}

export interface BookOldMetadataJsonObject {
  title: string
  subtitle: string | null
  authors: BookAuthorMetadataObject[]
  narrators: string[]
  series: BookSeriesMetadataObject[]
  genres: string[]
  publishedYear: string | null
  publishedDate: string | null
  publisher: string | null
  description: string | null
  isbn: string | null
  asin: string | null
  language: string | null
  explicit: boolean
  abridged: boolean
}

export interface BookOldMetadataMinifiedJsonObject {
  title: string
  titleIgnorePrefix: string
  subtitle: string | null
  authorName: string
  authorNameLF: string
  narratorName: string
  seriesName: string
  genres: string[]
  publishedYear: string | null
  publishedDate: string | null
  publisher: string | null
  description: string | null
  isbn: string | null
  asin: string | null
  language: string | null
  explicit: boolean
  abridged: boolean
}

export interface BookOldMetadataExpandedJsonObject extends BookOldMetadataJsonObject {
  titleIgnorePrefix: string
  authorName: string
  authorNameLF: string
  narratorName: string
  seriesName: string
  descriptionPlain: string | null
}

export interface BookAbsMetadataJsonObject {
  tags: string[]
  chapters: ChapterObject[]
  title: string
  subtitle: string | null
  authors: string[]
  narrators: string[]
  series: string[]
  genres: string[]
  publishedYear: string | null
  publishedDate: string | null
  publisher: string | null
  description: string | null
  isbn: string | null
  asin: string | null
  language: string | null
  explicit: boolean
  abridged: boolean
}

export interface BookUpdateMetadataPayload {
  title?: string | number | null
  subtitle?: string | number | null
  publishedYear?: string | number | null
  publishedDate?: string | number | null
  publisher?: string | number | null
  description?: string | number | null
  isbn?: string | number | null
  asin?: string | number | null
  language?: string | number | null
  explicit?: boolean
  abridged?: boolean
  narrators?: string[]
  genres?: string[]
}

export interface BookUpdateRequestPayload {
  metadata?: BookUpdateMetadataPayload
  tags?: string[]
}

export interface BookOldJsonObject {
  id: string
  libraryItemId: string
  metadata: BookOldMetadataJsonObject
  coverPath: string | null
  tags: string[]
  audioFiles?: AudioFileObject[] | null
  chapters?: ChapterObject[] | null
  ebookFile?: EBookFileObject | null
}

export interface BookOldJsonMinifiedObject {
  id: string
  metadata: BookOldMetadataMinifiedJsonObject
  coverPath: string | null
  tags: string[]
  numTracks: number
  numAudioFiles: number
  numChapters: number
  duration: number
  size: number
  ebookFormat?: string
}

export interface BookOldJsonExpandedObject extends Omit<BookOldJsonMinifiedObject, 'metadata'> {
  libraryItemId: string
  metadata: BookOldMetadataExpandedJsonObject
  audioFiles?: AudioFileObject[] | null
  chapters?: ChapterObject[] | null
  ebookFile?: EBookFileObject | null
  tracks: AudioTrack[]
}

// ==========================================
// 5. User & Permission DTOs
// ==========================================

export interface AudioBookmarkObject {
  libraryItemId: string
  title: string
  time: number
  createdAt: number
}

export interface UserPermissionsObject {
  download?: boolean
  update?: boolean
  delete?: boolean
  upload?: boolean
  accessExplicitContent?: boolean
  accessAllLibraries?: boolean
  accessAllTags?: boolean
  createEreader?: boolean
  selectedTagsNotAccessible?: boolean
  librariesAccessible?: string[]
  itemTagsSelected?: string[]
}

export interface AbsExternalPermissionsObject {
  canDownload?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  canUpload?: boolean
  canAccessExplicitContent?: boolean
  canAccessAllLibraries?: boolean
  canAccessAllTags?: boolean
  canCreateEReader?: boolean
  tagsAreDenylist?: boolean
  allowedLibraries?: string[]
  allowedTags?: string[]
}

export interface UserPublicJsonObject {
  id: string
  username: string
  type: string
  session: unknown
  lastSeen: number | null
  createdAt: number
}

export interface UserOldJsonForBrowserObject {
  id: string
  username: string
  email: string | null
  type: string
  token: string | null
  isOldToken: boolean
  mediaProgress?: unknown[]
  seriesHideFromContinueListening: string[]
  bookmarks?: AudioBookmarkObject[]
  isActive: boolean
  isLocked: boolean
  lastSeen: number | null
  createdAt: number
  permissions: UserPermissionsObject
  librariesAccessible: string[]
  itemTagsSelected: string[]
  hasOpenIDLink: boolean
  latestSession?: unknown
}

export interface UserExtraData {
  oldUserId?: string
  authOpenIDSub?: string
  seriesHideFromContinueListening?: string[]
}

export interface MediaProgressExtraData {
  libraryItemId?: string | null
  progress?: number | null
}
