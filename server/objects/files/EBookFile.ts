import FileMetadata from '../metadata/FileMetadata'
import type LibraryFile from './LibraryFile'
import type { EBookFileJsonObject, EBookFilePayload } from '../../types'

class EBookFile {
  ino: string | null = null
  metadata: FileMetadata = new FileMetadata()
  ebookFormat: string | null = null
  addedAt: number | null = null
  updatedAt: number | null = null

  constructor(file?: EBookFilePayload | null) {
    if (file) {
      this.construct(file)
    }
  }

  construct(file: EBookFilePayload): void {
    this.ino = file.ino ?? null
    this.metadata = new FileMetadata(file.metadata)
    this.ebookFormat = file.ebookFormat || this.metadata.format || null
    this.addedAt = file.addedAt ?? null
    this.updatedAt = file.updatedAt ?? null
  }

  toJSON(): EBookFileJsonObject {
    return {
      ino: this.ino,
      metadata: this.metadata.toJSON(),
      ebookFormat: this.ebookFormat,
      addedAt: this.addedAt,
      updatedAt: this.updatedAt
    }
  }

  get isEpub(): boolean {
    return this.ebookFormat === 'epub'
  }

  setData(libraryFile: LibraryFile): void {
    this.ino = libraryFile.ino
    this.metadata = libraryFile.metadata.clone()
    this.ebookFormat = libraryFile.metadata.format || null
    this.addedAt = Date.now()
    this.updatedAt = Date.now()
  }

  updateFromLibraryFile(libraryFile: LibraryFile): boolean {
    let hasUpdated = false

    if (this.metadata.update(libraryFile.metadata)) {
      hasUpdated = true
    }

    if (this.ebookFormat !== libraryFile.metadata.format) {
      this.ebookFormat = libraryFile.metadata.format || null
      hasUpdated = true
    }

    return hasUpdated
  }
}

export = EBookFile
