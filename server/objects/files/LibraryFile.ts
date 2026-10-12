import Path from 'path'
import { getFileTimestampsWithIno, filePathToPOSIX } from '../../utils/fileUtils'
import globals from '../../utils/globals'
import FileMetadata from '../metadata/FileMetadata'
import type { LibraryFileJsonObject, LibraryFilePayload } from '../../types'

class LibraryFile {
  ino: string | null = null
  metadata: FileMetadata = new FileMetadata()
  isSupplementary: boolean | null = null
  addedAt: number | null = null
  updatedAt: number | null = null

  constructor(file?: LibraryFilePayload | null) {
    if (file) {
      this.construct(file)
    }
  }

  construct(file: LibraryFilePayload): void {
    this.ino = file.ino ?? null
    this.metadata = new FileMetadata(file.metadata)
    this.isSupplementary = file.isSupplementary === undefined ? null : file.isSupplementary
    this.addedAt = file.addedAt ?? null
    this.updatedAt = file.updatedAt ?? null
  }

  toJSON(): LibraryFileJsonObject {
    return {
      ino: this.ino,
      metadata: this.metadata.toJSON(),
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
    const format = this.metadata?.format ?? ''
    if (globals.SupportedImageTypes.includes(format)) return 'image'
    if (globals.SupportedAudioTypes.includes(format)) return 'audio'
    if (globals.SupportedEbookTypes.includes(format)) return 'ebook'
    if (globals.TextFileTypes.includes(format)) return 'text'
    if (globals.MetadataFileTypes.includes(format)) return 'metadata'
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
    if (!fileTsData) return
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
