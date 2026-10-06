import { xmlToJSON } from '../index'
import htmlSanitizer from '../htmlSanitizer'

export interface MetadataCreatorObject {
  value: string
  role: string | null
  fileAs: string | null
}

export interface OpfSeries {
  name: string
  sequence: string | null
}

export interface OpfMetadata {
  title: string | null
  subtitle: string | null
  authors: string[]
  narrators: string[]
  publishedYear: string | null
  publisher: string | null
  isbn: string | null
  asin: string | null
  description: string | null
  genres: string[]
  language: string | null
  series: OpfSeries[]
  tags: string[]
}

interface XmlNode {
  _?: string
  $?: Record<string, string>
  [key: string]: unknown
}

function parseCreators(metadata: Record<string, unknown>): (MetadataCreatorObject | false)[] | null {
  const dcCreators = metadata['dc:creator']
  if (!Array.isArray(dcCreators) || !dcCreators.length) return null

  const metaObj = (metadata.meta as { refines?: Array<{ refines?: string; property?: string; value?: string }> }) || {}

  return dcCreators.map((c: unknown) => {
    if (typeof c !== 'object' || c === null) return false
    const node = c as XmlNode
    if (!node.$ || !node._) return false

    const namespace =
      Object.keys(node.$)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'

    const creator: MetadataCreatorObject = {
      value: node._,
      role: node.$[`${namespace}:role`] || null,
      fileAs: node.$[`${namespace}:file-as`] || null
    }

    const id = node.$['id']
    if (id && Array.isArray(metaObj.refines) && metaObj.refines.some((r) => r.refines === `#${id}`)) {
      const creatorMeta = metaObj.refines.filter((r) => r.refines === `#${id}`)
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
  const validCreators = creators.filter((c): c is MetadataCreatorObject => Boolean(c))
  return [...new Set(validCreators.filter((c) => c.role === role && c.value).map((c) => c.value))]
}

function fetchTagString(metadata: Record<string, unknown>, tag: string): string | null {
  const tagList = metadata[tag]
  if (!Array.isArray(tagList) || !tagList.length) return null
  let value: unknown = tagList[0]

  if (typeof value === 'object' && value !== null && '_' in (value as Record<string, unknown>)) {
    value = (value as { _: unknown })._
  }
  if (typeof value !== 'string') return null
  return value
}

function fetchDate(metadata: Record<string, unknown>): string | null {
  const date = fetchTagString(metadata, 'dc:date')
  if (!date) return null
  const dateSplit = date.split('-')
  if (!dateSplit.length || (dateSplit[0] && dateSplit[0].length !== 4) || (dateSplit[0] && isNaN(Number(dateSplit[0])))) return null
  return dateSplit[0] ?? null
}

function fetchPublisher(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:publisher')
}

function fetchIdentifier(metadata: Record<string, unknown>, scheme: string): string | null {
  const identifiers = metadata['dc:identifier']
  if (!Array.isArray(identifiers) || !identifiers.length) return null

  const identifierObj = identifiers.find((i: unknown) => {
    if (typeof i !== 'object' || i === null) return false
    const node = i as XmlNode
    if (!node.$) return false
    const namespace =
      Object.keys(node.$)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    return node.$[`${namespace}:scheme`] === scheme
  }) as XmlNode | undefined

  return identifierObj?._ ?? null
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
  description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return htmlSanitizer.stripAllTags(description)
}

function fetchGenres(metadata: Record<string, unknown>): string[] {
  const subjects = metadata['dc:subject']
  if (!Array.isArray(subjects) || !subjects.length) return []
  return [...new Set(subjects.filter((g): g is string => typeof g === 'string' && Boolean(g)))]
}

function fetchLanguage(metadata: Record<string, unknown>): string | null {
  return fetchTagString(metadata, 'dc:language')
}

function fetchSeries(metadataMeta: unknown): OpfSeries[] {
  if (!Array.isArray(metadataMeta)) return []
  const result: OpfSeries[] = []
  for (let i = 0; i < metadataMeta.length; i++) {
    const current = metadataMeta[i] as XmlNode | undefined
    if (current?.$?.name === 'calibre:series' && current.$.content?.trim()) {
      const name = current.$.content.trim()
      let sequence: string | null = null
      const next = metadataMeta[i + 1] as XmlNode | undefined
      if (next?.$?.name === 'calibre:series_index' && next.$.content?.trim()) {
        sequence = next.$.content.trim()
      }
      result.push({ name, sequence })
    }
  }

  if (result.length === 1 && !result[0]?.sequence) {
    const seriesIndexMeta = (metadataMeta as XmlNode[]).find((m) => m.$?.name === 'calibre:series_index' && Boolean(m.$?.content?.trim()))
    const content = seriesIndexMeta?.$?.content?.trim()
    if (content) {
      const first = result[0]
      if (first) first.sequence = content
    }
  }

  return result.filter((se, idx) => result.findIndex((s) => s.name === se.name) === idx)
}

function fetchNarrators(creators: (MetadataCreatorObject | false)[] | null, metadata: Record<string, unknown>): string[] | null {
  const narrators = fetchCreators(creators, 'nrt')
  if (narrators?.length) return narrators
  try {
    const metaObj = (metadata.meta as Record<string, unknown>) || {}
    const rawTag = fetchTagString(metaObj, 'calibre:user_metadata:#narrators')
    if (!rawTag) return null
    const narratorsJSON = JSON.parse(rawTag.replace(/&quot;/g, '"'))
    return Array.isArray(narratorsJSON['#value#']) ? (narratorsJSON['#value#'] as string[]) : null
  } catch {
    return null
  }
}

function fetchTags(metadata: Record<string, unknown>): string[] {
  const tags = metadata['dc:tag']
  if (!Array.isArray(tags) || !tags.length) return []
  return [...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag)))]
}

function stripPrefix(str?: string | null): string {
  if (!str) return ''
  return str.split(':').pop() ?? ''
}

export function parseOpfMetadataJson(json: Record<string, unknown>): OpfMetadata | null {
  const packageKey = Object.keys(json).find((key) => stripPrefix(key) === 'package')
  if (!packageKey) return null
  const prefix = packageKey.split(':').shift()
  const pkg = json[packageKey] as Record<string, unknown>
  if (!pkg) return null

  let metadata: Record<string, unknown> = (prefix ? pkg[`${prefix}:metadata`] || pkg.metadata : pkg.metadata) as Record<string, unknown>
  if (!metadata) return null
  if (Array.isArray(metadata)) {
    if (!metadata.length) return null
    metadata = metadata[0] as Record<string, unknown>
  }

  const metadataMeta = prefix ? metadata[`${prefix}:meta`] || metadata.meta : metadata.meta

  const metaDict: Record<string, unknown> = {}
  if (Array.isArray(metadataMeta)) {
    metadataMeta.forEach((meta: unknown) => {
      const m = meta as XmlNode
      if (m?.['$']?.name) {
        metaDict[m['$'].name] = [m['$'].content || '']
      } else if (m?.['$']?.refines) {
        if (!metaDict.refines) {
          metaDict.refines = []
        }
        (metaDict.refines as Array<{ value?: string; refines?: string; property?: string }>).push({
          value: m._,
          refines: m['$'].refines,
          property: m['$'].property
        })
      }
    })
  }
  metadata.meta = metaDict

  const creators = parseCreators(metadata)
  const authors = (fetchCreators(creators, 'aut') || []).map((au) => au.trim()).filter((au) => Boolean(au))
  const narrators = (fetchNarrators(creators, metadata) || []).map((nrt) => nrt.trim()).filter((nrt) => Boolean(nrt))

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

export async function parseOpfMetadataXML(xml: string): Promise<OpfMetadata | null> {
  const json = (await xmlToJSON(xml)) as Record<string, unknown> | null
  if (!json) return null
  return parseOpfMetadataJson(json)
}

export default {
  parseOpfMetadataJson,
  parseOpfMetadataXML
}
