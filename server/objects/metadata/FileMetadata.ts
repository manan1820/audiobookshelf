import type { FileMetadataJsonObject, FileMetadataPayload } from '../../types'

class FileMetadata {
  filename: string | null = null
  ext: string | null = null
  path: string | null = null
  relPath: string | null = null
  size: number | null = null
  mtimeMs: number | null = null
  ctimeMs: number | null = null
  birthtimeMs: number | null = null
  wasModified = false

  constructor(metadata?: FileMetadataPayload | null) {
    if (metadata) {
      this.construct(metadata)
    }
  }

  construct(metadata: FileMetadataPayload): void {
    this.filename = metadata.filename ?? null
    this.ext = metadata.ext ?? null
    this.path = metadata.path ?? null
    this.relPath = metadata.relPath ?? null
    this.size = metadata.size ?? null
    this.mtimeMs = metadata.mtimeMs ?? null
    this.ctimeMs = metadata.ctimeMs ?? null
    this.birthtimeMs = metadata.birthtimeMs ?? null
  }

  toJSON(): FileMetadataJsonObject {
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
    if (!this.filename || !this.ext) return this.filename ?? ''
    return this.filename.replace(this.ext, '')
  }

  update(payload: Partial<FileMetadataJsonObject>): boolean {
    let hasUpdates = false
    const keys: (keyof FileMetadataJsonObject)[] = [
      'filename',
      'ext',
      'path',
      'relPath',
      'size',
      'mtimeMs',
      'ctimeMs',
      'birthtimeMs'
    ]
    for (const key of keys) {
      if (payload[key] !== undefined && this[key] !== payload[key]) {
        if (key === 'size' || key === 'mtimeMs' || key === 'ctimeMs' || key === 'birthtimeMs') {
          this[key] = (payload[key] as number | null) ?? null
        } else {
          this[key] = (payload[key] as string | null) ?? null
        }
        hasUpdates = true
      }
    }
    return hasUpdates
  }

  setData(payload: Partial<FileMetadataJsonObject>): void {
    const keys: (keyof FileMetadataJsonObject)[] = [
      'filename',
      'ext',
      'path',
      'relPath',
      'size',
      'mtimeMs',
      'ctimeMs',
      'birthtimeMs'
    ]
    for (const key of keys) {
      if (payload[key] !== undefined) {
        if (key === 'size' || key === 'mtimeMs' || key === 'ctimeMs' || key === 'birthtimeMs') {
          this[key] = (payload[key] as number | null) ?? null
        } else {
          this[key] = (payload[key] as string | null) ?? null
        }
      }
    }
  }
}

export = FileMetadata
