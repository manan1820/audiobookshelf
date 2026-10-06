import xml from '../../libs/xml'
import escapeForXML from '../../libs/xml/escapeForXML'

export interface PodcastOPMLItem {
  title: string
  feedURL?: string | null
  description?: string | null
  itunesPageUrl?: string | null
  language?: string | null
}

interface FeedAttributes {
  type: string
  text: string
  title: string
  xmlUrl: string
  description?: string
  htmlUrl?: string
  language?: string
}

/**
 * Generate OPML file string for podcasts in a library
 */
export function generate(podcasts: PodcastOPMLItem[], indent = true): string {
  const bodyItems: Array<{ outline: { _attr: FeedAttributes } }> = []
  podcasts.forEach((podcast) => {
    if (!podcast.feedURL) return
    const feedAttributes: FeedAttributes = {
      type: 'rss',
      text: escapeForXML(podcast.title),
      title: escapeForXML(podcast.title),
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
