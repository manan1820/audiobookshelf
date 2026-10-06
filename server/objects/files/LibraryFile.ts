import Path from 'path'
import { getFileTimestampsWithIno, filePathToPOSIX } from '../../utils/fileUtils'
import globals from '../../utils/globals'
import FileMetadata from '../metadata/FileMetadata'
import { LibraryFileJSON } from '../../types'

class LibraryFile {
  ino: string | null = null
  metadata: FileMetadata | null = null
  isSupplementary: boolean | null = null
  addedAt: number | null = null
  updatedAt: number | null = null

  constructor(file?: Partial<LibraryFileJSON> | null) {
    if (file) {
      this.construct(file)
    }
  }

  construct(file: Partial<LibraryFileJSON>): void {
    this.ino = file.ino ?? null
    this.metadata = file.metadata ? new FileMetadata(file.metadata) : null
    this.isSupplementary = file.isSupplementary === undefined ? null : file.isSupplementary
    this.addedAt = file.addedAt ?? null
    this.updatedAt = file.updatedAt ?? null
  }

  toJSON(): LibraryFileJSON {
    return {
      ino: this.ino,
      metadata: this.metadata
        ? this.metadata.toJSON()
        : {
            filename: null,
            ext: null,
            path: null,
            relPath: null,
            size: null,
            mtimeMs: null,
            ctimeMs: null,
            birthtimeMs: null
          },
      isSupplementary: this.isSupplementary,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt,
      fileType: this.fileType
    }
  }

  clone(): LibraryFile {
    return new LibraryFile(this.toJSON())
  }

  get fileType(): string {
    const format = this.metadata?.format || ''
    if ((globals.SupportedImageTypes as readonly string[]).includes(format)) return 'image'
    if ((globals.SupportedAudioTypes as readonly string[]).includes(format)) return 'audio'
    if ((globals.SupportedEbookTypes as readonly string[]).includes(format)) return 'ebook'
    if ((globals.TextFileTypes as readonly string[]).includes(format)) return 'text'
    if ((globals.MetadataFileTypes as readonly string[]).includes(format)) return 'metadata'
    return 'unknown'
  }

  get isMediaFile(): boolean {
    return this.fileType === 'audio' || this.fileType === 'ebook'
  }

  get isEBookFile(): boolean {
    return this.fileType === 'ebook'
  }

  get isOPFFile(): boolean {
    return this.metadata?.ext === '.opf'
  }

  async setDataFromPath(path: string, relPath: string): Promise<void> {
    const fileTsData = await getFileTimestampsWithIno(path)
    if (!fileTsData) {
      return
    }
    const fileMetadata = new FileMetadata()
    fileMetadata.setData(fileTsData)
    fileMetadata.filename = Path.basename(relPath)
    fileMetadata.path = filePathToPOSIX(path)
    fileMetadata.relPath = filePathToPOSIX(relPath)
    fileMetadata.ext = Path.extname(relPath)
    this.ino = fileTsData.ino
    this.metadata = fileMetadata
    this.addedAt = Date.now()
    this.updatedAt = Date.now()
  }
}

export = LibraryFile
