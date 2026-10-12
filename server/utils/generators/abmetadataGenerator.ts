import Logger from '../../Logger'
import parseSeriesString, { ParsedSeries } from '../parsers/parseSeriesString'

export type ExpectedType = 'string' | 'boolean' | 'stringArray'

export const bookKeys: { [key: string]: ExpectedType } = {
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
}

export const podcastKeys: { [key: string]: ExpectedType } = {
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

export interface ChapterItem {
  id: number
  start: number
  end: number
  title: string
}

export interface ValidatedBookMetadata {
  tags?: string[]
  title?: string | null
  subtitle?: string | null
  authors?: string[]
  narrators?: string[]
  series?: ParsedSeries[]
  genres?: string[]
  publishedYear?: string | null
  publishedDate?: string | null
  publisher?: string | null
  description?: string | null
  isbn?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean | null
  abridged?: boolean | null
  chapters?: ChapterItem[]
}

export interface ValidatedPodcastMetadata {
  tags?: string[]
  title?: string | null
  author?: string | null
  description?: string | null
  releaseDate?: string | null
  genres?: string[]
  feedURL?: string | null
  imageURL?: string | null
  itunesPageURL?: string | null
  itunesId?: string | null
  itunesArtistId?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean | null
  podcastType?: string | null
}

function validateMetadataValue(
  key: string,
  value: unknown,
  expectedType: ExpectedType
): string | boolean | string[] | null | undefined {
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

  if (expectedType === 'stringArray') {
    if (value === null) return []
    if (!Array.isArray(value)) {
      Logger.warn(`[abmetadataGenerator] Invalid metadata key "${key}" expected string array, got ${typeof value}`)
      return undefined
    }

    const cleanedArray: string[] = value.filter((t): t is string => typeof t === 'string')
    return [...new Set(cleanedArray.map((t) => t.trim()).filter((t) => Boolean(t)))]
  }

  Logger.warn(`[abmetadataGenerator] Unknown expected type "${expectedType}" for key "${key}"`)
  return undefined
}

function cleanChaptersArray(chaptersArray: unknown[], mediaTitle: string): ChapterItem[] | null {
  const chapters: ChapterItem[] = []
  let index = 0
  for (const chap of chaptersArray) {
    if (typeof chap !== 'object' || chap === null) {
      Logger.error(`[abmetadataGenerator] Invalid chapter item for "${mediaTitle}" metadata file`)
      return null
    }
    const chapterObj = chap as { start?: unknown; end?: unknown; title?: unknown }
    const start = typeof chapterObj.start === 'number' ? chapterObj.start : Number(chapterObj.start)
    const end = typeof chapterObj.end === 'number' ? chapterObj.end : Number(chapterObj.end)
    const title = chapterObj.title

    if (chapterObj.start === null || chapterObj.start === undefined || isNaN(start)) {
      Logger.error(`[abmetadataGenerator] Invalid chapter start time ${String(chapterObj.start)} for "${mediaTitle}" metadata file`)
      return null
    }
    if (chapterObj.end === null || chapterObj.end === undefined || isNaN(end)) {
      Logger.error(`[abmetadataGenerator] Invalid chapter end time ${String(chapterObj.end)} for "${mediaTitle}" metadata file`)
      return null
    }
    if (!title || typeof title !== 'string') {
      Logger.error(`[abmetadataGenerator] Invalid chapter title ${String(title)} for "${mediaTitle}" metadata file`)
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

export function parseJson(text: string, mediaType: 'book'): ValidatedBookMetadata | null
export function parseJson(text: string, mediaType: 'podcast'): ValidatedPodcastMetadata | null
export function parseJson(text: string, mediaType: 'book' | 'podcast'): ValidatedBookMetadata | ValidatedPodcastMetadata | null
export function parseJson(text: string, mediaType: 'book' | 'podcast'): ValidatedBookMetadata | ValidatedPodcastMetadata | null {
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) {
      Logger.error('[abmetadataGenerator] Invalid metadata.json JSON')
      return null
    }
    const abmetadataData = parsed as { [key: string]: unknown }

    // Old metadata.json used nested "metadata"
    if (typeof abmetadataData.metadata === 'object' && abmetadataData.metadata !== null) {
      const nested = abmetadataData.metadata as { [key: string]: unknown }
      for (const key of Object.keys(nested)) {
        if (nested[key] === undefined) continue
        let newModelKey = key
        if (key === 'feedUrl') newModelKey = 'feedURL'
        else if (key === 'imageUrl') newModelKey = 'imageURL'
        else if (key === 'itunesPageUrl') newModelKey = 'itunesPageURL'
        else if (key === 'type') newModelKey = 'podcastType'
        abmetadataData[newModelKey] = nested[key]
      }
    }
    delete abmetadataData.metadata

    if (mediaType === 'book') {
      const validated: ValidatedBookMetadata = {}
      for (const key of Object.keys(bookKeys)) {
        if (!(key in abmetadataData)) continue

        const validatedValue = validateMetadataValue(key, abmetadataData[key], bookKeys[key])
        if (validatedValue !== undefined) {
          if (key === 'series' && Array.isArray(validatedValue)) {
            validated.series = validatedValue
              .map((series) => parseSeriesString.parse(series))
              .filter((s): s is ParsedSeries => s !== null)
          } else if (key === 'tags' && Array.isArray(validatedValue)) {
            validated.tags = validatedValue
          } else if (key === 'authors' && Array.isArray(validatedValue)) {
            validated.authors = validatedValue
          } else if (key === 'narrators' && Array.isArray(validatedValue)) {
            validated.narrators = validatedValue
          } else if (key === 'genres' && Array.isArray(validatedValue)) {
            validated.genres = validatedValue
          } else if (key === 'explicit' && (typeof validatedValue === 'boolean' || validatedValue === null)) {
            validated.explicit = validatedValue
          } else if (key === 'abridged' && (typeof validatedValue === 'boolean' || validatedValue === null)) {
            validated.abridged = validatedValue
          } else if (typeof validatedValue === 'string' || validatedValue === null) {
            if (key === 'title') validated.title = validatedValue
            else if (key === 'subtitle') validated.subtitle = validatedValue
            else if (key === 'publishedYear') validated.publishedYear = validatedValue
            else if (key === 'publishedDate') validated.publishedDate = validatedValue
            else if (key === 'publisher') validated.publisher = validatedValue
            else if (key === 'description') validated.description = validatedValue
            else if (key === 'isbn') validated.isbn = validatedValue
            else if (key === 'asin') validated.asin = validatedValue
            else if (key === 'language') validated.language = validatedValue
          }
        }
      }

      if ('chapters' in abmetadataData) {
        if (abmetadataData.chapters === null) {
          validated.chapters = []
        } else if (Array.isArray(abmetadataData.chapters)) {
          const mediaTitle = (validated.title ?? (typeof abmetadataData.title === 'string' ? abmetadataData.title : '')) || ''
          const cleanedChapters = cleanChaptersArray(abmetadataData.chapters, mediaTitle)
          if (cleanedChapters) {
            validated.chapters = cleanedChapters
          }
        } else {
          Logger.warn(`[abmetadataGenerator] Invalid metadata key "chapters" expected array, got ${typeof abmetadataData.chapters}`)
        }
      }

      return validated
    } else if (mediaType === 'podcast') {
      const validated: ValidatedPodcastMetadata = {}
      for (const key of Object.keys(podcastKeys)) {
        if (!(key in abmetadataData)) continue

        const validatedValue = validateMetadataValue(key, abmetadataData[key], podcastKeys[key])
        if (validatedValue !== undefined) {
          if (key === 'tags' && Array.isArray(validatedValue)) {
            validated.tags = validatedValue
          } else if (key === 'genres' && Array.isArray(validatedValue)) {
            validated.genres = validatedValue
          } else if (key === 'explicit' && (typeof validatedValue === 'boolean' || validatedValue === null)) {
            validated.explicit = validatedValue
          } else if (typeof validatedValue === 'string' || validatedValue === null) {
            if (key === 'title') validated.title = validatedValue
            else if (key === 'author') validated.author = validatedValue
            else if (key === 'description') validated.description = validatedValue
            else if (key === 'releaseDate') validated.releaseDate = validatedValue
            else if (key === 'feedURL') validated.feedURL = validatedValue
            else if (key === 'imageURL') validated.imageURL = validatedValue
            else if (key === 'itunesPageURL') validated.itunesPageURL = validatedValue
            else if (key === 'itunesId') validated.itunesId = validatedValue
            else if (key === 'itunesArtistId') validated.itunesArtistId = validatedValue
            else if (key === 'asin') validated.asin = validatedValue
            else if (key === 'language') validated.language = validatedValue
            else if (key === 'podcastType') validated.podcastType = validatedValue
          }
        }
      }
      return validated
    } else {
      Logger.error(`[abmetadataGenerator] Invalid media type "${String(mediaType)}"`)
      return null
    }
  } catch (error) {
    Logger.error('[abmetadataGenerator] Invalid metadata.json JSON', error)
    return null
  }
}

export default {
  parseJson
}
