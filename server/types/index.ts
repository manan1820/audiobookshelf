export interface LogObject {
  timestamp: string
  source: string
  message: string
  levelName: string
  level: number
}

export interface SocketListener {
  id: string
  socket: {
    emit(event: string, data: unknown): void
  }
  level: number
}

export interface ILogManager {
  logToFile(logObj: LogObject): Promise<void>
}

export type AvailabilityOption = 'adminOrUp' | 'userOrUp' | 'guestOrUp' | 'specificUsers'

export interface EreaderDeviceObject {
  name: string
  email: string
  availabilityOption: AvailabilityOption
  users: string[]
}

export interface IUserAccess {
  id: string
  isAdminOrUp?: boolean
  isUser?: boolean
}

export interface SeriesSequence {
  name: string
  sequence: string | null
}

export interface BookMetadataObject {
  title?: string | null
  subtitle?: string | null
  authors?: string[]
  narrators?: string[]
  series?: SeriesSequence[]
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
}

export interface EBookFileObject {
  ino?: string
  ebookFormat: string
  addedAt?: number
  updatedAt?: number
  metadata: {
    filename?: string
    ext?: string
    path: string
    relPath?: string
    size?: number
    mtimeMs?: number
    ctimeMs?: number
    birthtimeMs?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface EBookFileScanData {
  path: string
  ebookFormat: string
  ebookCoverPath?: string
  metadata: BookMetadataObject | null
}

export interface DeviceInfoJSON {
  id?: string | null
  userId?: string | null
  deviceId?: string | null
  ipAddress?: string | null
  browserName?: string | null
  browserVersion?: string | null
  osName?: string | null
  osVersion?: string | null
  deviceType?: string | null
  clientVersion?: string | null
  manufacturer?: string | null
  model?: string | null
  sdkVersion?: string | null
  clientName?: string | null
  deviceName?: string | null
}

export interface ClientDeviceInfo {
  deviceId?: string
  clientVersion?: string
  manufacturer?: string
  model?: string
  sdkVersion?: string | number
  clientName?: string
}

export interface UserAgentParsed {
  browser?: {
    name?: string
    version?: string
  }
  os?: {
    name?: string
    version?: string
  }
  device?: {
    type?: string
  }
}

export interface TaskString {
  text: string
  key?: string
  subs?: string[]
}

export interface TaskJSON {
  id: string | null
  action: string | null
  data: Record<string, unknown>
  title: string | null
  titleKey: string | null
  titleSubs: string[] | null
  description: string | null
  descriptionKey: string | null
  descriptionSubs: string[] | null
  error: string | null
  errorKey: string | null
  errorSubs: string[] | null
  showSuccess: boolean
  isFailed: boolean
  isFinished: boolean
  startedAt: number | null
  finishedAt: number | null
}

export interface SmtpTransportObject {
  host: string | null
  secure: boolean
  port?: number
  auth?: {
    user: string
    pass: string
  }
  tls?: {
    rejectUnauthorized: boolean
  }
}

export interface EmailSettingsData {
  host?: string | null
  port?: number | null
  secure?: boolean
  rejectUnauthorized?: boolean
  user?: string | null
  pass?: string | null
  testAddress?: string | null
  fromAddress?: string | null
  ereaderDevices?: EreaderDeviceObject[]
}

export interface EmailSettingsJSON {
  id: string
  host: string | null
  port: number
  secure: boolean
  rejectUnauthorized: boolean
  user: string | null
  pass: string | null
  testAddress: string | null
  fromAddress: string | null
  ereaderDevices: EreaderDeviceObject[]
}

export interface ApprisePayload {
  urls: string[]
  title: string
  body: string
}

export interface NotificationPayload {
  id?: string
  libraryId?: string | null
  eventName?: string
  urls?: string[]
  titleTemplate?: string
  bodyTemplate?: string
  type?: string | null
  enabled?: boolean
}

export interface NotificationData {
  id?: string | null
  libraryId?: string | null
  eventName: string
  urls: string[]
  titleTemplate?: string
  bodyTemplate?: string
  type?: string
  enabled?: boolean
  lastFiredAt?: number | null
  lastAttemptFailed?: boolean
  numConsecutiveFailedAttempts?: number
  numTimesFired?: number
  createdAt?: number | null
}

export interface NotificationJSON {
  id: string | null
  libraryId: string | null
  eventName: string
  urls: string[]
  titleTemplate: string
  bodyTemplate: string
  enabled: boolean
  type: string
  lastFiredAt: number | null
  lastAttemptFailed: boolean
  numConsecutiveFailedAttempts: number
  numTimesFired: number
  createdAt: number | null
}

export interface NotificationSettingsData {
  appriseType?: string
  appriseApiUrl?: string | null
  notifications?: NotificationData[]
  maxFailedAttempts?: number
  maxNotificationQueue?: number
  notificationDelay?: number
}

export interface NotificationSettingsJSON {
  id: string
  appriseType: string
  appriseApiUrl: string | null
  notifications: NotificationJSON[]
  maxFailedAttempts: number
  maxNotificationQueue: number
  notificationDelay: number
}

export type TrackStartedCallback = (trackIndex: number) => void
export type ProgressCallback = (trackIndex: number, progressInTrack: number, totalProgress: number) => void
export type TrackFinishedCallback = (trackIndex: number) => void

export interface ParsedDeviceInfo {
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  model?: string
  vendor?: string
}

export interface BackupData {
  details: [string, string | number, string | number, string?]
  fullPath: string
}

export interface BackupJSON {
  id: string | null
  key: string | null
  backupDirPath: string | null
  datePretty: string | null
  fullPath: string | null
  path: string | null
  filename: string | null
  fileSize: number | null
  createdAt: number | null
  serverVersion: string | null
}

export interface DailyLogJSON {
  id: string
  dailyLogDirPath: string
  fullPath: string
  filename: string
  createdAt: number
}

export type SupportedImageType = 'png' | 'jpg' | 'jpeg' | 'webp'
export type SupportedAudioType =
  | 'm4b'
  | 'mp3'
  | 'm4a'
  | 'flac'
  | 'opus'
  | 'ogg'
  | 'oga'
  | 'mp4'
  | 'aac'
  | 'wma'
  | 'aiff'
  | 'aif'
  | 'wav'
  | 'webm'
  | 'webma'
  | 'mka'
  | 'awb'
  | 'caf'
  | 'mpg'
  | 'mpeg'
export type SupportedEbookType = 'epub' | 'pdf' | 'mobi' | 'azw3' | 'cbr' | 'cbz'
export type TextFileType = 'txt' | 'nfo'
export type MetadataFileType = 'opf' | 'abs' | 'xml' | 'json'

export interface ParsedFullName {
  title: string
  first: string
  middle: string
  last: string
  nick: string
  suffix: string
  error: string[]
}

export interface NfoMetadata {
  title?: string
  subtitle?: string
  authors?: string[]
  narrators?: string[]
  series?: string
  genres?: string[]
  tags?: string[]
  publishedYear?: string
  sequence?: string
  abridged?: boolean
  publisher?: string
  asin?: string
  isbn?: string
  language?: string
  description?: string
}

export interface AudioFileMediaMarkerInput {
  metaTags?: {
    tagOverdriveMediaMarker?: string | null
  } | null
  duration: number
}

export interface ParsedChapter {
  id: number
  start: number
  end: number
  title: string
}

export interface NotificationEventData {
  name: string
  requiresLibrary: boolean
  libraryMediaType?: string
  description: string
  descriptionKey: string
  variables: string[]
  defaults: {
    title: string
    body: string
  }
  testData: Record<string, string | number>
}

export interface NotificationDataStore {
  events: NotificationEventData[]
}

export interface FilePathItem {
  name: string
  path: string
  reldirpath: string
  fullpath: string
  extension: string
  deep: number
}

export interface FileTimestampsWithIno {
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  ino: string
}

export interface DirectoryInfo {
  path: string
  dirname: string
  level: number
}

export interface PendingFileUpdate {
  path: string
  relPath: string
  [key: string]: unknown
}

export interface FileMetadataJSON {
  filename: string | null
  ext: string | null
  path: string | null
  relPath: string | null
  size: number | null
  mtimeMs: number | null
  ctimeMs: number | null
  birthtimeMs: number | null
}

export interface LibraryFileJSON {
  ino: string | null
  metadata: FileMetadataJSON
  isSupplementary: boolean | null
  addedAt: number | null
  updatedAt: number | null
  fileType: string
}

export interface LibraryItemFilenameMetadata {
  title?: string | null
  subtitle?: string | null
  asin?: string | null
  authors?: string[]
  narrators?: string[]
  seriesName?: string | null
  seriesSequence?: string | null
  publishedYear?: string | null
}

export interface BookSeriesItem {
  id: string
  name: string
  bookSeries: {
    sequence: string
  }
}

export interface SeriesBookJson {
  id: string
  sequence?: string
  filterSeriesSequence?: string
  media: {
    duration?: number | string | null
    metadata?: Record<string, unknown>
    [key: string]: unknown
  }
  collapsedSeries?: Record<string, unknown>
  [key: string]: unknown
}

export interface SeriesGroup {
  id: string
  name: string
  nameIgnorePrefix: string
  nameIgnorePrefixSort: string
  type: string
  books: SeriesBookJson[]
  totalDuration: number
}

export interface LibraryItemLike {
  id: string
  mediaType?: string
  media: {
    id?: string
    title?: string
    titleIgnorePrefix?: string
    duration?: number | string | null
    series?: BookSeriesItem[]
    [key: string]: unknown
  }
  authorNamesFirstLast?: string | null
  authorNamesLastFirst?: string | null
  collapsedSeries?: SeriesGroup
  toOldJSONMinified(): SeriesBookJson
  [key: string]: unknown
}

export interface CollapseSubseriesPayload {
  sortBy?: string
  sortDesc?: boolean
  limit?: number
  page?: number
  total?: number
  [key: string]: unknown
}

export interface UserLike {
  checkCanAccessLibraryItem(libraryItem: unknown): boolean
  [key: string]: unknown
}

export interface LibraryLike {
  settings: {
    hideSingleBookSeries?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RssPodcastChapter {
  id: number
  title: string
  start: number
  end: number
}

export interface RssPodcastEpisodeEnclosure {
  url: string
  type?: string
  length?: string
  [key: string]: unknown
}

export interface RssPodcastEpisode {
  title: string
  subtitle: string
  description: string
  descriptionPlain: string
  pubDate: string
  episodeType: string
  season: string
  episode: string
  author: string
  duration: string
  durationSeconds: number | null
  explicit: string
  publishedAt: number | null
  enclosure: RssPodcastEpisodeEnclosure
  guid: string | null
  chaptersUrl: string | null
  chaptersType: string | null
  chapters: RssPodcastChapter[]
  [key: string]: unknown
}

export interface RssPodcastMetadata {
  title?: string
  language?: string
  explicit?: string
  author?: string
  pubDate?: string
  link?: string
  image: string | null
  categories: string[]
  feedUrl: string | null
  description: string | null
  descriptionPlain: string | null
  type: string | null
  [key: string]: unknown
}

export interface RssPodcast {
  metadata: RssPodcastMetadata
  episodes?: RssPodcastEpisode[]
  numEpisodes?: number
}

export interface ConcatAudioTrack {
  index: number
  duration: number
  metadata: {
    path: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface FFMetadataChapter {
  start: number
  end: number
  title?: string
  [key: string]: unknown
}

export interface PodcastEpisodeDownloadLike {
  url: string
  targetPath: string
  pubYear?: string | number | null
  pubDate?: string | null
  libraryItem: {
    media: {
      title?: string | null
      author?: string | null
      genres: string[]
      language?: string | null
      itunesId?: string | null
      podcastType?: string | null
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  rssPodcastEpisode: {
    title?: string | null
    subtitle?: string | null
    description?: string | null
    season?: string | null
    episode?: string | null
    episodeType?: string | null
    pubDate?: string | null
    enclosure?: {
      length?: string | number | null
      [key: string]: unknown
    } | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface LibraryItemMediaMetadataLike {
  media: {
    title?: string | null
    subtitle?: string | null
    authorName?: string | null
    genres?: string[] | null
    publishedYear?: string | number | null
    description?: string | null
    narrators?: string[] | null
    publisher?: string | null
    series?: Array<{
      name: string
      bookSeries: {
        sequence?: string | null
      }
    }> | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface MergeAudioTrack {
  index: number
  duration: number
  metadata: {
    path: string
    ext: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface AbMergeEncodeOptions {
  bitrate?: string
  codec?: string
  channels?: number
  [key: string]: unknown
}

export interface ChapterObject {
  id: number
  start: number
  end: number
  title: string
}

export interface AudioFileMetadata {
  filename: string
  ext: string
  path: string
  relPath?: string
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  [key: string]: unknown
}

export interface AudioFileObject {
  index: number | null
  ino: string
  metadata: AudioFileMetadata
  addedAt?: number | null
  updatedAt?: number | null
  trackNumFromMeta?: number | null
  discNumFromMeta?: number | null
  trackNumFromFilename?: number | null
  discNumFromFilename?: number | null
  manuallyVerified?: boolean
  exclude?: boolean
  error?: string | null
  format?: string | null
  duration?: number | null
  bitRate?: number | null
  language?: string | null
  codec?: string | null
  timeBase?: string | null
  channels?: number | null
  channelLayout?: string | null
  chapters?: ChapterObject[]
  embeddedCoverArt?: string | null
  metaTags?: Record<string, unknown> | object | null
  mimeType?: string | null
  [key: string]: unknown
}

export interface AudioTrack extends AudioFileObject {
  title: string
  contentUrl: string
  startOffset: number
}

export interface ProgressUpdatePayload {
  libraryItemId?: string
  episodeId?: string
  duration?: number
  progress?: number
  currentTime?: number
  isFinished?: boolean
  hideFromContinueListening?: boolean
  ebookLocation?: string
  ebookProgress?: number
  finishedAt?: number | string | Date | null
  lastUpdate?: number | string | Date
  markAsFinishedTimeRemaining?: number | string
  markAsFinishedPercentComplete?: number | string
  [key: string]: unknown
}

export interface FeedOptions {
  preventIndexing?: boolean
  ownerName?: string | null
  ownerEmail?: string | null
}

declare global {
  var ServerSettings: {
    sortingIgnorePrefix?: boolean
    allowIframe?: boolean
    allowedOrigins?: string[]
    authOpenIDMatchExistingBy?: string
    [key: string]: unknown
  }
}

export interface AudioBookmarkObject {
  libraryItemId: string
  title: string
  time: number
  createdAt: number
}

export interface UserPermissions {
  download?: boolean
  update?: boolean
  delete?: boolean
  upload?: boolean
  createEreader?: boolean
  accessAllLibraries?: boolean
  accessAllTags?: boolean
  accessExplicitContent?: boolean
  selectedTagsNotAccessible?: boolean
  librariesAccessible?: string[]
  itemTagsSelected?: string[]
  [key: string]: unknown
}

export interface UserExtraData {
  seriesHideFromContinueListening?: string[]
  authOpenIDSub?: string
  oldUserId?: string
  [key: string]: unknown
}

export interface OpenIdUserInfo {
  sub: string
  email?: string
  email_verified?: boolean
  preferred_username?: string
  username?: string
  name?: string
  [key: string]: unknown
}



