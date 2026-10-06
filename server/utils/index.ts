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
    track[0][i] = i
  }
  for (let j = 0; j <= s2.length; j += 1) {
    track[j][0] = j
  }
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      )
    }
  }
  return track[s2.length][s1.length]
}

export const levenshteinSimilarity = (str1: unknown, str2: unknown, caseSensitive = false): number => {
  const distance = levenshteinDistance(str1, str2, caseSensitive)
  const maxLength = Math.max(String(str1).length, String(str2).length)
  if (maxLength === 0) return 1
  return 1 - distance / maxLength
}

export const isObject = (val: unknown): val is Record<string, unknown> => {
  return val !== null && typeof val === 'object'
}

export const comparePaths = (path1: string, path2: string): boolean => {
  return path1 === path2 || Path.normalize(path1) === Path.normalize(path2)
}

export const isNullOrNaN = (num: unknown): boolean => {
  return num === null || Number.isNaN(num)
}

export const clampPositiveInt = (value: number | null | undefined, max: number): number | null => {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return Math.min(Math.floor(value), max)
}

export const xmlToJSON = (xml: string): Promise<Record<string, unknown> | null> => {
  return new Promise((resolve) => {
    parseString(xml, (err, results) => {
      if (err) {
        Logger.error('[xmlToJSON] Error', err)
        resolve(null)
      } else {
        resolve(results as Record<string, unknown>)
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
    timeParts.push(`${minutes} min` || '')
  }
  return timeParts.join(' ')
}

export function secondsToTimestamp(seconds: number, includeMs = false, alwaysIncludeHours = false): string {
  let sec = seconds
  const min = Math.floor(sec / 60)
  sec -= min * 60
  const hours = Math.floor(min / 60)
  const remainingMinutes = min - hours * 60

  const ms = sec - Math.floor(sec)
  sec = Math.floor(sec)

  const msString = includeMs ? '.' + ms.toFixed(3).split('.')[1] : ''
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
    const final: Record<string, unknown> = {}
    for (const key in val) {
      final[key] = copyValue(val[key])
    }
    return final
  }
}

export const toNumber = (val: unknown, fallback = 0): number => {
  if (val === null || (typeof val === 'number' && Number.isNaN(val)) || (typeof val !== 'number' && Number.isNaN(Number(val)))) {
    return fallback
  }
  return Number(val)
}

export const cleanStringForSearch = (str?: string | null): string => {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/['.`",]/g, '')
    .trim()
}

interface GlobalWithSettings {
  ServerSettings?: {
    sortingPrefixes?: string[]
  }
}

export const getTitleParts = (title?: string | null): [string, string | null] => {
  if (!title) return ['', null]
  const prefixesToIgnore = (global as unknown as GlobalWithSettings).ServerSettings?.sortingPrefixes || []
  for (const prefix of prefixesToIgnore) {
    if (title.toLowerCase().startsWith(`${prefix} `)) {
      return [title.substring(prefix.length + 1), `${prefix.substring(0, 1).toUpperCase() + prefix.substring(1)}`]
    }
  }
  return [title, null]
}

export const getTitleIgnorePrefix = (title: string): string => {
  return getTitleParts(title)[0]
}

export const getTitlePrefixAtEnd = (title: string): string => {
  const [sort, prefix] = getTitleParts(title)
  return prefix ? `${sort}, ${prefix}` : title
}

export const escapeRegExp = (str?: string | null): string => {
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
  if (parts.some((p) => Number.isNaN(p))) {
    return null
  } else if (parts.length === 1) {
    return parts[0]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
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
  query: Record<string, unknown>,
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
