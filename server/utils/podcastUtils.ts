import axios from 'axios'
import ssrfFilter from 'ssrf-req-filter'
import Logger from '../Logger'
import { xmlToJSON, timestampToSeconds } from './index'
import { sanitize, stripAllTags } from './htmlSanitizer'
import Fuse, { FuseOptions } from '../libs/fusejs'
import {
  RssPodcast,
  RssPodcastChapter,
  RssPodcastEpisode,
  RssPodcastEpisodeEnclosure,
  RssPodcastMetadata
} from '../types'

declare global {
  var PodcastDownloadTimeout: number | undefined
  var DisableSsrfRequestFilter: ((url: string) => boolean) | undefined
}

export interface ParsedPodcastRssFeedPayload {
  podcast: RssPodcast
  rawJson?: Record<string, unknown>
}

function extractFirstArrayItem(json: Record<string, unknown>, key: string): unknown {
  const arr = json[key]
  if (!Array.isArray(arr) || !arr.length) return null
  return arr[0]
}

function extractStringOrStringify(json: Record<string, unknown>): string {
  try {
    const firstKey = Object.keys(json)[0]
    if (firstKey) {
      const val = json[firstKey]
      if (Array.isArray(val) && typeof val[0] === 'string') {
        return val[0]
      }
    }
    // Handles case where html was included without being wrapped in CDATA
    return JSON.stringify(json)
  } catch {
    return ''
  }
}

function extractFirstArrayItemString(json: Record<string, unknown>, key: string): string {
  const item = extractFirstArrayItem(json, key)
  if (!item) return ''
  if (typeof item === 'object') {
    const itemObj = item as Record<string, unknown>
    if (itemObj['_'] && typeof itemObj['_'] === 'string') return itemObj['_']

    return extractStringOrStringify(itemObj)
  }
  return typeof item === 'string' ? item : ''
}

interface XmlImage {
  url?: string[]
}

interface XmlAttributeHref {
  $?: {
    href?: string
    [key: string]: unknown
  }
}

function extractImage(channel: Record<string, unknown>): string | null {
  const image = channel.image as XmlImage | undefined
  if (!image || !image.url || !image.url.length) {
    const itunesImage = channel['itunes:image'] as XmlAttributeHref[] | undefined
    if (!itunesImage || !itunesImage.length || !itunesImage[0]?.$) {
      return null
    }
    const itunesImageAttr = itunesImage[0].$
    return itunesImageAttr.href || null
  }
  return image.url[0] || null
}

interface XmlCategory {
  $?: {
    text?: string
    [key: string]: unknown
  }
  'itunes:category'?: XmlCategory[]
}

function extractCategories(channel: Record<string, unknown>): string[] {
  const categories = channel['itunes:category'] as XmlCategory[] | undefined
  if (!categories || !categories.length) return []
  let cleanedCats: string[] = []
  categories.forEach((cat) => {
    if (!cat.$ || !cat.$.text) return
    const cattext = cat.$.text
    if (cat['itunes:category']) {
      const subcats = extractCategories(cat as unknown as Record<string, unknown>)
      if (subcats.length) {
        cleanedCats = cleanedCats.concat(subcats.map((subcat) => `${cattext}:${subcat}`))
      } else {
        cleanedCats.push(cattext)
      }
    } else {
      cleanedCats.push(cattext)
    }
  })
  return cleanedCats
}

function extractPodcastMetadata(channel: Record<string, unknown>): RssPodcastMetadata {
  const metadata: RssPodcastMetadata = {
    image: extractImage(channel),
    categories: extractCategories(channel),
    feedUrl: null,
    description: null,
    descriptionPlain: null,
    type: null
  }

  if (channel['itunes:new-feed-url']) {
    metadata.feedUrl = extractFirstArrayItem(channel, 'itunes:new-feed-url') as string | null
  } else if (Array.isArray(channel['atom:link']) && channel['atom:link'].length && (channel['atom:link'][0] as Record<string, unknown>)?.$) {
    const linkAttr = (channel['atom:link'][0] as Record<string, unknown>).$ as Record<string, unknown>
    metadata.feedUrl = (linkAttr.href as string) || null
  }

  if (channel['description']) {
    const rawDescription = extractFirstArrayItemString(channel, 'description')
    metadata.description = sanitize(rawDescription.trim())
    metadata.descriptionPlain = stripAllTags(rawDescription.trim())
  }

  const arrayFields = ['title', 'language', 'itunes:explicit', 'itunes:author', 'pubDate', 'link', 'itunes:type']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop()!
    let value = extractFirstArrayItem(channel, key)
    if (value && typeof value === 'object' && '_' in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)['_']
    }
    (metadata as Record<string, unknown>)[cleanKey] = value
  })
  return metadata
}

interface EnclosureAttr {
  url: string
  type?: string
  length?: string
  [key: string]: unknown
}

interface XmlItemEnclosure {
  $?: EnclosureAttr
}

interface XmlMediaContent {
  $?: {
    url?: string
    type?: string
    [key: string]: unknown
  }
}

function extractEpisodeData(item: Record<string, unknown>): Partial<RssPodcastEpisode> | null {
  let enclosure: EnclosureAttr | undefined

  const enclosures = item.enclosure as XmlItemEnclosure[] | undefined
  const mediaContents = item['media:content'] as XmlMediaContent[] | undefined

  if (enclosures?.[0]?.['$']?.url) {
    enclosure = enclosures[0]['$']
  } else if (mediaContents?.find((c) => c?.['$']?.url && (c?.['$']?.type ?? '').startsWith('audio'))) {
    const found = mediaContents.find((c) => (c['$']?.type ?? '').startsWith('audio'))
    if (found?.$ && found.$.url) {
      enclosure = found.$ as EnclosureAttr
    }
  }

  if (!enclosure) {
    Logger.error('[podcastUtils] Invalid podcast episode data')
    return null
  }

  const episode: Partial<RssPodcastEpisode> = {
    enclosure: { ...enclosure }
  }

  episode.enclosure!.url = episode.enclosure!.url.trim()

  // Full description with html
  if (item['content:encoded']) {
    const rawDescription = (extractFirstArrayItemString(item, 'content:encoded') || '').trim()
    episode.description = sanitize(rawDescription)
  }

  // Extract chapters
  const podcastChapters = item['podcast:chapters'] as Array<{ $?: { url?: string; type?: string } }> | undefined
  if (podcastChapters?.[0]?.['$']?.url) {
    episode.chaptersUrl = podcastChapters[0]['$'].url
    episode.chaptersType = podcastChapters[0]['$'].type || 'application/json'
  }

  // Supposed to be the plaintext description but not always followed
  if (item['description']) {
    const rawDescription = extractFirstArrayItemString(item, 'description')

    if (!episode.description) episode.description = sanitize(rawDescription.trim())
    episode.descriptionPlain = stripAllTags(rawDescription.trim())
  }

  if (item['pubDate']) {
    const pubDate = extractFirstArrayItem(item, 'pubDate')
    if (typeof pubDate === 'string') {
      episode.pubDate = pubDate
    } else if (
      pubDate &&
      typeof pubDate === 'object' &&
      '_' in (pubDate as Record<string, unknown>) &&
      typeof (pubDate as Record<string, unknown>)._ === 'string'
    ) {
      episode.pubDate = (pubDate as Record<string, unknown>)._ as string
    } else {
      Logger.error(`[podcastUtils] Invalid pubDate ${String(item['pubDate'])} for ${episode.enclosure!.url}`)
    }
  }

  if (item['guid']) {
    const guidItem = extractFirstArrayItem(item, 'guid')
    if (typeof guidItem === 'string') {
      episode.guid = guidItem
    } else if (
      guidItem &&
      typeof guidItem === 'object' &&
      '_' in (guidItem as Record<string, unknown>) &&
      typeof (guidItem as Record<string, unknown>)._ === 'string'
    ) {
      episode.guid = (guidItem as Record<string, unknown>)._ as string
    } else {
      Logger.error(`[podcastUtils] Invalid guid for ${episode.enclosure!.url}`, item['guid'])
    }
  }

  const arrayFields = [
    'title',
    'itunes:episodeType',
    'itunes:season',
    'itunes:episode',
    'itunes:author',
    'itunes:duration',
    'itunes:explicit',
    'itunes:subtitle'
  ]
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop()!
    ;(episode as Record<string, unknown>)[cleanKey] = extractFirstArrayItemString(item, key)
  })

  if (episode.subtitle) {
    episode.subtitle = sanitize(episode.subtitle.trim())
  }

  // Extract psc:chapters if duration is set
  episode.durationSeconds = episode.duration ? timestampToSeconds(episode.duration) : null

  interface PscChapter {
    $?: {
      title?: unknown
      start?: unknown
    }
  }
  const pscChaptersWrapper = item['psc:chapters'] as Array<{ 'psc:chapter'?: PscChapter[] }> | undefined
  const pscChapterList = pscChaptersWrapper?.[0]?.['psc:chapter']
  if (pscChapterList?.length && episode.durationSeconds) {
    const cleanedChapters = pscChapterList.map((chapter, index) => {
      if (
        !chapter['$']?.title ||
        !chapter['$']?.start ||
        typeof chapter['$']?.start !== 'string' ||
        typeof chapter['$']?.title !== 'string'
      ) {
        return null
      }

      const start = timestampToSeconds(chapter['$'].start)
      if (start === null) {
        return null
      }

      return {
        id: index,
        title: chapter['$'].title,
        start
      }
    })

    if (cleanedChapters.some((chapter) => !chapter)) {
      Logger.warn(`[podcastUtils] Invalid chapter data for ${episode.enclosure!.url}`)
    } else {
      episode.chapters = cleanedChapters.map((chapter, index) => {
        const currentChapter = chapter!
        const nextChapter = cleanedChapters[index + 1]
        const end = nextChapter ? nextChapter.start : episode.durationSeconds!
        return {
          id: currentChapter.id,
          title: currentChapter.title,
          start: currentChapter.start,
          end
        }
      })
    }
  }

  return episode
}

function cleanEpisodeData(data: Partial<RssPodcastEpisode>): RssPodcastEpisode {
  const pubJsDate = data.pubDate ? new Date(data.pubDate) : null
  const publishedAt = pubJsDate && !isNaN(pubJsDate.getTime()) ? pubJsDate.valueOf() : null

  return {
    title: data.title || '',
    subtitle: data.subtitle || '',
    description: data.description || '',
    descriptionPlain: data.descriptionPlain || '',
    pubDate: data.pubDate || '',
    episodeType: data.episodeType || '',
    season: data.season || '',
    episode: data.episode || '',
    author: data.author || '',
    duration: data.duration || '',
    durationSeconds: data.durationSeconds ?? null,
    explicit: data.explicit || '',
    publishedAt,
    enclosure: data.enclosure as RssPodcastEpisodeEnclosure,
    guid: data.guid ?? null,
    chaptersUrl: data.chaptersUrl ?? null,
    chaptersType: data.chaptersType ?? null,
    chapters: (data.chapters || []) as RssPodcastChapter[]
  }
}

function extractPodcastEpisodes(items: Record<string, unknown>[]): RssPodcastEpisode[] {
  const episodes: RssPodcastEpisode[] = []
  items.forEach((item) => {
    const extracted = extractEpisodeData(item)
    if (extracted) {
      episodes.push(cleanEpisodeData(extracted))
    }
  })
  return episodes
}

function cleanPodcastJson(rssJson: Record<string, unknown>, excludeEpisodeMetadata: boolean): RssPodcast | null {
  const channels = rssJson.channel as Record<string, unknown>[] | undefined
  if (!channels?.length) {
    Logger.error('[podcastUtil] Invalid podcast no channel object')
    return null
  }
  const channel = channels[0]
  const items = channel.item as Record<string, unknown>[] | undefined
  if (!items?.length) {
    Logger.error('[podcastUtil] Invalid podcast no episodes')
    return null
  }
  const podcast: RssPodcast = {
    metadata: extractPodcastMetadata(channel)
  }
  if (!excludeEpisodeMetadata) {
    podcast.episodes = extractPodcastEpisodes(items)
  } else {
    podcast.numEpisodes = items.length
  }
  return podcast
}

export const parsePodcastRssFeedXml = async (
  xml: string,
  excludeEpisodeMetadata = false,
  includeRaw = false
): Promise<ParsedPodcastRssFeedPayload | null> => {
  if (!xml) return null
  const json = (await xmlToJSON(xml)) as Record<string, unknown> | null
  if (!json?.rss || typeof json.rss !== 'object') {
    Logger.error('[podcastUtils] Invalid XML or RSS feed')
    return null
  }

  const podcast = cleanPodcastJson(json.rss as Record<string, unknown>, excludeEpisodeMetadata)
  if (!podcast) return null

  if (includeRaw) {
    return {
      podcast,
      rawJson: json
    }
  } else {
    return {
      podcast
    }
  }
}

/**
 * Get podcast RSS feed as JSON
 * Uses SSRF filter to prevent internal URLs
 */
export const getPodcastFeed = async (feedUrl: string, excludeEpisodeMetadata = false): Promise<RssPodcast | null> => {
  Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}"`)

  let userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
  if (feedUrl.startsWith('https://www.cbc.ca')) {
    userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS) - CBC'
  }

  try {
    const data = await axios({
      url: feedUrl,
      method: 'GET',
      timeout: global.PodcastDownloadTimeout,
      responseType: 'arraybuffer',
      headers: {
        Accept: 'application/rss+xml, application/xhtml+xml, application/xml, */*;q=0.8',
        'Accept-Encoding': 'gzip, compress, deflate',
        'User-Agent': userAgent
      },
      httpAgent: global.DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl),
      httpsAgent: global.DisableSsrfRequestFilter?.(feedUrl) ? null : ssrfFilter(feedUrl)
    })

    const contentType = (data.headers?.['content-type'] as string) || ''
    let bodyString: string
    if (contentType.toLowerCase().includes('iso-8859-1')) {
      bodyString = Buffer.isBuffer(data.data) ? data.data.toString('latin1') : String(data.data)
    } else {
      bodyString = Buffer.isBuffer(data.data) ? data.data.toString() : String(data.data)
    }

    if (!bodyString) {
      Logger.error(`[podcastUtils] getPodcastFeed: Invalid podcast feed request response (${feedUrl})`)
      return null
    }
    Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}" success - parsing xml`)
    const payload = await parsePodcastRssFeedXml(bodyString, excludeEpisodeMetadata)
    if (!payload) {
      return null
    }

    payload.podcast.metadata.feedUrl = feedUrl
    return payload.podcast
  } catch (error: unknown) {
    const err = error as {
      code?: string
      cause?: { code?: string }
      request?: { _options?: { protocol?: string; href?: string } }
    }
    if (err.code === 'ERR_FR_REDIRECTION_FAILURE' && err.cause?.code === 'ERR_INVALID_PROTOCOL') {
      if (feedUrl.startsWith('http://') && err.request?._options?.protocol === 'https:') {
        Logger.info('Redirection from http to https detected. Upgrading Request', err.request._options.href)
        feedUrl = feedUrl.replace('http://', 'https://')
        return getPodcastFeed(feedUrl, excludeEpisodeMetadata)
      }
    }
    Logger.error('[podcastUtils] getPodcastFeed Error', error)
    return null
  }
}

/**
 * Find matching episodes in feed using fuse.js
 */
export const findMatchingEpisodesInFeed = (
  feed: RssPodcast | null | undefined,
  searchTitle: string,
  threshold = 0.4
): Array<{ episode: RssPodcastEpisode }> | null => {
  if (!feed?.episodes) {
    return null
  }

  const fuseOptions: FuseOptions = {
    ignoreDiacritics: true,
    threshold,
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'subtitle', weight: 0.3 }
    ]
  }
  const fuse = new Fuse(feed.episodes, fuseOptions)

  const matches: Array<{ episode: RssPodcastEpisode }> = []
  fuse.search(searchTitle).forEach((match) => {
    matches.push({
      episode: match.item
    })
  })
  return matches
}

/**
 * Return array of episodes ordered by closest match using fuse.js
 */
export const findMatchingEpisodes = async (
  feedUrl: string,
  searchTitle: string
): Promise<Array<{ episode: RssPodcastEpisode }> | null> => {
  const feed = await getPodcastFeed(feedUrl).catch(() => null)
  return findMatchingEpisodesInFeed(feed, searchTitle)
}

const podcastUtils = {
  parsePodcastRssFeedXml,
  getPodcastFeed,
  findMatchingEpisodes,
  findMatchingEpisodesInFeed
}

export default podcastUtils
