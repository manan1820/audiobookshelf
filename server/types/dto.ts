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

export interface AuthorSeriesMapItem {
  id: string
  name: string
  items: LibraryItemOldJsonMinifiedObject[]
}

export interface AuthorOldJsonExpandedObject extends AuthorOldJsonObject {
  numBooks: number
  series?: (SeriesOldJsonObject | AuthorSeriesMapItem)[]
  libraryItems?: LibraryItemOldJsonMinifiedObject[]
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
  rssFeed?: FeedOldJsonObject | null
  books?: (BookOldJsonObject | BookOldJsonMinifiedObject)[]
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
  session: PlaybackSessionOldJsonObject | null
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
  mediaProgress?: MediaProgressOldJsonObject[]
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
  latestSession?: PlaybackSessionOldJsonObject | null
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

export interface MediaProgressOldJsonObject {
  id: string
  userId: string
  libraryItemId: string | null
  episodeId: string | null
  mediaItemId: string
  mediaItemType: string
  duration: number
  progress: number
  currentTime: number
  isFinished: boolean
  hideFromContinueListening: boolean
  ebookLocation: string | null
  ebookProgress: number | null
  lastUpdate: number
  startedAt: number
  finishedAt: number | null
  displayTitle?: string | null
  displaySubtitle?: string | null
  coverPath?: string | null
  mediaUpdatedAt?: Date | number | null
}

// ==========================================
// 6. Podcast & PodcastEpisode DTOs
// ==========================================

export interface PodcastEpisodeExtraData {
  guid?: string | null
  oldEpisodeId?: string | null
}

export interface PodcastEpisodeEnclosure {
  url: string
  type: string | null
  length: string | null
}

export interface PodcastEpisodeOldJsonObject {
  libraryItemId: string
  podcastId: string
  id: string
  oldEpisodeId: string | null
  index: number | null
  season: string | null
  episode: string | null
  episodeType: string | null
  title: string | null
  subtitle: string | null
  description: string | null
  enclosure: PodcastEpisodeEnclosure | null
  guid: string | null
  pubDate: string | null
  chapters: ChapterObject[] | null
  audioFile: AudioFileObject | null
  publishedAt: number | null
  addedAt: number
  updatedAt: number
}

export interface PodcastEpisodeOldJsonExpandedObject extends PodcastEpisodeOldJsonObject {
  audioTrack: AudioTrack | null
  size: number
  duration: number
}

export interface PodcastAbsMetadataJsonObject {
  tags: string[]
  title: string
  author: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  feedURL: string | null
  imageURL: string | null
  itunesPageURL: string | null
  itunesId: string | null
  itunesArtistId: string | null
  asin?: string | null
  language: string | null
  explicit: boolean
  podcastType: string | null
}

export interface PodcastOldMetadataJsonObject {
  title: string
  author: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  feedUrl: string | null
  imageUrl: string | null
  itunesPageUrl: string | null
  itunesId: string | null
  itunesArtistId: string | null
  explicit: boolean
  language: string | null
  type: string | null
}

export interface PodcastOldMetadataExpandedJsonObject extends PodcastOldMetadataJsonObject {
  titleIgnorePrefix: string
}

export interface PodcastOldJsonObject {
  id: string
  libraryItemId: string
  metadata: PodcastOldMetadataJsonObject
  coverPath: string | null
  tags: string[]
  episodes: PodcastEpisodeOldJsonObject[]
  autoDownloadEpisodes: boolean
  autoDownloadSchedule: string | null
  lastEpisodeCheck: number | null
  maxEpisodesToKeep: number
  maxNewEpisodesToDownload: number
}

export interface PodcastOldJsonMinifiedObject {
  id: string
  metadata: PodcastOldMetadataExpandedJsonObject
  coverPath: string | null
  tags: string[]
  numEpisodes: number
  autoDownloadEpisodes: boolean
  autoDownloadSchedule: string | null
  lastEpisodeCheck: number | null
  maxEpisodesToKeep: number
  maxNewEpisodesToDownload: number
  size: number
}

export interface PodcastOldJsonExpandedObject extends PodcastOldJsonMinifiedObject {
  libraryItemId: string
  episodes: PodcastEpisodeOldJsonExpandedObject[]
}

// ==========================================
// 7. PlaybackSession DTOs
// ==========================================

export interface DeviceInfoObject {
  id: string | null
  userId: string | null
  deviceId: string | null
  ipAddress: string | null
  browserName: string | null
  browserVersion: string | null
  osName: string | null
  osVersion: string | null
  deviceType: string | null
  clientVersion: string | null
  manufacturer: string | null
  model: string | null
  sdkVersion: string | null
  clientName: string | null
  deviceName: string | null
}

export interface PlaybackSessionExtraData {
  libraryItemId?: string | null
}

export interface PlaybackSessionMediaMetadata {
  title?: string | null
  subtitle?: string | null
  author?: string | null
  authors?: BookAuthorMetadataObject[]
  narrators?: string[]
  series?: BookSeriesMetadataObject[]
  genres?: string[]
  publishedYear?: string | null
  publishedDate?: string | null
  publisher?: string | null
  description?: string | null
  isbn?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean
  abridged?: boolean
  feedUrl?: string | null
  imageUrl?: string | null
  itunesPageUrl?: string | null
  itunesId?: string | null
  itunesArtistId?: string | null
  type?: string | null
}

export interface PlaybackSessionOldJsonObject {
  id: string
  userId: string
  libraryId: string | null
  libraryItemId: string | null
  bookId: string | null
  episodeId: string | null
  mediaType: string
  mediaMetadata: PlaybackSessionMediaMetadata | null
  chapters: ChapterObject[] | null
  displayTitle: string | null
  displayAuthor: string | null
  coverPath: string | null
  duration: number | null
  playMethod: number | null
  mediaPlayer: string | null
  deviceInfo: DeviceInfoObject | null
  serverVersion: string | null
  date: string | null
  dayOfWeek: string | null
  timeListening: number | null
  startTime: number | null
  currentTime: number
  startedAt: number | null
  updatedAt: number | null
}

export interface PlaybackSessionForClientObject extends PlaybackSessionOldJsonObject {
  audioTracks: AudioTrack[]
  libraryItem: LibraryItemOldJsonExpandedObject | null
  coverAspectRatio?: number
}

// ==========================================
// 8. Feed & FeedEpisode DTOs
// ==========================================

export interface FeedEpisodeEnclosure {
  url: string | null
  size: number | null
  type: string | null
}

export interface FeedEpisodeOldJsonObject {
  id: string
  title: string | null
  description: string | null
  enclosure: FeedEpisodeEnclosure
  pubDate: string | null
  link: string | null
  author: string | null
  explicit: boolean
  duration: number | null
  season: string | null
  episode: string | null
  episodeType: string | null
  fullPath: string | null
}

export interface FeedEpisodeCustomElement {
  [tag: string]: string | number | boolean | { _cdata: string } | null | undefined
}

export interface FeedEpisodeRssData {
  title: string | null
  description: string
  url: string
  guid: string
  author: string | null
  date: string | null
  enclosure: {
    url: string
    type: string | null
    size: number | null
  }
  custom_elements: FeedEpisodeCustomElement[]
}

export interface FeedMetaJsonObject {
  title: string
  description: string | null
  author: string | null
  imageUrl: string | null
  feedUrl: string
  link: string | null
  explicit: boolean
  type: string | null
  language: string | null
  preventIndexing: boolean
  ownerName: string | null
  ownerEmail: string | null
}

export interface FeedMinifiedMetaJsonObject {
  title: string
  description: string | null
  preventIndexing: boolean
  ownerName: string | null
  ownerEmail: string | null
}

export interface FeedOldJsonObject {
  id: string
  slug: string
  userId: string | null
  entityType: string
  entityId: string
  entityUpdatedAt: number | null
  coverPath: string | null
  meta: FeedMetaJsonObject
  serverAddress: string
  feedUrl: string
  episodes: FeedEpisodeOldJsonObject[]
  createdAt: number
  updatedAt: number
}

export interface FeedOldJsonMinifiedObject {
  id: string
  entityType: string
  entityId: string
  feedUrl: string
  meta: FeedMinifiedMetaJsonObject
}

// ==========================================
// 9. LibraryItem DTOs
// ==========================================

export interface LibraryFileObject {
  ino: string
  isSupplementary?: boolean
  addedAt: number
  updatedAt: number
  fileType?: string
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

export interface LibraryItemExtraData {
  oldLibraryItemId?: string | null
}

export interface LibraryItemOldJsonObject {
  id: string
  ino: string | null
  oldLibraryItemId: string | null
  libraryId: string
  folderId: string | null
  path: string
  relPath: string
  isFile: boolean
  mtimeMs?: number
  ctimeMs?: number
  birthtimeMs?: number
  addedAt: number
  updatedAt: number
  lastScan?: number
  scanVersion?: string | null
  isMissing: boolean
  isInvalid: boolean
  mediaType: string
  media: BookOldJsonObject | PodcastOldJsonObject
  libraryFiles: LibraryFileObject[]
}

export interface LibraryItemOldJsonMinifiedObject {
  id: string
  ino: string | null
  oldLibraryItemId: string | null
  libraryId: string
  folderId: string | null
  path: string
  relPath: string
  isFile: boolean
  mtimeMs?: number
  ctimeMs?: number
  birthtimeMs?: number
  addedAt: number
  updatedAt: number
  isMissing: boolean
  isInvalid: boolean
  mediaType: string
  media: BookOldJsonMinifiedObject | PodcastOldJsonMinifiedObject
  numFiles: number
  size: number | bigint | null | undefined
  collapsedSeries?: SeriesMinimalJsonObject | null
  rssFeed?: FeedOldJsonObject | null
  numEpisodesIncomplete?: number
  mediaItemShare?: MediaItemShareOldJsonObject | null
}

export interface LibraryItemOldJsonExpandedObject extends Omit<LibraryItemOldJsonMinifiedObject, 'media'> {
  lastScan?: number
  scanVersion?: string | null
  media?: BookOldJsonExpandedObject | PodcastOldJsonExpandedObject
  libraryFiles: LibraryFileObject[]
}

export interface PersonalizedShelf {
  id: string
  label: string
  labelStringKey: string
  type: string
  entities: (
    | BookOldJsonObject
    | AuthorOldJsonObject
    | AuthorOldJsonExpandedObject
    | SeriesOldJsonObject
    | LibraryItemOldJsonObject
    | LibraryItemOldJsonMinifiedObject
  )[]
  total?: number
  category?: string
}

export interface LibraryFilterOptions {
  limit?: number
  page?: number
  sort?: string
  desc?: number | boolean
  filter?: string
  search?: string
  minified?: boolean
  collapseSeries?: boolean
  include?: string
  [key: string]: unknown
}

// ==========================================
// 10. OPF Metadata Parser Interfaces
// ==========================================

export interface MetadataCreatorObject {
  value: string
  role: string | null
  fileAs: string | null
}

export interface OpfSeries {
  name: string
  sequence: string | null
}

export interface OpfMetadata {
  title: string | null
  subtitle: string | null
  authors: string[]
  narrators: string[]
  publishedYear: string | null
  publisher: string | null
  isbn: string | null
  asin: string | null
  description: string | null
  genres: string[]
  language: string | null
  series: OpfSeries[]
  tags: string[]
}

export interface XmlAttributeNode<T = Record<string, string>> {
  _?: string
  $?: T
}

export interface XmlOpfMetaRefine {
  value?: string
  refines?: string
  property?: string
}

export interface XmlOpfMetaNode {
  _?: string
  $?: {
    name?: string
    content?: string
    refines?: string
    property?: string
    scheme?: string
    [key: string]: string | undefined
  }
}

export interface XmlOpfMetaDict {
  refines?: XmlOpfMetaRefine[]
  [key: string]: Array<string | XmlAttributeNode> | XmlOpfMetaRefine[] | undefined
}

export interface XmlOpfMetadata {
  'dc:creator'?: Array<XmlAttributeNode | string>
  'dc:date'?: Array<XmlAttributeNode | string>
  'dc:publisher'?: Array<XmlAttributeNode | string>
  'dc:identifier'?: Array<XmlAttributeNode | string>
  'dc:title'?: Array<XmlAttributeNode | string>
  'dc:subtitle'?: Array<XmlAttributeNode | string>
  'dc:description'?: Array<XmlAttributeNode | string>
  'dc:subject'?: Array<XmlAttributeNode | string>
  'dc:language'?: Array<XmlAttributeNode | string>
  'dc:tag'?: Array<XmlAttributeNode | string>
  meta?: XmlOpfMetaDict | XmlOpfMetaNode[]
  [key: string]:
    | Array<XmlAttributeNode | string>
    | XmlOpfMetaDict
    | XmlOpfMetaNode[]
    | undefined
}

export interface XmlOpfPackageNode {
  metadata?: XmlOpfMetadata | XmlOpfMetadata[]
  [key: string]: XmlOpfMetadata | XmlOpfMetadata[] | undefined
}

export interface XmlOpfPackage {
  package?: XmlOpfPackageNode
  [key: string]: XmlOpfPackageNode | undefined
}

// ==========================================
// 11. RSS Feed Parser & Utility Interfaces
// ==========================================

export interface XmlRssCategory {
  $?: {
    text?: string
    [key: string]: string | undefined
  }
  'itunes:category'?: XmlRssCategory[]
}

export interface XmlRssTextNode {
  _?: string
  $?: Record<string, string>
}

export type XmlRssValue = string | XmlRssTextNode | Record<string, string>

export interface XmlRssItem {
  title?: XmlRssValue[]
  description?: XmlRssValue[]
  pubDate?: XmlRssValue[]
  guid?: XmlRssValue[]
  link?: XmlRssValue[]
  enclosure?: Array<{ $?: { url: string; type?: string; length?: string } }>
  'media:content'?: Array<{ $?: { url: string; type?: string; length?: string } }>
  'content:encoded'?: XmlRssValue[]
  'podcast:chapters'?: Array<{ $?: { url?: string; type?: string } }>
  'itunes:episodeType'?: XmlRssValue[]
  'itunes:season'?: XmlRssValue[]
  'itunes:episode'?: XmlRssValue[]
  'itunes:author'?: XmlRssValue[]
  'itunes:duration'?: XmlRssValue[]
  'itunes:explicit'?: XmlRssValue[]
  'itunes:subtitle'?: XmlRssValue[]
  'psc:chapters'?: Array<{ 'psc:chapter'?: Array<{ $?: { title?: string; start?: string } }> }>
  [key: string]:
    | XmlRssValue[]
    | Array<{ $?: { url: string; type?: string; length?: string } }>
    | Array<{ $?: { url?: string; type?: string } }>
    | Array<{ 'psc:chapter'?: Array<{ $?: { title?: string; start?: string } }> }>
    | undefined
}

export interface XmlRssChannel {
  title?: XmlRssValue[]
  description?: XmlRssValue[]
  language?: XmlRssValue[]
  pubDate?: XmlRssValue[]
  link?: XmlRssValue[]
  image?: { url?: string[] }
  item?: XmlRssItem[]
  'itunes:image'?: Array<{ $?: { href?: string } }>
  'itunes:category'?: XmlRssCategory[]
  'itunes:new-feed-url'?: XmlRssValue[]
  'itunes:explicit'?: XmlRssValue[]
  'itunes:author'?: XmlRssValue[]
  'itunes:type'?: XmlRssValue[]
  'atom:link'?: Array<{ $?: { href?: string; [key: string]: string | undefined } }>
  [key: string]:
    | XmlRssValue[]
    | XmlRssItem[]
    | XmlRssCategory[]
    | { url?: string[] }
    | Array<{ $?: { href?: string } }>
    | Array<{ $?: { href?: string; [key: string]: string | undefined } }>
    | undefined
}

export interface XmlRssFeed {
  channel?: XmlRssChannel[]
  [key: string]: XmlRssChannel[] | undefined
}

// ==========================================
// 12. Media Prober & Probe Data Interfaces
// ==========================================

export interface FfprobeRawStream {
  index?: number
  codec_type?: string
  codec_name?: string
  codec_long_name?: string
  codec_time_base?: string
  time_base?: string
  bit_rate?: string | number
  sample_rate?: string | number
  channel_layout?: string
  channels?: number
  profile?: string
  is_avc?: string | boolean
  pix_fmt?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  width?: string | number
  height?: string | number
  color_range?: string
  color_space?: string
  color_transfer?: string
  color_primaries?: string
  disposition?: { default?: number | string }
  tags?: Record<string, string>
  [key: string]:
    | string
    | number
    | boolean
    | Record<string, string>
    | { default?: number | string }
    | undefined
}

export interface FfprobeRawFormat {
  name?: string
  format_long_name?: string
  size?: string | number
  duration?: string | number
  bit_rate?: string | number
  tags?: Record<string, string>
  [key: string]: string | number | Record<string, string> | undefined
}

export interface FfprobeRawChapter {
  id?: number
  title?: string
  'TAG:title'?: string
  time_base?: string
  start?: string | number
  start_time?: string | number
  end?: string | number
  end_time?: string | number
  tags?: { title?: string }
}

export interface FfprobeRawOutput {
  streams?: FfprobeRawStream[]
  format?: FfprobeRawFormat
  chapters?: FfprobeRawChapter[]
  error?: { string?: string }
}

// ==========================================
// 13. Controller & Manager Request/Response DTOs
// ==========================================

export interface ClientDeviceInfoPayload {
  deviceId?: string | null
  clientVersion?: string | null
  manufacturer?: string | null
  model?: string | null
  sdkVersion?: string | number | null
  clientName?: string | null
  deviceName?: string | null
}

export interface CreateUserPayload {
  username?: string
  password?: string
  type?: string
  email?: string | null
  isActive?: boolean
  isLocked?: boolean
  permissions?: Partial<UserPermissionsObject>
  librariesAccessible?: string[]
  itemTagsSelected?: string[]
}

export interface UpdateUserPayload {
  id?: string
  pash?: string
  token?: string
  extraData?: UserExtraData
  bookmarks?: AudioBookmarkObject[]
  username?: string
  password?: string
  type?: string
  email?: string | null
  isActive?: boolean
  isLocked?: boolean
  permissions?: Partial<UserPermissionsObject>
  librariesAccessible?: string[]
  itemTagsSelected?: string[]
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | UserExtraData
    | AudioBookmarkObject[]
    | Partial<UserPermissionsObject>
    | string[]
}

export interface UserListeningStatsItem {
  timeListening: number
  [key: string]: string | number | boolean | null | undefined
}

export interface UserListeningStatsResponse {
  totalTime: number
  items: Record<string, UserListeningStatsItem>
  days: Record<string, number>
  dayOfWeek: Record<string, number>
  today: number
  recentSessions: PlaybackSessionOldJsonObject[]
}

export interface UpdateAuthorPayload {
  name?: string | null
  description?: string | null
  asin?: string | null
  [key: string]: string | null | undefined
}

export interface UpdatePodcastEpisodePayload {
  title?: string
  subtitle?: string
  description?: string
  pubDate?: string
  episode?: string
  season?: string
  episodeType?: string
  enclosure?: { url?: string; type?: string | null; length?: number | null } | null
  chapters?: ChapterObject[]
  publishedAt?: number
  [key: string]:
    | string
    | number
    | ChapterObject[]
    | { url?: string; type?: string | null; length?: number | null }
    | null
    | undefined
}

export interface RssFeedMetadataDetails {
  preventIndexing?: boolean
  ownerName?: string | null
  ownerEmail?: string | null
}

export interface RssFeedRequestOptions {
  serverAddress?: string
  slug?: string
  metadataDetails?: RssFeedMetadataDetails
  [key: string]: string | boolean | RssFeedMetadataDetails | undefined
}

export interface BinaryAssetInfo {
  bin?: Record<string, Record<string, string>>
  [key: string]:
    | string
    | number
    | boolean
    | Record<string, Record<string, string>>
    | undefined
}

// ==========================================
// 13. Peripheral Subsystem DTOs
// ==========================================

export interface MediaItemShareExtraData {
  playbackSessionId?: string | null
  [key: string]: string | number | boolean | null | undefined
}

export interface MediaItemShareOldJsonObject {
  id: string
  mediaItemId: string
  mediaItemType: string
  slug: string
  expiresAt: Date | string | null
  createdAt: Date | string | number
  updatedAt: Date | string | number
  isDownloadable: boolean
}

export interface MediaItemShareForClientObject extends MediaItemShareOldJsonObject {}

export interface CollectionOldJsonObject {
  id: string
  libraryId: string
  name: string
  description: string | null
  books: string[]
  lastUpdate: number
  createdAt: number
}

export interface CollectionOldJsonExpandedObject extends Omit<CollectionOldJsonObject, 'books'> {
  books: LibraryItemOldJsonExpandedObject[]
  rssFeed?: FeedOldJsonObject | null
}

export interface PlaylistOldJsonObject {
  id: string
  name: string
  libraryId: string
  userId: string
  description: string | null
  lastUpdate: number
  createdAt: number
}

export interface PlaylistItemBookObject {
  libraryItemId: string
  libraryItem: LibraryItemOldJsonExpandedObject
}

export interface PlaylistItemEpisodeObject {
  episodeId: string
  episode: PodcastEpisodeOldJsonExpandedObject
  libraryItemId: string
  libraryItem: LibraryItemOldJsonMinifiedObject
}

export type PlaylistItemObject = PlaylistItemBookObject | PlaylistItemEpisodeObject

export interface PlaylistOldJsonExpandedObject extends PlaylistOldJsonObject {
  items: PlaylistItemObject[]
}

export interface DeviceExtraData {
  manufacturer?: string | null
  model?: string | null
  osName?: string | null
  osVersion?: string | null
  browserName?: string | null
}

export interface DeviceOldJsonObject {
  id: string
  deviceId: string
  userId: string
  ipAddress: string | null
  browserName: string | null
  browserVersion: string | null
  osName: string | null
  osVersion: string | null
  clientVersion: string | null
  manufacturer: string | null
  model: string | null
  sdkVersion: string | null
  deviceName: string | null
  clientName: string | null
}

export interface ApiKeyPermissions {
  download: boolean
  update: boolean
  delete: boolean
  upload: boolean
  createEreader: boolean
  accessAllLibraries: boolean
  accessAllTags: boolean
  accessExplicitContent: boolean
  selectedTagsNotAccessible: boolean
  librariesAccessible: string[]
  itemTagsSelected: string[]
}

export interface ApiKeyOldJsonObject {
  id: string
  name: string
  description: string | null
  expiresAt: Date | null
  lastUsedAt: Date | null
  isActive: boolean
  permissions: ApiKeyPermissions
  createdAt: Date
  updatedAt: Date
  userId: string
  createdByUserId: string | null
}

export interface CustomMetadataProviderExtraData {
  [key: string]: string | number | boolean | null | undefined
}

export interface ClientCustomMetadataProviderObject {
  id: string
  name: string
  mediaType: string
  slug: string
}

export interface SettingValueObject {
  id: string
  [key: string]: string | number | boolean | null | undefined | unknown[] | object
}

