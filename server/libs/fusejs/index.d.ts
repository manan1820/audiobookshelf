export interface FuseOptionsKeyObject {
  name: string
  weight?: number
}

export interface FuseOptions {
  ignoreDiacritics?: boolean
  threshold?: number
  keys?: Array<string | FuseOptionsKeyObject>
  [key: string]: unknown
}

export interface FuseSearchResult<T> {
  item: T
  refIndex?: number
  score?: number
}

declare class Fuse<T> {
  constructor(list: readonly T[], options?: FuseOptions)
  search(pattern: string): Array<FuseSearchResult<T>>
}

export default Fuse
export = Fuse
