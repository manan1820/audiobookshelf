import * as h from 'htmlparser2'
import Logger from '../../Logger'

export interface ParsedOpmlFeed {
  title: string
  feedUrl: string
}

export function parse(opmlText: string): ParsedOpmlFeed[] {
  const feeds: ParsedOpmlFeed[] = []
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
