import xml from '../../libs/xml'
import escapeForXML from '../../libs/xml/escapeForXML'

export interface OpmlPodcastItem {
  feedURL?: string | null
  title?: string | null
  description?: string | null
  itunesPageUrl?: string | null
  language?: string | null
}

interface OutlineAttribute {
  type: string
  text: string
  title: string
  xmlUrl: string
  description?: string
  htmlUrl?: string
  language?: string
}

interface BodyItem {
  outline: {
    _attr: OutlineAttribute
  }
}

/**
 * Generate OPML file string for podcasts in a library
 */
export function generate(podcasts: OpmlPodcastItem[], indent: boolean | string = true): string {
  const bodyItems: BodyItem[] = []
  podcasts.forEach((podcast) => {
    if (!podcast.feedURL) return
    const title = podcast.title ?? ''
    const feedAttributes: OutlineAttribute = {
      type: 'rss',
      text: escapeForXML(title),
      title: escapeForXML(title),
      xmlUrl: escapeForXML(podcast.feedURL)
    }
    if (podcast.description) {
      feedAttributes.description = escapeForXML(podcast.description)
    }
    if (podcast.itunesPageUrl) {
      feedAttributes.htmlUrl = escapeForXML(podcast.itunesPageUrl)
    }
    if (podcast.language) {
      feedAttributes.language = escapeForXML(podcast.language)
    }
    bodyItems.push({
      outline: {
        _attr: feedAttributes
      }
    })
  })

  const data = [
    {
      opml: [
        {
          _attr: {
            version: '1.0'
          }
        },
        {
          head: [
            {
              title: 'Audiobookshelf Podcast Subscriptions'
            }
          ]
        },
        {
          body: bodyItems
        }
      ]
    }
  ]

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml(data, indent)
}

export default {
  generate
}
