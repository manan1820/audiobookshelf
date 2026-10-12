import { xmlToJSON } from '../index'
import htmlSanitizer from '../htmlSanitizer'
import type {
  MetadataCreatorObject,
  OpfSeries,
  OpfMetadata,
  XmlAttributeNode,
  XmlOpfMetaRefine,
  XmlOpfMetaNode,
  XmlOpfMetaDict,
  XmlOpfMetadata,
  XmlOpfPackageNode,
  XmlOpfPackage
} from '../../types'

export type {
  MetadataCreatorObject,
  OpfSeries,
  OpfMetadata,
  XmlAttributeNode,
  XmlOpfMetaRefine,
  XmlOpfMetaNode,
  XmlOpfMetaDict,
  XmlOpfMetadata,
  XmlOpfPackageNode,
  XmlOpfPackage
}

function parseCreators(metadata: XmlOpfMetadata): (MetadataCreatorObject | false)[] | null {
  const dcCreators = metadata['dc:creator']
  if (!Array.isArray(dcCreators) || !dcCreators.length) return null

  const metaObj = (metadata.meta as XmlOpfMetaDict) || {}

  return dcCreators.map((c) => {
    if (typeof c !== 'object' || c === null) return false
    const node = c as XmlAttributeNode
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

function fetchTagString(metadata: XmlOpfMetadata | XmlOpfMetaDict, tag: string): string | null {
  const tagList = metadata[tag]
  if (!Array.isArray(tagList) || !tagList.length) return null
  const first = tagList[0]

  if (typeof first === 'object' && first !== null && '_' in first) {
    const val = (first as XmlAttributeNode)._
    return typeof val === 'string' ? val : null
  }
  if (typeof first === 'string') return first
  return null
}

function fetchDate(metadata: XmlOpfMetadata): string | null {
  const date = fetchTagString(metadata, 'dc:date')
  if (!date) return null
  const dateSplit = date.split('-')
  if (!dateSplit.length || (dateSplit[0] && dateSplit[0].length !== 4) || (dateSplit[0] && isNaN(Number(dateSplit[0])))) return null
  return dateSplit[0] ?? null
}

function fetchPublisher(metadata: XmlOpfMetadata): string | null {
  return fetchTagString(metadata, 'dc:publisher')
}

function fetchIdentifier(metadata: XmlOpfMetadata, scheme: string): string | null {
  const identifiers = metadata['dc:identifier']
  if (!Array.isArray(identifiers) || !identifiers.length) return null

  const identifierObj = identifiers.find((i) => {
    if (typeof i !== 'object' || i === null) return false
    const node = i as XmlAttributeNode
    if (!node.$) return false
    const namespace =
      Object.keys(node.$)
        .find((key) => key.startsWith('xmlns:'))
        ?.split(':')[1] || 'opf'
    return node.$[`${namespace}:scheme`] === scheme
  }) as XmlAttributeNode | undefined

  return identifierObj?._ ?? null
}

function fetchISBN(metadata: XmlOpfMetadata): string | null {
  return fetchIdentifier(metadata, 'ISBN')
}

function fetchASIN(metadata: XmlOpfMetadata): string | null {
  return fetchIdentifier(metadata, 'ASIN')
}

function fetchTitle(metadata: XmlOpfMetadata): string | null {
  return fetchTagString(metadata, 'dc:title')
}

function fetchSubtitle(metadata: XmlOpfMetadata): string | null {
  return fetchTagString(metadata, 'dc:subtitle')
}

function fetchDescription(metadata: XmlOpfMetadata): string | null {
  let description = fetchTagString(metadata, 'dc:description')
  if (!description) return null
  description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  return htmlSanitizer.stripAllTags(description)
}

function fetchGenres(metadata: XmlOpfMetadata): string[] {
  const subjects = metadata['dc:subject']
  if (!Array.isArray(subjects) || !subjects.length) return []
  return [...new Set(subjects.filter((g): g is string => typeof g === 'string' && Boolean(g)))]
}

function fetchLanguage(metadata: XmlOpfMetadata): string | null {
  return fetchTagString(metadata, 'dc:language')
}

function fetchSeries(metadataMeta?: XmlOpfMetaNode[]): OpfSeries[] {
  if (!Array.isArray(metadataMeta)) return []
  const result: OpfSeries[] = []
  for (let i = 0; i < metadataMeta.length; i++) {
    const current = metadataMeta[i]
    if (current?.$?.name === 'calibre:series' && current.$.content?.trim()) {
      const name = current.$.content.trim()
      let sequence: string | null = null
      const next = metadataMeta[i + 1]
      if (next?.$?.name === 'calibre:series_index' && next.$.content?.trim()) {
        sequence = next.$.content.trim()
      }
      result.push({ name, sequence })
    }
  }

  if (result.length === 1 && !result[0]?.sequence) {
    const seriesIndexMeta = metadataMeta.find((m) => m.$?.name === 'calibre:series_index' && Boolean(m.$?.content?.trim()))
    const content = seriesIndexMeta?.$?.content?.trim()
    if (content) {
      const first = result[0]
      if (first) first.sequence = content
    }
  }

  return result.filter((se, idx) => result.findIndex((s) => s.name === se.name) === idx)
}

function fetchNarrators(creators: (MetadataCreatorObject | false)[] | null, metadata: XmlOpfMetadata): string[] | null {
  const narrators = fetchCreators(creators, 'nrt')
  if (narrators?.length) return narrators
  try {
    const metaObj = (metadata.meta as XmlOpfMetaDict) || {}
    const rawTag = fetchTagString(metaObj, 'calibre:user_metadata:#narrators')
    if (!rawTag) return null
    const narratorsJSON = JSON.parse(rawTag.replace(/&quot;/g, '"')) as { '#value#'?: string[] }
    return Array.isArray(narratorsJSON['#value#']) ? narratorsJSON['#value#'] : null
  } catch {
    return null
  }
}

function fetchTags(metadata: XmlOpfMetadata): string[] {
  const tags = metadata['dc:tag']
  if (!Array.isArray(tags) || !tags.length) return []
  return [...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag)))]
}

function stripPrefix(str?: string | null): string {
  if (!str) return ''
  return str.split(':').pop() ?? ''
}

export function parseOpfMetadataJson(json: XmlOpfPackage): OpfMetadata | null {
  const packageKey = Object.keys(json).find((key) => stripPrefix(key) === 'package')
  if (!packageKey) return null
  const prefix = packageKey.split(':').shift()
  const pkg = json[packageKey]
  if (!pkg) return null

  let metadata = prefix ? pkg[`${prefix}:metadata`] || pkg.metadata : pkg.metadata
  if (!metadata) return null
  if (Array.isArray(metadata)) {
    if (!metadata.length) return null
    metadata = metadata[0]
  }
  if (!metadata) return null

  const metadataMeta = (prefix ? metadata[`${prefix}:meta`] || metadata.meta : metadata.meta) as XmlOpfMetaNode[] | undefined

  const metaDict: XmlOpfMetaDict = {}
  if (Array.isArray(metadataMeta)) {
    metadataMeta.forEach((m) => {
      if (m?.['$']?.name) {
        metaDict[m['$'].name] = [m['$'].content || '']
      } else if (m?.['$']?.refines) {
        if (!metaDict.refines) {
          metaDict.refines = []
        }
        metaDict.refines.push({
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
  const json = (await xmlToJSON(xml)) as XmlOpfPackage | null
  if (!json) return null
  return parseOpfMetadataJson(json)
}

export default {
  parseOpfMetadataJson,
  parseOpfMetadataXML
}
