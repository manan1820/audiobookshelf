/**
 * Audiobookshelf Common Utility Types and Type Guards
 * Zero 'any', Zero suppressions, Zero non-null assertions.
 */

export interface PaginationOptions {
  limit?: number
  offset?: number
  page?: number
  sort?: string
  desc?: boolean
}

export interface PagedResult<T> {
  results: T[]
  total: number
  limit: number
  page: number
}

export type UUID = string
export type Timestamp = number

export interface TextSearchQuery {
  matchExpression(column: string): string
}

/**
 * Type guard to check if a value is defined (not null and not undefined).
 */
export function isDefined<T>(val: T | null | undefined): val is T {
  return val !== null && val !== undefined
}

/**
 * Type guard to check if a value is not null or undefined.
 */
export function isNotNullOrUndefined<T>(val: T | null | undefined): val is T {
  return val !== null && val !== undefined
}

/**
 * Type guard to check if an unknown value is a non-null object.
 */
export function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

/**
 * Runtime assertion function asserting that a value is defined.
 * Throws a descriptive error instead of unsafe non-null assertion.
 */
export function assertExists<T>(
  val: T | null | undefined,
  message = 'Expected value to be defined'
): asserts val is T {
  if (val === null || val === undefined) {
    throw new Error(`[Assertion Failure] ${message}`)
  }
}
