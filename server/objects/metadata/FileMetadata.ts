import { FileMetadataJSON } from '../../types'

class FileMetadata {
  filename: string | null = null
  ext: string | null = null
  path: string | null = null
  relPath: string | null = null
  size: number | null = null
  mtimeMs: number | null = null
  ctimeMs: number | null = null
  birthtimeMs: number | null = null

  // Temp flag used in scans
  wasModified = false

  constructor(metadata?: Partial<FileMetadataJSON> | null) {
    if (metadata) {
      this.construct(metadata)
    }
  }

  construct(metadata: Partial<FileMetadataJSON>): void {
    this.filename = metadata.filename ?? null
    this.ext = metadata.ext ?? null
    this.path = metadata.path ?? null
    this.relPath = metadata.relPath ?? null
    this.size = metadata.size ?? null
    this.mtimeMs = metadata.mtimeMs ?? null
    this.ctimeMs = metadata.ctimeMs ?? null
    this.birthtimeMs = metadata.birthtimeMs ?? null
  }

  toJSON(): FileMetadataJSON {
    return {
      filename: this.filename,
      ext: this.ext,
      path: this.path,
      relPath: this.relPath,
      size: this.size,
      mtimeMs: this.mtimeMs,
      ctimeMs: this.ctimeMs,
      birthtimeMs: this.birthtimeMs
    }
  }

  clone(): FileMetadata {
    return new FileMetadata(this.toJSON())
  }

  get format(): string {
    if (!this.ext) return ''
    return this.ext.slice(1).toLowerCase()
  }

  get filenameNoExt(): string {
    return this.filename ? this.filename.replace(this.ext || '', '') : ''
  }

  update(payload: Partial<FileMetadataJSON>): boolean {
    let hasUpdates = false
    if (payload.filename !== undefined && this.filename !== payload.filename) {
      this.filename = payload.filename
      hasUpdates = true
    }
    if (payload.ext !== undefined && this.ext !== payload.ext) {
      this.ext = payload.ext
      hasUpdates = true
    }
    if (payload.path !== undefined && this.path !== payload.path) {
      this.path = payload.path
      hasUpdates = true
    }
    if (payload.relPath !== undefined && this.relPath !== payload.relPath) {
      this.relPath = payload.relPath
      hasUpdates = true
    }
    if (payload.size !== undefined && this.size !== payload.size) {
      this.size = payload.size
      hasUpdates = true
    }
    if (payload.mtimeMs !== undefined && this.mtimeMs !== payload.mtimeMs) {
      this.mtimeMs = payload.mtimeMs
      hasUpdates = true
    }
    if (payload.ctimeMs !== undefined && this.ctimeMs !== payload.ctimeMs) {
      this.ctimeMs = payload.ctimeMs
      hasUpdates = true
    }
    if (payload.birthtimeMs !== undefined && this.birthtimeMs !== payload.birthtimeMs) {
      this.birthtimeMs = payload.birthtimeMs
      hasUpdates = true
    }
    return hasUpdates
  }

  setData(payload: Partial<FileMetadataJSON>): void {
    if (payload.filename !== undefined) this.filename = payload.filename
    if (payload.ext !== undefined) this.ext = payload.ext
    if (payload.path !== undefined) this.path = payload.path
    if (payload.relPath !== undefined) this.relPath = payload.relPath
    if (payload.size !== undefined) this.size = payload.size
    if (payload.mtimeMs !== undefined) this.mtimeMs = payload.mtimeMs
    if (payload.ctimeMs !== undefined) this.ctimeMs = payload.ctimeMs
    if (payload.birthtimeMs !== undefined) this.birthtimeMs = payload.birthtimeMs
  }
}

export = FileMetadata
