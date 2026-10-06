import sanitizeHtml from '../libs/sanitizeHtml'
import { entities } from './htmlEntities'

const entityMap = entities as Record<string, string>

function decodeHTMLEntities(strToDecode: string): string {
  return strToDecode.replace(/&([^;]+);?/g, function (entity) {
    if (entity in entityMap) {
      return entityMap[entity]
    }
    return entity
  })
}

/**
 * Sanitize html input
 */
export function sanitize(html: unknown): string {
  if (typeof html !== 'string') {
    return ''
  }

  const sanitizerOptions = {
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

/**
 * Strip all tags from html input and optionally decode entities
 */
export function stripAllTags(html: unknown, shouldDecodeEntities = true): string {
  if (typeof html !== 'string') return ''

  const sanitizerOptions = {
    allowedTags: [] as string[],
    disallowedTagsMode: 'discard'
  }

  const sanitized = sanitizeHtml(html, sanitizerOptions)
  return shouldDecodeEntities ? decodeHTMLEntities(sanitized) : sanitized
}
