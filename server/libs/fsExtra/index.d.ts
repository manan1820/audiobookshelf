import type * as fs from 'fs'

export function pathExists(path: string): Promise<boolean>
export function pathExistsSync(path: string): boolean
export function remove(dir: string): Promise<void>
export function removeSync(dir: string): void
export function emptyDir(dir: string): Promise<void>
export function ensureDir(dir: string): Promise<void>
export function mkdirs(dir: string): Promise<void>
export function move(src: string, dest: string, options?: { overwrite?: boolean }): Promise<void>
export function copy(src: string, dest: string, options?: { overwrite?: boolean }): Promise<void>
export function writeFile(file: string, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions): Promise<void>
export function writeFileSync(file: string, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions): void
export function readFile(file: string, encoding?: BufferEncoding | { encoding: BufferEncoding; flag?: string }): Promise<string>
export function readFileSync(file: string, encoding?: BufferEncoding | { encoding: BufferEncoding; flag?: string }): string
export function stat(path: string, options?: { bigint?: boolean }): Promise<fs.Stats>
export function statSync(path: string, options?: { bigint?: boolean }): fs.Stats
export function lstat(path: string): Promise<fs.Stats>
export function lstatSync(path: string): fs.Stats
export function readdir(path: string): Promise<string[]>
export function readdirSync(path: string): string[]
export function createReadStream(path: fs.PathLike, options?: BufferEncoding | { flags?: string; encoding?: BufferEncoding; fd?: number; mode?: number; autoClose?: boolean; emitClose?: boolean; start?: number; end?: number; highWaterMark?: number }): fs.ReadStream
export function createWriteStream(path: fs.PathLike, options?: BufferEncoding | { flags?: string; encoding?: BufferEncoding; fd?: number; mode?: number; autoClose?: boolean; emitClose?: boolean; start?: number; highWaterMark?: number }): fs.WriteStream
export function chmod(path: fs.PathLike, mode: fs.Mode): Promise<void>
