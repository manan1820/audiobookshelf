import Logger from '../../Logger'
import * as parseSeriesString from '../parsers/parseSeriesString'
import { ParsedChapter, SeriesSequence } from '../../types'

type MediaType = 'book' | 'podcast'
type FieldType = 'string' | 'stringArray' | 'boolean'

const mediaTypeKeys: Record<MediaType, Record<string, FieldType>> = {
  book: {
    tags: 'stringArray',
    title: 'string',
    subtitle: 'string',
    authors: 'stringArray',
    narrators: 'stringArray',
    series: 'stringArray',
    genres: 'stringArray',
    publishedYear: 'string',
    publishedDate: 'string',
    publisher: 'string',
    description: 'string',
    isbn: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    abridged: 'boolean'
  },
  podcast: {
    tags: 'stringArray',
    title: 'string',
    author: 'string',
    description: 'string',
    releaseDate: 'string',
    genres: 'stringArray',
    feedURL: 'string',
    imageURL: 'string',
    itunesPageURL: 'string',
    itunesId: 'string',
    itunesArtistId: 'string',
    asin: 'string',
    language: 'string',
    explicit: 'boolean',
    podcastType: 'string'
  }
}

export type ValidatedMetadataValue = string | boolean | string[] | SeriesSequence[] | ParsedChapter[] | null

export function parseJson(text: string, mediaType: MediaType): Record<string, ValidatedMetadataValue> | null {
  try {
    const abmetadataData = JSON.parse(text) as Record<string, unknown>

    // Old metadata.json used nested "metadata"
    if (abmetadataData.metadata && typeof abmetadataData.metadata === 'object') {
      const nestedMeta = abmetadataData.metadata as Record<string, unknown>
      for (const key in nestedMeta) {
        if (nestedMeta[key] === undefined) continue
        let newModelKey = key
        if (key === 'feedUrl') newModelKey = 'feedURL'
        else if (key === 'imageUrl') newModelKey = 'imageURL'
        else if (key === 'itunesPageUrl') newModelKey = 'itunesPageURL'
        else if (key === 'type') newModelKey = 'podcastType'
        abmetadataData[newModelKey] = nestedMeta[key]
      }
    }
    delete abmetadataData.metadata

    const expectedKeys = mediaTypeKeys[mediaType]
    if (!expectedKeys) {
      Logger.error(`[abmetadataGenerator] Invalid media type "${mediaType}"`)
      return null
    }

    const validated: Record<string, ValidatedMetadataValue> = {}
    for (const key in expectedKeys) {
      const expectedType = expectedKeys[key]
      if (!(key in abmetadataData)) continue

      const validatedValue = validateMetadataValue(key, abmetadataData[key], expectedType)
      if (validatedValue !== undefined) {
        validated[key] = validatedValue
      }
    }

    if (Array.isArray(validated.series) && validated.series.length) {
      validated.series = (validated.series as string[])
        .map((series) => parseSeriesString.parse(series))
        .filter((s): s is SeriesSequence => Boolean(s))
    }

    if (mediaType === 'book' && 'chapters' in abmetadataData) {
      if (abmetadataData.chapters === null) {
        validated.chapters = []
      } else if (Array.isArray(abmetadataData.chapters)) {
        const mediaTitle = typeof validated.title === 'string' ? validated.title : typeof abmetadataData.title === 'string' ? abmetadataData.title : ''
        const cleanedChapters = cleanChaptersArray(abmetadataData.chapters as Array<Record<string, unknown>>, mediaTitle)
        if (cleanedChapters) {
          validated.chapters = cleanedChapters
        }
      } else {
        Logger.warn(`[abmetadataGenerator] Invalid metadata key "chapters" expected array, got ${typeof abmetadataData.chapters}`)
      }
    }

    return validated
  } catch (error) {
    Logger.error(`[abmetadataGenerator] Invalid metadata.json JSON`, error)
    return null
  }
}

function validateMetadataValue(key: string, value: unknown, expectedType: FieldType): string | boolean | string[] | null | undefined {
  if (expectedType === 'string') {
    if (value === null) return null
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return value
    Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string, got ${typeof value}`)
    return undefined
  }

  if (expectedType === 'boolean') {
    if (value === null) return null
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      if (lower === 'true') return true
      if (lower === 'false') return false
    }
    Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected boolean, got ${typeof value}`)
    return undefined
  }

  // Filter empty strings and deduplicate
  if (expectedType === 'stringArray') {
    if (value === null) return []
    if (!Array.isArray(value)) {
      Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string array, got ${typeof value}`)
      return undefined
    }

    const cleanedArray = value.filter((t): t is string => typeof t === 'string')
    return [...new Set(cleanedArray.map((t) => t.trim()).filter(Boolean))]
  }

  Logger.warn(`[abmetadataGenerator] Unknown expected type "${expectedType}" for key "${key}"`)
  return undefined
}

function cleanChaptersArray(chaptersArray: Array<Record<string, unknown>>, mediaTitle: string): ParsedChapter[] | null {
  const chapters: ParsedChapter[] = []
  let index = 0
  for (const chap of chaptersArray) {
    const start = chap.start as number | null | undefined
    const end = chap.end as number | null | undefined
    const title = chap.title as string | null | undefined
    if (start === null || start === undefined || isNaN(start)) {
      Logger.error(`[abmetadataGenerator] Invalid chapter start time ${start} for "${mediaTitle}" metadata file`)
      return null
    }
    if (end === null || end === undefined || isNaN(end)) {
      Logger.error(`[abmetadataGenerator] Invalid chapter end time ${end} for "${mediaTitle}" metadata file`)
      return null
    }
    if (!title || typeof title !== 'string') {
      Logger.error(`[abmetadataGenerator] Invalid chapter title ${title} for "${mediaTitle}" metadata file`)
      return null
    }

    chapters.push({
      id: index++,
      start,
      end,
      title
    })
  }
  return chapters
}
