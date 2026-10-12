import { AudioMimeType } from '../../utils/constants'
import AudioMetaTags from '../metadata/AudioMetaTags'
import FileMetadata from '../metadata/FileMetadata'
import type LibraryFile from './LibraryFile'
import type { ChapterObject, AudioFileObject } from '../../types'
import type { AudioFileDataPayload, AudioProbeDataPayload } from '../../types/objects'

class AudioFile {
  index: number | null = null
  ino: string | null = null
  metadata: FileMetadata = new FileMetadata()
  addedAt: number | null = null
  updatedAt: number | null = null

  trackNumFromMeta: number | string | null = null
  discNumFromMeta: number | string | null = null
  trackNumFromFilename: number | string | null = null
  discNumFromFilename: number | string | null = null

  format: string | null = null
  duration: number | null = null
  bitRate: number | null = null
  language: string | null = null
  codec: string | null = null
  timeBase: string | null = null
  channels: number | null = null
  channelLayout: string | null = null
  chapters: ChapterObject[] = []
  embeddedCoverArt: string | null = null

  metaTags: AudioMetaTags | null = null

  manuallyVerified = false
  exclude = false
  error: string | null = null

  constructor(data?: AudioFileDataPayload | null) {
    if (data) {
      this.construct(data)
    }
  }

  toJSON(): AudioFileObject {
    return {
      index: this.index ?? 0,
      ino: this.ino ?? '',
      metadata: {
        filename: this.metadata.filename ?? '',
        ext: this.metadata.ext ?? '',
        path: this.metadata.path ?? '',
        relPath: this.metadata.relPath ?? '',
        size: this.metadata.size ?? 0,
        mtimeMs: this.metadata.mtimeMs ?? 0,
        ctimeMs: this.metadata.ctimeMs ?? 0,
        birthtimeMs: this.metadata.birthtimeMs ?? 0
      },
      addedAt: this.addedAt ?? 0,
      updatedAt: this.updatedAt ?? 0,
      trackNumFromMeta: this.trackNumFromMeta,
      discNumFromMeta: this.discNumFromMeta,
      trackNumFromFilename: this.trackNumFromFilename,
      discNumFromFilename: this.discNumFromFilename,
      manuallyVerified: Boolean(this.manuallyVerified),
      exclude: Boolean(this.exclude),
      error: this.error || null,
      format: this.format ?? '',
      duration: this.duration ?? 0,
      bitRate: this.bitRate ?? 0,
      language: this.language ?? null,
      codec: this.codec ?? '',
      timeBase: this.timeBase ?? '',
      channels: this.channels ?? 0,
      channelLayout: this.channelLayout ?? '',
      chapters: this.chapters,
      embeddedCoverArt: this.embeddedCoverArt,
      metaTags: this.metaTags?.toJSON() || {},
      mimeType: this.mimeType
    }
  }

  construct(data: AudioFileDataPayload): void {
    this.index = data.index ?? null
    this.ino = data.ino ?? null
    this.metadata = new FileMetadata(data.metadata || {})
    this.addedAt = data.addedAt ?? null
    this.updatedAt = data.updatedAt ?? null
    this.manuallyVerified = Boolean(data.manuallyVerified)
    this.exclude = Boolean(data.exclude)
    this.error = data.error || null

    this.trackNumFromMeta = data.trackNumFromMeta ?? null
    this.discNumFromMeta = data.discNumFromMeta ?? null
    this.trackNumFromFilename = data.trackNumFromFilename ?? null

    if (data.cdNumFromFilename !== undefined) {
      this.discNumFromFilename = data.cdNumFromFilename
    } else {
      this.discNumFromFilename = data.discNumFromFilename ?? null
    }

    this.format = data.format ?? null
    this.duration = data.duration ?? null
    this.bitRate = data.bitRate ?? null
    this.language = data.language ?? null
    this.codec = data.codec || null
    this.timeBase = data.timeBase ?? null
    this.channels = data.channels ?? null
    this.channelLayout = data.channelLayout ?? null
    this.chapters = data.chapters ? [...data.chapters] : []
    this.embeddedCoverArt = data.embeddedCoverArt || null

    this.metaTags = new AudioMetaTags(data.metaTags || {})
  }

  get mimeType(): string {
    const format = this.metadata.format.toUpperCase()
    if (format in AudioMimeType) {
      return AudioMimeType[format as keyof typeof AudioMimeType]
    } else {
      return AudioMimeType.MP3
    }
  }

  setDataFromProbe(libraryFile: LibraryFile, probeData: AudioProbeDataPayload): void {
    this.ino = libraryFile.ino || null

    if (libraryFile.metadata instanceof FileMetadata) {
      this.metadata = libraryFile.metadata.clone()
    } else {
      this.metadata = new FileMetadata(libraryFile.metadata)
    }

    this.addedAt = Date.now()
    this.updatedAt = Date.now()

    this.format = probeData.format ?? null
    this.duration = probeData.duration ?? null
    this.bitRate = probeData.bitRate || null
    this.language = probeData.language ?? null
    this.codec = probeData.codec || null
    this.timeBase = probeData.timeBase ?? null
    this.channels = probeData.channels ?? null
    this.channelLayout = probeData.channelLayout ?? null
    this.chapters = probeData.chapters ? [...probeData.chapters] : []
    this.metaTags = probeData.audioMetaTags || null
    this.embeddedCoverArt = probeData.embeddedCoverArt ?? null
  }

  syncChapters(updatedChapters: ChapterObject[]): boolean {
    if (this.chapters.length !== updatedChapters.length) {
      this.chapters = updatedChapters.map((ch) => ({ ...ch }))
      return true
    } else if (updatedChapters.length === 0) {
      if (this.chapters.length > 0) {
        this.chapters = []
        return true
      }
      return false
    }

    let hasUpdates = false
    for (let i = 0; i < updatedChapters.length; i++) {
      if (JSON.stringify(updatedChapters[i]) !== JSON.stringify(this.chapters[i])) {
        hasUpdates = true
      }
    }
    if (hasUpdates) {
      this.chapters = updatedChapters.map((ch) => ({ ...ch }))
    }
    return hasUpdates
  }

  clone(): AudioFile {
    return new AudioFile(this.toJSON())
  }

  updateFromScan(scannedAudioFile: AudioFile): boolean {
    let hasUpdated = false

    const newjson = scannedAudioFile.toJSON()

    if (this.metadata.update(newjson.metadata)) {
      hasUpdated = true
    }

    if (!this.metaTags || !this.metaTags.isEqual(scannedAudioFile.metaTags)) {
      this.metaTags = scannedAudioFile.metaTags ? scannedAudioFile.metaTags.clone() : null
      hasUpdated = true
    }

    if (this.syncChapters(newjson.chapters || [])) {
      hasUpdated = true
    }

    if (this.index !== newjson.index) {
      this.index = newjson.index
      hasUpdated = true
    }
    if (this.ino !== newjson.ino) {
      this.ino = newjson.ino
      hasUpdated = true
    }
    if (this.trackNumFromMeta !== newjson.trackNumFromMeta) {
      this.trackNumFromMeta = newjson.trackNumFromMeta ?? null
      hasUpdated = true
    }
    if (this.discNumFromMeta !== newjson.discNumFromMeta) {
      this.discNumFromMeta = newjson.discNumFromMeta ?? null
      hasUpdated = true
    }
    if (this.trackNumFromFilename !== newjson.trackNumFromFilename) {
      this.trackNumFromFilename = newjson.trackNumFromFilename ?? null
      hasUpdated = true
    }
    if (this.discNumFromFilename !== newjson.discNumFromFilename) {
      this.discNumFromFilename = newjson.discNumFromFilename ?? null
      hasUpdated = true
    }
    if (this.format !== newjson.format) {
      this.format = newjson.format ?? null
      hasUpdated = true
    }
    if (this.duration !== newjson.duration) {
      this.duration = newjson.duration ?? null
      hasUpdated = true
    }
    if (this.bitRate !== newjson.bitRate) {
      this.bitRate = newjson.bitRate ?? null
      hasUpdated = true
    }
    if (this.language !== newjson.language) {
      this.language = newjson.language ?? null
      hasUpdated = true
    }
    if (this.codec !== newjson.codec) {
      this.codec = newjson.codec ?? null
      hasUpdated = true
    }
    if (this.timeBase !== newjson.timeBase) {
      this.timeBase = newjson.timeBase ?? null
      hasUpdated = true
    }
    if (this.channels !== newjson.channels) {
      this.channels = newjson.channels ?? null
      hasUpdated = true
    }
    if (this.channelLayout !== newjson.channelLayout) {
      this.channelLayout = newjson.channelLayout ?? null
      hasUpdated = true
    }
    if (this.embeddedCoverArt !== newjson.embeddedCoverArt) {
      this.embeddedCoverArt = newjson.embeddedCoverArt ?? null
      hasUpdated = true
    }
    if (this.error !== newjson.error) {
      this.error = newjson.error ?? null
      hasUpdated = true
    }
    if (this.exclude !== Boolean(newjson.exclude)) {
      this.exclude = Boolean(newjson.exclude)
      hasUpdated = true
    }

    return hasUpdated
  }
}

export = AudioFile
