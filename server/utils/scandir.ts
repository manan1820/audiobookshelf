import Path from 'path'
import { filePathToPOSIX, FilePathItem } from './fileUtils'
import globals from './globals'
import LibraryFile from '../objects/files/LibraryFile'
import parseNameString from './parsers/parseNameString'

export interface LibraryItemFilenameMetadata {
  title?: string | null
  subtitle?: string | null
  asin?: string | null
  authors?: string[]
  narrators?: string[]
  seriesName?: string | null
  seriesSequence?: string | null
  publishedYear?: string | null
}

export function isMediaFile(mediaType: string, ext?: string | null, audiobooksOnly = false): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  if (mediaType === 'podcast') return globals.SupportedAudioTypes.includes(extclean)
  else if (audiobooksOnly) return globals.SupportedAudioTypes.includes(extclean)
  return globals.SupportedAudioTypes.includes(extclean) || globals.SupportedEbookTypes.includes(extclean)
}

export function isScannableNonMediaFile(ext?: string | null): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return (
    globals.TextFileTypes.includes(extclean) ||
    globals.MetadataFileTypes.includes(extclean) ||
    globals.SupportedImageTypes.includes(extclean)
  )
}

export function checkFilepathIsAudioFile(filepath: string): boolean {
  const ext = Path.extname(filepath)
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return globals.SupportedAudioTypes.includes(extclean)
}

export function groupFileItemsIntoLibraryItemDirs(
  mediaType: string,
  fileItems: FilePathItem[],
  audiobooksOnly: boolean,
  includeNonMediaFiles = false
): Record<string, string | string[]> {
  // Step 1: Filter out non-book-media files in root dir (with depth of 0)
  const itemsFiltered = fileItems.filter((i) => {
    return i.deep > 0 || (mediaType === 'book' && isMediaFile(mediaType, i.extension, audiobooksOnly))
  })

  // Step 2: Separate media files and other files
  const mediaFileItems: FilePathItem[] = []
  const otherFileItems: FilePathItem[] = []
  itemsFiltered.forEach((item) => {
    if (
      isMediaFile(mediaType, item.extension, audiobooksOnly) ||
      (includeNonMediaFiles && isScannableNonMediaFile(item.extension))
    ) {
      mediaFileItems.push(item)
    } else {
      otherFileItems.push(item)
    }
  })

  // Step 3: Group media files in library items
  const libraryItemGroup: Record<string, string | string[]> = {}
  mediaFileItems.forEach((item) => {
    const dirparts = item.reldirpath.split('/').filter((p) => Boolean(p))
    const numparts = dirparts.length
    let _path = ''

    if (!dirparts.length) {
      // Media file in root
      libraryItemGroup[item.name] = item.name
    } else {
      for (let i = 0; i < numparts; i++) {
        const dirpart = dirparts.shift()
        if (!dirpart) continue
        _path = Path.posix.join(_path, dirpart)

        const existingGroup = libraryItemGroup[_path]
        if (Array.isArray(existingGroup)) {
          const relpath = Path.posix.join(dirparts.join('/'), item.name)
          existingGroup.push(relpath)
          return
        } else if (!dirparts.length) {
          libraryItemGroup[_path] = [item.name]
          return
        } else if (dirparts.length === 1 && /^(cd|dis[ck])\s*\d{1,3}$/i.test(dirparts[0])) {
          libraryItemGroup[_path] = [Path.posix.join(dirparts[0], item.name)]
          return
        }
      }
    }
  })

  // Step 4: Add other files into library item groups
  otherFileItems.forEach((item) => {
    const dirparts = item.reldirpath.split('/')
    const numparts = dirparts.length
    let _path = ''

    for (let i = 0; i < numparts; i++) {
      const dirpart = dirparts.shift()
      if (!dirpart) continue
      _path = Path.posix.join(_path, dirpart)
      const existingGroup = libraryItemGroup[_path]
      if (Array.isArray(existingGroup)) {
        const relpath = Path.posix.join(dirparts.join('/'), item.name)
        existingGroup.push(relpath)
        return
      }
    }
  })
  return libraryItemGroup
}

export function buildLibraryFile(libraryItemPath: string, files: string[]): Promise<LibraryFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const filePath = Path.posix.join(libraryItemPath, file)
      const newLibraryFile = new LibraryFile()
      await newLibraryFile.setDataFromPath(filePath, file)
      return newLibraryFile
    })
  )
}

export function getNarrator(folder: string): [string, string | null] {
  const pattern = /^(?<title>.*) \{(?<narrators>.*)\}$/
  const match = folder.match(pattern)
  if (match?.groups?.title && match.groups.narrators) {
    return [match.groups.title, match.groups.narrators]
  }
  return [folder, null]
}

export function getSequence(folder: string): [string, string | null] {
  const pattern = /^(?<volumeLabel>vol\.? |volume |book )?(?<sequence>\d{0,3}(?:\.\d{1,2})?)(?<trailingDot>\.?)(?: (?<suffix>.*))?$/i

  let volumeNumber: string | null = null
  const parts = folder.split(' - ')
  for (let i = 0; i < parts.length; i++) {
    const match = parts[i]?.match(pattern)
    if (match?.groups?.sequence && !(match.groups.suffix && !(match.groups.volumeLabel || match.groups.trailingDot))) {
      volumeNumber = isNaN(Number(match.groups.sequence))
        ? match.groups.sequence
        : Number(match.groups.sequence).toString()
      parts[i] = match.groups.suffix ?? ''
      if (!parts[i]) {
        parts.splice(i, 1)
      }
      break
    }
  }

  folder = parts.join(' - ')
  return [folder, volumeNumber]
}

export function getPublishedYear(folder: string): [string, string | null] {
  let publishedYear: string | null = null

  const pattern = /^ *\(?([0-9]{4})\)? * - *(.+)/
  const match = folder.match(pattern)
  if (match && match[1] && match[2]) {
    publishedYear = match[1]
    folder = match[2]
  }

  return [folder, publishedYear]
}

export function getSubtitle(folder: string): [string | null, string | null] {
  const splitTitle = folder.split(' - ')
  return [splitTitle.shift() ?? null, splitTitle.join(' - ') || null]
}

export function getASIN(folder: string): [string, string | null] {
  let asin: string | null = null

  const pattern = /(?: |^)\[([A-Z0-9]{10})](?= |$)/
  const match = folder.match(pattern)
  if (match && match[0] && match[1]) {
    asin = match[1]
    folder = folder.replace(match[0], '')
  }
  return [folder.trim(), asin]
}

export function getBookDataFromDir(relPath: string, parseSubtitle = false): LibraryItemFilenameMetadata {
  const splitDir = relPath.split('/')

  const titleFolder = splitDir.pop() ?? ''
  const series = splitDir.length > 1 ? splitDir.pop() ?? null : null
  const author = splitDir.length > 0 ? splitDir.pop() ?? null : null

  const [afterAsin, asin] = getASIN(titleFolder)
  const [afterNarrators, narrators] = getNarrator(afterAsin)
  const [afterSequence, sequence] = series ? getSequence(afterNarrators) : [afterNarrators, null]
  const [afterYear, publishedYear] = getPublishedYear(afterSequence)
  const [title, subtitle] = parseSubtitle ? getSubtitle(afterYear) : [afterYear, null]

  const parsedAuthors = author ? parseNameString.parse(author)?.names ?? [] : []
  const parsedNarrators = narrators ? parseNameString.parse(narrators)?.names ?? [] : []

  return {
    title,
    subtitle,
    asin,
    authors: parsedAuthors,
    narrators: parsedNarrators,
    seriesName: series,
    seriesSequence: sequence,
    publishedYear
  }
}

export function getPodcastDataFromDir(relPath: string): LibraryItemFilenameMetadata {
  const splitDir = relPath.split('/')
  const title = splitDir.pop() ?? ''
  return {
    title
  }
}

export function getDataFromMediaDir(
  libraryMediaType: string,
  folderPath: string,
  relPath: string
): { mediaMetadata: LibraryItemFilenameMetadata | null; relPath: string; path: string } {
  relPath = filePathToPOSIX(relPath)
  const fullPath = Path.posix.join(folderPath, relPath)
  let mediaMetadata: LibraryItemFilenameMetadata | null = null

  if (libraryMediaType === 'podcast') {
    mediaMetadata = getPodcastDataFromDir(relPath)
  } else {
    const serverSettings = (global as { ServerSettings?: { scannerParseSubtitle?: boolean } }).ServerSettings
    mediaMetadata = getBookDataFromDir(relPath, Boolean(serverSettings?.scannerParseSubtitle))
  }

  return {
    mediaMetadata,
    relPath,
    path: fullPath
  }
}

export default {
  isMediaFile,
  isScannableNonMediaFile,
  checkFilepathIsAudioFile,
  groupFileItemsIntoLibraryItemDirs,
  buildLibraryFile,
  getBookDataFromDir,
  getNarrator,
  getSequence,
  getPublishedYear,
  getSubtitle,
  getASIN,
  getPodcastDataFromDir,
  getDataFromMediaDir
}
