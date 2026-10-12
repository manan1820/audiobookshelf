export type ISortByFunction<T> = (prop: T) => unknown
export type ISortBy<T> = keyof T | ISortByFunction<T> | { asc?: ISortBy<T>; desc?: ISortBy<T> }

export interface ISortInstanceOptions {
  comparer?: ((a: string, b: string) => number) | ((a: unknown, b: unknown, order?: number) => number) | ((...args: unknown[]) => number)
  inPlaceSorting?: boolean
}

export interface ISortByObject<T> {
  asc?: ISortBy<T>
  desc?: ISortBy<T>
  [key: string]: unknown
}

export interface ISortInstance<T> {
  asc(sortBy?: ISortBy<T> | ISortBy<T>[]): T[]
  desc(sortBy?: ISortBy<T> | ISortBy<T>[]): T[]
  by(sortBy: (ISortBy<T> | ISortByObject<T>)[]): T[]
}

export declare function createNewSortInstance(options?: ISortInstanceOptions): <T>(array: T[]) => ISortInstance<T>
export declare function sort<T>(array: T[]): ISortInstance<T>
export declare function inPlaceSort<T>(array: T[]): ISortInstance<T>
