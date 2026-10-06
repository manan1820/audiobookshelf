export interface IOptions {
  allowedTags?: string[] | false
  disallowedTagsMode?: string
  allowedAttributes?: Record<string, string[]> | false
  allowedSchemes?: string[]
  allowProtocolRelative?: boolean
}

declare function sanitizeHtml(dirty: string, options?: IOptions): string
export default sanitizeHtml
export = sanitizeHtml
