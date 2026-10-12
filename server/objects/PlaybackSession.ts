import { v4 as uuidv4 } from 'uuid'
import date from '../libs/dateAndTime'
import packageJson from '../../package.json'
import DeviceInfo from './DeviceInfo'
import AudioTrackClass from './files/AudioTrack'
import type Stream from './Stream'
import type LibraryItem from '../models/LibraryItem'
import type Book from '../models/Book'
import type Podcast from '../models/Podcast'
import type {
  ChapterObject,
  DeviceInfoObject,
  PlaybackSessionMediaMetadata,
  PlaybackSessionOldJsonObject,
  PlaybackSessionForClientObject,
  AudioTrack
} from '../types'

const serverVersion = packageJson.version

class PlaybackSession {
  id = ''
  userId = ''
  libraryId: string | null = null
  libraryItemId: string | null = null
  bookId: string | null = null
  episodeId: string | null = null

  mediaType: string | null = null
  mediaMetadata: PlaybackSessionMediaMetadata | null = null
  chapters: ChapterObject[] | null = null
  displayTitle: string | null = null
  displayAuthor: string | null = null
  coverPath: string | null = null
  duration: number | null = null

  playMethod: number | null = null
  mediaPlayer: string | null = null
  deviceInfo: DeviceInfo | null = null
  serverVersion: string | null = null

  date: string | null = null
  dayOfWeek: string | null = null

  timeListening: number | null = null
  startTime: number | null = null
  currentTime = 0

  startedAt: number | null = null
  updatedAt = 0

  // Not saved in DB
  lastSave = 0
  audioTracks: (AudioTrack | AudioTrackClass)[] = []
  stream: Stream | null = null
  shareSessionId: string | null = null
  mediaItemShareId: string | null = null
  coverAspectRatio: number | null = null

  constructor(session?: Partial<PlaybackSessionOldJsonObject> | null) {
    if (session) {
      this.construct(session)
    }
  }

  toJSON(): PlaybackSessionOldJsonObject {
    return {
      id: this.id,
      userId: this.userId,
      libraryId: this.libraryId || '',
      libraryItemId: this.libraryItemId || '',
      bookId: this.bookId || null,
      episodeId: this.episodeId || null,
      mediaType: this.mediaType || '',
      mediaMetadata: this.mediaMetadata ? structuredClone(this.mediaMetadata) : null,
      chapters: (this.chapters || []).map((c) => ({ ...c })),
      displayTitle: this.displayTitle || null,
      displayAuthor: this.displayAuthor || null,
      coverPath: this.coverPath || null,
      duration: this.duration || null,
      playMethod: this.playMethod || null,
      mediaPlayer: this.mediaPlayer || null,
      deviceInfo: this.deviceInfo?.toJSON() || null,
      serverVersion: this.serverVersion || null,
      date: this.date || null,
      dayOfWeek: this.dayOfWeek || null,
      timeListening: this.timeListening || null,
      startTime: this.startTime || null,
      currentTime: this.currentTime,
      startedAt: this.startedAt || null,
      updatedAt: this.updatedAt
    }
  }

  toJSONForClient(libraryItem?: LibraryItem | null): PlaybackSessionForClientObject {
    return {
      id: this.id,
      userId: this.userId,
      libraryId: this.libraryId || '',
      libraryItemId: this.libraryItemId || '',
      bookId: this.bookId || null,
      episodeId: this.episodeId || null,
      mediaType: this.mediaType || '',
      mediaMetadata: this.mediaMetadata ? structuredClone(this.mediaMetadata) : null,
      chapters: (this.chapters || []).map((c) => ({ ...c })),
      displayTitle: this.displayTitle || null,
      displayAuthor: this.displayAuthor || null,
      coverPath: this.coverPath || null,
      duration: this.duration || null,
      playMethod: this.playMethod || null,
      mediaPlayer: this.mediaPlayer || null,
      deviceInfo: this.deviceInfo?.toJSON() || null,
      serverVersion: this.serverVersion || null,
      date: this.date || null,
      dayOfWeek: this.dayOfWeek || null,
      timeListening: this.timeListening || null,
      startTime: this.startTime || null,
      currentTime: this.currentTime,
      startedAt: this.startedAt || null,
      updatedAt: this.updatedAt,
      audioTracks: this.audioTracks.map((at) => (at instanceof AudioTrackClass ? at.toJSON() : { ...at })),
      libraryItem: libraryItem?.toOldJSONExpanded() || null,
      coverAspectRatio: this.coverAspectRatio !== null ? this.coverAspectRatio : undefined
    }
  }

  construct(session: Partial<PlaybackSessionOldJsonObject>): void {
    this.id = session.id || ''
    this.userId = session.userId || ''
    this.libraryId = session.libraryId || null
    this.libraryItemId = session.libraryItemId ?? null
    this.bookId = session.bookId || null
    this.episodeId = session.episodeId ?? null
    this.mediaType = session.mediaType ?? null
    this.duration = session.duration ?? null
    this.playMethod = session.playMethod ?? null
    this.mediaPlayer = session.mediaPlayer || null

    if (this.libraryId?.startsWith('lib_')) {
      this.libraryId = null
    }
    if (this.libraryItemId?.startsWith('li_') || this.libraryItemId?.startsWith('local_')) {
      this.libraryItemId = null
    }
    if (this.episodeId?.startsWith('ep_') || this.episodeId?.startsWith('local_')) {
      this.episodeId = null
    }

    if (session.deviceInfo instanceof DeviceInfo) {
      this.deviceInfo = new DeviceInfo(session.deviceInfo.toJSON())
    } else if (session.deviceInfo) {
      this.deviceInfo = new DeviceInfo(session.deviceInfo as DeviceInfoObject)
    } else {
      this.deviceInfo = null
    }

    this.serverVersion = session.serverVersion ?? null
    this.chapters = session.chapters ? session.chapters.map((c) => ({ ...c })) : []

    this.mediaMetadata = session.mediaMetadata ? structuredClone(session.mediaMetadata) : null
    this.displayTitle = session.displayTitle || ''
    this.displayAuthor = session.displayAuthor || ''
    this.coverPath = session.coverPath ?? null
    this.date = session.date ?? null
    this.dayOfWeek = session.dayOfWeek ?? null

    this.timeListening = session.timeListening || null
    this.startTime = session.startTime || 0
    this.currentTime = session.currentTime || 0

    this.startedAt = session.startedAt ?? null
    this.updatedAt = session.updatedAt || session.startedAt || 0

    if (!this.date && session.updatedAt) {
      this.date = date.format(new Date(session.updatedAt), 'YYYY-MM-DD')
      this.dayOfWeek = date.format(new Date(session.updatedAt), 'dddd')
    }
  }

  get mediaItemId(): string | null {
    if (this.episodeId) return `${this.libraryItemId}-${this.episodeId}`
    return this.libraryItemId
  }

  get progress(): number {
    if (!this.duration) return 0
    return Math.max(0, Math.min(this.currentTime / this.duration, 1))
  }

  get deviceId(): string | null | undefined {
    return this.deviceInfo?.id
  }

  get deviceDescription(): string {
    if (!this.deviceInfo) return 'No Device Info'
    return this.deviceInfo.deviceDescription
  }

  get mediaProgressObject(): {
    duration: number | null
    currentTime: number
    progress: number
    lastUpdate: number | null
  } {
    return {
      duration: this.duration,
      currentTime: this.currentTime,
      progress: this.progress,
      lastUpdate: this.updatedAt
    }
  }

  setData(
    libraryItem: LibraryItem,
    userId: string,
    mediaPlayer: string,
    deviceInfo: DeviceInfo,
    startTime: number,
    episodeId: string | null = null
  ): void {
    this.id = uuidv4()
    this.userId = userId
    this.libraryId = libraryItem.libraryId
    this.libraryItemId = libraryItem.id
    this.bookId = episodeId ? null : (libraryItem.media as Book).id
    this.episodeId = episodeId
    this.mediaType = libraryItem.mediaType
    if (libraryItem.mediaType === 'podcast') {
      const podcast = libraryItem.media as Podcast
      this.chapters = podcast.getChapters(episodeId || '')
      this.displayTitle = podcast.getPlaybackTitle(episodeId || '')
      this.duration = podcast.getPlaybackDuration(episodeId || '')
      this.displayAuthor = podcast.getPlaybackAuthor()
      this.coverPath = podcast.coverPath
      this.mediaMetadata = podcast.oldMetadataToJSON()
    } else {
      const book = libraryItem.media as Book
      this.chapters = book.getChapters()
      this.displayTitle = book.getPlaybackTitle()
      this.duration = book.getPlaybackDuration()
      this.displayAuthor = book.getPlaybackAuthor()
      this.coverPath = book.coverPath
      this.mediaMetadata = book.oldMetadataToJSON()
    }

    this.mediaPlayer = mediaPlayer
    this.deviceInfo = deviceInfo || new DeviceInfo()
    this.serverVersion = serverVersion

    this.timeListening = 0
    this.startTime = startTime
    this.currentTime = startTime

    this.date = date.format(new Date(), 'YYYY-MM-DD')
    this.dayOfWeek = date.format(new Date(), 'dddd')
    this.startedAt = Date.now()
    this.updatedAt = Date.now()
  }

  addListeningTime(timeListened: number | string): void {
    if (!timeListened || isNaN(Number(timeListened))) return

    if (!this.date) {
      this.date = date.format(new Date(), 'YYYY-MM-DD')
      this.dayOfWeek = date.format(new Date(), 'dddd')
    }

    this.timeListening = (this.timeListening || 0) + Number.parseFloat(String(timeListened))
    this.updatedAt = Date.now()
  }
}

export = PlaybackSession
