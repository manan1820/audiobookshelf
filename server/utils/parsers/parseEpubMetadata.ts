import Path from 'path'
import Logger from '../../Logger'
import StreamZip from '../../libs/nodeStreamZip'
import { parseOpfMetadataJson } from './parseOpfMetadata'
import { xmlToJSON } from '../index'
import { EBookFileObject, EBookFileScanData } from '../../types'

interface ContainerXmlRootfile {
  $?: {
    'full-path'?: string
  }
}

interface ContainerJson {
  container?: {
    rootfiles?: Array<{
      rootfile?: ContainerXmlRootfile[]
    }>
  }
}

interface PackageManifestItem {
  $?: {
    id?: string
    href?: string
    'media-type'?: string
    properties?: string
  }
}

interface PackageMetaItem {
  $?: {
    name?: string
    content?: string
    [key: string]: string | undefined
  }
}

interface PackageJson {
  package?: {
    metadata?:
      | Array<{
          meta?: PackageMetaItem[]
        }>
      | {
          meta?: PackageMetaItem[]
        }
    manifest?: Array<{
      item?: PackageManifestItem[]
    }>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Extract file from epub and return string content
 */
async function extractFileFromEpub(epubPath: string, filepath: string): Promise<string | undefined> {
  const zip = new StreamZip.async({ file: epubPath })
  const data = await zip.entryData(filepath).catch((error: unknown) => {
    Logger.error(`[parseEpubMetadata] Failed to extract ${filepath} from epub at "${epubPath}"`, error)
    return undefined
  })
  const filedata = data?.toString('utf8')
  await zip.close().catch((error: unknown) => {
    Logger.error(`[parseEpubMetadata] Failed to close zip`, error)
  })

  return filedata
}

/**
 * Extract an XML file from epub and return JSON
 */
async function extractXmlToJson<T = Record<string, unknown>>(epubPath: string, xmlFilepath: string): Promise<T | null> {
  const filedata = await extractFileFromEpub(epubPath, xmlFilepath)
  if (!filedata) return null
  const json = await xmlToJSON(filedata)
  return json as T | null
}

/**
 * Extract cover image from epub return true if success
 */
export async function extractCoverImage(epubPath: string, epubImageFilepath: string, outputCoverPath: string): Promise<boolean> {
  const zip = new StreamZip.async({ file: epubPath })

  const success = await zip
    .extract(epubImageFilepath, outputCoverPath)
    .then(() => true)
    .catch((error: unknown) => {
      Logger.error(`[parseEpubMetadata] Failed to extract image ${epubImageFilepath} from epub at "${epubPath}"`, error)
      return false
    })

  await zip.close().catch((error: unknown) => {
    Logger.error(`[parseEpubMetadata] Failed to close zip`, error)
  })

  return success
}

/**
 * Parse metadata from epub
 */
export async function parse(ebookFile: EBookFileObject): Promise<EBookFileScanData | null> {
  const epubPath = ebookFile.metadata.path
  Logger.debug(`Parsing metadata from epub at "${epubPath}"`)
  // Entrypoint of the epub that contains the filepath to the package document (opf file)
  const containerJson = await extractXmlToJson<ContainerJson>(epubPath, 'META-INF/container.xml')
  if (!containerJson) {
    return null
  }

  // Get package document opf filepath from container.xml
  const packageDocPath = containerJson.container?.rootfiles?.[0]?.rootfile?.[0]?.$?.['full-path']
  if (!packageDocPath) {
    Logger.error(`Failed to get package doc path in Container.xml`, JSON.stringify(containerJson, null, 2))
    return null
  }

  // Extract package document to JSON
  const packageJson = await extractXmlToJson<PackageJson>(epubPath, packageDocPath)
  if (!packageJson) {
    return null
  }

  // Parse metadata from package document opf file
  const opfMetadata = parseOpfMetadataJson(structuredClone(packageJson) as Record<string, unknown>)
  if (!opfMetadata) {
    Logger.error(`Unable to parse metadata in package doc with json`, JSON.stringify(packageJson, null, 2))
    return null
  }

  const payload: EBookFileScanData = {
    path: epubPath,
    ebookFormat: 'epub',
    metadata: opfMetadata
  }

  // Attempt to find filepath to cover image:
  // Metadata may include <meta name="cover" content="id"/> where content is the id of the cover image in the manifest
  // Otherwise find image in the manifest with cover-image property set
  // As a fallback the first image in the manifest is used as the cover image
  let packageMetadata = packageJson.package?.metadata
  if (Array.isArray(packageMetadata)) {
    packageMetadata = packageMetadata[0]
  }
  const metaList = Array.isArray(packageMetadata?.meta) ? packageMetadata.meta : []
  const metaCoverId = metaList.find((meta) => meta.$?.name === 'cover')?.$?.content

  const manifestItems = packageJson.package?.manifest?.[0]?.item || []
  let manifestFirstImage: PackageManifestItem | undefined
  if (metaCoverId) {
    manifestFirstImage = manifestItems.find((item) => item.$?.id === metaCoverId)
  }
  if (!manifestFirstImage) {
    manifestFirstImage = manifestItems.find((item) => item.$?.['properties']?.split(' ')?.includes('cover-image'))
  }
  if (!manifestFirstImage) {
    manifestFirstImage = manifestItems.find((item) => item.$?.['media-type']?.startsWith('image/'))
  }

  const coverImagePath = manifestFirstImage?.$?.href
  if (coverImagePath) {
    const packageDirname = Path.dirname(packageDocPath)
    payload.ebookCoverPath = Path.posix.join(packageDirname, coverImagePath)
  } else {
    Logger.warn(`Cover image not found in manifest for epub at "${epubPath}"`)
  }

  return payload
}
