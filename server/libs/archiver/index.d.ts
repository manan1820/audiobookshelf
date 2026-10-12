import { Transform } from 'stream'

export interface ArchiverOptions {
  zlib?: {
    level?: number
  }
}

export interface Archiver extends Transform {
  pointer(): number
  directory(dirpath: string, destpath: string | boolean): this
  file(source: string, data: { name: string }): this
  append(source: NodeJS.ReadableStream | Buffer | string, data: { name: string }): this
  finalize(): Promise<void>
}

declare function archiver(format: string, options?: ArchiverOptions): Archiver

export default archiver
