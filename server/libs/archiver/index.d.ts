import { Readable, Writable } from 'stream'

declare namespace archiver {
  interface ArchiverOptions {
    zlib?: {
      level?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }

  interface ArchiverError extends Error {
    code?: string
  }

  interface Archiver extends Readable {
    pointer(): number
    pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T
    directory(dirpath: string, destpath: string | false): this
    file(filepath: string, data: { name: string }): this
    finalize(): Promise<void>
    on(event: 'warning', listener: (error: ArchiverError) => void): this
    on(event: 'error', listener: (error: ArchiverError) => void): this
    on(event: string, listener: (...args: unknown[]) => void): this
  }
}

declare function archiver(format: string, options?: archiver.ArchiverOptions): archiver.Archiver

export = archiver
