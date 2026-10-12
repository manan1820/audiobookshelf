import { EventEmitter } from 'events'

export interface StreamZipAsyncOptions {
  file: string
  storeEntries?: boolean
  chunkSize?: number
}

export interface ZipEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  comment: string
  size: number
  compressedSize: number
  mtime: number
  crc: number
}

export class async extends EventEmitter {
  constructor(config: StreamZipAsyncOptions)
  get entriesCount(): Promise<number>
  get comment(): Promise<string>
  entry(name: string): Promise<ZipEntry | undefined>
  entries(): Promise<{ [key: string]: ZipEntry }>
  stream(entry: string | ZipEntry): Promise<NodeJS.ReadableStream>
  entryData(entry: string | ZipEntry): Promise<Buffer>
  extract(entry: string | ZipEntry | null, outPath: string): Promise<number | undefined>
  close(): Promise<void>
}

export default class StreamZip extends EventEmitter {
  static async: typeof async
  constructor(config: StreamZipAsyncOptions)
}
