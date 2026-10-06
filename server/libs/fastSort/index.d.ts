export type ISortByFunction<T> = (prop: T) => unknown
export type ISortBy<T> = keyof T | ISortByFunction<T> | (keyof T | ISortByFunction<T>)[]

export interface ISortInstance<T> {
  asc(sortBy?: ISortBy<T>): T[]
  desc(sortBy?: ISortBy<T>): T[]
  by(sortBy: { asc?: ISortBy<T>; desc?: ISortBy<T>; comparer?: (a: unknown, b: unknown) => number } | Array<{ asc?: ISortBy<T>; desc?: ISortBy<T> }>): T[]
}

export interface SortOptions {
  comparer?: (a: unknown, b: unknown, order?: number) => number
  inPlaceSorting?: boolean
}

export function createNewSortInstance(options?: SortOptions): <T>(array: T[]) => ISortInstance<T>
export function sort<T>(array: T[]): ISortInstance<T>
export function inPlaceSort<T>(array: T[]): ISortInstance<T>
