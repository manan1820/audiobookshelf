import Path from 'path'
import * as uuid from 'uuid'
import { parseString } from 'xml2js'
import Logger from '../Logger'
import areEquivalent from './areEquivalent'

export const levenshteinDistance = (str1: unknown, str2: unknown, caseSensitive = false): number => {
  let s1 = String(str1)
  let s2 = String(str2)
  if (!caseSensitive) {
    s1 = s1.toLowerCase()
    s2 = s2.toLowerCase()
  }
  const track: number[][] = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(0))
  for (let i = 0; i <= s1.length; i += 1) {
    track[0] = track[0] || []
    track[0][i] = i
  }
  for (let j = 0; j <= s2.length; j += 1) {
    track[j] = track[j] || []
    track[j][0] = j
  }
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1
      const row = track[j] || []
      const prevRow = track[j - 1] || []
      row[i] = Math.min(
        (row[i - 1] ?? 0) + 1, // deletion
        (prevRow[i] ?? 0) + 1, // insertion
        (prevRow[i - 1] ?? 0) + indicator // substitution
      )
    }
  }
  return track[s2.length]?.[s1.length] ?? 0
}

export const levenshteinSimilarity = (str1: unknown, str2: unknown, caseSensitive = false): number => {
  const s1 = String(str1)
  const s2 = String(str2)
  const distance = levenshteinDistance(s1, s2, caseSensitive)
  const maxLength = Math.max(s1.length, s2.length)
  if (maxLength === 0) return 1
  return 1 - distance / maxLength
}

export const isObject = (val: unknown): val is object => {
  return val !== null && typeof val === 'object'
}

export const comparePaths = (path1: string, path2: string): boolean => {
  return path1 === path2 || Path.normalize(path1) === Path.normalize(path2)
}

export const isNullOrNaN = (num: unknown): boolean => {
  return num === null || isNaN(num as number)
}

export const clampPositiveInt = (value: number | null | undefined, max: number): number | null => {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return Math.min(Math.floor(value), max)
}

export const xmlToJSON = (xml: string): Promise<unknown> => {
  return new Promise((resolve) => {
    parseString(xml, (err: Error | null, results: unknown) => {
      if (err) {
        Logger.error('[xmlToJSON] Error', err)
        resolve(null)
      } else {
        resolve(results)
      }
    })
  })
}

export const getId = (prepend = ''): string => {
  const id = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8)
  if (prepend) return prepend + '_' + id
  return id
}

export function elapsedPretty(seconds: number): string {
  if (seconds > 0 && seconds < 1) {
    return `${Math.floor(seconds * 1000)} ms`
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)} sec`
  }
  let minutes = Math.floor(seconds / 60)
  if (minutes < 70) {
    return `${minutes} min`
  }
  let hours = Math.floor(minutes / 60)
  minutes -= hours * 60

  const days = Math.floor(hours / 24)
  hours -= days * 24

  const timeParts: string[] = []
  if (days) {
    timeParts.push(`${days} d`)
  }
  if (hours || (days && minutes)) {
    timeParts.push(`${hours} hr`)
  }
  if (minutes) {
    timeParts.push(`${minutes} min`)
  }
  return timeParts.join(' ')
}

export function secondsToTimestamp(seconds: number, includeMs = false, alwaysIncludeHours = false): string {
  let sec = seconds
  const minutes = Math.floor(seconds / 60)
  sec -= minutes * 60
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes - hours * 60

  const ms = sec - Math.floor(seconds)
  sec = Math.floor(sec)

  const msString = includeMs ? '.' + (ms.toFixed(3).split('.')[1] || '000') : ''
  if (alwaysIncludeHours) {
    return `${hours.toString().padStart(2, '0')}:${remainingMinutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}${msString}`
  }
  if (!hours) {
    return `${remainingMinutes}:${sec.toString().padStart(2, '0')}${msString}`
  }
  return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}${msString}`
}

export const reqSupportsWebp = (req?: { headers?: { accept?: string } } | null): boolean => {
  if (!req || !req.headers || !req.headers.accept) return false
  return req.headers.accept.includes('image/webp') || req.headers.accept === '*/*'
}

export { areEquivalent }

export const copyValue = (val: unknown): unknown => {
  if (val === undefined || val === '') return null
  if (!val) return val

  if (!isObject(val)) return val

  if (Array.isArray(val)) {
    return val.map(copyValue)
  } else {
    const final: { [key: string]: unknown } = {}
    const obj = val as { [key: string]: unknown }
    for (const key in obj) {
      final[key] = copyValue(obj[key])
    }
    return final
  }
}

export const toNumber = (val: unknown, fallback = 0): number => {
  if (isNaN(val as number) || val === null) return fallback
  return Number(val)
}

export const cleanStringForSearch = (str?: string | null): string => {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/['.`",]/g, '')
    .trim()
}

const getTitleParts = (title?: string | null): [string, string | null] => {
  if (!title) return ['', null]
  const serverSettings = (global as { ServerSettings?: { sortingPrefixes?: string[] } }).ServerSettings
  const prefixesToIgnore = serverSettings?.sortingPrefixes || []
  for (const prefix of prefixesToIgnore) {
    if (title.toLowerCase().startsWith(`${prefix} `)) {
      return [title.substring(prefix.length + 1), `${prefix.substring(0, 1).toUpperCase() + prefix.substring(1)}`]
    }
  }
  return [title, null]
}

export const getTitleIgnorePrefix = (title?: string | null): string => {
  return getTitleParts(title)[0]
}

export const getTitlePrefixAtEnd = (title?: string | null): string => {
  const [sort, prefix] = getTitleParts(title)
  return prefix ? `${sort}, ${prefix}` : (title || '')
}

export const escapeRegExp = (str: unknown): string => {
  if (typeof str !== 'string') return ''
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const validateUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    return new URL(rawUrl).toString()
  } catch (error) {
    Logger.error(`Invalid URL "${rawUrl}"`, error)
    return null
  }
}

export const isUUID = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false
  return uuid.validate(str)
}

export const isValidASIN = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false
  return /^[A-Z0-9]{10}$/.test(str)
}

export const timestampToSeconds = (timestamp?: string | null): number | null => {
  if (typeof timestamp !== 'string') {
    return null
  }
  const parts = timestamp.split(':').map(Number)
  if (parts.some(isNaN)) {
    return null
  } else if (parts.length === 1) {
    return parts[0] ?? null
  } else if (parts.length === 2) {
    const p0 = parts[0] ?? 0
    const p1 = parts[1] ?? 0
    return p0 * 60 + p1
  } else if (parts.length === 3) {
    const p0 = parts[0] ?? 0
    const p1 = parts[1] ?? 0
    const p2 = parts[2] ?? 0
    return p0 * 3600 + p1 * 60 + p2
  }
  return null
}

export class ValidationError extends Error {
  paramName: string
  status: number

  constructor(paramName: string, message: string, status = 400) {
    super(`Query parameter "${paramName}" ${message}`)
    this.name = 'ValidationError'
    this.paramName = paramName
    this.status = status
  }
}

export class NotFoundError extends Error {
  status: number

  constructor(message: string, status = 404) {
    super(message)
    this.name = 'NotFoundError'
    this.status = status
  }
}

export const getQueryParamAsString = (
  query: { [key: string]: unknown },
  paramName: string,
  defaultValue = '',
  required = false,
  maxLength = 1000
): string => {
  const value = query[paramName]
  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(paramName, 'is required')
    }
    return defaultValue
  }
  if (Array.isArray(value)) {
    throw new ValidationError(paramName, 'is an array')
  }
  if (typeof value === 'string' && value.length > maxLength) {
    throw new ValidationError(paramName, 'is too long')
  }
  return String(value)
}

export default {
  levenshteinDistance,
  levenshteinSimilarity,
  isObject,
  comparePaths,
  isNullOrNaN,
  clampPositiveInt,
  xmlToJSON,
  getId,
  elapsedPretty,
  secondsToTimestamp,
  reqSupportsWebp,
  areEquivalent,
  copyValue,
  toNumber,
  cleanStringForSearch,
  getTitleIgnorePrefix,
  getTitlePrefixAtEnd,
  escapeRegExp,
  validateUrl,
  isUUID,
  isValidASIN,
  timestampToSeconds,
  ValidationError,
  NotFoundError,
  getQueryParamAsString
}
