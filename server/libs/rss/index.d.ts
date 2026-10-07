export interface RssFeedOptions {
  title?: string
  description?: string
  generator?: string
  feed_url?: string
  site_url?: string
  image_url?: string
  author?: string
  language?: string
  custom_namespaces?: Record<string, string>
  custom_elements?: unknown[]
  [key: string]: unknown
}

declare class RSS {
  constructor(options: RssFeedOptions)
  item(options: unknown): this
  xml(options?: { indent?: boolean | string }): string
}

export default RSS
export = RSS
