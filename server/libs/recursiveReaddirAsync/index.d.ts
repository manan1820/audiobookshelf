declare namespace rra {
  const LIST: 1
  const TREE: 2

  interface Options {
    mode?: number
    recursive?: boolean
    stats?: boolean
    ignoreFolders?: boolean
    extensions?: boolean
    deep?: boolean
    realPath?: boolean
    normalizePath?: boolean
    [key: string]: unknown
  }

  interface FileItem {
    name: string
    title: string
    path: string
    fullname: string
    extension: string
    deep: number
    isDirectory: boolean
    error?: unknown
  }

  interface ListResult extends Array<FileItem> {
    error?: unknown
  }

  function list(path: string, options?: Options): Promise<ListResult>
}

export = rra
