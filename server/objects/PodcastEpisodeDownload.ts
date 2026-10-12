import Path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { sanitizeFilename, filePathToPOSIX } from '../utils/fileUtils'
import globals from '../utils/globals'
import type { RssPodcastEpisode } from '../utils/podcastUtils'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type { PodcastEpisodeDownloadClientObject } from '../types'

class PodcastEpisodeDownload {
  id: string | null = null
  rssPodcastEpisode: RssPodcastEpisode | null = null
  url: string | null = null
  libraryItem: LibraryItem | null = null
  libraryId: string | null = null

  isAutoDownload = false
  isFinished = false
  failed = false

  appendRandomId = false

  targetFilename: string | null = null

  startedAt: number | null = null
  createdAt: number | null = null
  finishedAt: number | null = null

  toJSONForClient(): PodcastEpisodeDownloadClientObject {
    const podcastMedia = this.libraryItem?.media as Podcast | null | undefined
    return {
      id: this.id,
      episodeDisplayTitle: this.rssPodcastEpisode?.title ?? null,
      url: this.url,
      libraryItemId: this.libraryItemId,
      libraryId: this.libraryId || null,
      isFinished: this.isFinished,
      failed: this.failed,
      appendRandomId: this.appendRandomId,
      startedAt: this.startedAt,
      createdAt: this.createdAt,
      finishedAt: this.finishedAt,
      podcastTitle: podcastMedia?.title ?? null,
      podcastExplicit: Boolean(podcastMedia?.explicit),
      season: this.rssPodcastEpisode?.season ?? null,
      episode: this.rssPodcastEpisode?.episode ?? null,
      episodeType: this.rssPodcastEpisode?.episodeType ?? 'full',
      publishedAt: this.rssPodcastEpisode?.publishedAt ?? null,
      guid: this.rssPodcastEpisode?.guid ?? null
    }
  }

  get urlFileExtension(): string {
    const cleanUrl = this.url?.split('?')[0] ?? ''
    return Path.extname(cleanUrl).substring(1).toLowerCase()
  }

  get fileExtension(): string {
    const extname = this.urlFileExtension
    if (globals.SupportedAudioTypes.includes(extname)) return extname
    return 'mp3'
  }

  get enclosureType(): string | null {
    const enclosureType = this.rssPodcastEpisode?.enclosure?.type
    return typeof enclosureType === 'string' ? enclosureType : null
  }

  get episodeTitle(): string {
    return this.rssPodcastEpisode?.title ?? ''
  }

  get targetPath(): string {
    if (!this.libraryItem || !this.targetFilename) return ''
    return filePathToPOSIX(Path.join(this.libraryItem.path, this.targetFilename))
  }

  get targetRelPath(): string {
    return this.targetFilename ?? ''
  }

  get libraryItemId(): string | null {
    return this.libraryItem?.id || null
  }

  get pubYear(): number | null {
    if (!this.rssPodcastEpisode?.publishedAt) return null
    return new Date(this.rssPodcastEpisode.publishedAt).getFullYear()
  }

  getSanitizedFilename(title: string): string {
    const appendage = this.appendRandomId && this.id ? ` (${this.id})` : ''
    const filename = `${title.trim()}${appendage}.${this.fileExtension}`
    const sanitized = sanitizeFilename(filename)
    return sanitized || filename
  }

  setAppendRandomId(appendRandomId: boolean): void {
    this.appendRandomId = appendRandomId
    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode?.title || '')
  }

  setData(rssPodcastEpisode: RssPodcastEpisode, libraryItem: LibraryItem, isAutoDownload: boolean, libraryId: string): void {
    this.id = uuidv4()
    this.rssPodcastEpisode = rssPodcastEpisode

    const url = rssPodcastEpisode.enclosure?.url || ''
    if (decodeURIComponent(url) !== url) {
      // Already encoded
      this.url = url
    } else {
      this.url = encodeURI(url)
    }

    this.targetFilename = this.getSanitizedFilename(this.rssPodcastEpisode.title || '')

    this.libraryItem = libraryItem
    this.isAutoDownload = isAutoDownload
    this.createdAt = Date.now()
    this.libraryId = libraryId
  }

  setFinished(success: boolean): void {
    this.finishedAt = Date.now()
    this.isFinished = true
    this.failed = !success
  }
}

export = PodcastEpisodeDownload
