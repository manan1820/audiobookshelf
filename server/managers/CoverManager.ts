import Path from 'path'
import type { UploadedFile } from 'express'
import fs from '../libs/fsExtra'
import Logger from '../Logger'
import readChunk from '../libs/readChunk'
import imageType from '../libs/imageType'

import globals from '../utils/globals'
import { downloadImageFile, filePathToPOSIX, checkPathIsFile } from '../utils/fileUtils'
import { extractCoverArt } from '../utils/ffmpegHelpers'
import parseEbookMetadata from '../utils/parsers/parseEbookMetadata'
import CacheManager from './CacheManager'
import type LibraryItem from '../models/LibraryItem'
import type { AudioFileObject, EBookFileScanData } from '../types'

type CheckImageResult = { ext: string; mime: string } | { error: string }

type CoverResult = { cover: string; updated?: boolean } | { error: string }

class CoverManager {
  getCoverDirectory(libraryItem: LibraryItem): string {
    if (global.ServerSettings?.storeCoverWithItem && !libraryItem.isFile) {
      return libraryItem.path
    } else {
      return Path.posix.join(Path.posix.join(global.MetadataPath, 'items'), libraryItem.id)
    }
  }

  async getFilesInDirectory(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir)
    } catch (error: unknown) {
      Logger.error(`[CoverManager] Failed to get files in dir ${dir}`, error)
      return []
    }
  }

  removeFile(filepath: string): Promise<boolean> {
    try {
      return fs.pathExists(filepath).then((exists) => {
        if (!exists) Logger.warn(`[CoverManager] Attempting to remove file that does not exist ${filepath}`)
        return exists
          ? fs.unlink(filepath).then(() => true).catch(() => false)
          : false
      })
    } catch (error: unknown) {
      Logger.error(`[CoverManager] Failed to remove file "${filepath}"`, error)
      return Promise.resolve(false)
    }
  }

  // Remove covers that dont have the same filename as the new cover
  async removeOldCovers(dirpath: string, newCoverExt: string): Promise<void> {
    const filesInDir = await this.getFilesInDirectory(dirpath)

    const imageExtensions = ['.jpeg', '.jpg', '.png', '.webp', '.jiff']
    for (let i = 0; i < filesInDir.length; i++) {
      const file = filesInDir[i]
      const extname = Path.extname(file).toLowerCase()
      const filename = Path.basename(file, extname).toLowerCase()
      if (filename === 'cover' && extname !== newCoverExt && imageExtensions.includes(extname)) {
        const filepath = Path.join(dirpath, file)
        Logger.debug(`[CoverManager] Removing old cover from metadata "${filepath}"`)
        await this.removeFile(filepath)
      }
    }
  }

  async checkFileIsValidImage(imagepath: string, removeOnInvalid = false): Promise<CheckImageResult> {
    const buffer = await readChunk(imagepath, 0, 12)
    const imgType = imageType(buffer)
    if (!imgType) {
      if (removeOnInvalid) await this.removeFile(imagepath)
      return {
        error: 'Invalid image'
      }
    }

    if (!globals.SupportedImageTypes.includes(imgType.ext)) {
      if (removeOnInvalid) await this.removeFile(imagepath)
      return {
        error: `Invalid image type ${imgType.ext} (Supported: ${globals.SupportedImageTypes.join(',')})`
      }
    }
    return imgType
  }

  async uploadCover(libraryItem: LibraryItem, coverFile: UploadedFile): Promise<CoverResult> {
    const extname = Path.extname(coverFile.name.toLowerCase())
    if (!extname || !globals.SupportedImageTypes.includes(extname.slice(1))) {
      return {
        error: `Invalid image type ${extname} (Supported: ${globals.SupportedImageTypes.join(',')})`
      }
    }

    const coverDirPath = this.getCoverDirectory(libraryItem)
    await fs.ensureDir(coverDirPath)

    const coverFullPath = Path.posix.join(coverDirPath, `cover${extname}`)

    // Move cover from temp upload dir to destination
    const success = await coverFile
      .mv(coverFullPath)
      .then(() => true)
      .catch((error: unknown) => {
        Logger.error('[CoverManager] Failed to move cover file', coverFullPath, error)
        return false
      })

    if (!success) {
      return {
        error: 'Failed to move cover into destination'
      }
    }

    await this.removeOldCovers(coverDirPath, extname)
    await CacheManager.purgeCoverCache(libraryItem.id)

    Logger.info(`[CoverManager] Uploaded libraryItem cover "${coverFullPath}" for "${libraryItem.media?.title || 'Unknown'}"`)

    return {
      cover: coverFullPath
    }
  }

  async validateCoverPath(coverPath: string, libraryItem: LibraryItem): Promise<CoverResult> {
    // Invalid cover path
    if (!coverPath || coverPath.startsWith('http:') || coverPath.startsWith('https:')) {
      Logger.error(`[CoverManager] validate cover path invalid http url "${coverPath}"`)
      return {
        error: 'Invalid cover path'
      }
    }
    let normalizedCoverPath = filePathToPOSIX(coverPath)

    // Must already have been scanned in for the library item
    const isLibraryItemFile = libraryItem.libraryFiles?.some((lf) => !!lf.metadata?.path && filePathToPOSIX(lf.metadata.path) === normalizedCoverPath)
    if (!isLibraryItemFile) {
      Logger.error(`[CoverManager] validate cover path is not a library item file "${normalizedCoverPath}"`)
      return {
        error: 'Invalid cover path'
      }
    }

    if (!libraryItem.media) {
      return {
        error: 'Invalid media'
      }
    }

    // Cover path already set on media
    if (libraryItem.media.coverPath === normalizedCoverPath) {
      Logger.debug(`[CoverManager] validate cover path already set "${normalizedCoverPath}"`)
      return {
        cover: normalizedCoverPath,
        updated: false
      }
    }

    // Cover path does not exist
    if (!(await fs.pathExists(normalizedCoverPath))) {
      Logger.error(`[CoverManager] validate cover path does not exist "${normalizedCoverPath}"`)
      return {
        error: 'Cover path does not exist'
      }
    }

    // Cover path is not a file
    if (!(await checkPathIsFile(normalizedCoverPath))) {
      Logger.error(`[CoverManager] validate cover path is not a file "${normalizedCoverPath}"`)
      return {
        error: 'Cover path is not a file'
      }
    }

    // Check valid image at path
    const imgtype = await this.checkFileIsValidImage(normalizedCoverPath, false)
    if ('error' in imgtype) {
      return imgtype
    }

    const coverDirPath = this.getCoverDirectory(libraryItem)

    // Cover path is not in correct directory - make a copy
    if (!normalizedCoverPath.startsWith(coverDirPath)) {
      await fs.ensureDir(coverDirPath)

      const coverFilename = `cover.${imgtype.ext}`
      const newCoverPath = Path.posix.join(coverDirPath, coverFilename)
      Logger.debug(`[CoverManager] validate cover path copy cover from "${normalizedCoverPath}" to "${newCoverPath}"`)

      const copySuccess = await fs
        .copy(normalizedCoverPath, newCoverPath, { overwrite: true })
        .then(() => true)
        .catch((error: unknown) => {
          Logger.error('[CoverManager] validate cover path failed to copy cover', error)
          return false
        })
      if (!copySuccess) {
        return {
          error: 'Failed to copy cover to dir'
        }
      }
      await this.removeOldCovers(coverDirPath, '.' + imgtype.ext)
      Logger.debug('[CoverManager] cover copy success')
      normalizedCoverPath = newCoverPath
    }

    await CacheManager.purgeCoverCache(libraryItem.id)

    return {
      cover: normalizedCoverPath,
      updated: true
    }
  }

  async saveEmbeddedCoverArt(
    audioFiles: AudioFileObject[],
    libraryItemId: string,
    libraryItemPath?: string | null
  ): Promise<string | null> {
    const audioFileWithCover = audioFiles.find((af) => af.embeddedCoverArt)
    if (!audioFileWithCover) return null

    let coverDirPath: string
    if (global.ServerSettings?.storeCoverWithItem && libraryItemPath) {
      coverDirPath = libraryItemPath
    } else {
      coverDirPath = Path.posix.join(global.MetadataPath, 'items', libraryItemId)
    }
    await fs.ensureDir(coverDirPath)

    const coverFilename = audioFileWithCover.embeddedCoverArt === 'png' ? 'cover.png' : 'cover.jpg'
    const coverFilePath = Path.join(coverDirPath, coverFilename)

    const coverAlreadyExists = await fs.pathExists(coverFilePath)
    if (coverAlreadyExists) {
      Logger.warn(`[CoverManager] Extract embedded cover art but cover already exists for "${coverFilePath}" - bail`)
      return null
    }

    const success = await extractCoverArt(audioFileWithCover.metadata.path, coverFilePath)
    if (success) {
      await CacheManager.purgeCoverCache(libraryItemId)
      return coverFilePath
    }
    return null
  }

  async saveEbookCoverArt(
    ebookFileScanData?: EBookFileScanData | null,
    libraryItemId?: string,
    libraryItemPath?: string | null
  ): Promise<string | null> {
    if (!ebookFileScanData?.ebookCoverPath || !libraryItemId) return null

    let coverDirPath: string
    if (global.ServerSettings?.storeCoverWithItem && libraryItemPath) {
      coverDirPath = libraryItemPath
    } else {
      coverDirPath = Path.posix.join(global.MetadataPath, 'items', libraryItemId)
    }
    await fs.ensureDir(coverDirPath)

    let extname = Path.extname(ebookFileScanData.ebookCoverPath) || '.jpg'
    if (extname === '.jpeg') extname = '.jpg'
    const coverFilename = `cover${extname}`
    const coverFilePath = Path.join(coverDirPath, coverFilename)

    const coverAlreadyExists = await fs.pathExists(coverFilePath)
    if (coverAlreadyExists) {
      Logger.warn(`[CoverManager] Extract embedded cover art but cover already exists for "${coverFilePath}" - overwriting`)
    }

    const success = await parseEbookMetadata.extractCoverImage(ebookFileScanData, coverFilePath)
    if (success) {
      await CacheManager.purgeCoverCache(libraryItemId)
      return coverFilePath
    }
    return null
  }

  async downloadCoverFromUrlNew(
    url: string,
    libraryItemId: string,
    libraryItemPath?: string | null,
    forceLibraryItemFolder = false
  ): Promise<CoverResult> {
    try {
      let coverDirPath: string
      if ((global.ServerSettings?.storeCoverWithItem || forceLibraryItemFolder) && libraryItemPath) {
        coverDirPath = libraryItemPath
      } else {
        coverDirPath = Path.posix.join(global.MetadataPath, 'items', libraryItemId)
      }

      await fs.ensureDir(coverDirPath)

      const temppath = Path.posix.join(coverDirPath, 'cover')
      const success = await downloadImageFile(url, temppath)
        .then(() => true)
        .catch((err: unknown) => {
          Logger.error(`[CoverManager] Download image file failed for "${url}"`, err)
          return false
        })
      if (!success) {
        return {
          error: 'Failed to download image from url'
        }
      }

      const imgtype = await this.checkFileIsValidImage(temppath, true)
      if ('error' in imgtype) {
        return imgtype
      }

      const coverFullPath = Path.posix.join(coverDirPath, `cover.${imgtype.ext}`)
      await fs.rename(temppath, coverFullPath)

      await this.removeOldCovers(coverDirPath, '.' + imgtype.ext)
      await CacheManager.purgeCoverCache(libraryItemId)

      Logger.info(`[CoverManager] Downloaded libraryItem cover "${coverFullPath}" from url "${url}"`)
      return {
        cover: coverFullPath
      }
    } catch (error: unknown) {
      Logger.error(`[CoverManager] Fetch cover image from url "${url}" failed`, error)
      return {
        error: 'Failed to fetch image from url'
      }
    }
  }
}

const coverManager = new CoverManager()

namespace CoverManager {
  export type CoverManagerInstance = CoverManager
  export type CheckImageResultType = CheckImageResult
  export type CoverResultType = CoverResult
}

export = coverManager
