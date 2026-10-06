import { DataTypes, Model, Sequelize } from 'sequelize'
import libraryItemsPodcastFilters from '../utils/queries/libraryItemsPodcastFilters'
import type { AudioFileObject, AudioTrack, ChapterObject, RssPodcastEpisode } from '../types'

interface PodcastEpisodeEnclosure {
  url: string
  type: string | null
  length: string | null
}

interface PodcastEpisodeOldJSON {
  libraryItemId: string
  podcastId: string
  id: string
  oldEpisodeId: string | null
  index: number | null
  season: string | null
  episode: string | null
  episodeType: string | null
  title: string
  subtitle: string | null
  description: string | null
  enclosure: PodcastEpisodeEnclosure | null
  guid: string | null
  pubDate: string | null
  chapters: ChapterObject[]
  audioFile: AudioFileObject
  publishedAt: number | null
  addedAt: number
  updatedAt: number
}

interface PodcastEpisodeOldJSONExpanded extends PodcastEpisodeOldJSON {
  audioTrack: AudioTrack
  size: number
  duration: number
}

class PodcastEpisode extends Model {
  declare id: string
  declare index: number | null
  declare season: string | null
  declare episode: string | null
  declare episodeType: string | null
  declare title: string
  declare subtitle: string | null
  declare description: string | null
  declare pubDate: string | null
  declare enclosureURL: string | null
  declare enclosureSize: bigint | number | string | null
  declare enclosureType: string | null
  declare publishedAt: Date | null
  declare audioFile: AudioFileObject | null
  declare chapters: ChapterObject[] | null
  declare extraData: Record<string, unknown> | null
  declare podcastId: string
  declare createdAt: Date
  declare updatedAt: Date

  static async createFromRssPodcastEpisode(
    rssPodcastEpisode: RssPodcastEpisode,
    podcastId: string,
    audioFile: { toJSON(): AudioFileObject; chapters?: ChapterObject[] }
  ): Promise<PodcastEpisode> {
    const podcastEpisode: Record<string, unknown> = {
      index: null,
      season: rssPodcastEpisode.season,
      episode: rssPodcastEpisode.episode,
      episodeType: rssPodcastEpisode.episodeType,
      title: rssPodcastEpisode.title,
      subtitle: rssPodcastEpisode.subtitle,
      description: rssPodcastEpisode.description,
      pubDate: rssPodcastEpisode.pubDate,
      enclosureURL: rssPodcastEpisode.enclosure?.url || null,
      enclosureSize: rssPodcastEpisode.enclosure?.length || null,
      enclosureType: rssPodcastEpisode.enclosure?.type || null,
      publishedAt: rssPodcastEpisode.publishedAt,
      podcastId,
      audioFile: audioFile.toJSON(),
      chapters: [],
      extraData: {}
    }
    const extraData = podcastEpisode.extraData as Record<string, unknown>
    if (rssPodcastEpisode.guid) {
      extraData.guid = rssPodcastEpisode.guid
    }

    if (audioFile.chapters?.length) {
      podcastEpisode.chapters = audioFile.chapters.map((ch) => ({ ...ch }))
    } else if (rssPodcastEpisode.chapters?.length) {
      podcastEpisode.chapters = rssPodcastEpisode.chapters.map((ch) => ({ ...ch }))
    }

    return this.create(podcastEpisode) as unknown as Promise<PodcastEpisode>
  }

  static override init(sequelize: Sequelize): typeof PodcastEpisode
  static override init(attributes: unknown, options: unknown): typeof PodcastEpisode
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof PodcastEpisode {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof PodcastEpisode
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        index: DataTypes.INTEGER,
        season: DataTypes.STRING,
        episode: DataTypes.STRING,
        episodeType: DataTypes.STRING,
        title: DataTypes.STRING,
        subtitle: DataTypes.STRING(1000),
        description: DataTypes.TEXT,
        pubDate: DataTypes.STRING,
        enclosureURL: DataTypes.STRING,
        enclosureSize: DataTypes.BIGINT,
        enclosureType: DataTypes.STRING,
        publishedAt: DataTypes.DATE,

        audioFile: DataTypes.JSON,
        chapters: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'podcastEpisode',
        indexes: [
          {
            name: 'podcastEpisode_createdAt_podcastId',
            fields: ['createdAt', 'podcastId']
          },
          {
            name: 'podcast_episodes_published_at',
            fields: ['publishedAt']
          }
        ]
      }
    )

    const { podcast } = sequelize.models
    podcast.hasMany(PodcastEpisode, {
      onDelete: 'CASCADE'
    })
    PodcastEpisode.belongsTo(podcast)

    PodcastEpisode.addHook('afterDestroy', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterDestroy')
    })

    PodcastEpisode.addHook('afterCreate', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterCreate')
    })

    return PodcastEpisode
  }

  get size(): number {
    return this.audioFile?.metadata?.size || 0
  }

  get duration(): number {
    return this.audioFile?.duration || 0
  }

  checkMatchesGuidOrEnclosureUrl(guid?: string | null, enclosureURL?: string | null): boolean {
    if (this.extraData?.guid && this.extraData.guid === guid) {
      return true
    }
    if (this.enclosureURL && this.enclosureURL === enclosureURL) {
      return true
    }
    return false
  }

  getAudioTrack(libraryItemId: string): AudioTrack {
    const track = structuredClone(this.audioFile) as AudioTrack
    track.startOffset = 0
    track.title = this.audioFile?.metadata?.filename || ''
    track.index = 1 // Podcast episodes only have one track
    track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
    return track
  }

  toOldJSON(libraryItemId: string): PodcastEpisodeOldJSON {
    if (!libraryItemId) {
      throw new Error(`[PodcastEpisode] Cannot convert to old JSON because libraryItemId is not provided`)
    }

    let enclosure: PodcastEpisodeEnclosure | null = null
    if (this.enclosureURL) {
      enclosure = {
        url: this.enclosureURL,
        type: this.enclosureType,
        length: this.enclosureSize !== null && this.enclosureSize !== undefined ? String(this.enclosureSize) : null
      }
    }

    return {
      libraryItemId,
      podcastId: this.podcastId,
      id: this.id,
      oldEpisodeId: (this.extraData?.oldEpisodeId as string) || null,
      index: this.index,
      season: this.season,
      episode: this.episode,
      episodeType: this.episodeType,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      enclosure,
      guid: (this.extraData?.guid as string) || null,
      pubDate: this.pubDate,
      chapters: structuredClone(this.chapters) || [],
      audioFile: structuredClone(this.audioFile) as AudioFileObject,
      publishedAt: this.publishedAt?.valueOf() || null,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONExpanded(libraryItemId: string): PodcastEpisodeOldJSONExpanded {
    const json = this.toOldJSON(libraryItemId) as PodcastEpisodeOldJSONExpanded

    json.audioTrack = this.getAudioTrack(libraryItemId)
    json.size = this.size
    json.duration = this.duration

    return json
  }
}

export = PodcastEpisode
