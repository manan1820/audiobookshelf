export interface ComicBookExtractor {
  open(): Promise<void>
  getFilePaths(): Promise<string[]>
  extractToFile(file: string, outputFilePath: string): Promise<boolean>
  extractToBuffer(file: string): Promise<Buffer | Uint8Array | null>
  close(): void
}

export function createComicBookExtractor(comicPath: string): ComicBookExtractor
