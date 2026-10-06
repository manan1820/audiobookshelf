import xml2js from 'xml2js'
import Logger from '../../Logger'
import { AudioFileMediaMarkerInput, ParsedChapter } from '../../types'

interface MarkerItem {
  Name: string
  Time: string
  [key: string]: unknown
}

interface XmlMarkersResult {
  Markers?: {
    Marker?: Array<Record<string, unknown>>
  }
}

// given the array of Overdrive Media Markers from generateOverdriveMediaMarkers()
//  parse and clean them in to something a bit more usable
function cleanOverdriveMediaMarkers(overdriveMediaMarkers: string[]): MarkerItem[][] {
  Logger.debug('[parseOverdriveMediaMarkers] Cleaning up overdrive media markers')

  const parsedOverdriveMediaMarkers: MarkerItem[][] = []
  overdriveMediaMarkers.forEach((item) => {
    let parsedResult: MarkerItem[] | null = null
    // convert xml to JSON
    xml2js.parseString(item, (_err, result: XmlMarkersResult) => {
      // The values for Name and Time in results.Markers.Marker are returned as Arrays from parseString and should be strings
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

// given an array of objects, convert any values that are arrays to strings
function objectValuesArrayToString(arrayOfObjects: Array<Record<string, unknown>>): MarkerItem[] {
  Logger.debug('[parseOverdriveMediaMarkers] Converting Marker object values from arrays to strings')
  arrayOfObjects.forEach((item) => {
    Object.keys(item).forEach((key) => {
      const val = item[key]
      item[key] = val != null ? String(val) : ''
    })
  })

  return arrayOfObjects as unknown as MarkerItem[]
}

// Overdrive sometimes has weird chapters and subchapters defined
//  These aren't necessary, so lets remove them
function removeExtraChapters(parsedOverdriveMediaMarkers: MarkerItem[][]): MarkerItem[][] {
  Logger.debug('[parseOverdriveMediaMarkers] Removing any unnecessary chapters')
  const weirdChapterFilterRegex = /([(]\d|[cC]ontinued)/
  const cleaned: MarkerItem[][] = []
  parsedOverdriveMediaMarkers.forEach((item) => {
    cleaned.push(item.filter((chapter) => !weirdChapterFilterRegex.test(chapter.Name)))
  })

  return cleaned
}

// Given a set of chapters from generateParsedChapters, add the end time to each one
function addChapterEndTimes(chapters: ParsedChapter[], totalAudioDuration: number): ParsedChapter[] {
  Logger.debug('[parseOverdriveMediaMarkers] Adding chapter end times')
  chapters.forEach((chapter, chapterIndex) => {
    if (chapterIndex < chapters.length - 1) {
      chapter.end = chapters[chapterIndex + 1].start
    } else {
      chapter.end = totalAudioDuration
    }
  })

  return chapters
}

// The function that actually generates the Chapters object that we update ABS with
function generateParsedChapters(
  includedAudioFiles: AudioFileMediaMarkerInput[],
  cleanedOverdriveMediaMarkers: MarkerItem[][]
): ParsedChapter[] {
  Logger.debug('[parseOverdriveMediaMarkers] Generating new chapters for ABS')
  let parsedChapters: ParsedChapter[] = []
  let length = 0.0
  let index = 0
  let time = 0.0

  includedAudioFiles.forEach((track, trackIndex) => {
    cleanedOverdriveMediaMarkers[trackIndex].forEach((chapter) => {
      const timeParts = chapter.Time.split(':')
      // add seconds
      time = length + parseFloat(timeParts.pop() || '0')
      if (timeParts.length) {
        // add minutes
        time += parseFloat(timeParts.pop() || '0') * 60
      }
      if (timeParts.length) {
        // add hours
        time += parseFloat(timeParts.pop() || '0') * 3600
      }
      const newChapterData: ParsedChapter = {
        id: index++,
        start: time,
        end: 0,
        title: chapter.Name
      }
      parsedChapters.push(newChapterData)
    })
    length += track.duration
  })

  parsedChapters = addChapterEndTimes(parsedChapters, length)
  return parsedChapters
}

export function parseOverdriveMediaMarkersAsChapters(
  includedAudioFiles: AudioFileMediaMarkerInput[]
): ParsedChapter[] | null {
  const overdriveMediaMarkers = includedAudioFiles
    .map((af) => af.metaTags?.tagOverdriveMediaMarker)
    .filter((af): af is string => Boolean(af))
  if (!overdriveMediaMarkers.length) return null

  const cleanedOverdriveMediaMarkers = cleanOverdriveMediaMarkers(overdriveMediaMarkers)
  if (cleanedOverdriveMediaMarkers.length !== includedAudioFiles.length) return null
  return generateParsedChapters(includedAudioFiles, cleanedOverdriveMediaMarkers)
}
