import { xmlToJSON } from '../index'
import * as htmlSanitizer from '../htmlSanitizer'
import { BookMetadataObject, SeriesSequence } from '../../types'

export interface MetadataCreatorObject {
  value: string
  role: string | null
  fileAs: string | null
}

interface CreatorRefine {
  value?: string
  refines?: string
  property?: string
}

interface OpfMetaStore {
  refines?: CreatorRefine[]
  [key: string]: unknown
}

function parseCreators(metadata: Record<string, unknown>): (MetadataCreatorObject | false)[] | null {
  const dcCreators = metadata['dc:creator'] as Array<Record<string, unknown>> | undefined
  if (!dcCreators || !Array.isArray(dcCreators) || !dcCreators.length) return null
  const metaStore = (metadata.meta || {}) as OpfMetaStore

  return dcCreators.map((c) => {
    if (typeof c !== 'object' || c === null || !c['$'] || !c['_']) return false
    const attrs = c['$'] as Record<string, string | undefined>
    const namespace =
      Object.keys(attrs)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    const creator: MetadataCreatorObject = {
      value: String(c['_']),
      role: attrs[`${namespace}:role`] || null,
      fileAs: attrs[`${namespace}:file-as`] || null
    }

    const id = attrs['id']
    if (id && metaStore.refines?.some((r) => r.refines === `#${id}`)) {
      const creatorMeta = metaStore.refines.filter((r) => r.refines === `#${id}`)
      if (creatorMeta.length) {
        creator.role = creatorMeta.find((r) => r.property === 'role')?.value || creator.role || null
        creator.fileAs = creatorMeta.find((r) => r.property === 'file-as')?.value || creator.fileAs || null
      }
    }

    return creator
  })
}

function fetchCreators(creators: (MetadataCreatorObject | false)[] | null, role: string): string[] | null {
  if (!creators?.length) return null
  const validCreators = creators.filter((c): c is MetadataCreatorObject => Boolean(c) && typeof c === 'object')
  return [...new Set(validCreators.filter((c) => c.role === role && c.value).map((c) => c.value))]
}

function fetchTagString(metadata: Record<string, unknown> | null | undefined, tag: string): string | null {
  if (!metadata) return null
  const items = metadata[tag] as unknown[] | undefined
  if (!items || !Array.isArray(items) || !items.length) return null
  let value: unknown = items[0]
  if (value && typeof value === 'object' && '_' in value) {
    value = (value as { _: unknown })._
  }
  if (typeof value !== 'string') return null
  return value
}

function fetchDate(metadata: Record<string, unknown>): string | null {
  const date = fetchTagString(metadata, 'dc:date')
  if (!date) return null
  const dateSplit = date.split('-')
  if (!dateSplit.length || dateSplit[0].length !== 4 || isNaN(Number(dateSplit[0]))) return null
  return dateSplit[0]
}

function fetchPublisher(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:publisher')
}

function fetchIdentifier(metadata: Record<string, unknown>, scheme: string): string | null {
  const dcIdentifiers = metadata['dc:identifier'] as Array<Record<string, unknown>> | undefined
  if (!dcIdentifiers || !Array.isArray(dcIdentifiers) || !dcIdentifiers.length) return null
  const identifierObj = dcIdentifiers.find((i) => {
    if (!i || !i['$']) return false
    const attrs = i['$'] as Record<string, string | undefined>
    const namespace =
      Object.keys(attrs)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    return attrs[`${namespace}:scheme`] === scheme
  })
  return identifierObj ? (identifierObj['_'] as string) || null : null
}

function fetchISBN(metadata: Record<string, unknown>): string | null {
  return fetchIdentifier(metadata, 'ISBN')
}

function fetchASIN(metadata: Record<string, unknown>): string | null {
  return fetchIdentifier(metadata, 'ASIN')
}

function fetchTitle(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:title')
}

function fetchSubtitle(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:subtitle')
}

function fetchDescription(metadata: Record<string, unknown>): string | null {
  let description = fetchTagString(metadata, 'dc:description')
  if (!description) return null
  // check if description is HTML or plain text. only plain text allowed
  // calibre stores < and > as &lt; and &gt;
  description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return htmlSanitizer.stripAllTags(description)
}

function fetchGenres(metadata: Record<string, unknown>): string[] {
  const dcSubjects = metadata['dc:subject'] as unknown[] | undefined
  if (!dcSubjects || !Array.isArray(dcSubjects) || !dcSubjects.length) return []
  return [...new Set(dcSubjects.filter((g): g is string => typeof g === 'string' && Boolean(g)))]
}

function fetchLanguage(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:language')
}

function fetchSeries(metadataMeta?: Array<Record<string, unknown>>): SeriesSequence[] {
  if (!metadataMeta || !Array.isArray(metadataMeta)) return []
  const result: SeriesSequence[] = []
  for (let i = 0; i < metadataMeta.length; i++) {
    const item = metadataMeta[i]
    const attrs = item?.$ as Record<string, string | undefined> | undefined
    if (attrs?.name === 'calibre:series' && attrs.content?.trim()) {
      const name = attrs.content.trim()
      let sequence: string | null = null
      const nextAttrs = metadataMeta[i + 1]?.$ as Record<string, string | undefined> | undefined
      if (nextAttrs?.name === 'calibre:series_index' && nextAttrs.content?.trim()) {
        sequence = nextAttrs.content.trim()
      }
      result.push({ name, sequence })
    }
  }

  // If one series was found with no series_index then check if any series_index meta can be found
  // this is to support when calibre:series_index is not directly underneath calibre:series
  if (result.length === 1 && !result[0].sequence) {
    const seriesIndexMeta = metadataMeta.find((m) => {
      const attrs = m?.$ as Record<string, string | undefined> | undefined
      return attrs?.name === 'calibre:series_index' && Boolean(attrs.content?.trim())
    })
    if (seriesIndexMeta) {
      const attrs = seriesIndexMeta.$ as Record<string, string | undefined>
      result[0].sequence = attrs.content?.trim() || null
    }
  }

  // Remove duplicates
  return result.filter((se, idx) => result.findIndex((s) => s.name === se.name) === idx)
}

function fetchNarrators(creators: (MetadataCreatorObject | false)[] | null, metadata: Record<string, unknown>): string[] | null {
  const narrators = fetchCreators(creators, 'nrt')
  if (narrators?.length) return narrators
  try {
    const metaObj = metadata.meta as Record<string, unknown> | undefined
    const rawTag = fetchTagString(metaObj, 'calibre:user_metadata:#narrators')
    if (!rawTag) return null
    const narratorsJSON = JSON.parse(rawTag.replace(/&quot;/g, '"')) as { '#value#'?: string[] }
    return narratorsJSON['#value#'] || null
  } catch {
    return null
  }
}

function fetchTags(metadata: Record<string, unknown>): string[] {
  const dcTags = metadata['dc:tag'] as unknown[] | undefined
  if (!dcTags || !Array.isArray(dcTags) || !dcTags.length) return []
  return [...new Set(dcTags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag)))]
}

function stripPrefix(str?: string | null): string {
  if (!str) return ''
  return str.split(':').pop() || ''
}

export function parseOpfMetadataJson(json: Record<string, unknown>): (BookMetadataObject & { tags?: string[] }) | null {
  // Handle <package ...> or with prefix <ns0:package ...>
  const packageKey = Object.keys(json).find((key) => stripPrefix(key) === 'package')
  if (!packageKey) return null
  const prefix = packageKey.split(':').length > 1 ? packageKey.split(':')[0] : ''
  const packageObj = json[packageKey] as Record<string, unknown>
  let metadata = (prefix ? packageObj[`${prefix}:metadata`] || packageObj.metadata : packageObj.metadata) as Record<string, unknown> | Array<Record<string, unknown>>
  if (!metadata) return null
  if (Array.isArray(metadata)) {
    if (!metadata.length) return null
    metadata = metadata[0]
  }

  const metadataMeta = (prefix ? metadata[`${prefix}:meta`] || metadata.meta : metadata.meta) as Array<Record<string, unknown>> | undefined

  const metaStore: OpfMetaStore = {}
  metadata.meta = metaStore
  if (metadataMeta?.length) {
    metadataMeta.forEach((meta) => {
      const attrs = meta?.['$'] as Record<string, string | undefined> | undefined
      if (attrs?.name) {
        metaStore[attrs.name] = [attrs.content || '']
      } else if (attrs?.refines) {
        if (!metaStore.refines) {
          metaStore.refines = []
        }
        metaStore.refines.push({
          value: meta._ as string | undefined,
          refines: attrs.refines,
          property: attrs.property
        })
      }
    })
  }

  const creators = parseCreators(metadata)
  const authors = (fetchCreators(creators, 'aut') || []).map((au) => au?.trim()).filter((au): au is string => Boolean(au))
  const narrators = (fetchNarrators(creators, metadata) || []).map((nrt) => nrt?.trim()).filter((nrt): nrt is string => Boolean(nrt))

  return {
    title: fetchTitle(metadata),
    subtitle: fetchSubtitle(metadata),
    authors,
    narrators,
    publishedYear: fetchDate(metadata),
    publisher: fetchPublisher(metadata),
    isbn: fetchISBN(metadata),
    asin: fetchASIN(metadata),
    description: fetchDescription(metadata),
    genres: fetchGenres(metadata),
    language: fetchLanguage(metadata),
    series: fetchSeries(metadataMeta),
    tags: fetchTags(metadata)
  }
}

export async function parseOpfMetadataXML(xml: string): Promise<(BookMetadataObject & { tags?: string[] }) | null> {
  const json = await xmlToJSON(xml)
  if (!json) return null

  return parseOpfMetadataJson(json)
}
