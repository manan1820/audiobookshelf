import { EventEmitter } from 'events'
import Path from 'path'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import fs from '../libs/fsExtra'
import Ffmpeg, { FfmpegCommand } from '../libs/fluentFfmpeg'
import { secondsToTimestamp } from '../utils'
import { writeConcatFile } from '../utils/ffmpegHelpers'
import { AudioMimeType } from '../utils/constants'
import hlsPlaylistGenerator from '../utils/generators/hlsPlaylistGenerator'
import AudioTrackClass from './files/AudioTrack'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type PodcastEpisode from '../models/PodcastEpisode'
import type Book from '../models/Book'
import type User from '../models/User'
import type { TranscodeOptions, StreamProgressPayload, StreamJsonObject, AudioTrack } from '../types'

class Stream extends EventEmitter {
  id: string
  user: User
  libraryItem: LibraryItem
  episodeId: string | null
  transcodeOptions: TranscodeOptions
  segmentLength = 6
  maxSeekBackTime = 30
  streamPath: string
  concatFilesPath: string
  playlistPath: string
  finalPlaylistPath: string
  startTime: number
  ffmpeg: FfmpegCommand | null = null
  loop: NodeJS.Timeout | null = null
  isResetting = false
  isClientInitialized = false
  isTranscodeComplete = false
  segmentsCreated = new Set<number>()
  furthestSegmentCreated = 0

  constructor(
    sessionId: string,
    streamPath: string,
    user: User,
    libraryItem: LibraryItem,
    episodeId: string | null,
    startTime: number,
    transcodeOptions: TranscodeOptions = {}
  ) {
    super()

    this.id = sessionId
    this.user = user
    this.libraryItem = libraryItem
    this.episodeId = episodeId
    this.transcodeOptions = transcodeOptions

    this.streamPath = Path.join(streamPath, this.id)
    this.concatFilesPath = Path.join(this.streamPath, 'files.txt')
    this.playlistPath = Path.join(this.streamPath, 'output.m3u8')
    this.finalPlaylistPath = Path.join(this.streamPath, 'final-output.m3u8')
    this.startTime = startTime
  }

  get episode(): PodcastEpisode | null {
    if (!this.libraryItem.isPodcast) return null
    const podcast = this.libraryItem.media as Podcast | undefined
    return podcast?.podcastEpisodes?.find((ep) => ep.id === this.episodeId) ?? null
  }

  get mediaTitle(): string {
    if (this.libraryItem.isPodcast) {
      return (this.libraryItem.media as Podcast).getPlaybackTitle(this.episodeId || '')
    }
    return (this.libraryItem.media as Book).getPlaybackTitle()
  }

  get totalDuration(): number {
    if (this.libraryItem.isPodcast) {
      return (this.libraryItem.media as Podcast).getPlaybackDuration(this.episodeId || '')
    }
    return (this.libraryItem.media as Book).getPlaybackDuration()
  }

  get tracks(): AudioTrack[] {
    return this.libraryItem.getTrackList(this.episodeId || undefined)
  }

  get tracksAudioFileType(): string | null {
    if (!this.tracks.length) return null
    return this.tracks[0].metadata?.ext?.slice(1) ?? null
  }

  get tracksMimeType(): string | null {
    if (!this.tracks.length) return null
    return this.tracks[0].mimeType
  }

  get tracksCodec(): string | null {
    if (!this.tracks.length) return null
    return this.tracks[0].codec ?? null
  }

  get mimeTypesToForceAAC(): string[] {
    return [
      AudioMimeType.FLAC,
      AudioMimeType.OPUS,
      AudioMimeType.WMA,
      AudioMimeType.AIFF,
      AudioMimeType.WEBM,
      AudioMimeType.WEBMA,
      AudioMimeType.AWB,
      AudioMimeType.CAF
    ]
  }

  get codecsToForceAAC(): string[] {
    return ['alac', 'ac3', 'eac3', 'opus']
  }

  get userToken(): string | null {
    return this.user.token ?? null
  }

  get hlsSegmentType(): string {
    return 'mpegts'
  }

  get segmentBasename(): string {
    return 'output-%d.ts'
  }

  get segmentStartNumber(): number {
    if (!this.startTime) return 0
    return Math.floor(Math.max(this.startTime - this.maxSeekBackTime, 0) / this.segmentLength)
  }

  get numSegments(): number {
    let numSegs = Math.floor(this.totalDuration / this.segmentLength)
    if (this.totalDuration - numSegs * this.segmentLength > 0) {
      numSegs++
    }
    return numSegs
  }

  get clientPlaylistUri(): string {
    return `/hls/${this.id}/output.m3u8`
  }

  get isAACEncodable(): boolean {
    return ['mp4', 'm4a', 'm4b'].includes(this.tracksAudioFileType || '')
  }

  get transcodeForceAAC(): boolean {
    return Boolean(this.transcodeOptions.forceAAC)
  }

  toJSON(): StreamJsonObject {
    return {
      id: this.id,
      userId: this.user.id,
      libraryItem: this.libraryItem.toOldJSONExpanded(),
      episode: this.episode ? this.episode.toOldJSONExpanded(this.libraryItem.id) : null,
      segmentLength: this.segmentLength,
      playlistPath: this.playlistPath,
      clientPlaylistUri: this.clientPlaylistUri,
      startTime: this.startTime,
      segmentStartNumber: this.segmentStartNumber,
      isTranscodeComplete: this.isTranscodeComplete
    }
  }

  async checkSegmentNumberRequest(segNum: number): Promise<number | false> {
    const segStartTime = segNum * this.segmentLength
    if (this.segmentStartNumber > segNum) {
      Logger.warn(
        `[STREAM] Segment #${segNum} Request is before starting segment number #${this.segmentStartNumber} - Reset Transcode`
      )
      await this.reset(segStartTime - this.segmentLength * 5)
      return segStartTime
    } else if (this.isTranscodeComplete) {
      return false
    }

    if (this.furthestSegmentCreated) {
      const distanceFromFurthestSegment = segNum - this.furthestSegmentCreated
      if (distanceFromFurthestSegment > 10) {
        Logger.info(
          `Segment #${segNum} requested is ${distanceFromFurthestSegment} segments from latest (${secondsToTimestamp(segStartTime)}) - Reset Transcode`
        )
        await this.reset(segStartTime - this.segmentLength * 5)
        return segStartTime
      }
    }

    return false
  }

  async generatePlaylist(): Promise<string> {
    await fs.ensureDir(this.streamPath)
    await hlsPlaylistGenerator(this.playlistPath, 'output', this.totalDuration, this.segmentLength, this.hlsSegmentType)
    return this.clientPlaylistUri
  }

  async checkFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.streamPath)
      files.forEach((file: string) => {
        const extname = Path.extname(file)
        if (extname === '.ts') {
          const basename = Path.basename(file, extname)
          const num_part = basename.split('-')[1]
          const part_num = Number(num_part)
          this.segmentsCreated.add(part_num)
        }
      })

      if (!this.segmentsCreated.size) {
        Logger.warn('No Segments')
        return
      }

      if (this.segmentsCreated.size > 6 && !this.isClientInitialized) {
        this.isClientInitialized = true
        Logger.info(`[STREAM] ${this.id} notifying client that stream is ready`)
        this.clientEmit('stream_open', this.toJSON())
      }

      const chunks: (number | string)[] = []
      let current_chunk: number[] = []
      let last_seg_in_chunk = -1

      const segments = Array.from(this.segmentsCreated).sort((a, b) => a - b)
      const lastSegment = segments[segments.length - 1]
      if (lastSegment > this.furthestSegmentCreated) {
        this.furthestSegmentCreated = lastSegment
      }

      segments.forEach((seg) => {
        if (!current_chunk.length || last_seg_in_chunk + 1 === seg) {
          last_seg_in_chunk = seg
          current_chunk.push(seg)
        } else {
          if (current_chunk.length === 1) chunks.push(current_chunk[0])
          else chunks.push(`${current_chunk[0]}-${current_chunk[current_chunk.length - 1]}`)
          last_seg_in_chunk = seg
          current_chunk = [seg]
        }
      })
      if (current_chunk.length) {
        if (current_chunk.length === 1) chunks.push(current_chunk[0])
        else chunks.push(`${current_chunk[0]}-${current_chunk[current_chunk.length - 1]}`)
      }

      const perc = ((this.segmentsCreated.size * 100) / this.numSegments).toFixed(2) + '%'
      Logger.info(
        '[STREAM-CHECK] Check Files',
        this.segmentsCreated.size,
        'of',
        this.numSegments,
        perc,
        `Furthest Segment: ${this.furthestSegmentCreated}`
      )

      this.clientEmit('stream_progress', {
        stream: this.id,
        percent: perc,
        chunks,
        numSegments: this.numSegments
      })
    } catch (error) {
      Logger.error('Failed checking files', error)
    }
  }

  startLoop(): void {
    this.clientEmit('stream_progress', { stream: this.id, chunks: [], numSegments: 0, percent: '0%' })

    if (this.loop) {
      clearInterval(this.loop)
    }
    const intervalId = setInterval(() => {
      if (!this.isTranscodeComplete) {
        void this.checkFiles()
      } else {
        Logger.info(`[Stream] ${this.mediaTitle} sending stream_ready`)
        this.clientEmit('stream_ready')
        clearInterval(intervalId)
      }
    }, 2000)
    this.loop = intervalId
  }

  async start(): Promise<void> {
    Logger.info(`[STREAM] START STREAM - Num Segments: ${this.numSegments}`)

    this.ffmpeg = Ffmpeg()
    this.furthestSegmentCreated = 0

    const adjustedStartTime = Math.max(this.startTime - this.maxSeekBackTime, 0)
    const trackStartTime = await writeConcatFile(this.tracks, this.concatFilesPath, adjustedStartTime)
    if (trackStartTime == null) {
      this.ffmpeg = null
      await this.close('Failed to write stream concat file')
      return
    }

    this.ffmpeg.addInput(this.concatFilesPath)
    this.ffmpeg.inputOption('-seek_timestamp 1')
    this.ffmpeg.inputFormat('concat')
    this.ffmpeg.inputOption('-safe 0')

    if (adjustedStartTime > 0) {
      const shiftedStartTime = adjustedStartTime - trackStartTime
      const startTimeS = Math.round(shiftedStartTime * 10) / 10 + 's'
      Logger.info(
        `[STREAM] Starting Stream at startTime ${secondsToTimestamp(adjustedStartTime)} (User startTime ${secondsToTimestamp(this.startTime)}) and Segment #${this.segmentStartNumber}`
      )
      this.ffmpeg.inputOption(`-ss ${startTimeS}`)
      this.ffmpeg.inputOption('-noaccurate_seek')
    }

    const logLevel = process.env.NODE_ENV === 'production' ? 'error' : 'warning'

    let audioCodec = 'copy'
    if (
      this.transcodeForceAAC ||
      (this.tracksMimeType && this.mimeTypesToForceAAC.includes(this.tracksMimeType)) ||
      (this.tracksCodec && this.codecsToForceAAC.includes(this.tracksCodec))
    ) {
      Logger.debug(`[Stream] Forcing AAC for tracks with mime type ${this.tracksMimeType} and codec ${this.tracksCodec}`)
      audioCodec = 'aac'
    }

    const codecOptions = [`-loglevel ${logLevel}`, '-map 0:a']

    const firstTrack = this.tracks[0] as AudioTrack | undefined
    if (
      this.tracksCodec &&
      ['ac3', 'eac3'].includes(this.tracksCodec) &&
      this.tracks.length > 0 &&
      firstTrack &&
      'bitRate' in firstTrack &&
      firstTrack.bitRate &&
      'channels' in firstTrack &&
      firstTrack.channels
    ) {
      codecOptions.push(
        `-c:a ${audioCodec}`,
        `-b:a ${String(firstTrack.bitRate)}`,
        `-ac ${String(firstTrack.channels)}`
      )
    } else {
      codecOptions.push(`-c:a ${audioCodec}`)
    }

    this.ffmpeg.addOption(codecOptions)
    const hlsOptions = [
      '-f hls',
      '-copyts',
      '-avoid_negative_ts make_non_negative',
      '-max_delay 5000000',
      '-max_muxing_queue_size 2048',
      `-hls_time 6`,
      `-hls_segment_type ${this.hlsSegmentType}`,
      `-start_number ${this.segmentStartNumber}`,
      '-hls_playlist_type vod',
      '-hls_list_size 0',
      '-hls_allow_cache 0'
    ]
    this.ffmpeg.addOption(hlsOptions)
    if (this.hlsSegmentType === 'fmp4') {
      this.ffmpeg.addOption('-strict -2')
      const fmp4InitFilename = Path.join(this.streamPath, 'init.mp4')
      this.ffmpeg.addOption('-hls_fmp4_init_filename', fmp4InitFilename)
    }
    const segmentFilename = Path.join(this.streamPath, this.segmentBasename)
    this.ffmpeg.addOption('-hls_segment_filename', segmentFilename)
    this.ffmpeg.output(this.finalPlaylistPath)

    this.ffmpeg.on('start', (command: string) => {
      Logger.info('[INFO] FFMPEG transcoding started with command: ' + command)
      Logger.info('')
      if (this.isResetting) {
        const clearIsResettingTime = this.transcodeForceAAC ? 3000 : 500
        setTimeout(() => {
          Logger.info('[STREAM] Clearing isResetting')
          this.isResetting = false
          this.startLoop()
        }, clearIsResettingTime)
      } else {
        this.startLoop()
      }
    })

    this.ffmpeg.on('stderr', (stdErrline: string) => {
      Logger.info(stdErrline)
    })

    this.ffmpeg.on('error', (err: Error) => {
      if (err.message && err.message.includes('SIGKILL')) {
        Logger.info('[FFMPEG] Transcode Killed')
        this.ffmpeg = null
        if (this.loop) {
          clearInterval(this.loop)
        }
      } else {
        Logger.error('Ffmpeg Err', '"' + err.message + '"')

        const aacErrorMsg = 'ffmpeg exited with code 1'
        const errorMessageSuggestsReEncode =
          err.message?.startsWith(aacErrorMsg) && !err.message?.includes('No such file or directory')
        if (audioCodec === 'copy' && this.isAACEncodable && errorMessageSuggestsReEncode) {
          Logger.info(`[Stream] Re-attempting stream with AAC encode`)
          this.transcodeOptions.forceAAC = true
          void this.reset(this.startTime)
        } else {
          void this.close(err.message)
        }
      }
    })

    this.ffmpeg.on('end', () => {
      Logger.info('[FFMPEG] Transcoding ended')
      if (!this.isClientInitialized) {
        this.isClientInitialized = true
        Logger.info(`[STREAM] ${this.id} notifying client that stream is ready`)
        this.clientEmit('stream_open', this.toJSON())
      }
      this.isTranscodeComplete = true
      this.ffmpeg = null
      if (this.loop) {
        clearInterval(this.loop)
      }
    })

    this.ffmpeg.run()
  }

  async close(errorMessage: string | null = null): Promise<void> {
    if (this.loop) {
      clearInterval(this.loop)
    }

    Logger.info('Closing Stream', this.id)
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL')
    }

    await fs
      .remove(this.streamPath)
      .then(() => {
        Logger.info('Deleted session data', this.streamPath)
      })
      .catch((err) => {
        Logger.error('Failed to delete session data', err)
      })

    if (errorMessage) {
      this.clientEmit('stream_error', { id: this.id, error: (errorMessage || '').trim() })
    } else {
      this.clientEmit('stream_closed', this.id)
    }

    this.emit('closed')
  }

  cancelTranscode(): void {
    if (this.loop) {
      clearInterval(this.loop)
    }
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL')
    }
  }

  async waitCancelTranscode(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (!this.ffmpeg) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    Logger.error('[STREAM] Transcode never closed...')
    return false
  }

  async reset(time: number): Promise<void> {
    if (this.isResetting) {
      Logger.info(`[STREAM] Stream ${this.id} already resetting`)
      return
    }
    time = Math.max(0, time)
    this.isResetting = true

    if (this.ffmpeg) {
      this.cancelTranscode()
      await this.waitCancelTranscode()
    }

    this.isTranscodeComplete = false
    this.startTime = time
    Logger.info(`Stream Reset New Start Time ${secondsToTimestamp(this.startTime)}`)
    void this.start()
  }

  clientEmit(
    evtName: string,
    data?: StreamProgressPayload | StreamJsonObject | { id: string; error: string } | string
  ): void {
    SocketAuthority.clientEmitter(this.user.id, evtName, data)
  }

  getAudioTrack(): AudioTrackClass {
    const newAudioTrack = new AudioTrackClass()
    newAudioTrack.setFromStream(this.mediaTitle, this.totalDuration, this.clientPlaylistUri)
    return newAudioTrack
  }
}

export = Stream
