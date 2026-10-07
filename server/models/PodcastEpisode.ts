import { DataTypes, Model, NonAttribute, Optional, Sequelize } from 'sequelize'
import libraryItemsPodcastFilters from '../utils/queries/libraryItemsPodcastFilters'
import type Podcast from './Podcast'
import type { AudioFileObject, AudioTrack } from './Book'
import type { RssPodcastEpisode } from '../utils/podcastUtils'

export interface ChapterObject {
  id: number
  start: number
  end: number
  title: string
}

export interface PodcastEpisodeAttributes {
  id: string
  index: number | null
  season: string | null
  episode: string | null
  episodeType: string | null
  title: string | null
  subtitle: string | null
  description: string | null
  pubDate: string | null
  enclosureURL: string | null
  enclosureSize: number | bigint | null
  enclosureType: string | null
  publishedAt: Date | null
  audioFile: AudioFileObject | null
  chapters: ChapterObject[] | null
  extraData: Record<string, unknown> | null
  podcastId?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface PodcastEpisodeCreationAttributes
  extends Optional<
    PodcastEpisodeAttributes,
    | 'id'
    | 'index'
    | 'season'
    | 'episode'
    | 'episodeType'
    | 'title'
    | 'subtitle'
    | 'description'
    | 'pubDate'
    | 'enclosureURL'
    | 'enclosureSize'
    | 'enclosureType'
    | 'publishedAt'
    | 'audioFile'
    | 'chapters'
    | 'extraData'
    | 'podcastId'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class PodcastEpisode
  extends Model<PodcastEpisodeAttributes, PodcastEpisodeCreationAttributes>
  implements PodcastEpisodeAttributes
{
  declare id: string
  declare index: number | null
  declare season: string | null
  declare episode: string | null
  declare episodeType: string | null
  declare title: string | null
  declare subtitle: string | null
  declare description: string | null
  declare pubDate: string | null
  declare enclosureURL: string | null
  declare enclosureSize: number | bigint | null
  declare enclosureType: string | null
  declare publishedAt: Date | null
  declare audioFile: AudioFileObject | null
  declare chapters: ChapterObject[] | null
  declare extraData: Record<string, unknown> | null
  declare podcastId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare podcast?: NonAttribute<Podcast>

  static async createFromRssPodcastEpisode(
    rssPodcastEpisode: RssPodcastEpisode,
    podcastId: string,
    audioFile: { toJSON(): unknown; chapters?: ChapterObject[] }
  ): Promise<PodcastEpisode> {
    const extraData: Record<string, unknown> = {}
    if (rssPodcastEpisode.guid) {
      extraData.guid = rssPodcastEpisode.guid
    }

    let chapters: ChapterObject[] = []
    if (audioFile.chapters?.length) {
      chapters = audioFile.chapters.map((ch) => ({ ...ch }))
    } else if (rssPodcastEpisode.chapters?.length) {
      chapters = rssPodcastEpisode.chapters.map((ch) => ({ ...ch }))
    }

    const publishedAt =
      rssPodcastEpisode.publishedAt !== null ? new Date(rssPodcastEpisode.publishedAt) : null

    return this.create({
      index: null,
      season: rssPodcastEpisode.season || null,
      episode: rssPodcastEpisode.episode || null,
      episodeType: rssPodcastEpisode.episodeType || null,
      title: rssPodcastEpisode.title || null,
      subtitle: rssPodcastEpisode.subtitle || null,
      description: rssPodcastEpisode.description || null,
      pubDate: rssPodcastEpisode.pubDate || null,
      enclosureURL: rssPodcastEpisode.enclosure?.url ?? null,
      enclosureSize:
        rssPodcastEpisode.enclosure?.length !== undefined &&
        rssPodcastEpisode.enclosure.length !== null
          ? Number(rssPodcastEpisode.enclosure.length)
          : null,
      enclosureType: rssPodcastEpisode.enclosure?.type ?? null,
      publishedAt,
      podcastId,
      audioFile: audioFile.toJSON() as AudioFileObject | null,
      chapters,
      extraData
    })
  }

  static initModel(sequelize: Sequelize): typeof PodcastEpisode {
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
    if (podcast) {
      podcast.hasMany(PodcastEpisode, {
        onDelete: 'CASCADE'
      })
      PodcastEpisode.belongsTo(podcast)
    }

    PodcastEpisode.addHook('afterDestroy', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterDestroy')
    })

    PodcastEpisode.addHook('afterCreate', async () => {
      libraryItemsPodcastFilters.clearCountCache('podcastEpisode', 'afterCreate')
    })

    return PodcastEpisode
  }

  get size(): number {
    return this.audioFile?.metadata?.size ?? 0
  }

  get duration(): number {
    return this.audioFile?.duration ?? 0
  }

  checkMatchesGuidOrEnclosureUrl(
    guid?: string | null,
    enclosureURL?: string | null
  ): boolean {
    if (this.extraData?.guid && guid && this.extraData.guid === guid) {
      return true
    }
    if (this.enclosureURL && enclosureURL && this.enclosureURL === enclosureURL) {
      return true
    }
    return false
  }

  getAudioTrack(libraryItemId: string): AudioTrack {
    if (!this.audioFile) {
      throw new Error(`[PodcastEpisode] Audio file is missing for episode ${this.id}`)
    }
    const track = structuredClone(this.audioFile) as AudioTrack
    track.startOffset = 0
    track.title = this.audioFile.metadata?.filename ?? ''
    track.index = 1
    track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
    return track
  }

  toOldJSON(libraryItemId: string): Record<string, unknown> {
    if (!libraryItemId) {
      throw new Error('[PodcastEpisode] Cannot convert to old JSON because libraryItemId is not provided')
    }

    let enclosure: Record<string, unknown> | null = null
    if (this.enclosureURL) {
      enclosure = {
        url: this.enclosureURL,
        type: this.enclosureType,
        length: this.enclosureSize !== null ? String(this.enclosureSize) : null
      }
    }

    return {
      libraryItemId,
      podcastId: this.podcastId,
      id: this.id,
      oldEpisodeId: this.extraData?.oldEpisodeId ?? null,
      index: this.index,
      season: this.season,
      episode: this.episode,
      episodeType: this.episodeType,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      enclosure,
      guid: this.extraData?.guid ?? null,
      pubDate: this.pubDate,
      chapters: structuredClone(this.chapters),
      audioFile: structuredClone(this.audioFile),
      publishedAt: this.publishedAt?.valueOf() ?? null,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONExpanded(libraryItemId: string): Record<string, unknown> {
    const json = this.toOldJSON(libraryItemId)
    json.audioTrack = this.getAudioTrack(libraryItemId)
    json.size = this.size
    json.duration = this.duration
    return json
  }
}

export default PodcastEpisode
