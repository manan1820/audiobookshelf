declare class CompressedFile {
  name: string
  size: number
  extract(): Promise<{ fileData: Buffer }>
}

declare class Archive {
  static open(fileBuffer: Buffer): Promise<Archive>
  getFilesArray(): Promise<{ file: { _path: string; name: string; size: number } }[]>
  extractSingleFile(path: string): Promise<{ fileData: Buffer } | null>
  close(): void
}

export = Archive
