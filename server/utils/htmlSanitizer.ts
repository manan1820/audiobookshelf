import sanitizeHtml from '../libs/sanitizeHtml'
import { entities } from './htmlEntities'

export interface SanitizeOptions {
  allowedTags?: string[]
  disallowedTagsMode?: 'discard' | 'completelyDiscard' | 'recursiveEscape'
  allowedAttributes?: Record<string, string[]>
  allowedSchemes?: string[]
  allowProtocolRelative?: boolean
}

export function sanitize(html?: string | null): string {
  if (typeof html !== 'string') {
    return ''
  }

  const sanitizerOptions: SanitizeOptions = {
    allowedTags: ['p', 'ol', 'ul', 'li', 'a', 'strong', 'em', 'del', 'br', 'b', 'i'],
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      a: ['href', 'name', 'target']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false
  }

  return sanitizeHtml(html, sanitizerOptions)
}

export function decodeHTMLEntities(strToDecode: string): string {
  const entityMap = entities as Record<string, string>
  return strToDecode.replace(/&([^;]+);?/g, (entity) => {
    if (Object.prototype.hasOwnProperty.call(entityMap, entity)) {
      return entityMap[entity] ?? entity
    }
    return entity
  })
}

export function stripAllTags(html?: string | null, shouldDecodeEntities = true): string {
  if (typeof html !== 'string') return ''

  const sanitizerOptions: SanitizeOptions = {
    allowedTags: [],
    disallowedTagsMode: 'discard'
  }

  const sanitized = sanitizeHtml(html, sanitizerOptions)
  return shouldDecodeEntities ? decodeHTMLEntities(sanitized) : sanitized
}

export default {
  sanitize,
  stripAllTags
}
