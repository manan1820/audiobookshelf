import * as h from 'htmlparser2'
import Logger from '../../Logger'

export interface OpmlFeedItem {
  title: string
  feedUrl: string
}

export function parse(opmlText?: string | null): OpmlFeedItem[] {
  if (!opmlText) return []
  const feeds: OpmlFeedItem[] = []
  const parser = new h.Parser({
    onopentag: (name: string, attribs: Record<string, string>) => {
      if (name === 'outline' && attribs.type === 'rss') {
        if (!attribs.xmlurl) {
          Logger.error('[parseOPML] Invalid opml outline tag has no xmlurl attribute')
        } else {
          feeds.push({
            title: attribs.title || attribs.text || '',
            feedUrl: attribs.xmlurl
          })
        }
      }
    }
  })
  parser.write(opmlText)
  return feeds
}

export default {
  parse
}
