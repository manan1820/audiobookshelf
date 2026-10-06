declare module 'ssrf-req-filter' {
  function ssrfFilter(url: string): import('http').Agent
  export = ssrfFilter
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
      asc(getter: unknown): T[]
      desc(getter: unknown): T[]
      by(descriptors: unknown): T[]
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
}


