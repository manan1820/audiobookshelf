interface RSSOptions {
  title: string
  description?: string
  generator?: string
  feed_url?: string
  site_url?: string
  image_url?: string
  docs?: string
  author?: string
  managingEditor?: string
  webMaster?: string
  copyright?: string
  language?: string
  categories?: string[]
  pubDate?: Date | string
  ttl?: number
  geoRSS?: boolean
  custom_namespaces?: Record<string, string>
  custom_elements?: unknown[]
}

interface RSSItemOptions {
  title?: string
  description?: string
  url?: string
  guid?: string
  categories?: string[]
  author?: string
  date?: Date | string
  lat?: number
  long?: number
  enclosure?: { url: string; size?: number | string | bigint; type?: string } | false
  custom_elements?: unknown[]
}

declare class RSS {
  constructor(options: RSSOptions, items?: unknown[])
  item(options: RSSItemOptions): this
  xml(indent?: string | boolean): string
}

export = RSS
