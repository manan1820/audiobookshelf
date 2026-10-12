import xml2js from 'xml2js'
import Logger from '../../Logger'
import type { ChapterObject } from '../../types'

interface MarkerRaw {
  Name?: string[] | string
  Time?: string[] | string
  [key: string]: unknown
}

interface MarkerCleaned {
  Name: string
  Time: string
  [key: string]: string
}

interface ChapterInProgress {
  id: number
  start: number
  end?: number
  title: string
}

export interface AudioFileWithOverdrive {
  duration: number
  metaTags?: {
    tagOverdriveMediaMarker?: string | null
  } | null
}

function objectValuesArrayToString(arrayOfObjects: MarkerRaw[]): MarkerCleaned[] {
  Logger.debug('[parseOverdriveMediaMarkers] Converting Marker object values from arrays to strings')
  return arrayOfObjects.map((item) => {
    const cleaned: MarkerCleaned = {
      Name: '',
      Time: ''
    }
    Object.keys(item).forEach((key) => {
      const val = item[key]
      cleaned[key] = Array.isArray(val) ? val.join('') : String(val ?? '')
    })
    return cleaned
  })
}

function removeExtraChapters(parsedOverdriveMediaMarkers: MarkerCleaned[][]): MarkerCleaned[][] {
  Logger.debug('[parseOverdriveMediaMarkers] Removing any unnecessary chapters')
  const weirdChapterFilterRegex = /([(]\d|[cC]ontinued)/
  return parsedOverdriveMediaMarkers.map((item) => {
    return item.filter((chapter) => !weirdChapterFilterRegex.test(chapter.Name))
  })
}

function cleanOverdriveMediaMarkers(overdriveMediaMarkers: string[]): MarkerCleaned[][] {
  Logger.debug('[parseOverdriveMediaMarkers] Cleaning up overdrive media markers')
  const parsedOverdriveMediaMarkers: MarkerCleaned[][] = []

  overdriveMediaMarkers.forEach((item) => {
    let parsedResult: MarkerCleaned[] | null = null
    xml2js.parseString(item, (_err: Error | null, result: { Markers?: { Marker?: MarkerRaw[] } }) => {
      if (result?.Markers?.Marker) {
        parsedResult = objectValuesArrayToString(result.Markers.Marker)
      }
    })

    if (parsedResult) {
      parsedOverdriveMediaMarkers.push(parsedResult)
    }
  })

  return removeExtraChapters(parsedOverdriveMediaMarkers)
}

function addChapterEndTimes(chapters: ChapterInProgress[], totalAudioDuration: number): ChapterObject[] {
  Logger.debug('[parseOverdriveMediaMarkers] Adding chapter end times')
  return chapters.map((chapter, chapterIndex) => {
    const nextChapter = chapters[chapterIndex + 1]
    const end = chapterIndex < chapters.length - 1 && nextChapter ? nextChapter.start : totalAudioDuration
    return {
      id: chapter.id,
      start: chapter.start,
      end,
      title: chapter.title
    }
  })
}

function generateParsedChapters(
  includedAudioFiles: AudioFileWithOverdrive[],
  cleanedOverdriveMediaMarkers: MarkerCleaned[][]
): ChapterObject[] {
  Logger.debug('[parseOverdriveMediaMarkers] Generating new chapters for ABS')
  let parsedChapters: ChapterInProgress[] = []
  let length = 0.0
  let index = 0

  includedAudioFiles.forEach((track, trackIndex) => {
    const trackMarkers = cleanedOverdriveMediaMarkers[trackIndex] || []
    trackMarkers.forEach((chapter) => {
      let time = 0.0
      const timeParts = chapter.Time.split(':')
      const secPart = timeParts.pop()
      time = length + (secPart ? parseFloat(secPart) : 0)
      if (timeParts.length) {
        const minPart = timeParts.pop()
        time += (minPart ? parseFloat(minPart) : 0) * 60
      }
      if (timeParts.length) {
        const hrPart = timeParts.pop()
        time += (hrPart ? parseFloat(hrPart) : 0) * 3600
      }
      const newChapterData: ChapterInProgress = {
        id: index++,
        start: time,
        title: chapter.Name
      }
      parsedChapters.push(newChapterData)
    })
    length += track.duration
  })

  return addChapterEndTimes(parsedChapters, length)
}

export function parseOverdriveMediaMarkersAsChapters(
  includedAudioFiles: AudioFileWithOverdrive[]
): ChapterObject[] | null {
  const overdriveMediaMarkers = includedAudioFiles
    .map((af) => af.metaTags?.tagOverdriveMediaMarker)
    .filter((af): af is string => !!af)

  if (!overdriveMediaMarkers.length) return null

  const cleanedOverdriveMediaMarkers = cleanOverdriveMediaMarkers(overdriveMediaMarkers)
  if (cleanedOverdriveMediaMarkers.length !== includedAudioFiles.length) return null
  return generateParsedChapters(includedAudioFiles, cleanedOverdriveMediaMarkers)
}

export default { parseOverdriveMediaMarkersAsChapters }
