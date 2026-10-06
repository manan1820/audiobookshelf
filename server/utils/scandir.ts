import Path from 'path'
import { filePathToPOSIX } from './fileUtils'
import globals from './globals'
import LibraryFile from '../objects/files/LibraryFile'
import * as parseNameString from './parsers/parseNameString'
import { FilePathItem, LibraryItemFilenameMetadata } from '../types'

interface GlobalServerSettings {
  ServerSettings?: {
    scannerParseSubtitle?: boolean
  }
}

export function isMediaFile(mediaType: string, ext?: string | null, audiobooksOnly = false): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  if (mediaType === 'podcast') return (globals.SupportedAudioTypes as readonly string[]).includes(extclean)
  else if (audiobooksOnly) return (globals.SupportedAudioTypes as readonly string[]).includes(extclean)
  return (globals.SupportedAudioTypes as readonly string[]).includes(extclean) || (globals.SupportedEbookTypes as readonly string[]).includes(extclean)
}

export function isScannableNonMediaFile(ext?: string | null): boolean {
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return (
    (globals.TextFileTypes as readonly string[]).includes(extclean) ||
    (globals.MetadataFileTypes as readonly string[]).includes(extclean) ||
    (globals.SupportedImageTypes as readonly string[]).includes(extclean)
  )
}

export function checkFilepathIsAudioFile(filepath: string): boolean {
  const ext = Path.extname(filepath)
  if (!ext) return false
  const extclean = ext.slice(1).toLowerCase()
  return (globals.SupportedAudioTypes as readonly string[]).includes(extclean)
}

export function groupFileItemsIntoLibraryItemDirs(
  mediaType: string,
  fileItems: FilePathItem[],
  audiobooksOnly = false,
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
    if (isMediaFile(mediaType, item.extension, audiobooksOnly) || (includeNonMediaFiles && isScannableNonMediaFile(item.extension))) {
      mediaFileItems.push(item)
    } else {
      otherFileItems.push(item)
    }
  })

  // Step 3: Group media files (or non-media files if includeNonMediaFiles is true) in library items
  const libraryItemGroup: Record<string, string | string[]> = {}
  mediaFileItems.forEach((item) => {
    const dirparts = item.reldirpath.split('/').filter((p) => Boolean(p))
    const numparts = dirparts.length
    let _path = ''

    if (!dirparts.length) {
      // Media file in root
      libraryItemGroup[item.name] = item.name
    } else {
      // Iterate over directories in path
      for (let i = 0; i < numparts; i++) {
        const dirpart = dirparts.shift()!
        _path = Path.posix.join(_path, dirpart)

        const existing = libraryItemGroup[_path]
        if (existing && Array.isArray(existing)) {
          // Directory already has files, add file
          const relpath = Path.posix.join(dirparts.join('/'), item.name)
          existing.push(relpath)
          return
        } else if (!dirparts.length) {
          // This is the last directory, create group
          libraryItemGroup[_path] = [item.name]
          return
        } else if (dirparts.length === 1 && /^(cd|dis[ck])\s*\d{1,3}$/i.test(dirparts[0])) {
          // Next directory is the last and is a CD dir, create group
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

    // Iterate over directories in path
    for (let i = 0; i < numparts; i++) {
      const dirpart = dirparts.shift()!
      _path = Path.posix.join(_path, dirpart)
      const existing = libraryItemGroup[_path]
      if (existing && Array.isArray(existing)) {
        // Directory is audiobook group
        const relpath = Path.posix.join(dirparts.join('/'), item.name)
        existing.push(relpath)
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

export function getBookDataFromDir(relPath: string, parseSubtitle = false): LibraryItemFilenameMetadata {
  const splitDir = relPath.split('/')

  const titleFolder = splitDir.pop() || '' // Audio files will always be in the directory named for the title
  const series = splitDir.length > 1 ? splitDir.pop() : null // If there are at least 2 more directories, next furthest will be the series
  const author = splitDir.length > 0 ? splitDir.pop() : null // There could be many more directories, but only the top 3 are used for naming /author/series/title/

  // Each extractor strips one piece of metadata and returns the remaining folder name.
  const [afterAsin, asin] = getASIN(titleFolder)
  const [afterNarrators, narrators] = getNarrator(afterAsin)
  const [afterSequence, sequence] = series ? getSequence(afterNarrators) : [afterNarrators, null]
  const [afterYear, publishedYear] = getPublishedYear(afterSequence)
  const [title, subtitle] = parseSubtitle ? getSubtitle(afterYear) : [afterYear, null]

  return {
    title,
    subtitle,
    asin,
    authors: parseNameString.parse(author)?.names || [],
    narrators: parseNameString.parse(narrators)?.names || [],
    seriesName: series,
    seriesSequence: sequence,
    publishedYear
  }
}

export function getNarrator(folder: string): [string, string | null] {
  const pattern = /^(?<title>.*) \{(?<narrators>.*)\}$/
  const match = folder.match(pattern)
  return match && match.groups ? [match.groups.title, match.groups.narrators] : [folder, null]
}

export function getSequence(folder: string): [string, string | null] {
  // Matches a valid volume string. Also matches a book whose title starts with a 1 to 3 digit number. Will handle that later.
  const pattern = /^(?<volumeLabel>vol\.? |volume |book )?(?<sequence>\d{0,3}(?:\.\d{1,2})?)(?<trailingDot>\.?)(?: (?<suffix>.*))?$/i

  let volumeNumber: string | null = null
  const parts = folder.split(' - ')
  for (let i = 0; i < parts.length; i++) {
    const match = parts[i].match(pattern)
    // This excludes '101 Dalmations' but includes '101. Dalmations'
    if (match && match.groups && !(match.groups.suffix && !(match.groups.volumeLabel || match.groups.trailingDot))) {
      volumeNumber = isNaN(Number(match.groups.sequence)) ? match.groups.sequence : Number(match.groups.sequence).toString()
      parts[i] = match.groups.suffix
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

  const pattern = /^ *\(?([0-9]{4})\)? * - *(.+)/ // Matches #### - title or (####) - title
  const match = folder.match(pattern)
  if (match) {
    publishedYear = match[1]
    folder = match[2]
  }

  return [folder, publishedYear]
}

export function getSubtitle(folder: string): [string, string | null] {
  // Subtitle is everything after " - "
  const splitTitle = folder.split(' - ')
  const title = splitTitle.shift() || ''
  const subtitle = splitTitle.length ? splitTitle.join(' - ') : null
  return [title, subtitle]
}

export function getASIN(folder: string): [string, string | null] {
  let asin: string | null = null

  const pattern = /(?: |^)\[([A-Z0-9]{10})](?= |$)/ // Matches "[B0015T963C]"
  const match = folder.match(pattern)
  if (match) {
    asin = match[1]
    folder = folder.replace(match[0], '')
  }
  return [folder.trim(), asin]
}

export function getPodcastDataFromDir(relPath: string): LibraryItemFilenameMetadata {
  const splitDir = relPath.split('/')
  const title = splitDir.pop()
  return {
    title
  }
}

export function getDataFromMediaDir(
  libraryMediaType: string,
  folderPath: string,
  relPath: string
): { mediaMetadata: LibraryItemFilenameMetadata | null; relPath: string; path: string } {
  const normalizedRelPath = filePathToPOSIX(relPath)
  const fullPath = Path.posix.join(folderPath, normalizedRelPath)
  let mediaMetadata: LibraryItemFilenameMetadata | null = null

  if (libraryMediaType === 'podcast') {
    mediaMetadata = getPodcastDataFromDir(normalizedRelPath)
  } else {
    // book
    const scannerParseSubtitle = (global as unknown as GlobalServerSettings).ServerSettings?.scannerParseSubtitle
    mediaMetadata = getBookDataFromDir(normalizedRelPath, Boolean(scannerParseSubtitle))
  }

  return {
    mediaMetadata,
    relPath: normalizedRelPath,
    path: fullPath
  }
}
