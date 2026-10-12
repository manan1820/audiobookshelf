import Path from 'path'
import { DataTypes, Model, NonAttribute, Optional, Sequelize, Transaction } from 'sequelize'
import { v4 as uuidv4 } from 'uuid'
import Logger from '../Logger'
import date from '../libs/dateAndTime'
import type Feed from './Feed'
import type PodcastEpisode from './PodcastEpisode'
import type LibraryItem from './LibraryItem'
import type { AudioFileObject, AudioTrack, ChapterObject, Book } from './Book'
import type {
  FeedEpisodeEnclosure,
  FeedEpisodeOldJsonObject,
  FeedEpisodeCustomElement,
  FeedEpisodeRssData
} from '../types'

export type {
  FeedEpisodeEnclosure,
  FeedEpisodeOldJsonObject,
  FeedEpisodeCustomElement,
  FeedEpisodeRssData
}

export interface FeedEpisodeAttributes {
  id: string
  title: string | null
  author: string | null
  description: string | null
  siteURL: string | null
  enclosureURL: string | null
  enclosureType: string | null
  enclosureSize: number | bigint | null
  pubDate: string | null
  season: string | null
  episode: string | null
  episodeType: string | null
  duration: number | null
  filePath: string | null
  explicit: boolean
  feedId?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface FeedEpisodeCreationAttributes
  extends Optional<
    FeedEpisodeAttributes,
    | 'id'
    | 'title'
    | 'author'
    | 'description'
    | 'siteURL'
    | 'enclosureURL'
    | 'enclosureType'
    | 'enclosureSize'
    | 'pubDate'
    | 'season'
    | 'episode'
    | 'episodeType'
    | 'duration'
    | 'filePath'
    | 'explicit'
    | 'feedId'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class FeedEpisode
  extends Model<FeedEpisodeAttributes, FeedEpisodeCreationAttributes>
  implements FeedEpisodeAttributes
{
  declare id: string
  declare title: string | null
  declare author: string | null
  declare description: string | null
  declare siteURL: string | null
  declare enclosureURL: string | null
  declare enclosureType: string | null
  declare enclosureSize: number | bigint | null
  declare pubDate: string | null
  declare season: string | null
  declare episode: string | null
  declare episodeType: string | null
  declare duration: number | null
  declare filePath: string | null
  declare explicit: boolean
  declare feedId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare feed?: NonAttribute<Feed>

  static getFeedEpisodeObjFromPodcastEpisode(
    libraryItemExpanded: LibraryItem & { media: { explicit: boolean } },
    feed: Feed,
    slug: string,
    episode: PodcastEpisode & {
      audioFile: {
        metadata: { filename: string; size: number; path: string }
        mimeType: string
        duration: number
      }
    },
    existingEpisodeId: string | null = null
  ): FeedEpisodeCreationAttributes {
    const episodeId = existingEpisodeId || uuidv4()
    return {
      id: episodeId,
      title: episode.title,
      author: feed.author,
      description: episode.description,
      siteURL: feed.siteURL,
      enclosureURL: `/feed/${slug}/item/${episodeId}/media${Path.extname(episode.audioFile.metadata.filename)}`,
      enclosureType: episode.audioFile.mimeType,
      enclosureSize: episode.audioFile.metadata.size,
      pubDate: episode.pubDate,
      season: episode.season,
      episode: episode.episode,
      episodeType: episode.episodeType,
      duration: episode.audioFile.duration,
      filePath: episode.audioFile.metadata.path,
      explicit: libraryItemExpanded.media.explicit,
      feedId: feed.id
    }
  }

  static async createFromPodcastEpisodes(
    libraryItemExpanded: LibraryItem & {
      media: {
        explicit: boolean
        podcastEpisodes: Array<
          PodcastEpisode & {
            pubDate: string | null
            audioFile: {
              metadata: { filename: string; size: number; path: string }
              mimeType: string
              duration: number
            }
          }
        >
      }
    },
    feed: Feed,
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    const feedEpisodeObjs: FeedEpisodeCreationAttributes[] = []

    if (feed.podcastType === 'episodic') {
      libraryItemExpanded.media.podcastEpisodes.sort((a, b) => {
        const timeB = b.pubDate ? new Date(b.pubDate).valueOf() : 0
        const timeA = a.pubDate ? new Date(a.pubDate).valueOf() : 0
        return timeB - timeA
      })
    } else {
      libraryItemExpanded.media.podcastEpisodes.sort((a, b) => {
        const timeA = a.pubDate ? new Date(a.pubDate).valueOf() : 0
        const timeB = b.pubDate ? new Date(b.pubDate).valueOf() : 0
        return timeA - timeB
      })
    }

    let numExisting = 0
    for (const episode of libraryItemExpanded.media.podcastEpisodes) {
      const existingEpisode = feed.feedEpisodes?.find((feedEpisode) => {
        return feedEpisode.filePath === episode.audioFile.metadata.path
      })
      numExisting = existingEpisode ? numExisting + 1 : numExisting

      feedEpisodeObjs.push(
        this.getFeedEpisodeObjFromPodcastEpisode(
          libraryItemExpanded,
          feed,
          slug,
          episode,
          existingEpisode?.id ?? null
        )
      )
    }
    Logger.info(
      `[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`
    )
    return this.bulkCreate(feedEpisodeObjs, {
      transaction,
      updateOnDuplicate: [
        'title',
        'author',
        'description',
        'siteURL',
        'enclosureURL',
        'enclosureType',
        'enclosureSize',
        'pubDate',
        'season',
        'episode',
        'episodeType',
        'duration',
        'filePath',
        'explicit'
      ]
    })
  }

  static checkUseChapterTitlesForEpisodes(
    trackList: AudioTrack[],
    book: { chapters?: ChapterObject[] | null }
  ): boolean {
    const chapters = book.chapters ?? []
    if (trackList.length !== chapters.length) return false
    for (let i = 0; i < trackList.length; i++) {
      const chapter = chapters[i]
      const track = trackList[i]
      if (chapter && track && Math.abs(chapter.start - track.startOffset) >= 1) {
        return false
      }
    }
    return true
  }

  static getFeedEpisodeObjFromAudiobookTrack(
    book: Book & {
      includedAudioFiles: AudioFileObject[]
      chapters?: ChapterObject[] | null
      explicit: boolean
      title: string
      description: string | null
    },
    pubDateStart: Date | null,
    feed: Feed,
    slug: string,
    audioTrack: AudioFileObject & { startOffset: number },
    useChapterTitles: boolean,
    offsetIndex: number,
    existingEpisodeId: string | null = null
  ): FeedEpisodeCreationAttributes {
    const timeOffset = offsetIndex * 60000
    const episodeId = existingEpisodeId || uuidv4()

    const startTime = pubDateStart ? pubDateStart.valueOf() : Date.now()
    const audiobookPubDate = date.format(
      new Date(startTime + timeOffset),
      'ddd, DD MMM YYYY HH:mm:ss [GMT]'
    )

    const contentUrl = `/feed/${slug}/item/${episodeId}/media${Path.extname(audioTrack.metadata.filename)}`

    let title = Path.basename(
      audioTrack.metadata.filename,
      Path.extname(audioTrack.metadata.filename)
    )
    if (book.includedAudioFiles?.length === 1) {
      title = book.title
    } else if (useChapterTitles && book.chapters) {
      const matchingChapter = book.chapters.find(
        (ch) => Math.abs(ch.start - audioTrack.startOffset) < 1
      )
      if (matchingChapter?.title) {
        title = matchingChapter.title
      }
    }

    return {
      id: episodeId,
      title,
      author: feed.author,
      description: book.description ?? '',
      siteURL: feed.siteURL,
      enclosureURL: contentUrl,
      enclosureType: audioTrack.mimeType,
      enclosureSize: audioTrack.metadata.size,
      pubDate: audiobookPubDate,
      duration: audioTrack.duration,
      filePath: audioTrack.metadata.path,
      explicit: book.explicit,
      feedId: feed.id
    }
  }

  static async createFromAudiobookTracks(
    libraryItemExpanded: LibraryItem & {
      getTrackList(): AudioTrack[]
      createdAt: Date
      media: Book & {
        includedAudioFiles: AudioFileObject[]
        chapters?: ChapterObject[] | null
        explicit: boolean
        title: string
        description: string | null
      }
    },
    feed: Feed,
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    const trackList = libraryItemExpanded.getTrackList()
    const useChapterTitles = this.checkUseChapterTitlesForEpisodes(
      trackList,
      libraryItemExpanded.media
    )

    const feedEpisodeObjs: FeedEpisodeCreationAttributes[] = []
    let numExisting = 0
    for (let i = 0; i < trackList.length; i++) {
      const track = trackList[i]
      if (!track) continue
      const existingEpisode = feed.feedEpisodes?.find((episode) => {
        return episode.filePath === track.metadata.path
      })
      numExisting = existingEpisode ? numExisting + 1 : numExisting

      feedEpisodeObjs.push(
        this.getFeedEpisodeObjFromAudiobookTrack(
          libraryItemExpanded.media,
          libraryItemExpanded.createdAt,
          feed,
          slug,
          track,
          useChapterTitles,
          i,
          existingEpisode?.id ?? null
        )
      )
    }
    Logger.info(
      `[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`
    )
    return this.bulkCreate(feedEpisodeObjs, {
      transaction,
      updateOnDuplicate: [
        'title',
        'author',
        'description',
        'siteURL',
        'enclosureURL',
        'enclosureType',
        'enclosureSize',
        'pubDate',
        'season',
        'episode',
        'episodeType',
        'duration',
        'filePath',
        'explicit'
      ]
    })
  }

  static async createFromBooks(
    books: Array<
      Book & {
        libraryItem: { id: string; createdAt: Date }
        includedAudioFiles: AudioFileObject[]
        chapters?: ChapterObject[] | null
        explicit: boolean
        title: string
        description: string | null
        getTracklist(libraryItemId: string): AudioTrack[]
      }
    >,
    feed: Feed,
    slug: string,
    transaction?: Transaction
  ): Promise<FeedEpisode[]> {
    const earliestLibraryItemCreatedAt =
      books.length > 0
        ? books.reduce((earliest, book) => {
            return book.libraryItem.createdAt < earliest.libraryItem.createdAt ? book : earliest
          }).libraryItem.createdAt
        : null

    const feedEpisodeObjs: FeedEpisodeCreationAttributes[] = []
    let numExisting = 0
    let offsetIndex = 0
    for (const book of books) {
      const trackList = book.getTracklist(book.libraryItem.id)
      const useChapterTitles = this.checkUseChapterTitlesForEpisodes(trackList, book)
      for (const track of trackList) {
        const existingEpisode = feed.feedEpisodes?.find((episode) => {
          return episode.filePath === track.metadata.path
        })
        numExisting = existingEpisode ? numExisting + 1 : numExisting

        feedEpisodeObjs.push(
          this.getFeedEpisodeObjFromAudiobookTrack(
            book,
            earliestLibraryItemCreatedAt,
            feed,
            slug,
            track,
            useChapterTitles,
            offsetIndex++,
            existingEpisode?.id ?? null
          )
        )
      }
    }
    Logger.info(
      `[FeedEpisode] Upserting ${feedEpisodeObjs.length} episodes for feed ${feed.id} (${numExisting} existing)`
    )
    return this.bulkCreate(feedEpisodeObjs, {
      transaction,
      updateOnDuplicate: [
        'title',
        'author',
        'description',
        'siteURL',
        'enclosureURL',
        'enclosureType',
        'enclosureSize',
        'pubDate',
        'season',
        'episode',
        'episodeType',
        'duration',
        'filePath',
        'explicit'
      ]
    })
  }

  static initModel(sequelize: Sequelize): typeof FeedEpisode {
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
    if (feed) {
      feed.hasMany(FeedEpisode, {
        onDelete: 'CASCADE'
      })
      FeedEpisode.belongsTo(feed)
    }

    return FeedEpisode
  }

  getOldEpisode(): FeedEpisodeOldJsonObject {
    const enclosure: FeedEpisodeEnclosure = {
      url: this.enclosureURL,
      size: typeof this.enclosureSize === 'bigint' ? Number(this.enclosureSize) : this.enclosureSize,
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

  getRSSData(hostPrefix: string): FeedEpisodeRssData {
    const rawCustomElements: FeedEpisodeCustomElement[] = [
      { 'itunes:author': this.author ?? null },
      { 'itunes:duration': Math.round(Number(this.duration ?? 0)) },
      { 'itunes:explicit': Boolean(this.explicit) },
      { 'itunes:episodeType': this.episodeType ?? null },
      { 'itunes:season': this.season ?? null },
      { 'itunes:episode': this.episode ?? null }
    ]
    const customElements: FeedEpisodeCustomElement[] = rawCustomElements.filter((element) => {
      return Object.values(element)[0] !== null
    })

    if (this.description) {
      customElements.push({ 'itunes:summary': { _cdata: this.description } })
    }

    return {
      title: this.title,
      description: this.description ?? '',
      url: `${hostPrefix}${this.siteURL}`,
      guid: `${hostPrefix}${this.enclosureURL}`,
      author: this.author,
      date: this.pubDate,
      enclosure: {
        url: `${hostPrefix}${this.enclosureURL}`,
        type: this.enclosureType,
        size: typeof this.enclosureSize === 'bigint' ? Number(this.enclosureSize) : this.enclosureSize
      },
      custom_elements: customElements
    }
  }
}

export default FeedEpisode
