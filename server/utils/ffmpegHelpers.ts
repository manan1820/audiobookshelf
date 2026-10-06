import axios from 'axios'
import ssrfFilter from 'ssrf-req-filter'
import Ffmpeg from '../libs/fluentFfmpeg'
import * as ffmpgegUtils from '../libs/fluentFfmpeg/utils'
import fs from '../libs/fsExtra'
import Path from 'path'
import Logger from '../Logger'
import { filePathToPOSIX, copyToExisting } from './fileUtils'
import {
  ConcatAudioTrack,
  FFMetadataChapter,
  PodcastEpisodeDownloadLike,
  LibraryItemMediaMetadataLike,
  MergeAudioTrack,
  AbMergeEncodeOptions
} from '../types'

declare global {
  var PodcastDownloadTimeout: number | undefined
  var DisableSsrfRequestFilter: ((url: string) => boolean) | undefined
}

function escapeSingleQuotes(path: string): string {
  // A ' within a quoted string is escaped with '\'' in ffmpeg (see https://www.ffmpeg.org/ffmpeg-utils.html#Quoting-and-escaping)
  return filePathToPOSIX(path).replace(/'/g, "'\\''")
}

/**
 * Returns first track start time
 * startTime is for streams starting an encode part-way through an audiobook
 */
export async function writeConcatFile(
  tracks: ConcatAudioTrack[],
  outputPath: string,
  startTime = 0
): Promise<number | null> {
  let trackToStartWithIndex = 0
  let firstTrackStartTime = 0

  // Find first track greater than startTime
  if (startTime > 0) {
    let currTrackEnd = 0
    const startingTrack = tracks.find((t) => {
      currTrackEnd += t.duration
      return startTime < currTrackEnd
    })
    if (startingTrack) {
      firstTrackStartTime = currTrackEnd - startingTrack.duration
      trackToStartWithIndex = startingTrack.index
    }
  }

  const tracksToInclude = tracks.filter((t) => t.index >= trackToStartWithIndex)
  const trackPaths = tracksToInclude.map((t) => {
    const line = "file '" + escapeSingleQuotes(t.metadata.path) + "'\n" + `duration ${t.duration}`
    return line
  })
  const inputstr = trackPaths.join('\n\n')

  try {
    await fs.writeFile(outputPath, inputstr)
    return firstTrackStartTime
  } catch (error) {
    Logger.error(`[ffmpegHelpers] Failed to write stream concat file at "${outputPath}"`, error)
    return null
  }
}

export async function extractCoverArt(filepath: string, outputpath: string): Promise<string | false> {
  const dirname = Path.dirname(outputpath)
  await fs.ensureDir(dirname)

  return new Promise((resolve) => {
    const ffmpeg = Ffmpeg(filepath)
    ffmpeg.addOption(['-map 0:v:0', '-frames:v 1'])
    ffmpeg.output(outputpath)

    ffmpeg.on('start', (cmd: string) => {
      Logger.debug(`[FfmpegHelpers] Extract Cover Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err: unknown) => {
      Logger.error(`[FfmpegHelpers] Extract Cover Error ${String(err)}`)
      resolve(false)
    })
    ffmpeg.on('end', () => {
      Logger.debug(`[FfmpegHelpers] Cover Art Extracted Successfully`)
      resolve(outputpath)
    })
    ffmpeg.run()
  })
}

export async function resizeImage(
  filePath: string,
  outputPath: string,
  width?: number | null,
  height?: number | null
): Promise<string | false> {
  return new Promise((resolve) => {
    const ffmpeg = Ffmpeg(filePath)
    ffmpeg.addOption(['-vf', `scale=${width || -1}:${height || -1}`])
    ffmpeg.addOutput(outputPath)
    ffmpeg.on('start', (cmd: string) => {
      Logger.debug(`[FfmpegHelpers] Resize Image Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err: unknown, stdout: unknown, stderr: unknown) => {
      Logger.error(`[FfmpegHelpers] Resize Image Error ${String(err)} ${String(stdout)} ${String(stderr)}`)
      resolve(false)
    })
    ffmpeg.on('end', () => {
      Logger.debug(`[FfmpegHelpers] Image resized Successfully`)
      resolve(outputPath)
    })
    ffmpeg.run()
  })
}

export function downloadPodcastEpisode(
  podcastEpisodeDownload: PodcastEpisodeDownloadLike
): Promise<{ success: boolean; isRequestError?: boolean }> {
  return new Promise(async (resolve) => {
    const userAgents = [
      'audiobookshelf (+https://audiobookshelf.org; like iTMS)',
      'audiobookshelf (+https://audiobookshelf.org)'
    ]

    let response: { data: import('stream').Readable } | null = null
    let lastError: unknown = null

    for (const userAgent of userAgents) {
      try {
        response = await axios({
          url: podcastEpisodeDownload.url,
          method: 'GET',
          responseType: 'stream',
          headers: {
            Accept: '*/*',
            'User-Agent': userAgent
          },
          timeout: global.PodcastDownloadTimeout,
          httpAgent: global.DisableSsrfRequestFilter?.(podcastEpisodeDownload.url)
            ? null
            : ssrfFilter(podcastEpisodeDownload.url),
          httpsAgent: global.DisableSsrfRequestFilter?.(podcastEpisodeDownload.url)
            ? null
            : ssrfFilter(podcastEpisodeDownload.url)
        })

        Logger.debug(`[ffmpegHelpers] Successfully connected with User-Agent: ${userAgent}`)
        break
      } catch (error: unknown) {
        lastError = error
        const errMsg = error instanceof Error ? error.message : String(error)
        Logger.warn(
          `[ffmpegHelpers] Failed to download podcast episode with User-Agent "${userAgent}" for url "${podcastEpisodeDownload.url}"`,
          errMsg
        )

        if (userAgent === userAgents[userAgents.length - 1]) {
          Logger.error(
            `[ffmpegHelpers] All User-Agent attempts failed for url "${podcastEpisodeDownload.url}"`,
            lastError
          )
        }
      }
    }

    if (!response) {
      return resolve({
        success: false,
        isRequestError: true
      })
    }

    const ffmpeg = Ffmpeg(response.data)
    ffmpeg.addOption('-loglevel debug')
    ffmpeg.outputOptions('-c:a', 'copy', '-map', '0:a', '-metadata', 'podcast=1')

    const podcast = podcastEpisodeDownload.libraryItem.media
    const podcastEpisode = podcastEpisodeDownload.rssPodcastEpisode
    const finalSizeInBytes = Number(podcastEpisode.enclosure?.length || 0)

    const taggings: Record<string, string | number | null | undefined> = {
      album: podcast.title,
      'album-sort': podcast.title,
      artist: podcast.author,
      'artist-sort': podcast.author,
      comment: podcastEpisode.description,
      subtitle: podcastEpisode.subtitle,
      disc: podcastEpisode.season,
      genre: podcast.genres && podcast.genres.length ? podcast.genres.join(';') : null,
      language: podcast.language,
      MVNM: podcast.title,
      MVIN: podcastEpisode.episode,
      track: podcastEpisode.episode,
      'series-part': podcastEpisode.episode,
      title: podcastEpisode.title,
      'title-sort': podcastEpisode.title,
      year: podcastEpisodeDownload.pubYear,
      date: podcastEpisode.pubDate,
      releasedate: podcastEpisode.pubDate,
      'itunes-id': podcast.itunesId,
      'podcast-type': podcast.podcastType,
      'episode-type': podcastEpisode.episodeType
    }

    for (const tag in taggings) {
      const val = taggings[tag]
      if (val !== null && val !== undefined && val !== '') {
        let tagStr = String(val)
        if (tagStr.length > 10000) {
          Logger.warn(
            `[ffmpegHelpers] Episode download tag "${tag}" is too long (${tagStr.length} characters) - trimming it down`
          )
          tagStr = tagStr.slice(0, 10000)
        }
        ffmpeg.addOption('-metadata', `${tag}=${tagStr}`)
      }
    }

    ffmpeg.addOutput(podcastEpisodeDownload.targetPath)

    const stderrLines: string[] = []
    ffmpeg.on('stderr', (stderrLine: unknown) => {
      if (typeof stderrLine === 'string') {
        stderrLines.push(stderrLine)
      }
    })
    ffmpeg.on('start', (cmd: string) => {
      Logger.debug(`[FfmpegHelpers] downloadPodcastEpisode: Cmd: ${cmd}`)
    })
    ffmpeg.on('error', (err: unknown) => {
      Logger.error(`[FfmpegHelpers] downloadPodcastEpisode: Error ${String(err)}`)
      if (stderrLines.length) {
        Logger.error(`Full stderr dump for episode url "${podcastEpisodeDownload.url}": ${stderrLines.join('\n')}`)
      }
      resolve({
        success: false
      })
    })
    ffmpeg.on('progress', (progress: { targetSize?: number }) => {
      let progressPercent = 0
      if (finalSizeInBytes && progress.targetSize && !isNaN(progress.targetSize)) {
        const finalSizeInKb = Math.floor(finalSizeInBytes / 1000)
        progressPercent = Math.min(1, progress.targetSize / finalSizeInKb) * 100
      }
      Logger.debug(
        `[FfmpegHelpers] downloadPodcastEpisode: Progress estimate ${progressPercent.toFixed(0)}% (${progress?.targetSize || 'N/A'} KB) for "${podcastEpisodeDownload.url}"`
      )
    })
    ffmpeg.on('end', () => {
      Logger.debug(`[FfmpegHelpers] downloadPodcastEpisode: Complete`)
      resolve({
        success: true
      })
    })
    ffmpeg.run()
  })
}

function escapeFFMetadataValue(value: string | number): string {
  return String(value).replace(/([;=\n\\#])/g, '\\$1')
}

export function generateFFMetadata(
  metadata: Record<string, string | number | null | undefined>,
  chapters?: FFMetadataChapter[] | null
): string {
  let ffmetadataContent = ';FFMETADATA1\n'

  for (const key in metadata) {
    const val = metadata[key]
    if (val !== null && val !== undefined && val !== '') {
      ffmetadataContent += `${key}=${escapeFFMetadataValue(val)}\n`
    }
  }

  if (chapters) {
    chapters.forEach((chapter) => {
      ffmetadataContent += '\n[CHAPTER]\n'
      ffmetadataContent += `TIMEBASE=1/1000\n`
      ffmetadataContent += `START=${Math.floor(chapter.start * 1000)}\n`
      ffmetadataContent += `END=${Math.floor(chapter.end * 1000)}\n`
      if (chapter.title) {
        ffmetadataContent += `title=${escapeFFMetadataValue(chapter.title)}\n`
      }
    })
  }

  return ffmetadataContent
}

export async function writeFFMetadataFile(
  metadata: Record<string, string | number | null | undefined>,
  chapters: FFMetadataChapter[] | null,
  ffmetadataPath: string
): Promise<boolean> {
  try {
    await fs.writeFile(ffmetadataPath, generateFFMetadata(metadata, chapters))
    Logger.debug(`[ffmpegHelpers] Wrote ${ffmetadataPath}`)
    return true
  } catch (error) {
    Logger.error(`[ffmpegHelpers] Write ${ffmetadataPath} failed`, error)
    return false
  }
}

export async function addCoverAndMetadataToFile(
  audioFilePath: string,
  coverFilePath: string | null,
  metadataFilePath: string,
  track?: number | string | null,
  mimeType?: string,
  progressCB: ((percent: number) => void) | null = null,
  ffmpeg: Ffmpeg.FfmpegCommand = Ffmpeg(),
  copyFunc: (src: string, dest: string) => Promise<void> = copyToExisting
): Promise<void> {
  const isMp4 = mimeType === 'audio/mp4'
  const isMp3 = mimeType === 'audio/mpeg'

  const audioFileDir = Path.dirname(audioFilePath)
  const audioFileExt = Path.extname(audioFilePath)
  const audioFileBaseName = Path.basename(audioFilePath, audioFileExt)
  const tempFilePath = filePathToPOSIX(Path.join(audioFileDir, `${audioFileBaseName}.tmp${audioFileExt}`))

  return new Promise((resolve, reject) => {
    ffmpeg
      .input(audioFilePath)
      .input(metadataFilePath)
      .outputOptions([
        '-map 0:a',
        '-map_metadata 1',
        '-map_metadata 0',
        '-map_chapters 1',
        '-c copy'
      ])

    if (track && !isNaN(Number(track))) {
      ffmpeg.outputOptions(['-metadata track=' + track])
    }

    if (isMp4) {
      ffmpeg.outputOptions(['-f mp4'])
    } else if (isMp3) {
      ffmpeg.outputOptions(['-id3v2_version 3'])
    }

    if (coverFilePath) {
      ffmpeg.input(coverFilePath).outputOptions([
        '-map 2:v',
        '-disposition:v:0 attached_pic',
        '-metadata:s:v',
        'title=Cover',
        '-metadata:s:v',
        'comment=Cover'
      ])
      const ext = Path.extname(coverFilePath).toLowerCase()
      if (ext === '.webp') {
        ffmpeg.outputOptions(['-c:v mjpeg'])
      }
    } else {
      ffmpeg.outputOptions(['-map 0:v?'])
    }

    ffmpeg
      .output(tempFilePath)
      .on('start', (commandLine: string) => {
        Logger.debug('[ffmpegHelpers] Spawned Ffmpeg with command: ' + commandLine)
      })
      .on('progress', (progress: { percent?: number }) => {
        if (!progressCB || !progress.percent) return
        Logger.debug(`[ffmpegHelpers] Progress: ${progress.percent}%`)
        progressCB(progress.percent)
      })
      .on('end', async (stdout: unknown, stderr: unknown) => {
        Logger.debug('[ffmpegHelpers] ffmpeg stdout:', stdout)
        Logger.debug('[ffmpegHelpers] ffmpeg stderr:', stderr)
        Logger.debug(
          '[ffmpegHelpers] Moving temp file to audio file path:',
          `"${tempFilePath}"`,
          '->',
          `"${audioFilePath}"`
        )
        try {
          await copyFunc(tempFilePath, audioFilePath)
          await fs.remove(tempFilePath)
          resolve()
        } catch (error) {
          Logger.error(
            `[ffmpegHelpers] Failed to move temp file to audio file path: "${tempFilePath}" -> "${audioFilePath}"`,
            error
          )
          reject(error)
        }
      })
      .on('error', (err: Error, stdout: unknown, stderr: unknown) => {
        if (err.message && err.message.includes('SIGKILL')) {
          Logger.info(`[ffmpegHelpers] addCoverAndMetadataToFile Killed by User`)
          reject(new Error('FFMPEG_CANCELED'))
        } else {
          Logger.error('Error adding cover image and metadata:', err)
          Logger.error('ffmpeg stdout:', stdout)
          Logger.error('ffmpeg stderr:', stderr)
          reject(err)
        }
      })

    ffmpeg.run()
  })
}

export function getFFMetadataObject(
  libraryItem: LibraryItemMediaMetadataLike,
  audioFilesLength: number
): Record<string, string> {
  const media = libraryItem.media
  const ffmetadata: Record<string, string | undefined> = {
    title: media.title ?? undefined,
    artist: media.authorName ?? undefined,
    album_artist: media.authorName ?? undefined,
    album: (media.title || '') + (media.subtitle ? `: ${media.subtitle}` : '') || undefined,
    TIT3: media.subtitle ?? undefined,
    genre: media.genres?.join('; ') ?? undefined,
    date: media.publishedYear ? String(media.publishedYear) : undefined,
    comment: media.description ?? undefined,
    description: media.description ?? undefined,
    composer: (media.narrators || []).join(', ') || undefined,
    copyright: media.publisher ?? undefined,
    publisher: media.publisher ?? undefined,
    TRACKTOTAL: `${audioFilesLength}`,
    grouping:
      media.series
        ?.map((s) => s.name + (s.bookSeries.sequence ? ` #${s.bookSeries.sequence}` : ''))
        .join('; ') || undefined
  }

  const result: Record<string, string> = {}
  Object.keys(ffmetadata).forEach((key) => {
    const val = ffmetadata[key]
    if (val) {
      result[key] = val
    }
  })

  return result
}

export async function mergeAudioFiles(
  audioTracks: MergeAudioTrack[],
  duration: number,
  itemCachePath: string,
  outputFilePath: string,
  encodingOptions: AbMergeEncodeOptions,
  progressCB: ((percent: number) => void) | null = null,
  ffmpeg: Ffmpeg.FfmpegCommand = Ffmpeg()
): Promise<void> {
  const audioBitrate = encodingOptions.bitrate || '128k'
  const audioCodec = encodingOptions.codec || 'aac'
  const audioChannels = encodingOptions.channels || 2

  const audioRequiresEncode = true
  const firstTrack = audioTracks[0]
  const firstTrackIsM4b = firstTrack ? firstTrack.metadata.ext.toLowerCase() === '.m4b' : false
  const isOneTrack = audioTracks.length === 1

  let concatFilePath: string | null = null
  if (!isOneTrack) {
    concatFilePath = Path.join(itemCachePath, 'files.txt')
    if ((await writeConcatFile(audioTracks, concatFilePath)) === null) {
      throw new Error('Failed to write concat file')
    }
    ffmpeg.input(concatFilePath).inputOptions(['-safe 0', '-f concat'])
  } else if (firstTrack) {
    ffmpeg.input(firstTrack.metadata.path).inputOptions(firstTrackIsM4b ? ['-f mp4'] : [])
  }

  ffmpeg.outputOptions(['-f mp4'])

  if (audioRequiresEncode) {
    ffmpeg.outputOptions(['-map 0:a', `-acodec ${audioCodec}`, `-ac ${audioChannels}`, `-b:a ${audioBitrate}`])
  } else {
    ffmpeg.outputOptions(['-max_muxing_queue_size 1000'])

    if (isOneTrack && firstTrackIsM4b) {
      ffmpeg.outputOptions(['-c copy'])
    } else {
      ffmpeg.outputOptions(['-c:a copy'])
    }
  }

  ffmpeg.output(outputFilePath)

  return new Promise((resolve, reject) => {
    ffmpeg
      .on('start', (cmd: string) => {
        Logger.debug(`[ffmpegHelpers] Merge Audio Files ffmpeg command: ${cmd}`)
      })
      .on('progress', (progress: { timemark?: string }) => {
        if (!progressCB || !progress.timemark || !duration) return
        const percent = (ffmpgegUtils.timemarkToSeconds(progress.timemark) / duration) * 100
        progressCB(percent)
      })
      .on('end', async (stdout: unknown, stderr: unknown) => {
        if (concatFilePath) await fs.remove(concatFilePath)
        Logger.debug('[ffmpegHelpers] ffmpeg stdout:', stdout)
        Logger.debug('[ffmpegHelpers] ffmpeg stderr:', stderr)
        Logger.debug(`[ffmpegHelpers] Audio Files Merged Successfully`)
        resolve()
      })
      .on('error', async (err: Error, stdout: unknown, stderr: unknown) => {
        if (concatFilePath) await fs.remove(concatFilePath)
        if (err.message && err.message.includes('SIGKILL')) {
          Logger.info(`[ffmpegHelpers] Merge Audio Files Killed by User`)
          reject(new Error('FFMPEG_CANCELED'))
        } else {
          Logger.error(`[ffmpegHelpers] Merge Audio Files Error ${String(err)}`)
          Logger.error('ffmpeg stdout:', stdout)
          Logger.error('ffmpeg stderr:', stderr)
          reject(err)
        }
      })

    ffmpeg.run()
  })
}

const ffmpegHelpers = {
  writeConcatFile,
  extractCoverArt,
  resizeImage,
  downloadPodcastEpisode,
  generateFFMetadata,
  writeFFMetadataFile,
  addCoverAndMetadataToFile,
  getFFMetadataObject,
  mergeAudioFiles
}

export default ffmpegHelpers
