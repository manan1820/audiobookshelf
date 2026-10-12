import Path from 'path'
import fs from '../libs/fsExtra'
import Logger from '../Logger'
import Audnexus from '../providers/Audnexus'
import { downloadImageFile } from '../utils/fileUtils'

interface AuthorSearchObj {
  asin: string
  description: string
  image: string
  name: string
}

interface AuthorFinderOptions {
  maxLevenshtein?: number | string
}

interface SaveAuthorImageResult {
  path?: string
  error?: string
}

class AuthorFinder {
  audnexus: Audnexus

  constructor() {
    this.audnexus = new Audnexus()
  }

  findAuthorByASIN(asin: string, region: string): Promise<AuthorSearchObj | null> | null {
    if (!asin) return null
    return this.audnexus.findAuthorByASIN(asin, region)
  }

  async findAuthorByName(
    name: string,
    region = '',
    options: AuthorFinderOptions = {}
  ): Promise<AuthorSearchObj | null> {
    if (!name) return null
    const maxLevenshtein =
      options.maxLevenshtein !== undefined && !isNaN(Number(options.maxLevenshtein))
        ? Number(options.maxLevenshtein)
        : 3

    const author = await this.audnexus.findAuthorByName(name, region, maxLevenshtein)
    if (!author?.name) {
      return null
    }
    return author
  }

  async saveAuthorImage(authorId: string, url: string): Promise<SaveAuthorImageResult> {
    const authorDir = Path.join(global.MetadataPath, 'authors')

    if (!(await fs.pathExists(authorDir))) {
      await fs.ensureDir(authorDir)
    }

    const imageExtension = url.toLowerCase().split('.').pop()
    const ext = imageExtension === 'png' ? 'png' : 'jpg'
    const filename = `${authorId}.${ext}`
    const outputPath = Path.posix.join(authorDir, filename)

    try {
      await downloadImageFile(url, outputPath)
      return {
        path: outputPath
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Unknown error'
      Logger.error(`[AuthorFinder] Download image file failed for "${url}"`, errorMsg)
      return {
        error: errorMsg
      }
    }
  }
}

const authorFinder = new AuthorFinder()
export = authorFinder
