import Path from 'path'
import { DataTypes, Model, Sequelize, type Transaction } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'
import Logger from '../Logger'
import date from '../libs/dateAndTime'
import type Feed from './Feed'
import type PodcastEpisode from './PodcastEpisode'
import type Book from './Book'
import type { AudioFileObject, AudioTrack } from '../types'

interface FeedEpisodeData {
  id: string
  title: string
  author: string
  description: string | null
  siteURL: string
  enclosureURL: string
  enclosureType: string
  enclosureSize: bigint | number | string
  pubDate: string
  season?: string | null
  episode?: string | null
  episodeType?: string | null
  duration: number
  filePath: string
  explicit: boolean
  feedId: string
}

interface FeedEpisodeOldJSON {
  id: string
  title: string
  description: string | null
  enclosure: {
    url: string
    size: bigint | number | string
    type: string
  }
  pubDate: string
  link: string
  author: string
  explicit: boolean
  duration: number
  season: string | null
  episode: string | null
  episodeType: string | null
  fullPath: string
}

interface FeedEpisodeRSSData {
  title: string
  description: string
  url: string
  guid: string
  author: string
  date: string
  enclosure: {
    url: string
    type: string
    size: bigint | number | string
  }
  custom_elements: unknown[]
}

class FeedEpisode extends Model {
  declare id: string
  declare title: string
  declare author: string
  declare description: string | null
  declare siteURL: string
  declare enclosureURL: string
  declare enclosureType: string
  declare enclosureSize: bigint | number | string
  declare pubDate: string
  declare season: string | null
  declare episode: string | null
  declare episodeType: string | null
  declare duration: number
  declare filePath: string
  declare explicit: boolean
  declare feedId: string
  declare createdAt: Date
  declare updatedAt: Date

  static getFeedEpisodeObjFromPodcastEpisode(
    libraryItemExpanded: { media: { explicit: boolean } },
    feed: Feed,
    slug: string,
    episode: PodcastEpisode,
    existingEpisodeId: string | null = null
  ): FeedEpisodeData {
    const episodeId = existingEpisodeId || uuidv4()
    const audioFile = episode.audioFile as AudioFileObject
    return {
      id: episodeId,
      title: episode.title,
      author: feed.author,
      description: episode.description,
      siteURL: feed.siteURL,
      enclosureURL: `/feed/${slug}/item/${episodeId}/media${Path.extname(audioFile.metadata.filename)}`,
      enclosureType: audioFile.mimeType || '',
      enclosureSize: audioFile.metadata.size,
      pubDate: episode.pubDate || '',
      season: episode.season,
      episode: episode.episode,
      episodeType: episode.episodeType,
      duration: audioFile.duration || 0,
      filePath: audioFile.metadata.path,
      explicit: libraryItemExpanded.media.explicit,
      feedId: feed.id
    }
  }

  static async createFromPodcastEpisodes(
    libraryItemExpanded: { media: { podcastEpisodes: PodcastEpisode[] } },
    feed: Feed & { feedEpisodes?: FeedEpisode[]; podcastType?: string },
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    const feedEpisodeObjs: FeedEpisodeData[] = []

    // Sort podcastEpisodes by pubDate. episodic is newest to oldest. serial is oldest to newest.
    if (feed.podcastType === 'episodic') {
      libraryItemExpanded.media.podcastEpisodes.sort((a, b) => new Date(b.pubDate || '').getTime() - new Date(a.pubDate || '').getTime())
    } else {
      libraryItemExpanded.media.podcastEpisodes.sort((a, b) => new Date(a.pubDate || '').getTime() - new Date(b.pubDate || '').getTime())
    }

    let numExisting = 0
    for (const episode of libraryItemExpanded.media.podcastEpisodes) {
      const audioFile = episode.audioFile as AudioFileObject
      // Check for existing episode by filepath
      const existingEpisode = feed.feedEpisodes?.find((feedEpisode) => {
        return feedEpisode.filePath === audioFile.metadata.path
      })
      numExisting = existingEpisode ? numExisting + 1 : numExisting

      feedEpisodeObjs.push(this.getFeedEpisodeObjFromPodcastEpisode(libraryItemExpanded as never, feed, slug, episode, existingEpisode?.id))
    }
    Logger.info(`[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`)
    return this.bulkCreate(feedEpisodeObjs as never[], {
      transaction,
      updateOnDuplicate: ['title', 'author', 'description', 'siteURL', 'enclosureURL', 'enclosureType', 'enclosureSize', 'pubDate', 'season', 'episode', 'episodeType', 'duration', 'filePath', 'explicit']
    }) as unknown as Promise<FeedEpisode[]>
  }

  /**
   * If chapters for an audiobook match the audio tracks then use chapter titles instead of audio file names
   */
  static checkUseChapterTitlesForEpisodes(
    trackList: AudioTrack[],
    book: { chapters?: Array<{ start: number; title?: string }> }
  ): boolean {
    const chapters = book.chapters || []
    if (trackList.length !== chapters.length) return false
    for (let i = 0; i < trackList.length; i++) {
      if (Math.abs(chapters[i].start - trackList[i].startOffset) >= 1) {
        return false
      }
    }
    return true
  }

  static getFeedEpisodeObjFromAudiobookTrack(
    book: Book & { includedAudioFiles?: AudioFileObject[] },
    pubDateStart: Date,
    feed: Feed,
    slug: string,
    audioTrack: AudioFileObject & { startOffset?: number },
    useChapterTitles: boolean,
    offsetIndex: number,
    existingEpisodeId: string | null = null
  ): FeedEpisodeData {
    // Example: <pubDate>Fri, 04 Feb 2015 00:00:00 GMT</pubDate>
    // Offset pubdate in 1 minute intervals to ensure correct order
    const timeOffset = offsetIndex * 60000
    const episodeId = existingEpisodeId || uuidv4()

    // e.g. Track 1 will have a pub date before Track 2
    const audiobookPubDate = date.format(new Date(pubDateStart.valueOf() + timeOffset), 'ddd, DD MMM YYYY HH:mm:ss [GMT]')

    const contentUrl = `/feed/${slug}/item/${episodeId}/media${Path.extname(audioTrack.metadata.filename)}`

    let title = Path.basename(audioTrack.metadata.filename, Path.extname(audioTrack.metadata.filename))
    if (book.includedAudioFiles?.length === 1) {
      // If audiobook is a single file, use book title instead of chapter/file title
      title = book.title
    } else {
      if (useChapterTitles) {
        // If audio track start and chapter start are within 1 seconds of eachother then use the chapter title
        const matchingChapter = book.chapters?.find((ch: { start: number; title?: string }) => Math.abs(ch.start - (audioTrack.startOffset || 0)) < 1)
        if (matchingChapter?.title) title = matchingChapter.title
      }
    }

    return {
      id: episodeId,
      title,
      author: feed.author,
      description: book.description || '',
      siteURL: feed.siteURL,
      enclosureURL: contentUrl,
      enclosureType: audioTrack.mimeType || '',
      enclosureSize: audioTrack.metadata.size,
      pubDate: audiobookPubDate,
      duration: audioTrack.duration || 0,
      filePath: audioTrack.metadata.path,
      explicit: book.explicit,
      feedId: feed.id
    }
  }

  static async createFromAudiobookTracks(
    libraryItemExpanded: {
      getTrackList: () => AudioTrack[]
      media: Book & { includedAudioFiles?: AudioFileObject[] }
      createdAt: Date
    },
    feed: Feed & { feedEpisodes?: FeedEpisode[] },
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    const trackList = libraryItemExpanded.getTrackList()
    const useChapterTitles = this.checkUseChapterTitlesForEpisodes(trackList, libraryItemExpanded.media)

    const feedEpisodeObjs: FeedEpisodeData[] = []
    let numExisting = 0
    for (let i = 0; i < trackList.length; i++) {
      const track = trackList[i]
      // Check for existing episode by filepath
      const existingEpisode = feed.feedEpisodes?.find((episode) => {
        return episode.filePath === track.metadata.path
      })
      numExisting = existingEpisode ? numExisting + 1 : numExisting

      feedEpisodeObjs.push(this.getFeedEpisodeObjFromAudiobookTrack(libraryItemExpanded.media, libraryItemExpanded.createdAt, feed, slug, track, useChapterTitles, i, existingEpisode?.id))
    }
    Logger.info(`[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`)
    return this.bulkCreate(feedEpisodeObjs as never[], {
      transaction,
      updateOnDuplicate: ['title', 'author', 'description', 'siteURL', 'enclosureURL', 'enclosureType', 'enclosureSize', 'pubDate', 'season', 'episode', 'episodeType', 'duration', 'filePath', 'explicit']
    }) as unknown as Promise<FeedEpisode[]>
  }

  static async createFromBooks(
    books: Array<Book & { libraryItem: { id: string; createdAt: Date }; getTracklist: (id: string) => AudioTrack[]; includedAudioFiles?: AudioFileObject[] }>,
    feed: Feed & { feedEpisodes?: FeedEpisode[] },
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    // This is never null unless the books array is empty, as this method is not invoked when no books. Reduce needs an initial item
    const earliestLibraryItemCreatedAt =
      books.length > 0
        ? books.reduce((earliest, book) => {
            return book.libraryItem.createdAt < earliest.libraryItem.createdAt ? book : earliest
          }).libraryItem.createdAt
        : new Date()

    const feedEpisodeObjs: FeedEpisodeData[] = []
    let numExisting = 0
    let offsetIndex = 0
    for (const book of books) {
      const trackList = book.getTracklist(book.libraryItem.id)
      const useChapterTitles = this.checkUseChapterTitlesForEpisodes(trackList, book)
      for (const track of trackList) {
        // Check for existing episode by filepath
        const existingEpisode = feed.feedEpisodes?.find((episode) => {
          return episode.filePath === track.metadata.path
        })
        numExisting = existingEpisode ? numExisting + 1 : numExisting

        feedEpisodeObjs.push(this.getFeedEpisodeObjFromAudiobookTrack(book, earliestLibraryItemCreatedAt, feed, slug, track, useChapterTitles, offsetIndex++, existingEpisode?.id))
      }
    }
    Logger.info(`[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`)
    return this.bulkCreate(feedEpisodeObjs as never[], {
      transaction,
      updateOnDuplicate: ['title', 'author', 'description', 'siteURL', 'enclosureURL', 'enclosureType', 'enclosureSize', 'pubDate', 'season', 'episode', 'episodeType', 'duration', 'filePath', 'explicit']
    }) as unknown as Promise<FeedEpisode[]>
  }

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof FeedEpisode
  static override init(attributes: unknown, options: unknown): typeof FeedEpisode
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof FeedEpisode {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof FeedEpisode
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        title: DataTypes.STRING,
        author: DataTypes.STRING,
        description: DataTypes.TEXT,
        siteURL: DataTypes.STRING,
        enclosureURL: DataTypes.STRING,
        enclosureType: DataTypes.STRING,
        enclosureSize: DataTypes.BIGINT,
        pubDate: DataTypes.STRING,
        season: DataTypes.STRING,
        episode: DataTypes.STRING,
        episodeType: DataTypes.STRING,
        duration: DataTypes.FLOAT,
        filePath: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN
      },
      {
        sequelize,
        modelName: 'feedEpisode'
      }
    )

    const { feed } = sequelize.models

    feed.hasMany(FeedEpisode, {
      onDelete: 'CASCADE'
    })
    FeedEpisode.belongsTo(feed)

    return FeedEpisode
  }

  getOldEpisode(): FeedEpisodeOldJSON {
    const enclosure = {
      url: this.enclosureURL,
      size: this.enclosureSize,
      type: this.enclosureType
    }
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      enclosure,
      pubDate: this.pubDate,
      link: this.siteURL,
      author: this.author,
      explicit: this.explicit,
      duration: this.duration,
      season: this.season,
      episode: this.episode,
      episodeType: this.episodeType,
      fullPath: this.filePath
    }
  }

  getRSSData(hostPrefix: string): FeedEpisodeRSSData {
    const customElements: Array<Record<string, unknown>> = [
      { 'itunes:author': this.author || null },
      { 'itunes:duration': Math.round(Number(this.duration)) },
      {
        'itunes:explicit': !!this.explicit
      },
      { 'itunes:episodeType': this.episodeType || null },
      { 'itunes:season': this.season || null },
      { 'itunes:episode': this.episode || null }
    ].filter((element) => {
      // Remove empty custom elements
      return Object.values(element)[0] !== null
    })
    if (this.description) {
      customElements.push({ 'itunes:summary': { _cdata: this.description } })
    }

    return {
      title: this.title,
      description: this.description || '',
      url: `${hostPrefix}${this.siteURL}`,
      guid: `${hostPrefix}${this.enclosureURL}`,
      author: this.author,
      date: this.pubDate,
      enclosure: {
        url: `${hostPrefix}${this.enclosureURL}`,
        type: this.enclosureType,
        size: this.enclosureSize
      },
      custom_elements: customElements
    }
  }
}

export = FeedEpisode
