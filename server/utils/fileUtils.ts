import axios, { AxiosResponse } from 'axios'
import Path from 'path'
import ssrfFilter from 'ssrf-req-filter'
import { exec } from 'child_process'
import fs from '../libs/fsExtra'
import rra = require('../libs/recursiveReaddirAsync')
import Logger from '../Logger'
import { AudioMimeType } from './constants'

export interface FileTimestampsWithIno {
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  ino: string
}

export interface FilePathItem {
  name: string
  path: string
  reldirpath: string
  fullpath: string
  extension: string
  deep: number
}

export interface PendingFileUpdate {
  path: string
  relPath: string
}

export interface DirectoryInPath {
  path: string
  dirname: string
  level: number
}

interface RraItem {
  fullname: string
  path: string
  name: string
  extension: string
  deep: number
  error?: unknown
}

/**
 * Make sure folder separator is POSIX for Windows file paths. e.g. "C:\Users\Abs" becomes "C:/Users/Abs"
 */
export const filePathToPOSIX = (path: string): string => {
  const isWin = (global as { isWin?: boolean }).isWin
  if (!isWin || !path) return path
  return path.startsWith('\\\\') ? '\\\\' + path.slice(2).replace(/\\/g, '/') : path.replace(/\\/g, '/')
}

/**
 * Check path is a child of or equal to another path
 */
export function isSameOrSubPath(parentPath: string, childPath: string): boolean {
  parentPath = filePathToPOSIX(parentPath)
  childPath = filePathToPOSIX(childPath)
  if (parentPath === childPath) return true
  const relativePath = Path.relative(parentPath, childPath)
  return (
    relativePath === '' || // Same path (e.g. parentPath = '/a/b/', childPath = '/a/b')
    (!relativePath.startsWith('..') && !Path.isAbsolute(relativePath)) // Sub path
  )
}

export async function getFileStat(path: string): Promise<import('fs').Stats | null> {
  try {
    return await fs.stat(path)
  } catch (err) {
    Logger.error('[fileUtils] Failed to stat', err)
    return null
  }
}

export async function getFileTimestampsWithIno(path: string): Promise<FileTimestampsWithIno | false> {
  try {
    const stat = await fs.stat(path, { bigint: true })
    return {
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
      birthtimeMs: Number(stat.birthtimeMs),
      ino: String(stat.ino)
    }
  } catch (err) {
    Logger.error(`[fileUtils] Failed to getFileTimestampsWithIno for path "${path}"`, err)
    return false
  }
}

/**
 * Get file size
 */
export const getFileSize = async (path: string): Promise<number> => {
  const stat = await getFileStat(path)
  return stat?.size ?? 0
}

/**
 * Get file mtimeMs
 */
export const getFileMTimeMs = async (path: string): Promise<number> => {
  try {
    const stat = await getFileStat(path)
    return stat?.mtimeMs ?? 0
  } catch (err) {
    Logger.error(`[fileUtils] Failed to getFileMtimeMs`, err)
    return 0
  }
}

export async function checkPathIsFile(filepath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filepath)
    return stat.isFile()
  } catch {
    return false
  }
}

export function getIno(path: string): Promise<string | null> {
  return fs
    .stat(path, { bigint: true })
    .then((data: { ino: bigint | number }) => String(data.ino))
    .catch((err: unknown) => {
      Logger.warn(`[Utils] Failed to get ino for path "${path}"`, err)
      return null
    })
}

/**
 * Read contents of file
 */
export async function readTextFile(path: string): Promise<string> {
  try {
    const data = await fs.readFile(path)
    return String(data)
  } catch (error) {
    Logger.error(`[FileUtils] ReadTextFile error ${error}`)
    return ''
  }
}

/**
 * Check if file or directory should be ignored. Returns a string of the reason to ignore, or null if not ignored
 */
export const shouldIgnoreFile = (path: string): string | null => {
  // Check if directory or file name starts with "."
  if (Path.basename(path).startsWith('.')) {
    return 'dotfile'
  }
  if (path.split('/').find((p) => p.startsWith('.'))) {
    return 'dotpath'
  }

  // If these strings exist anywhere in the filename or directory name, ignore. Vendor specific hidden directories
  const includeAnywhereIgnore = ['@eaDir']
  const filteredInclude = includeAnywhereIgnore.filter((str) => path.includes(str))
  if (filteredInclude.length) {
    return `${filteredInclude[0]} directory`
  }

  const extensionIgnores = ['.part', '.tmp', '.crdownload', '.download', '.bak', '.old', '.temp', '.tempfile', '.tempfile~']

  // Check extension
  if (extensionIgnores.includes(Path.extname(path).toLowerCase())) {
    return `${Path.extname(path)} file`
  }

  return null
}

/**
 * Get array of files inside dir
 */
export const recurseFiles = async (path: string, relPathToReplace: string | null = null): Promise<FilePathItem[]> => {
  let resolvedPath = filePathToPOSIX(path)
  if (!resolvedPath.endsWith('/')) resolvedPath = resolvedPath + '/'

  let resolvedRelPath: string
  if (relPathToReplace) {
    resolvedRelPath = filePathToPOSIX(relPathToReplace)
    if (!resolvedRelPath.endsWith('/')) resolvedRelPath += '/'
  } else {
    resolvedRelPath = resolvedPath
  }

  const options = {
    mode: rra.LIST,
    recursive: true,
    stats: false,
    ignoreFolders: true,
    extensions: true,
    deep: true,
    realPath: true,
    normalizePath: false
  }
  const result = await rra.list(resolvedPath, options)
  if (!result || (result as { error?: unknown }).error) {
    Logger.error('[fileUtils] Recurse files error', (result as { error?: unknown })?.error)
    return []
  }

  const directoriesToIgnore: string[] = []
  const rawList = Array.isArray(result) ? (result as RraItem[]) : []

  const filteredList = rawList
    .filter((item) => {
      if (item.error) {
        Logger.error(`[fileUtils] Recurse files file "${item.fullname}" has error`, item.error)
        return false
      }

      item.fullname = filePathToPOSIX(item.fullname)
      item.path = filePathToPOSIX(item.path)
      const relpath = item.fullname.replace(resolvedRelPath, '')
      let reldirname = Path.dirname(relpath)
      if (reldirname === '.') reldirname = ''
      const dirname = Path.dirname(item.fullname)

      // Directory has a file named ".ignore" flag directory and ignore
      if (item.name === '.ignore' && reldirname && reldirname !== '.' && !directoriesToIgnore.includes(dirname)) {
        Logger.debug(`[fileUtils] .ignore found - ignoring directory "${reldirname}"`)
        directoriesToIgnore.push(dirname)
        return false
      }

      // Check for ignored extensions or directories
      const shouldIgnore = shouldIgnoreFile(relpath)
      if (shouldIgnore) {
        Logger.debug(`[fileUtils] Ignoring ${shouldIgnore} - "${relpath}"`)
        return false
      }

      return true
    })
    .filter((item) => {
      // Filter out items in ignore directories
      if (directoriesToIgnore.some((dir) => item.fullname.startsWith(dir + '/'))) {
        Logger.debug(`[fileUtils] Ignoring path in dir with .ignore "${item.fullname}"`)
        return false
      }
      return true
    })
    .map((item) => {
      const isInRoot = item.path + '/' === resolvedRelPath
      return {
        name: item.name,
        path: item.fullname.replace(resolvedRelPath, ''),
        reldirpath: isInRoot ? '' : item.path.replace(resolvedRelPath, ''),
        fullpath: item.fullname,
        extension: item.extension,
        deep: item.deep
      }
    })

  // Sort from least deep to most
  filteredList.sort((a, b) => a.deep - b.deep)

  return filteredList
}

export const getFilePathItemFromFileUpdate = (fileUpdate: PendingFileUpdate): FilePathItem => {
  let relPath = fileUpdate.relPath
  if (relPath.startsWith('/')) relPath = relPath.slice(1)

  const dirname = Path.dirname(relPath)
  return {
    name: Path.basename(relPath),
    path: relPath,
    reldirpath: dirname === '.' ? '' : dirname,
    fullpath: fileUpdate.path,
    extension: Path.extname(relPath),
    deep: relPath.split('/').length - 1
  }
}

/**
 * Download file from web to local file system
 * Uses SSRF filter to prevent internal URLs
 */
export const downloadFile = (
  url: string,
  filepath: string,
  contentTypeFilter: ((contentType?: string | null) => boolean) | null = null
): Promise<void> => {
  return new Promise((resolve, reject) => {
    Logger.debug(`[fileUtils] Downloading file to ${filepath}`)

    const disableSsrf = (global as { DisableSsrfRequestFilter?: (url: string) => boolean }).DisableSsrfRequestFilter
    const isSsrfDisabled = typeof disableSsrf === 'function' && disableSsrf(url)
    const agent = isSsrfDisabled ? null : ssrfFilter(url)

    axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': 'audiobookshelf (+https://audiobookshelf.org)'
      },
      timeout: 30000,
      httpAgent: agent,
      httpsAgent: agent
    })
      .then((response: AxiosResponse<import('stream').Readable>) => {
        const contentType = response.headers?.['content-type'] as string | undefined
        // Validate content type
        if (contentTypeFilter && !contentTypeFilter(contentType)) {
          return reject(new Error(`Invalid content type "${contentType ?? ''}"`))
        }

        const contentLengthHeader = response.headers?.['content-length'] as string | undefined
        const totalSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0
        let downloadedSize = 0

        // Write to filepath
        const writer = fs.createWriteStream(filepath)
        response.data.pipe(writer)

        let lastProgress = 0
        response.data.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length
          const progress = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0
          if (progress >= lastProgress + 5) {
            Logger.debug(`[fileUtils] File "${Path.basename(filepath)}" download progress: ${progress}% (${downloadedSize}/${totalSize} bytes)`)
            lastProgress = progress
          }
        })

        writer.on('finish', () => resolve())
        writer.on('error', (err: Error) => reject(err))
      })
      .catch((err: unknown) => {
        Logger.error(`[fileUtils] Failed to download file "${filepath}"`, err)
        reject(err)
      })
  })
}

/**
 * Download image file from web to local file system
 * Response header must have content-type of image/ (excluding svg)
 */
export const downloadImageFile = (url: string, filepath: string): Promise<void> => {
  const contentTypeFilter = (contentType?: string | null) => {
    return Boolean(contentType?.startsWith('image/') && contentType !== 'image/svg+xml')
  }
  return downloadFile(url, filepath, contentTypeFilter)
}

export const sanitizeFilename = (filename?: string | null, colonReplacement = ' - '): string | false => {
  if (typeof filename !== 'string') {
    return false
  }

  // Normalize the string first to ensure consistent byte calculations
  filename = filename.normalize('NFC')

  const MAX_FILENAME_BYTES = 255

  const replacement = ''
  const illegalRe = /[\/\?<>\\:\*\|"]/g
  const controlRe = /[\x00-\x1f\x80-\x9f]/g
  const reservedRe = /^\.+$/
  const windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
  const windowsTrailingRe = /[\. ]+$/
  const lineBreaks = /[\n\r]/g

  let sanitized = filename
    .replace(':', colonReplacement) // Replace first occurrence of a colon
    .replace(illegalRe, replacement)
    .replace(controlRe, replacement)
    .replace(reservedRe, replacement)
    .replace(lineBreaks, replacement)
    .replace(windowsReservedRe, replacement)
    .replace(windowsTrailingRe, replacement)
    .replace(/\s+/g, ' ') // Replace consecutive spaces with a single space

  // Check if basename is too many bytes
  const ext = Path.extname(sanitized)
  const basename = Path.basename(sanitized, ext)
  const extByteLength = Buffer.byteLength(ext, 'utf16le')

  const basenameByteLength = Buffer.byteLength(basename, 'utf16le')
  if (basenameByteLength + extByteLength > MAX_FILENAME_BYTES) {
    Logger.debug(`[fileUtils] Filename "${filename}" is too long (${basenameByteLength + extByteLength} bytes), trimming basename to ${MAX_FILENAME_BYTES - extByteLength} bytes.`)

    const MaxBytesForBasename = MAX_FILENAME_BYTES - extByteLength
    let totalBytes = 0
    let trimmedBasename = ''

    // Add chars until max bytes is reached
    for (const char of basename) {
      totalBytes += Buffer.byteLength(char, 'utf16le')
      if (totalBytes > MaxBytesForBasename) break
      else trimmedBasename += char
    }

    trimmedBasename = trimmedBasename.trim()
    sanitized = trimmedBasename + ext
  }

  if (filename !== sanitized) {
    Logger.debug(`[fileUtils] Sanitized filename "${filename}" to "${sanitized}" (${Buffer.byteLength(sanitized, 'utf16le')} bytes)`)
  }

  return sanitized
}

// Returns null if extname is not in our defined list of audio extnames
export const getAudioMimeTypeFromExtname = (extname?: string | null): string | null => {
  if (!extname || !extname.length) return null
  const formatUpper = extname.slice(1).toUpperCase()
  const mimeMap = AudioMimeType as Record<string, string>
  if (formatUpper in mimeMap) return mimeMap[formatUpper] ?? null
  return null
}

export const removeFile = (path?: string | null): Promise<boolean> => {
  if (!path) return Promise.resolve(false)
  return fs
    .remove(path)
    .then(() => true)
    .catch((error: unknown) => {
      Logger.error(`[fileUtils] Failed remove file "${path}"`, error)
      return false
    })
}

export const encodeUriPath = (path: string): string => {
  const uri = new URL('/', 'file://')
  uri.pathname = path
  return uri.pathname
}

/**
 * Check if directory is writable.
 */
export const isWritable = async (directory: string): Promise<boolean> => {
  try {
    const accessTestFile = Path.join(directory, 'accessTest')
    await fs.writeFile(accessTestFile, '')
    await fs.remove(accessTestFile)
    return true
  } catch (err) {
    Logger.info(`[fileUtils] Directory is not writable "${directory}"`, err)
    return false
  }
}

/**
 * Get Windows drives as array e.g. ["C:/", "F:/"]
 */
export const getWindowsDrives = async (): Promise<string[]> => {
  const isWin = (global as { isWin?: boolean }).isWin
  if (!isWin) {
    return []
  }
  return new Promise((resolve, reject) => {
    exec('powershell -Command "(Get-PSDrive -PSProvider FileSystem).Name"', async (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      const drives = (stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const validDrives: string[] = []
      for (const drive of drives) {
        const drivepath = drive + ':/'
        if (await fs.pathExists(drivepath)) {
          validDrives.push(drivepath)
        } else {
          Logger.error(`Invalid drive ${drivepath}`)
        }
      }
      resolve(validDrives)
    })
  })
}

/**
 * Get array of directory paths in a directory
 */
export const getDirectoriesInPath = async (dirPath: string, level: number): Promise<DirectoryInPath[]> => {
  try {
    const paths = (await fs.readdir(dirPath)) as string[]
    const dirs = await Promise.all(
      paths.map(async (dirname) => {
        const fullPath = Path.join(dirPath, dirname)

        const lstat = await fs.lstat(fullPath).catch((error: unknown) => {
          Logger.debug(`Failed to lstat "${fullPath}"`, error)
          return null
        })
        if (!lstat?.isDirectory()) return null

        return {
          path: filePathToPOSIX(fullPath),
          dirname,
          level
        }
      })
    )
    return dirs.filter((d): d is DirectoryInPath => d !== null)
  } catch (error) {
    Logger.error('Failed to readdir', dirPath, error)
    return []
  }
}

/**
 * Copies a file from the source path to an existing destination path, preserving the destination's permissions.
 */
export async function copyToExisting(srcPath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(srcPath)
    const writeStream = fs.createWriteStream(destPath, { flags: 'w' })

    readStream.pipe(writeStream)

    writeStream.on('finish', () => {
      Logger.debug(`[copyToExisting] Successfully copied file from ${srcPath} to ${destPath}`)
      resolve()
    })

    readStream.on('error', (error: Error) => {
      Logger.error(`[copyToExisting] Error reading from source file ${srcPath}: ${error.message}`)
      readStream.close()
      writeStream.close()
      reject(error)
    })

    writeStream.on('error', (error: Error) => {
      Logger.error(`[copyToExisting] Error writing to destination file ${destPath}: ${error.message}`)
      readStream.close()
      writeStream.close()
      reject(error)
    })
  })
}

export default {
  filePathToPOSIX,
  isSameOrSubPath,
  getFileStat,
  getFileTimestampsWithIno,
  getFileSize,
  getFileMTimeMs,
  checkPathIsFile,
  getIno,
  readTextFile,
  shouldIgnoreFile,
  recurseFiles,
  getFilePathItemFromFileUpdate,
  downloadFile,
  downloadImageFile,
  sanitizeFilename,
  getAudioMimeTypeFromExtname,
  removeFile,
  encodeUriPath,
  isWritable,
  getWindowsDrives,
  getDirectoriesInPath,
  copyToExisting
}
