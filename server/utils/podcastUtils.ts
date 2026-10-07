import axios from 'axios'
import ssrfFilter from 'ssrf-req-filter'
import Logger from '../Logger'
import { xmlToJSON, timestampToSeconds } from './index'
import htmlSanitizer from './htmlSanitizer'
import Fuse, { FuseOptions } from '../libs/fusejs'

export interface RssPodcastChapter {
  id: number
  title: string
  start: number
  end: number
}

export interface EnclosureObject {
  url: string
  type?: string
  length?: string
}

export interface RssPodcastEpisode {
  title: string
  subtitle: string
  description: string
  descriptionPlain: string
  pubDate: string
  episodeType: string
  season: string
  episode: string
  author: string
  duration: string
  durationSeconds: number | null
  explicit: string
  publishedAt: number | null
  enclosure: EnclosureObject
  guid: string | null
  chaptersUrl: string | null
  chaptersType: string | null
  chapters: RssPodcastChapter[]
}

export interface RssPodcastMetadata {
  title?: string
  language?: string
  explicit?: string
  author?: string
  pubDate?: string
  link?: string
  image: string | null
  categories: string[]
  feedUrl: string | null
  description: string | null
  descriptionPlain: string | null
  type: string | null
  [key: string]: unknown
}

export interface RssPodcast {
  metadata: RssPodcastMetadata
  episodes?: RssPodcastEpisode[]
  numEpisodes?: number
}

export interface ParsedPodcastRssFeed {
  podcast: RssPodcast
  rawJson?: unknown
}

function extractFirstArrayItem(json: Record<string, unknown>, key: string): unknown {
  const val = json[key]
  if (!Array.isArray(val) || val.length === 0) return null
  return val[0]
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
  if (typeof item === 'object' && item !== null) {
    const itemObj = item as Record<string, unknown>
    if (typeof itemObj['_'] === 'string') return itemObj['_']

    return extractStringOrStringify(itemObj)
  }
  return typeof item === 'string' ? item : ''
}

function extractImage(channel: Record<string, unknown>): string | null {
  const image = channel.image as { url?: string[] } | undefined
  if (!image?.url?.length) {
    const itunesImageArr = channel['itunes:image'] as Array<{ $?: { href?: string } }> | undefined
    if (!itunesImageArr?.length || !itunesImageArr[0]?.$) {
      return null
    }
    const itunesImage = itunesImageArr[0].$
    return itunesImage?.href ?? null
  }
  return image.url[0] ?? null
}

function extractCategories(channel: Record<string, unknown>): string[] {
  const categories = channel['itunes:category']
  if (!Array.isArray(categories) || !categories.length) return []
  let cleanedCats: string[] = []
  categories.forEach((catItem) => {
    if (typeof catItem !== 'object' || catItem === null) return
    const cat = catItem as Record<string, unknown>
    const dollar = cat['$'] as Record<string, unknown> | undefined
    if (typeof dollar?.text !== 'string') return
    const cattext = dollar.text
    if (cat['itunes:category']) {
      const subcats = extractCategories(cat)
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
    const newFeed = extractFirstArrayItem(channel, 'itunes:new-feed-url')
    if (typeof newFeed === 'string') {
      metadata.feedUrl = newFeed
    }
  } else if (Array.isArray(channel['atom:link']) && channel['atom:link'].length > 0) {
    const firstAtom = channel['atom:link'][0] as Record<string, unknown> | undefined
    const dollar = firstAtom?.['$'] as Record<string, unknown> | undefined
    if (typeof dollar?.href === 'string') {
      metadata.feedUrl = dollar.href
    }
  }

  if (channel['description']) {
    const rawDescription = extractFirstArrayItemString(channel, 'description')
    metadata.description = htmlSanitizer.sanitize(rawDescription.trim())
    metadata.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  const arrayFields = ['title', 'language', 'itunes:explicit', 'itunes:author', 'pubDate', 'link', 'itunes:type']
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop() ?? key
    let value = extractFirstArrayItem(channel, key)
    if (typeof value === 'object' && value !== null) {
      const valueObj = value as Record<string, unknown>
      if (typeof valueObj['_'] === 'string') {
        value = valueObj['_']
      }
    }
    metadata[cleanKey] = value
  })
  return metadata
}

function extractEpisodeData(
  item: Record<string, unknown>
): (Partial<RssPodcastEpisode> & { enclosure: EnclosureObject }) | null {
  let enclosure: EnclosureObject | null = null

  const enclosureArr = item.enclosure as Array<{ $?: EnclosureObject }> | undefined
  if (enclosureArr?.[0]?.['$']?.url) {
    enclosure = enclosureArr[0]['$']
  } else {
    const mediaContent = item['media:content'] as Array<{ $?: EnclosureObject }> | undefined
    if (Array.isArray(mediaContent)) {
      const match = mediaContent.find((c) => {
        const dollar = c?.['$']
        return Boolean(dollar?.url && (dollar.type ?? '').startsWith('audio'))
      })
      if (match?.['$']) {
        enclosure = match['$']
      }
    }
  }

  if (!enclosure) {
    Logger.error('[podcastUtils] Invalid podcast episode data')
    return null
  }

  const episode: Partial<RssPodcastEpisode> & { enclosure: EnclosureObject } = {
    enclosure: {
      ...enclosure,
      url: enclosure.url.trim()
    }
  }

  // Full description with html
  if (item['content:encoded']) {
    const rawDescription = (extractFirstArrayItemString(item, 'content:encoded') || '').trim()
    episode.description = htmlSanitizer.sanitize(rawDescription)
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

    if (!episode.description) episode.description = htmlSanitizer.sanitize(rawDescription.trim())
    episode.descriptionPlain = htmlSanitizer.stripAllTags(rawDescription.trim())
  }

  if (item['pubDate']) {
    const pubDate = extractFirstArrayItem(item, 'pubDate')
    if (typeof pubDate === 'string') {
      episode.pubDate = pubDate
    } else if (typeof (pubDate as { _?: string } | null)?._ === 'string') {
      episode.pubDate = (pubDate as { _?: string })._
    } else {
      Logger.error(`[podcastUtils] Invalid pubDate ${String(item['pubDate'])} for ${episode.enclosure.url}`)
    }
  }

  if (item['guid']) {
    const guidItem = extractFirstArrayItem(item, 'guid')
    if (typeof guidItem === 'string') {
      episode.guid = guidItem
    } else if (typeof (guidItem as { _?: string } | null)?._ === 'string') {
      episode.guid = (guidItem as { _?: string })._
    } else {
      Logger.error(`[podcastUtils] Invalid guid for ${episode.enclosure.url}`, item['guid'])
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
  const episodeObj = episode as Record<string, unknown>
  arrayFields.forEach((key) => {
    const cleanKey = key.split(':').pop() ?? key
    episodeObj[cleanKey] = extractFirstArrayItemString(item, key)
  })

  if (episode.subtitle) {
    episode.subtitle = htmlSanitizer.sanitize(episode.subtitle.trim())
  }

  // Extract psc:chapters if duration is set
  episode.durationSeconds = episode.duration ? timestampToSeconds(episode.duration) : null

  const pscChapters = item['psc:chapters'] as
    | Array<{ 'psc:chapter'?: Array<{ $?: { title?: string; start?: string } }> }>
    | undefined
  const pscChapterList = pscChapters?.[0]?.['psc:chapter']
  if (Array.isArray(pscChapterList) && pscChapterList.length > 0 && typeof episode.durationSeconds === 'number') {
    const episodeDuration = episode.durationSeconds
    const cleanedChapters = pscChapterList.map((chapter, index) => {
      const dollar = chapter?.['$']
      if (!dollar?.title || !dollar?.start || typeof dollar.start !== 'string' || typeof dollar.title !== 'string') {
        return null
      }

      const start = timestampToSeconds(dollar.start)
      if (start === null) {
        return null
      }

      return {
        id: index,
        title: dollar.title,
        start
      }
    })

    if (cleanedChapters.some((chapter) => chapter === null)) {
      Logger.warn(`[podcastUtils] Invalid chapter data for ${episode.enclosure.url}`)
    } else {
      const validChapters = cleanedChapters as Array<{ id: number; title: string; start: number }>
      episode.chapters = validChapters.map((chapter, index) => {
        const nextChapter = validChapters[index + 1]
        const end = nextChapter ? nextChapter.start : episodeDuration
        return {
          id: chapter.id,
          title: chapter.title,
          start: chapter.start,
          end
        }
      })
    }
  }

  return episode
}

function cleanEpisodeData(
  data: Partial<RssPodcastEpisode> & { enclosure: EnclosureObject }
): RssPodcastEpisode {
  const pubJsDate = data.pubDate ? new Date(data.pubDate) : null
  const publishedAt = pubJsDate && !isNaN(pubJsDate.valueOf()) ? pubJsDate.valueOf() : null

  return {
    title: data.title ?? '',
    subtitle: data.subtitle ?? '',
    description: data.description ?? '',
    descriptionPlain: data.descriptionPlain ?? '',
    pubDate: data.pubDate ?? '',
    episodeType: data.episodeType ?? '',
    season: data.season ?? '',
    episode: data.episode ?? '',
    author: data.author ?? '',
    duration: data.duration ?? '',
    durationSeconds: data.durationSeconds ?? null,
    explicit: data.explicit ?? '',
    publishedAt,
    enclosure: data.enclosure,
    guid: data.guid ?? null,
    chaptersUrl: data.chaptersUrl ?? null,
    chaptersType: data.chaptersType ?? null,
    chapters: data.chapters ?? []
  }
}

function extractPodcastEpisodes(items: Array<Record<string, unknown>>): RssPodcastEpisode[] {
  const episodes: RssPodcastEpisode[] = []
  items.forEach((item) => {
    const extracted = extractEpisodeData(item)
    if (extracted) {
      episodes.push(cleanEpisodeData(extracted))
    }
  })
  return episodes
}

function cleanPodcastJson(
  rssJson: Record<string, unknown>,
  excludeEpisodeMetadata: boolean
): RssPodcast | null {
  const channelArr = rssJson.channel as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(channelArr) || !channelArr.length) {
    Logger.error('[podcastUtil] Invalid podcast no channel object')
    return null
  }
  const channel = channelArr[0]
  if (!channel) {
    Logger.error('[podcastUtil] Invalid podcast no channel object')
    return null
  }
  const itemArr = channel.item as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(itemArr) || !itemArr.length) {
    Logger.error('[podcastUtil] Invalid podcast no episodes')
    return null
  }
  const podcast: RssPodcast = {
    metadata: extractPodcastMetadata(channel)
  }
  if (!excludeEpisodeMetadata) {
    podcast.episodes = extractPodcastEpisodes(itemArr)
  } else {
    podcast.numEpisodes = itemArr.length
  }
  return podcast
}

export async function parsePodcastRssFeedXml(
  xml: string | null | undefined,
  excludeEpisodeMetadata = false,
  includeRaw = false
): Promise<ParsedPodcastRssFeed | null> {
  if (!xml) return null
  const json = (await xmlToJSON(xml)) as { rss?: Record<string, unknown> } | null
  if (!json?.rss) {
    Logger.error('[podcastUtils] Invalid XML or RSS feed')
    return null
  }

  const podcast = cleanPodcastJson(json.rss, excludeEpisodeMetadata)
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
export function getPodcastFeed(
  feedUrl: string,
  excludeEpisodeMetadata = false
): Promise<RssPodcast | null> {
  Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}"`)

  let userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS)'
  if (feedUrl.startsWith('https://www.cbc.ca')) {
    userAgent = 'audiobookshelf (+https://audiobookshelf.org; like iTMS) - CBC'
  }

  const disableSsrf = global.DisableSsrfRequestFilter?.(feedUrl)

  return axios({
    url: feedUrl,
    method: 'GET',
    timeout: global.PodcastDownloadTimeout,
    responseType: 'arraybuffer',
    headers: {
      Accept: 'application/rss+xml, application/xhtml+xml, application/xml, */*;q=0.8',
      'Accept-Encoding': 'gzip, compress, deflate',
      'User-Agent': userAgent
    },
    httpAgent: disableSsrf ? null : ssrfFilter(feedUrl),
    httpsAgent: disableSsrf ? null : ssrfFilter(feedUrl)
  })
    .then(async (data) => {
      const contentType = String(data.headers?.['content-type'] ?? '')
      let stringData: string
      if (contentType.toLowerCase().includes('iso-8859-1')) {
        stringData = Buffer.from(data.data as Buffer).toString('latin1')
      } else {
        stringData = Buffer.from(data.data as Buffer).toString()
      }

      if (!stringData) {
        Logger.error(`[podcastUtils] getPodcastFeed: Invalid podcast feed request response (${feedUrl})`)
        return null
      }
      Logger.debug(`[podcastUtils] getPodcastFeed for "${feedUrl}" success - parsing xml`)
      const payload = await parsePodcastRssFeedXml(stringData, excludeEpisodeMetadata)
      if (!payload) {
        return null
      }

      payload.podcast.metadata.feedUrl = feedUrl
      return payload.podcast
    })
    .catch((error: unknown) => {
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
    })
}

export async function findMatchingEpisodes(
  feedUrl: string,
  searchTitle: string
): Promise<Array<{ episode: RssPodcastEpisode }> | null> {
  const feed = await getPodcastFeed(feedUrl).catch(() => null)
  return findMatchingEpisodesInFeed(feed, searchTitle)
}

export function findMatchingEpisodesInFeed(
  feed: RssPodcast | null | undefined,
  searchTitle: string,
  threshold = 0.4
): Array<{ episode: RssPodcastEpisode }> | null {
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

export default {
  parsePodcastRssFeedXml,
  getPodcastFeed,
  findMatchingEpisodes,
  findMatchingEpisodesInFeed
}
