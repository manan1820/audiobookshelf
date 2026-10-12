import Path from 'path'
import Logger from '../../Logger'
import parseComicInfoMetadata, { ComicInfoMetadata, RawComicInfoJson } from './parseComicInfoMetadata'
import globals from '../globals'
import { xmlToJSON } from '../index'
import { createComicBookExtractor, AbstractComicBookExtractor } from '../comicBookExtractors'
import type { EBookFileObject, EBookFileScanData } from '../../types'

export type { ComicInfoMetadata, RawComicInfoJson }

/**
 * Extract cover image from comic return true if success
 */
export async function extractCoverImage(
  comicPath: string,
  comicImageFilepath: string,
  outputCoverPath: string
): Promise<boolean> {
  let archive: AbstractComicBookExtractor | null = null
  try {
    archive = createComicBookExtractor(comicPath)
    await archive.open()
    return await archive.extractToFile(comicImageFilepath, outputCoverPath)
  } catch (error) {
    Logger.error(
      `[parseComicMetadata] Failed to extract image "${comicImageFilepath}" from comicPath "${comicPath}" into "${outputCoverPath}"`,
      error
    )
    return false
  } finally {
    // Ensure we free the memory
    archive?.close()
  }
}

/**
 * Parse metadata from comic
 */
export async function parse(ebookFile: EBookFileObject): Promise<EBookFileScanData | null> {
  const comicPath = ebookFile.metadata.path
  Logger.debug(`[parseComicMetadata] Parsing comic metadata at "${comicPath}"`)
  let archive: AbstractComicBookExtractor | null = null
  try {
    archive = createComicBookExtractor(comicPath)
    await archive.open()

    const filePaths = await archive.getFilePaths().catch((error: unknown) => {
      Logger.error(`[parseComicMetadata] Failed to get file paths from comic at "${comicPath}"`, error)
      return null
    })

    if (!filePaths) {
      return null
    }

    // Sort the file paths in a natural order to get the first image
    filePaths.sort((a, b) => {
      return a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    })

    let metadata: ComicInfoMetadata | null = null
    const comicInfoPath = filePaths.find((filePath) => filePath === 'ComicInfo.xml')
    if (comicInfoPath) {
      const comicInfoData = await archive.extractToBuffer(comicInfoPath)
      if (comicInfoData) {
        const comicInfoStr = new TextDecoder().decode(comicInfoData)
        const comicInfoJson = (await xmlToJSON(comicInfoStr)) as RawComicInfoJson | null
        if (comicInfoJson) {
          metadata = parseComicInfoMetadata.parse(comicInfoJson)
        }
      }
    }

    const payload: EBookFileScanData = {
      path: comicPath,
      ebookFormat: ebookFile.ebookFormat,
      metadata
    }

    const firstImagePath = filePaths.find((filePath) =>
      globals.SupportedImageTypes.includes(Path.extname(filePath).toLowerCase().slice(1))
    )
    if (firstImagePath) {
      payload.ebookCoverPath = firstImagePath
    } else {
      Logger.warn(`[parseComicMetadata] Cover image not found in comic at "${comicPath}"`)
    }

    return payload
  } catch (error) {
    Logger.error(`[parseComicMetadata] Failed to parse comic metadata at "${comicPath}"`, error)
    return null
  } finally {
    // Ensure we free the memory
    archive?.close()
  }
}

export default {
  extractCoverImage,
  parse
}
