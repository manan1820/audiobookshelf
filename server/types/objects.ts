import type { RssPodcastEpisode } from '../utils/podcastUtils'
import type LibraryItem from '../models/LibraryItem'
import type { DeviceInfoObject, ClientDeviceInfoPayload } from './dto'

export interface LogObject {
  timestamp: string
  source: string
  message: string
  levelName: string
  level: number
}

export interface DailyLogJsonObject {
  id: string
  dailyLogDirPath: string
  fullPath: string
  filename: string
  createdAt: number
}

export interface BackupData {
  details: (string | number)[]
  fullPath: string
}

export interface BackupJsonObject {
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

export interface NotificationPayload {
  id?: string | null
  libraryId?: string | null
  eventName?: string
  urls?: string[]
  titleTemplate?: string
  bodyTemplate?: string
  type?: string | null
  enabled?: boolean
  createdAt?: number | null
  lastFiredAt?: number | null
  lastAttemptFailed?: boolean
  numConsecutiveFailedAttempts?: number
  numTimesFired?: number
}

export interface NotificationJsonObject {
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

export interface AppriseNotificationPayload {
  urls: string[]
  title: string
  body: string
}

export interface NotificationTemplateData {
  [key: string]: string | number | boolean | null | undefined
}

export interface TaskString {
  text: string
  key?: string | null
  subs?: string[] | null
}

export interface TaskData {
  libraryItemId?: string
  libraryItemDir?: string
  itemCachePath?: string
  libraryId?: string
  libraryName?: string
  [key: string]: string | number | boolean | null | undefined
}

export interface TaskJsonObject {
  id: string | null
  action: string | null
  data: TaskData
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

export interface PodcastEpisodeDownloadClientObject {
  id: string | null
  episodeDisplayTitle: string | null
  url: string | null
  libraryItemId: string | null
  libraryId: string | null
  isFinished: boolean
  failed: boolean
  appendRandomId: boolean
  startedAt: number | null
  createdAt: number | null
  finishedAt: number | null
  podcastTitle: string | null
  podcastExplicit: boolean
  season: string | null
  episode: string | null
  episodeType: string
  publishedAt: string | number | null
  guid: string | null
}

export type TrackStartedCallback = (trackIndex: number) => void
export type ProgressCallback = (trackIndex: number, progressInTrack: number, totalProgress: number) => void
export type TrackFinishedCallback = (trackIndex: number) => void

export interface FileMetadataJsonObject {
  filename: string | null
  ext: string | null
  path: string | null
  relPath: string | null
  size: number | null
  mtimeMs: number | null
  ctimeMs: number | null
  birthtimeMs: number | null
}

export interface FileMetadataPayload {
  filename?: string | null
  ext?: string | null
  path?: string | null
  relPath?: string | null
  size?: number | null
  mtimeMs?: number | null
  ctimeMs?: number | null
  birthtimeMs?: number | null
}

export interface LibraryFileJsonObject {
  ino: string | null
  metadata: FileMetadataJsonObject
  isSupplementary: boolean | null
  addedAt: number | null
  updatedAt: number | null
  fileType: string
}

export interface LibraryFilePayload {
  ino?: string | null
  metadata?: FileMetadataPayload | FileMetadataJsonObject
  isSupplementary?: boolean | null
  addedAt?: number | null
  updatedAt?: number | null
}

export interface EBookFileJsonObject {
  ino: string | null
  metadata: FileMetadataJsonObject
  ebookFormat: string | null
  addedAt: number | null
  updatedAt: number | null
}

export interface EBookFilePayload {
  ino?: string | null
  metadata?: FileMetadataPayload | FileMetadataJsonObject
  ebookFormat?: string | null
  addedAt?: number | null
  updatedAt?: number | null
}

export interface AudioTrackJsonObject {
  index: number | null
  startOffset: number | null
  duration: number | null
  title: string | null
  contentUrl: string | null
  mimeType: string | null
  codec: string | null
  metadata: FileMetadataJsonObject | null
}

export interface AudioMetaTagsJsonObject {
  tagAlbum?: string | null
  tagAlbumSort?: string | null
  tagArtist?: string | null
  tagArtistSort?: string | null
  tagGenre?: string | null
  tagTitle?: string | null
  tagTitleSort?: string | null
  tagSeries?: string | null
  tagSeriesPart?: string | null
  tagGrouping?: string | null
  tagTrack?: string | null
  tagDisc?: string | null
  tagSubtitle?: string | null
  tagAlbumArtist?: string | null
  tagDate?: string | null
  tagComposer?: string | null
  tagPublisher?: string | null
  tagComment?: string | null
  tagDescription?: string | null
  tagEncoder?: string | null
  tagEncodedBy?: string | null
  tagIsbn?: string | null
  tagLanguage?: string | null
  tagASIN?: string | null
  tagItunesId?: string | null
  tagPodcastType?: string | null
  tagEpisodeType?: string | null
  tagOverdriveMediaMarker?: string | null
  tagOriginalYear?: string | null
  tagReleaseCountry?: string | null
  tagReleaseType?: string | null
  tagReleaseStatus?: string | null
  tagISRC?: string | null
  tagMusicBrainzTrackId?: string | null
  tagMusicBrainzAlbumId?: string | null
  tagMusicBrainzAlbumArtistId?: string | null
  tagMusicBrainzArtistId?: string | null
  [key: string]: string | number | boolean | null | undefined
}

export interface AudioMetaTagsProbePayload {
  file_tag_album?: string | null
  file_tag_albumsort?: string | null
  file_tag_artist?: string | null
  file_tag_artistsort?: string | null
  file_tag_genre?: string | null
  file_tag_title?: string | null
  file_tag_titlesort?: string | null
  file_tag_series?: string | null
  file_tag_seriespart?: string | null
  file_tag_grouping?: string | null
  file_tag_track?: string | null
  file_tag_disc?: string | null
  file_tag_subtitle?: string | null
  file_tag_albumartist?: string | null
  file_tag_date?: string | null
  file_tag_composer?: string | null
  file_tag_publisher?: string | null
  file_tag_comment?: string | null
  file_tag_description?: string | null
  file_tag_encoder?: string | null
  file_tag_encodedby?: string | null
  file_tag_isbn?: string | null
  file_tag_language?: string | null
  file_tag_asin?: string | null
  file_tag_itunesid?: string | null
  file_tag_podcasttype?: string | null
  file_tag_episodetype?: string | null
  file_tag_overdrive_media_marker?: string | null
  file_tag_originalyear?: string | null
  file_tag_releasecountry?: string | null
  file_tag_releasetype?: string | null
  file_tag_releasestatus?: string | null
  file_tag_isrc?: string | null
  file_tag_musicbrainz_trackid?: string | null
  file_tag_musicbrainz_albumid?: string | null
  file_tag_musicbrainz_albumartistid?: string | null
  file_tag_musicbrainz_artistid?: string | null
  [key: string]: string | number | boolean | null | undefined
}

export interface AudioFileDataPayload {
  index?: number | null
  ino?: string | null
  metadata?: FileMetadataPayload | null
  addedAt?: number | null
  updatedAt?: number | null
  manuallyVerified?: boolean | null
  exclude?: boolean | null
  error?: string | null
  trackNumFromMeta?: number | string | null
  discNumFromMeta?: number | string | null
  trackNumFromFilename?: number | string | null
  discNumFromFilename?: number | string | null
  cdNumFromFilename?: number | string | null
  format?: string | null
  duration?: number | null
  bitRate?: number | null
  language?: string | null
  codec?: string | null
  timeBase?: string | null
  channels?: number | null
  channelLayout?: string | null
  chapters?: import('./dto').ChapterObject[] | null
  embeddedCoverArt?: string | null
  metaTags?: Partial<AudioMetaTagsJsonObject> | null
  mimeType?: string | null
}

export interface AudioProbeDataPayload {
  format?: string | null
  duration?: number | null
  bitRate?: number | null
  language?: string | null
  codec?: string | null
  timeBase?: string | null
  channels?: number | null
  channelLayout?: string | null
  chapters?: import('./dto').ChapterObject[] | null
  audioMetaTags?: import('../objects/metadata/AudioMetaTags') | null
  embeddedCoverArt?: string | null
}

export interface EreaderDeviceObject {
  name: string
  email: string
  availabilityOption: string
  users: string[]
}

export interface EmailSettingsJsonObject {
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

export interface NotificationSettingsJsonObject {
  id: string
  appriseType: string
  appriseApiUrl: string | null
  notifications: NotificationJsonObject[]
  maxFailedAttempts: number
  maxNotificationQueue: number
  notificationDelay: number
}

export interface TranscodeOptions {
  forceAAC?: boolean
  [key: string]: string | number | boolean | null | undefined
}

export interface ServerSettingsJsonObject {
  id: string
  tokenSecret?: string | null
  scannerFindCovers: boolean
  scannerCoverProvider: string
  scannerParseSubtitle: boolean
  scannerPreferMatchedMetadata: boolean
  scannerDisableWatcher: boolean
  storeCoverWithItem: boolean
  storeMetadataWithItem: boolean
  metadataFileFormat: string
  rateLimitLoginRequests: number
  rateLimitLoginWindow: number
  allowIframe: boolean
  backupPath: string
  backupSchedule: string | boolean
  backupsToKeep: number
  maxBackupSize: number
  loggerDailyLogsToKeep: number
  loggerScannerLogsToKeep: number
  homeBookshelfView: number
  bookshelfView: number
  podcastEpisodeSchedule: string
  sortingIgnorePrefix: boolean
  sortingPrefixes: string[]
  chromecastEnabled: boolean
  dateFormat: string
  timeFormat: string
  language: string
  allowedOrigins: string[]
  logLevel: number
  version: string | null
  buildNumber: number
  authLoginCustomMessage: string | null
  authActiveAuthMethods: string[]
  authOpenIDIssuerURL: string | null
  authOpenIDAuthorizationURL: string | null
  authOpenIDTokenURL: string | null
  authOpenIDUserInfoURL: string | null
  authOpenIDJwksURL: string | null
  authOpenIDLogoutURL: string | null
  authOpenIDClientID?: string | null
  authOpenIDClientSecret?: string | null
  authOpenIDTokenSigningAlgorithm: string
  authOpenIDButtonText: string
  authOpenIDAutoLaunch: boolean
  authOpenIDAutoRegister: boolean
  authOpenIDMatchExistingBy: string | null
  authOpenIDMobileRedirectURIs?: string[]
  authOpenIDGroupClaim?: string
  authOpenIDAdvancedPermsClaim?: string
  authOpenIDSubfolderForRedirectURLs?: string | boolean
  storeCoverWithBook?: boolean
  storeMetadataWithBook?: boolean
}

export interface ServerSettingsClientObject
  extends Omit<
    ServerSettingsJsonObject,
    | 'tokenSecret'
    | 'authOpenIDClientID'
    | 'authOpenIDClientSecret'
    | 'authOpenIDMobileRedirectURIs'
    | 'authOpenIDGroupClaim'
    | 'authOpenIDAdvancedPermsClaim'
  > {
  timeZone: string
}

export interface StreamProgressPayload {
  stream: string
  percent: string
  chunks: (number | string)[]
  numSegments: number
}

export interface StreamJsonObject {
  id: string
  userId: string
  libraryItem: import('./dto').LibraryItemOldJsonExpandedObject
  episode: import('./dto').PodcastEpisodeOldJsonExpandedObject | null
  segmentLength: number
  playlistPath: string
  clientPlaylistUri: string
  startTime: number
  segmentStartNumber: number
  isTranscodeComplete: boolean
}
