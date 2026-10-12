import FileMetadata from '../metadata/FileMetadata'
import type AudioFile from './AudioFile'
import type { AudioTrackJsonObject } from '../../types'

class AudioTrack {
  index: number | null = null
  startOffset: number | null = null
  duration: number | null = null
  title: string | null = null
  contentUrl: string | null = null
  mimeType: string | null = null
  codec: string | null = null
  metadata: FileMetadata | null = null

  toJSON(): AudioTrackJsonObject {
    return {
      index: this.index,
      startOffset: this.startOffset,
      duration: this.duration,
      title: this.title,
      contentUrl: this.contentUrl,
      mimeType: this.mimeType,
      codec: this.codec,
      metadata: this.metadata?.toJSON() || null
    }
  }

  setData(itemId: string, audioFile: AudioFile, startOffset: number): void {
    this.index = audioFile.index
    this.startOffset = startOffset
    this.duration = audioFile.duration
    this.title = audioFile.metadata.filename || ''

    this.contentUrl = `/api/items/${itemId}/file/${audioFile.ino}`
    this.mimeType = audioFile.mimeType
    this.codec = audioFile.codec || null
    this.metadata = audioFile.metadata.clone()
  }

  setFromStream(title: string, duration: number, contentUrl: string): void {
    this.index = 1
    this.startOffset = 0
    this.duration = duration
    this.title = title
    this.contentUrl = contentUrl
    this.mimeType = 'application/vnd.apple.mpegurl'
  }
}

export = AudioTrack
