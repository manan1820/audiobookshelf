import { DataTypes, Model, NonAttribute, Optional, Sequelize, Transaction } from 'sequelize'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils'
import Logger from '../Logger'
import libraryItemsPodcastFilters from '../utils/queries/libraryItemsPodcastFilters'
import htmlSanitizer from '../utils/htmlSanitizer'
import type PodcastEpisode from './PodcastEpisode'
import type LibraryItem from './LibraryItem'
import type { AudioTrack } from './Book'
import type { ChapterObject } from './PodcastEpisode'
import type { RssPodcastEpisode } from '../utils/podcastUtils'
import type {
  PodcastAbsMetadataJsonObject,
  PodcastOldMetadataJsonObject,
  PodcastOldMetadataExpandedJsonObject,
  PodcastOldJsonObject,
  PodcastOldJsonMinifiedObject,
  PodcastOldJsonExpandedObject
} from '../types'

export type {
  PodcastAbsMetadataJsonObject,
  PodcastOldMetadataJsonObject,
  PodcastOldMetadataExpandedJsonObject,
  PodcastOldJsonObject,
  PodcastOldJsonMinifiedObject,
  PodcastOldJsonExpandedObject
}

export interface PodcastAttributes {
  id: string
  title: string
  titleIgnorePrefix: string | null
  author: string | null
  releaseDate: string | null
  feedURL: string | null
  imageURL: string | null
  description: string | null
  itunesPageURL: string | null
  itunesId: string | null
  itunesArtistId: string | null
  language: string | null
  podcastType: string | null
  explicit: boolean
  autoDownloadEpisodes: boolean
  autoDownloadSchedule: string | null
  lastEpisodeCheck: Date | null
  maxEpisodesToKeep: number
  maxNewEpisodesToDownload: number
  coverPath: string | null
  tags: string[] | null
  genres: string[] | null
  numEpisodes: number
  createdAt?: Date
  updatedAt?: Date
}

export interface PodcastCreationAttributes
  extends Optional<
    PodcastAttributes,
    | 'id'
    | 'titleIgnorePrefix'
    | 'author'
    | 'releaseDate'
    | 'feedURL'
    | 'imageURL'
    | 'description'
    | 'itunesPageURL'
    | 'itunesId'
    | 'itunesArtistId'
    | 'language'
    | 'podcastType'
    | 'explicit'
    | 'autoDownloadEpisodes'
    | 'autoDownloadSchedule'
    | 'lastEpisodeCheck'
    | 'maxEpisodesToKeep'
    | 'maxNewEpisodesToDownload'
    | 'coverPath'
    | 'tags'
    | 'genres'
    | 'numEpisodes'
    | 'createdAt'
    | 'updatedAt'
  > {}

export interface PodcastCreateRequestPayload {
  metadata: {
    title?: string | null
    author?: string | null
    releaseDate?: string | null
    feedUrl?: string | null
    imageUrl?: string | null
    description?: string | null
    itunesPageUrl?: string | null
    itunesId?: string | null
    itunesArtistId?: string | null
    language?: string | null
    type?: string | null
    explicit?: boolean
    genres?: string[]
    [key: string]: unknown
  }
  autoDownloadEpisodes?: boolean
  autoDownloadSchedule?: string | null
  tags?: string[]
  [key: string]: unknown
}

export interface PodcastUpdateRequestPayload {
  metadata?: {
    title?: string | null
    author?: string | null
    releaseDate?: string | null
    feedUrl?: string | null
    imageUrl?: string | null
    description?: string | null
    itunesPageUrl?: string | null
    itunesId?: string | null
    itunesArtistId?: string | null
    language?: string | null
    type?: string | null
    explicit?: boolean
    genres?: string[]
    [key: string]: unknown
  }
  autoDownloadEpisodes?: boolean
  autoDownloadSchedule?: string | null
  lastEpisodeCheck?: number
  maxEpisodesToKeep?: number
  maxNewEpisodesToDownload?: number
  tags?: string[]
  [key: string]: unknown
}

export class Podcast
  extends Model<PodcastAttributes, PodcastCreationAttributes>
  implements PodcastAttributes
{
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string | null
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
  declare numEpisodes: number
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare podcastEpisodes?: NonAttribute<PodcastEpisode[]>
  declare libraryItem?: NonAttribute<LibraryItem>

  static async createFromRequest(
    payload: PodcastCreateRequestPayload,
    transaction?: Transaction
  ): Promise<Podcast> {
    const title = typeof payload.metadata.title === 'string' ? payload.metadata.title : ''
    const autoDownloadSchedule =
      typeof payload.autoDownloadSchedule === 'string' ? payload.autoDownloadSchedule : null
    const genres =
      Array.isArray(payload.metadata.genres) &&
      payload.metadata.genres.every((g) => typeof g === 'string' && g.length > 0)
        ? payload.metadata.genres
        : []
    const tags =
      Array.isArray(payload.tags) &&
      payload.tags.every((t) => typeof t === 'string' && t.length > 0)
        ? payload.tags
        : []

    const stringKeys = [
      'title',
      'author',
      'releaseDate',
      'feedUrl',
      'imageUrl',
      'description',
      'itunesPageUrl',
      'itunesId',
      'itunesArtistId',
      'language',
      'type'
    ]
    stringKeys.forEach((key) => {
      if (typeof payload.metadata[key] === 'number') {
        payload.metadata[key] = String(payload.metadata[key])
      }
    })

    const rawDescription =
      typeof payload.metadata.description === 'string' ? payload.metadata.description : null
    const description = rawDescription ? htmlSanitizer.sanitize(rawDescription) : null

    return this.create(
      {
        title,
        titleIgnorePrefix: getTitleIgnorePrefix(title),
        author: typeof payload.metadata.author === 'string' ? payload.metadata.author : null,
        releaseDate:
          typeof payload.metadata.releaseDate === 'string' ? payload.metadata.releaseDate : null,
        feedURL: typeof payload.metadata.feedUrl === 'string' ? payload.metadata.feedUrl : null,
        imageURL: typeof payload.metadata.imageUrl === 'string' ? payload.metadata.imageUrl : null,
        description,
        itunesPageURL:
          typeof payload.metadata.itunesPageUrl === 'string'
            ? payload.metadata.itunesPageUrl
            : null,
        itunesId: typeof payload.metadata.itunesId === 'string' ? payload.metadata.itunesId : null,
        itunesArtistId:
          typeof payload.metadata.itunesArtistId === 'string'
            ? payload.metadata.itunesArtistId
            : null,
        language: typeof payload.metadata.language === 'string' ? payload.metadata.language : null,
        podcastType: typeof payload.metadata.type === 'string' ? payload.metadata.type : null,
        explicit: Boolean(payload.metadata.explicit),
        autoDownloadEpisodes: Boolean(payload.autoDownloadEpisodes),
        autoDownloadSchedule:
          autoDownloadSchedule ?? (global.ServerSettings?.podcastEpisodeSchedule || null),
        lastEpisodeCheck: new Date(),
        maxEpisodesToKeep: 0,
        maxNewEpisodesToDownload: 3,
        tags,
        genres
      },
      { transaction }
    )
  }

  static initModel(sequelize: Sequelize): typeof Podcast {
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
    return Boolean(this.podcastEpisodes?.length)
  }

  get hasAudioTracks(): boolean {
    return this.hasMediaFiles
  }

  get size(): number {
    if (!this.podcastEpisodes?.length) return 0
    return this.podcastEpisodes.reduce((total, episode) => total + (episode.size || 0), 0)
  }

  getAbsMetadataJson(): PodcastAbsMetadataJsonObject {
    return {
      tags: this.tags ?? [],
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: this.genres ?? [],
      feedURL: this.feedURL,
      imageURL: this.imageURL,
      itunesPageURL: this.itunesPageURL,
      itunesId: this.itunesId,
      itunesArtistId: this.itunesArtistId,
      language: this.language,
      explicit: Boolean(this.explicit),
      podcastType: this.podcastType
    }
  }

  async updateFromRequest(payload?: PodcastUpdateRequestPayload | null): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false

    if (payload.metadata) {
      const metadata = payload.metadata
      const stringKeys = [
        'title',
        'author',
        'releaseDate',
        'feedUrl',
        'imageUrl',
        'description',
        'itunesPageUrl',
        'itunesId',
        'itunesArtistId',
        'language',
        'type'
      ]
      stringKeys.forEach((key) => {
        if (typeof metadata[key] === 'number') {
          metadata[key] = String(metadata[key])
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

        let propValue: string | null = null
        if (newKey === 'podcastType') propValue = this.podcastType
        else if (newKey === 'feedURL') propValue = this.feedURL
        else if (newKey === 'imageURL') propValue = this.imageURL
        else if (newKey === 'itunesPageURL') propValue = this.itunesPageURL
        else if (newKey === 'title') propValue = this.title
        else if (newKey === 'author') propValue = this.author
        else if (newKey === 'releaseDate') propValue = this.releaseDate
        else if (newKey === 'description') propValue = this.description
        else if (newKey === 'itunesId') propValue = this.itunesId
        else if (newKey === 'itunesArtistId') propValue = this.itunesArtistId
        else if (newKey === 'language') propValue = this.language

        const metaValue = metadata[key]
        if (
          (typeof metaValue === 'string' || metaValue === null) &&
          metaValue !== propValue
        ) {
          if (key === 'description' && metaValue) {
            const sanitizedDescription = htmlSanitizer.sanitize(metaValue)
            if (sanitizedDescription !== metaValue) {
              Logger.debug(
                `[Podcast] "${this.title}" Sanitized description from "${metaValue}" to "${sanitizedDescription}"`
              )
              metadata[key] = sanitizedDescription
            }
          }

          const valToSet = (metadata[key] as string) || null
          if (newKey === 'podcastType') this.podcastType = valToSet
          else if (newKey === 'feedURL') this.feedURL = valToSet
          else if (newKey === 'imageURL') this.imageURL = valToSet
          else if (newKey === 'itunesPageURL') this.itunesPageURL = valToSet
          else if (newKey === 'title') {
            this.title = valToSet ?? ''
            this.titleIgnorePrefix = getTitleIgnorePrefix(this.title)
          } else if (newKey === 'author') this.author = valToSet
          else if (newKey === 'releaseDate') this.releaseDate = valToSet
          else if (newKey === 'description') this.description = valToSet
          else if (newKey === 'itunesId') this.itunesId = valToSet
          else if (newKey === 'itunesArtistId') this.itunesArtistId = valToSet
          else if (newKey === 'language') this.language = valToSet

          hasUpdates = true
        }
      })

      if (
        payload.metadata.explicit !== undefined &&
        Boolean(payload.metadata.explicit) !== this.explicit
      ) {
        this.explicit = Boolean(payload.metadata.explicit)
        hasUpdates = true
      }

      if (
        Array.isArray(payload.metadata.genres) &&
        !payload.metadata.genres.some((item) => typeof item !== 'string') &&
        JSON.stringify(this.genres) !== JSON.stringify(payload.metadata.genres)
      ) {
        this.genres = payload.metadata.genres
        this.changed('genres', true)
        hasUpdates = true
      }
    }

    if (
      Array.isArray(payload.tags) &&
      !payload.tags.some((item) => typeof item !== 'string') &&
      JSON.stringify(this.tags) !== JSON.stringify(payload.tags)
    ) {
      this.tags = payload.tags
      this.changed('tags', true)
      hasUpdates = true
    }

    if (
      payload.autoDownloadEpisodes !== undefined &&
      Boolean(payload.autoDownloadEpisodes) !== this.autoDownloadEpisodes
    ) {
      this.autoDownloadEpisodes = Boolean(payload.autoDownloadEpisodes)
      hasUpdates = true
    }
    if (
      typeof payload.autoDownloadSchedule === 'string' &&
      payload.autoDownloadSchedule !== this.autoDownloadSchedule
    ) {
      this.autoDownloadSchedule = payload.autoDownloadSchedule
      hasUpdates = true
    }
    if (
      typeof payload.lastEpisodeCheck === 'number' &&
      payload.lastEpisodeCheck !== this.lastEpisodeCheck?.valueOf()
    ) {
      this.lastEpisodeCheck = new Date(payload.lastEpisodeCheck)
      hasUpdates = true
    }

    if (
      typeof payload.maxEpisodesToKeep === 'number' &&
      payload.maxEpisodesToKeep !== this.maxEpisodesToKeep
    ) {
      this.maxEpisodesToKeep = payload.maxEpisodesToKeep
      hasUpdates = true
    }
    if (
      typeof payload.maxNewEpisodesToDownload === 'number' &&
      payload.maxNewEpisodesToDownload !== this.maxNewEpisodesToDownload
    ) {
      this.maxNewEpisodesToDownload = payload.maxNewEpisodesToDownload
      hasUpdates = true
    }

    if (hasUpdates) {
      Logger.debug('[Podcast] changed keys:', this.changed())
      await this.save()
    }

    return hasUpdates
  }

  checkCanDirectPlay(supportedMimeTypes: string[] | unknown, episodeId: string): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error('[Podcast] checkCanDirectPlay: supportedMimeTypes is not an array', supportedMimeTypes)
      return false
    }
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error('[Podcast] checkCanDirectPlay: episode not found', episodeId)
      return false
    }
    return supportedMimeTypes.includes(episode.audioFile?.mimeType)
  }

  getTracklist(libraryItemId: string, episodeId: string): AudioTrack[] {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error('[Podcast] getTracklist: episode not found', episodeId)
      return []
    }

    const audioTrack = episode.getAudioTrack(libraryItemId)
    return [audioTrack]
  }

  getChapters(episodeId: string): ChapterObject[] {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error('[Podcast] getChapters: episode not found', episodeId)
      return []
    }

    return structuredClone(episode.chapters) ?? []
  }

  getPlaybackTitle(episodeId: string): string {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error('[Podcast] getPlaybackTitle: episode not found', episodeId)
      return ''
    }

    return episode.title ?? ''
  }

  getPlaybackAuthor(): string | null {
    return this.author
  }

  getPlaybackDuration(episodeId: string): number {
    const episode = this.podcastEpisodes?.find((ep) => ep.id === episodeId)
    if (!episode) {
      Logger.error('[Podcast] getPlaybackDuration: episode not found', episodeId)
      return 0
    }

    return episode.duration
  }

  getLatestEpisodePublishedAt(): number {
    if (!this.podcastEpisodes?.length) return 0
    return this.podcastEpisodes.reduce((latest, episode) => {
      const pubAt = episode.publishedAt?.valueOf() ?? 0
      if (pubAt > latest) {
        return pubAt
      }
      return latest
    }, 0)
  }

  checkHasEpisodeByFeedEpisode(feedEpisode: RssPodcastEpisode): boolean {
    const guid = feedEpisode.guid
    const url = feedEpisode.enclosure.url
    return Boolean(this.podcastEpisodes?.some((ep) => ep.checkMatchesGuidOrEnclosureUrl(guid, url)))
  }

  oldMetadataToJSON(): PodcastOldMetadataJsonObject {
    return {
      title: this.title,
      author: this.author,
      description: this.description,
      releaseDate: this.releaseDate,
      genres: [...(this.genres ?? [])],
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

  oldMetadataToJSONExpanded(): PodcastOldMetadataExpandedJsonObject {
    return {
      ...this.oldMetadataToJSON(),
      titleIgnorePrefix: getTitlePrefixAtEnd(this.title)
    }
  }

  toOldJSON(libraryItemId: string): PodcastOldJsonObject {
    if (!libraryItemId) {
      throw new Error('[Podcast] Cannot convert to old JSON because libraryItemId is not provided')
    }
    if (!this.podcastEpisodes) {
      throw new Error('[Podcast] Cannot convert to old JSON because episodes are not provided')
    }

    return {
      id: this.id,
      libraryItemId,
      metadata: this.oldMetadataToJSON(),
      coverPath: this.coverPath,
      tags: [...(this.tags ?? [])],
      episodes: this.podcastEpisodes.map((episode) => episode.toOldJSON(libraryItemId)),
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() ?? null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload
    }
  }

  toOldJSONMinified(): PodcastOldJsonMinifiedObject {
    return {
      id: this.id,
      metadata: this.oldMetadataToJSONExpanded(),
      coverPath: this.coverPath,
      tags: [...(this.tags ?? [])],
      numEpisodes: this.podcastEpisodes?.length ?? 0,
      autoDownloadEpisodes: this.autoDownloadEpisodes,
      autoDownloadSchedule: this.autoDownloadSchedule,
      lastEpisodeCheck: this.lastEpisodeCheck?.valueOf() ?? null,
      maxEpisodesToKeep: this.maxEpisodesToKeep,
      maxNewEpisodesToDownload: this.maxNewEpisodesToDownload,
      size: this.size
    }
  }

  toOldJSONExpanded(libraryItemId: string): PodcastOldJsonExpandedObject {
    if (!libraryItemId) {
      throw new Error('[Podcast] Cannot convert to old JSON because libraryItemId is not provided')
    }
    if (!this.podcastEpisodes) {
      throw new Error('[Podcast] Cannot convert to old JSON because episodes are not provided')
    }

    return {
      ...this.toOldJSONMinified(),
      libraryItemId,
      episodes: this.podcastEpisodes.map((e) => e.toOldJSONExpanded(libraryItemId))
    }
  }
}

export default Podcast
