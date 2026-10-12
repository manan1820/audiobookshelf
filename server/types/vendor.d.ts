declare module 'ssrf-req-filter' {
  function ssrfFilter(url: string): import('http').Agent
  export = ssrfFilter
}

declare module 'express' {
  export interface CookieOptions {
    maxAge?: number
    signed?: boolean
    expires?: Date
    httpOnly?: boolean
    path?: string
    domain?: string
    secure?: boolean
    encode?: (val: string) => string
    sameSite?: boolean | 'lax' | 'strict' | 'none'
  }

  export interface Request extends import('http').IncomingMessage, Express.Request {
    url: string
    method: string
    headers: Record<string, string | string[] | undefined>
    query: Record<string, string | string[] | undefined>
    params: Record<string, string>
    body: unknown
    originalUrl?: string
    path?: string
    protocol?: string
    secure?: boolean
    ip?: string
    ips?: string[]
    xhr?: boolean
    hostname?: string
    get(name: string): string | undefined
    header(name: string): string | undefined
  }

  export interface Response extends import('http').ServerResponse, NodeJS.WritableStream {
    status(code: number): this
    sendStatus(code: number): this
    send(body?: unknown): this
    json(body?: unknown): this
    set(field: string | Record<string, string | number | string[] | undefined>, val?: string | number | string[]): this
    setHeader(name: string, value: number | string | readonly string[]): this
    header(field: string | Record<string, string | number | string[] | undefined>, val?: string | number | string[]): this
    get(field: string): string | undefined
    getHeaders(): Record<string, string | number | string[] | undefined>
    statusCode: number
    headersSent: boolean
    cookie(name: string, val: unknown, options?: CookieOptions): this
    clearCookie(name: string, options?: CookieOptions): this
    redirect(url: string): void
    redirect(status: number, url: string): void
    sendFile(path: string, options?: unknown, fn?: (err?: unknown) => void): void
    download(path: string, filename?: string, options?: unknown, fn?: (err?: unknown) => void): void
    contentType(type: string): this
    type(type: string): this
    attachment(filename?: string): this
    end(cb?: () => void): this
    end(chunk: unknown, cb?: () => void): this
    end(chunk: unknown, encoding: BufferEncoding, cb?: () => void): this
  }

  export type NextFunction = (err?: unknown) => void

  export interface RequestHandler {
    (req: Request, res: Response, next: NextFunction): unknown
  }

  export interface ErrorRequestHandler {
    (err: unknown, req: Request, res: Response, next: NextFunction): unknown
  }

  export interface Router {
    use(...handlers: unknown[]): this
    get(path: string, ...handlers: unknown[]): this
    post(path: string, ...handlers: unknown[]): this
    put(path: string, ...handlers: unknown[]): this
    patch(path: string, ...handlers: unknown[]): this
    delete(path: string, ...handlers: unknown[]): this
    all(path: string, ...handlers: unknown[]): this
  }

  export interface Application extends Router {
    set(setting: string, val: unknown): this
    get(setting: string): unknown
    listen(port: number | string, callback?: () => void): unknown
  }

  function express(): Application
  namespace express {
    export function json(options?: unknown): RequestHandler
    export function urlencoded(options?: unknown): RequestHandler
    export function static(root: string, options?: unknown): RequestHandler
    export function Router(options?: unknown): Router
  }

  export default express
}

declare module '../libs/fsExtra' {
  type FsExtraType = typeof import('fs') & {
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

  const fsExtra: FsExtraType
  export default fsExtra
  export = fsExtra
}

declare module '../libs/recursiveReaddirAsync' {
  export const LIST: number
  export interface RraItem {
    name: string
    path: string
    fullname: string
    extension: string
    deep: number
    error?: unknown
  }
  export function list(path: string, options?: unknown): Promise<RraItem[] | { error?: unknown }>
  const rra: {
    LIST: number
    list: (path: string, options?: unknown) => Promise<RraItem[] | { error?: unknown }>
  }
  export default rra
  export = rra
}

declare module '../libs/fastSort' {
  export function createNewSortInstance(options?: unknown): {
    <T>(array: T[]): {
      asc(getter?: ((item: T) => unknown) | string): T[]
      desc(getter?: ((item: T) => unknown) | string): T[]
      by(descriptors?: unknown): T[]
    }
  }
}

declare module '../../libs/fastSort' {
  export function createNewSortInstance(options?: unknown): {
    <T>(array: T[]): {
      asc(getter?: ((item: T) => unknown) | string): T[]
      desc(getter?: ((item: T) => unknown) | string): T[]
      by(descriptors?: unknown): T[]
    }
  }
}

declare module '../libs/sanitizeHtml' {
  function sanitizeHtml(html: string, options?: unknown): string
  export = sanitizeHtml
}

declare module '../libs/nodeFfprobe' {
  interface FfprobeFunction {
    (file: string): Promise<Record<string, unknown>>
    FFPROBE_PATH?: string
  }
  const ffprobe: FfprobeFunction
  export = ffprobe
}

declare module '../libs/fluentFfmpeg' {
  import type { EventEmitter } from 'events'

  export interface FfmpegCommand extends EventEmitter {
    input(input: unknown): this
    addInput(input: unknown): this
    output(target: string): this
    addOutput(target: string): this
    addOption(options: string | string[], ...args: unknown[]): this
    outputOptions(options: string | string[], ...args: unknown[]): this
    inputOptions(options: string | string[], ...args: unknown[]): this
    run(): void
    kill(signal?: string): this
  }

  function Ffmpeg(input?: unknown, options?: unknown): FfmpegCommand
  export default Ffmpeg
  export = Ffmpeg
}

declare module '../libs/fluentFfmpeg/utils' {
  export function timemarkToSeconds(timemark: string): number
}

declare module 'uuid' {
  export function v4(): string
  export function v1(): string
  export function v3(): string
  export function v5(): string
  export function validate(uuid: string): boolean
  export function version(uuid: string): number
}

declare module '../libs/which' {
  function which(cmd: string, opt?: { nothrow?: boolean; path?: string }): Promise<string>
  namespace which {
    function sync(cmd: string, opt?: { nothrow?: boolean; path?: string }): string | null
  }
  export = which
}

declare module '../libs/nodeStreamZip' {
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
    entries(): Promise<Record<string, ZipEntry>>
    stream(entry: string | ZipEntry): Promise<NodeJS.ReadableStream>
    entryData(entry: string | ZipEntry): Promise<Buffer>
    extract(entry: string | ZipEntry | null, outPath: string): Promise<number | undefined>
    close(): Promise<void>
  }

  export default class StreamZip extends EventEmitter {
    static async: typeof async
    constructor(config: StreamZipAsyncOptions)
  }
}

declare module '../libs/umzug' {
  import type { Sequelize } from 'sequelize'

  export interface MigrationParams {
    name: string
    path?: string
    context: unknown
  }

  export interface RunnableMigration {
    name: string
    path?: string
    up: (params: MigrationParams) => Promise<unknown>
    down?: (params: MigrationParams) => Promise<unknown>
  }

  export interface UmzugOptions {
    migrations?:
      | {
          files?: string[]
          resolve?: (params: { name: string; path: string }) => RunnableMigration
        }
      | (() => Promise<RunnableMigration[]>)
    context?: unknown
    storage?: unknown
    logger?: unknown
  }

  export class Umzug {
    constructor(options: UmzugOptions)
    options: UmzugOptions
    migrations(): Promise<RunnableMigration[]>
    executed(): Promise<RunnableMigration[]>
    up(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
    down(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
  }

  export class SequelizeStorage {
    constructor(options: { sequelize: Sequelize; tableName?: string; columnType?: unknown })
  }

  export function memoryStorage(): unknown
}

declare module 'semver' {
  export function gt(v1: string | null | undefined, v2: string | null | undefined): boolean
  export function gte(v1: string | null | undefined, v2: string | null | undefined): boolean
  export function lt(v1: string | null | undefined, v2: string | null | undefined): boolean
  export function lte(v1: string | null | undefined, v2: string | null | undefined): boolean
  export function eq(v1: string | null | undefined, v2: string | null | undefined): boolean
  export function compare(v1: string | null | undefined, v2: string | null | undefined): 1 | 0 | -1 | number
  export function valid(v: string | null | undefined): string | null
  export function clean(v: string | null | undefined): string | null
}

declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number
    algorithm?: string
    [key: string]: unknown
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options: SignOptions,
    callback: (err: Error | null, encoded: string | undefined) => void
  ): void

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    callback: (err: Error | null, encoded: string | undefined) => void
  ): void

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: unknown,
    callback?: (err: Error | null, decoded: unknown) => void
  ): void

  export function decode(token: string, options?: unknown): unknown
}



