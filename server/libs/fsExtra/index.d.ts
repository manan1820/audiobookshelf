import type * as nodeFs from 'fs'

export type FsExtraType = typeof nodeFs.promises & {
  createReadStream: typeof nodeFs.createReadStream
  createWriteStream: typeof nodeFs.createWriteStream
  constants: typeof nodeFs.constants
  remove(dir: string): Promise<void>
  removeSync(dir: string): void
  pathExists(path: string): Promise<boolean>
  pathExistsSync(path: string): boolean
  move(src: string, dest: string, options?: unknown): Promise<void>
  copy(src: string, dest: string, options?: unknown): Promise<void>
  emptyDir(dir: string): Promise<void>
  ensureDir(dir: string): Promise<void>
  ensureFile(file: string): Promise<void>
  mkdirs(dir: string): Promise<void>
  mkdirp(dir: string): Promise<void>
  outputFile(file: string, data: unknown, options?: unknown): Promise<void>
  outputJson(file: string, data: unknown, options?: unknown): Promise<void>
  readJson(file: string, options?: unknown): Promise<unknown>
  writeJson(file: string, data: unknown, options?: unknown): Promise<void>
}

declare const fsExtra: FsExtraType
export default fsExtra
export = fsExtra
