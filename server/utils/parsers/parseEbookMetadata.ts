import parseEpubMetadata from './parseEpubMetadata'
import parseComicMetadata from './parseComicMetadata'
import type { EBookFileObject, EBookFileScanData } from '../../types'

export type { EBookFileScanData }

/**
 * Parse metadata from ebook file
 */
export async function parse(ebookFile?: EBookFileObject | null): Promise<EBookFileScanData | null> {
  if (!ebookFile) return null

  if (ebookFile.ebookFormat === 'epub') {
    return parseEpubMetadata.parse(ebookFile)
  } else if (['cbz', 'cbr'].includes(ebookFile.ebookFormat)) {
    return parseComicMetadata.parse(ebookFile)
  }
  return null
}

/**
 * Extract cover from ebook file
 */
export async function extractCoverImage(
  ebookFileScanData?: EBookFileScanData | null,
  outputCoverPath?: string
): Promise<boolean> {
  if (!ebookFileScanData?.ebookCoverPath || !outputCoverPath) return false

  if (ebookFileScanData.ebookFormat === 'epub') {
    return parseEpubMetadata.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  } else if (['cbz', 'cbr'].includes(ebookFileScanData.ebookFormat)) {
    return parseComicMetadata.extractCoverImage(ebookFileScanData.path, ebookFileScanData.ebookCoverPath, outputCoverPath)
  }
  return false
}

export default {
  parse,
  extractCoverImage
}
