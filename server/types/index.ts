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

export interface DeviceInfoJSON {
  id?: string
  userId?: string
  deviceId?: string
  ipAddress?: string
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  clientVersion?: string
  manufacturer?: string
  model?: string
  sdkVersion?: string
  clientName?: string
  deviceName?: string
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
