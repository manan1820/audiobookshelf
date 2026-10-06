export interface FuseOptionKey {
  name: string
  weight?: number
}

export interface FuseOptions {
  isCaseSensitive?: boolean
  ignoreDiacritics?: boolean
  includeScore?: boolean
  includeMatches?: boolean
  threshold?: number
  distance?: number
  keys?: Array<string | FuseOptionKey>
  [key: string]: unknown
}

export interface FuseResult<T> {
  item: T
  refIndex: number
  score?: number
  matches?: unknown[]
}

export default class Fuse<T> {
  constructor(list: T[], options?: FuseOptions)
  search(pattern: string): Array<FuseResult<T>>
}
