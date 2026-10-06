export interface ArchiveFileEntry {
  file: {
    _path: string
    [key: string]: unknown
  }
  path: string
}

export interface ExtractedSingleFile {
  fileData: Buffer
  [key: string]: unknown
}

export default class Archive {
  static open(fileBuffer: Buffer): Promise<Archive>
  getFilesArray(): Promise<ArchiveFileEntry[]>
  extractSingleFile(target: string): Promise<ExtractedSingleFile>
  close(): void
}
