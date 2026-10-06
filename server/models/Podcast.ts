import { DataTypes, Model, Sequelize, type Transaction } from 'sequelize'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils'
import Logger from '../Logger'
import libraryItemsPodcastFilters from '../utils/queries/libraryItemsPodcastFilters'
import * as htmlSanitizer from '../utils/htmlSanitizer'
import type PodcastEpisode from './PodcastEpisode'
import type { AudioTrack, ChapterObject, RssPodcastEpisode } from '../types'

interface PodcastAbsMetadataJSON {
  tags: string[]
  title: string
  author: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  feedURL: string | null
  imageURL: string | null
  itunesPageURL: string | null
  itunesId: string | null
  itunesArtistId: string | null
  language: string | null
  explicit: boolean
  podcastType: string | null
}

interface PodcastOldMetadataJSON {
  title: string
  author: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  feedUrl: string | null
  imageUrl: string | null
  itunesPageUrl: string | null
  itunesId: string | null
  itunesArtistId: string | null
  explicit: boolean
  language: string | null
  type: string | null
}

interface PodcastOldMetadataJSONExpanded extends PodcastOldMetadataJSON {
  titleIgnorePrefix: string
}

interface PodcastOldJSON {
  id: string
  libraryItemId: string
  metadata: PodcastOldMetadataJSON
  coverPath: string | null
  tags: string[]
  episodes: unknown[]
  autoDownloadEpisodes: boolean
  autoDownloadSchedule: string | null
  lastEpisodeCheck: number | null
  maxEpisodesToKeep: number
  maxNewEpisodesToDownload: number
}

interface PodcastOldJSONMinified {
  id: string
  metadata: PodcastOldMetadataJSONExpanded
  coverPath: string | null
  tags: string[]
  numEpisodes: number
  autoDownloadEpisodes: boolean
  autoDownloadSchedule: string | null
  lastEpisodeCheck: number | null
  maxEpisodesToKeep: number
  maxNewEpisodesToDownload: number
  size: number
}

interface PodcastOldJSONExpanded extends PodcastOldJSONMinified {
  libraryItemId: string
  episodes: unknown[]
}

class Podcast extends Model {
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string
  declare author: string | null
  declare releaseDate: string | null
  declare feedURL: string | null
  declare imageURL: string | null
  declare description: string | null
  declare itunesPageURL: string | null
  declare itunesId: string | null
  declare itunesArtistId: string | null
  declare language: string | null
  declare podcastType: string | null
  declare explicit: boolean
  declare autoDownloadEpisodes: boolean
  declare autoDownloadSchedule: string | null
  declare lastEpisodeCheck: Date | null
  declare maxEpisodesToKeep: number
  declare maxNewEpisodesToDownload: number
  declare coverPath: string | null
  declare tags: string[] | null
  declare genres: string[] | null
  declare createdAt: Date
  declare updatedAt: Date
  declare numEpisodes: number

  declare podcastEpisodes?: PodcastEpisode[]

  /**
   * Payload from the /api/podcasts POST endpoint
   */
  static async createFromRequest(
    payload: {
      metadata: Record<string, unknown>
      autoDownloadSchedule?: string | null
      tags?: string[]
      autoDownloadEpisodes?: boolean
    },
    transaction?: Transaction
  ): Promise<Podcast> {
    const title = typeof payload.metadata.title === 'string' ? payload.metadata.title : null
    // cron expression validated in controller
    const autoDownloadSchedule = typeof payload.autoDownloadSchedule === 'string' ? payload.autoDownloadSchedule : null
    const genres = Array.isArray(payload.metadata.genres) && payload.metadata.genres.every((g) => typeof g === 'string' && g.length) ? (payload.metadata.genres as string[]) : []
    const tags = Array.isArray(payload.tags) && payload.tags.every((t) => typeof t === 'string' && t.length) ? payload.tags : []

    const stringKeys = ['title', 'author', 'releaseDate', 'feedUrl', 'imageUrl', 'description', 'itunesPageUrl', 'itunesId', 'itunesArtistId', 'language', 'type']
    stringKeys.forEach((key) => {
      if (typeof payload.metadata[key] === 'number') {
        payload.metadata[key] = String(payload.metadata[key])
      }
    })

    const rawDescription = typeof payload.metadata.description === 'string' ? payload.metadata.description : null
    const description = rawDescription ? htmlSanitizer.sanitize(rawDescription) : null

    return this.create(
      {
        title,
        titleIgnorePrefix: title ? getTitleIgnorePrefix(title) : '',
        author: typeof payload.metadata.author === 'string' ? payload.metadata.author : null,
        releaseDate: typeof payload.metadata.releaseDate === 'string' ? payload.metadata.releaseDate : null,
        feedURL: typeof payload.metadata.feedUrl === 'string' ? payload.metadata.feedUrl : null,
        imageURL: typeof payload.metadata.imageUrl === 'string' ? payload.metadata.imageUrl : null,
        description,
        itunesPageURL: typeof payload.metadata.itunesPageUrl === 'string' ? payload.metadata.itunesPageUrl : null,
        itunesId: typeof payload.metadata.itunesId === 'string' ? payload.metadata.itunesId : null,
        itunesArtistId: typeof payload.metadata.itunesArtistId === 'string' ? payload.metadata.itunesArtistId : null,
        language: typeof payload.metadata.language === 'string' ? payload.metadata.language : null,
        podcastType: typeof payload.metadata.type === 'string' ? payload.metadata.type : null,
        explicit: !!payload.metadata.explicit,
        autoDownloadEpisodes: !!payload.autoDownloadEpisodes,
        autoDownloadSchedule: autoDownloadSchedule || (global.ServerSettings?.podcastEpisodeSchedule as string) || null,
        lastEpisodeCheck: new Date(),
        maxEpisodesToKeep: 0,
        maxNewEpisodesToDownload: 3,
        tags,
        genres
      } as never,
      { transaction }
    ) as unknown as Promise<Podcast>
  }

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof Podcast
  static override init(attributes: unknown, options: unknown): typeof Podcast
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Podcast {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Podcast
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
        titleIgnorePrefix: DataTypes.STRING,
        author: DataTypes.STRING,
        releaseDate: DataTypes.STRING,
        feedURL: DataTypes.STRING,
        imageURL: DataTypes.STRING,
        description: DataTypes.TEXT,
        itunesPageURL: DataTypes.STRING,
        itunesId: DataTypes.STRING,
        itunesArtistId: DataTypes.STRING,
        language: DataTypes.STRING,
        podcastType: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN,

        autoDownloadEpisodes: DataTypes.BOOLEAN,
        autoDownloadSchedule: DataTypes.STRING,
        lastEpisodeCheck: DataTypes.DATE,
        maxEpisodesToKeep: DataTypes.INTEGER,
        maxNewEpisodesToDownload: DataTypes.INTEGER,
        coverPath: DataTypes.STRING,
        tags: DataTypes.JSON,
        genres: DataTypes.JSON,
        numEpisodes: DataTypes.INTEGER
      },
      {
        sequelize,
        modelName: 'podcast'
      }
    )

    Podcast.addHook('afterDestroy', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcast', 'afterDestroy')
    })

    Podcast.addHook('afterCreate', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcast', 'afterCreate')
    })

    return Podcast
  }

  get hasMediaFiles(): boolean {
    return !!this.podcastEpisodes?.length
  }

  get hasAudioTracks(): boolean {
    return this.hasMediaFiles
  }

  get size(): number {
    if (!this.podcastEpisodes?.length) return 0
    return this.podcastEpisodes.reduce((total, episode) => total + episode.size, 0)
  }

  getAbsMetadataJson(): PodcastAbsMetadataJSON {
    return {
      tags: this.tags || [],
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: this.genres || [],
      feedURL: this.feedURL,
      imageURL: this.imageURL,
      itunesPageURL: this.itunesPageURL,
      itunesId: this.itunesId,
      itunesArtistId: this.itunesArtistId,
      language: this.language,
      explicit: !!this.explicit,
      podcastType: this.podcastType
    }
  }

  async updateFromRequest(payload: {
    metadata?: Record<string, unknown>
    tags?: string[]
    autoDownloadEpisodes?: boolean
    autoDownloadSchedule?: string
    lastEpisodeCheck?: number
    maxEpisodesToKeep?: number
    maxNewEpisodesToDownload?: number
    [key: string]: unknown
  }): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false
    const self = this as unknown as Record<string, unknown>

    if (payload.metadata) {
      const stringKeys = ['title', 'author', 'releaseDate', 'feedUrl', 'imageUrl', 'description', 'itunesPageUrl', 'itunesId', 'itunesArtistId', 'language', 'type']
      stringKeys.forEach((key) => {
        // Convert numbers to strings
        if (typeof payload.metadata![key] === 'number') {
          payload.metadata![key] = String(payload.metadata![key])
        }

        let newKey = key
        if (key === 'type') {
          newKey = 'podcastType'
        } else if (key === 'feedUrl') {
          newKey = 'feedURL'
        } else if (key === 'imageUrl') {
          newKey = 'imageURL'
        } else if (key === 'itunesPageUrl') {
          newKey = 'itunesPageURL'
        }
        if ((typeof payload.metadata![key] === 'string' || payload.metadata![key] === null) && payload.metadata![key] !== self[newKey]) {
          // Sanitize description HTML
          if (key === 'description' && payload.metadata![key]) {
            const sanitizedDescription = htmlSanitizer.sanitize(payload.metadata![key] as string)
            if (sanitizedDescription !== payload.metadata![key]) {
              Logger.debug(`[Podcast] "${this.title}" Sanitized description from "${payload.metadata![key]}" to "${sanitizedDescription}"`)
              payload.metadata![key] = sanitizedDescription
            }
          }

          self[newKey] = payload.metadata![key] || null

          if (key === 'title') {
            this.titleIgnorePrefix = this.title ? getTitleIgnorePrefix(this.title) : ''
          }

          hasUpdates = true
        }
      })

      if (payload.metadata.explicit !== undefined && payload.metadata.explicit !== this.explicit) {
        this.explicit = !!payload.metadata.explicit
        hasUpdates = true
      }

      if (Array.isArray(payload.metadata.genres) && !payload.metadata.genres.some((item) => typeof item !== 'string') && JSON.stringify(this.genres) !== JSON.stringify(payload.metadata.genres)) {
        this.genres = payload.metadata.genres as string[]
        this.changed('genres', true)
        hasUpdates = true
      }
    }

    if (Array.isArray(payload.tags) && !payload.tags.some((item) => typeof item !== 'string') && JSON.stringify(this.tags) !== JSON.stringify(payload.tags)) {
      this.tags = payload.tags
      this.changed('tags', true)
      hasUpdates = true
    }

    if (payload.autoDownloadEpisodes !== undefined && payload.autoDownloadEpisodes !== this.autoDownloadEpisodes) {
      this.autoDownloadEpisodes = !!payload.autoDownloadEpisodes
      hasUpdates = true
    }
    if (typeof payload.autoDownloadSchedule === 'string' && payload.autoDownloadSchedule !== this.autoDownloadSchedule) {
      // cron expression validated in controller
      this.autoDownloadSchedule = payload.autoDownloadSchedule
      hasUpdates = true
    }
    if (typeof payload.lastEpisodeCheck === 'number' && payload.lastEpisodeCheck !== this.lastEpisodeCheck?.valueOf()) {
      this.lastEpisodeCheck = new Date(payload.lastEpisodeCheck)
      hasUpdates = true
    }

    const numberKeys = ['maxEpisodesToKeep', 'maxNewEpisodesToDownload']
    numberKeys.forEach((key) => {
      if (typeof payload[key] === 'number' && payload[key] !== self[key]) {
        self[key] = payload[key]
        hasUpdates = true
      }
    })

    if (hasUpdates) {
      Logger.debug(`[Podcast] changed keys:`, this.changed())
      await this.save()
    }

    return hasUpdates
  }

  checkCanDirectPlay(supportedMimeTypes: string[], episodeId: string): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error(`[Podcast] checkCanDirectPlay: supportedMimeTypes is not an array`, supportedMimeTypes)
      return false
    }
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] checkCanDirectPlay: episode not found`, episodeId)
      return false
    }
    return !!episode.audioFile?.mimeType && supportedMimeTypes.includes(episode.audioFile.mimeType)
  }

  /**
   * Get the track list to be used in client audio players
   * AudioTrack is the AudioFile with startOffset and contentUrl
   * Podcast episodes only have one track
   */
  getTracklist(libraryItemId: string, episodeId: string): AudioTrack[] {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getTracklist: episode not found`, episodeId)
      return []
    }

    const audioTrack = episode.getAudioTrack(libraryItemId)
    return [audioTrack]
  }

  getChapters(episodeId: string): ChapterObject[] {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getChapters: episode not found`, episodeId)
      return []
    }

    return structuredClone(episode.chapters) || []
  }

  getPlaybackTitle(episodeId: string): string {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getPlaybackTitle: episode not found`, episodeId)
      return ''
    }

    return episode.title
  }

  getPlaybackAuthor(): string | null {
    return this.author
  }

  getPlaybackDuration(episodeId: string): number {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error(`[Podcast] getPlaybackDuration: episode not found`, episodeId)
      return 0
    }

    return episode.duration
  }

  getLatestEpisodePublishedAt(): number {
    if (!this.podcastEpisodes) return 0
    return this.podcastEpisodes.reduce((latest, episode) => {
      const pubAt = episode.publishedAt?.valueOf() || 0
      if (pubAt > latest) {
        return pubAt
      }
      return latest
    }, 0)
  }

  checkHasEpisodeByFeedEpisode(feedEpisode: RssPodcastEpisode): boolean {
    const guid = feedEpisode.guid
    const url = feedEpisode.enclosure?.url
    return !!this.podcastEpisodes?.some((ep) => ep.checkMatchesGuidOrEnclosureUrl(guid, url))
  }

  /**
   * Old model kept metadata in a separate object
   */
  oldMetadataToJSON(): PodcastOldMetadataJSON {
    return {
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: [...(this.genres || [])],
      feedUrl: this.feedURL,
      imageUrl: this.imageURL,
      itunesPageUrl: this.itunesPageURL,
      itunesId: this.itunesId,
      itunesArtistId: this.itunesArtistId,
      explicit: this.explicit,
      language: this.language,
      type: this.podcastType
    }
  }

  oldMetadataToJSONExpanded(): PodcastOldMetadataJSONExpanded {
    const oldMetadataJSON = this.oldMetadataToJSON() as PodcastOldMetadataJSONExpanded
    oldMetadataJSON.titleIgnorePrefix = this.title ? getTitlePrefixAtEnd(this.title) : ''
    return oldMetadataJSON
  }

  toOldJSON(libraryItemId: string): PodcastOldJSON {
    if (!libraryItemId) {
      throw new Error(`[Podcast] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.podcastEpisodes) {
      throw new Error(`[Podcast] Cannot convert to old JSON because episodes are not provided`)
    }

    return {
      id: this.id,
      libraryItemId,
      metadata: this.oldMetadataToJSON(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      episodes: this.podcastEpisodes.map((episode) => episode.toOldJSON(libraryItemId)),
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() || null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload
    }
  }

  toOldJSONMinified(): PodcastOldJSONMinified {
    return {
      id: this.id,
      // Minified metadata and expanded metadata are the same
      metadata: this.oldMetadataToJSONExpanded(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      numEpisodes: this.podcastEpisodes?.length || 0,
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() || null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload,
      size: this.size
    }
  }

  toOldJSONExpanded(libraryItemId: string): PodcastOldJSONExpanded {
    if (!libraryItemId) {
      throw new Error(`[Podcast] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.podcastEpisodes) {
      throw new Error(`[Podcast] Cannot convert to old JSON because episodes are not provided`)
    }

    return {
      ...this.toOldJSONMinified(),
      libraryItemId,
      episodes: this.podcastEpisodes.map((e) => e.toOldJSONExpanded(libraryItemId))
    }
  }
}

export = Podcast
