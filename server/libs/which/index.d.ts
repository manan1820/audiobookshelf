interface WhichOptions {
  path?: string
  pathExt?: string
  all?: boolean
  nothrow?: boolean
  colon?: string
}

declare function which(cmd: string, opt?: WhichOptions): Promise<string>
declare function which(cmd: string, opt: WhichOptions & { all: true }): Promise<string[]>

declare namespace which {
  function sync(cmd: string, opt?: WhichOptions & { nothrow?: false }): string
  function sync(cmd: string, opt: WhichOptions & { nothrow: true }): string | null
  function sync(cmd: string, opt: WhichOptions & { all: true }): string[]
  function sync(cmd: string, opt?: WhichOptions): string | string[] | null
}

export = which
