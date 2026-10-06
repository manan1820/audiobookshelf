declare namespace StreamZip {
  interface StreamZipOptions {
    file?: string
    storeEntries?: boolean
    skipEntryVerification?: boolean
    chunkSize?: number
  }

  interface ZipEntry {
    name: string
    isDirectory: boolean
    size: number
    compressedSize: number
    comment: string
    time: number
    crc: number
  }

  class StreamZipAsync {
    constructor(config: StreamZipOptions)
    entry(entry: string): Promise<ZipEntry | undefined>
    entries(): Promise<Record<string, ZipEntry>>
    entryData(entry: string | ZipEntry): Promise<Buffer>
    extract(entry: string | ZipEntry | null, outPath: string): Promise<number | undefined>
    close(): Promise<void>
  }
}

declare class StreamZip {
  constructor(config: StreamZip.StreamZipOptions)
  static async: typeof StreamZip.StreamZipAsync
}

export = StreamZip
