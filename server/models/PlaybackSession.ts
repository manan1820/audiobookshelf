import { DataTypes, Model, NonAttribute, Optional, Sequelize, WhereOptions } from 'sequelize'
import oldPlaybackSession from '../objects/PlaybackSession'
import type User from './User'
import type Library from './Library'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'
import type {
  PlaybackSessionExtraData,
  PlaybackSessionMediaMetadata,
  DeviceInfoObject
} from '../types'

export type {
  PlaybackSessionExtraData,
  PlaybackSessionMediaMetadata,
  DeviceInfoObject
}

export interface PlaybackSessionAttributes {
  id: string
  mediaItemId: string
  mediaItemType: string
  displayTitle: string | null
  displayAuthor: string | null
  duration: number
  playMethod: number
  mediaPlayer: string | null
  startTime: number
  currentTime: number
  serverVersion: string | null
  coverPath: string | null
  timeListening: number
  mediaMetadata: PlaybackSessionMediaMetadata | null
  date: string | null
  dayOfWeek: string | null
  extraData: PlaybackSessionExtraData | null
  userId?: string | null
  deviceId?: string | null
  libraryId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface PlaybackSessionCreationAttributes
  extends Optional<
    PlaybackSessionAttributes,
    | 'id'
    | 'displayTitle'
    | 'displayAuthor'
    | 'duration'
    | 'playMethod'
    | 'mediaPlayer'
    | 'startTime'
    | 'currentTime'
    | 'serverVersion'
    | 'coverPath'
    | 'timeListening'
    | 'mediaMetadata'
    | 'date'
    | 'dayOfWeek'
    | 'extraData'
    | 'userId'
    | 'deviceId'
    | 'libraryId'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class PlaybackSession
  extends Model<PlaybackSessionAttributes, PlaybackSessionCreationAttributes>
  implements PlaybackSessionAttributes
{
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare displayTitle: string | null
  declare displayAuthor: string | null
  declare duration: number
  declare playMethod: number
  declare mediaPlayer: string | null
  declare startTime: number
  declare currentTime: number
  declare serverVersion: string | null
  declare coverPath: string | null
  declare timeListening: number
  declare mediaMetadata: PlaybackSessionMediaMetadata | null
  declare date: string | null
  declare dayOfWeek: string | null
  declare extraData: PlaybackSessionExtraData | null
  declare userId: string | null
  declare deviceId: string | null
  declare libraryId: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare user?: NonAttribute<User>
  declare device?: NonAttribute<{ getOldDevice(): DeviceInfoObject | unknown; id?: string }>
  declare library?: NonAttribute<Library>
  declare book?: NonAttribute<Book>
  declare podcastEpisode?: NonAttribute<PodcastEpisode>
  declare mediaItem?: NonAttribute<Book | PodcastEpisode | null>

  static async getOldPlaybackSessions(
    where: WhereOptions<PlaybackSessionAttributes> | null = null
  ): Promise<oldPlaybackSession[]> {
    const sequelize = this.sequelize
    if (!sequelize) return []
    const deviceModel = sequelize.models.device
    const options: {
      where?: WhereOptions<PlaybackSessionAttributes>
      include: Array<{ model: unknown }>
    } = {
      include: deviceModel ? [{ model: deviceModel }] : []
    }
    if (where) {
      options.where = where
    }

    const playbackSessions = await this.findAll(options as Parameters<typeof this.findAll>[0])
    return playbackSessions.map((session) => this.getOldPlaybackSession(session))
  }

  static async getById(sessionId: string): Promise<oldPlaybackSession | null> {
    const sequelize = this.sequelize
    if (!sequelize) return null
    const deviceModel = sequelize.models.device
    const playbackSession = await this.findByPk(sessionId, {
      include: deviceModel ? [{ model: deviceModel }] : []
    } as Parameters<typeof this.findByPk>[1])
    if (!playbackSession) return null
    return this.getOldPlaybackSession(playbackSession)
  }

  static getOldPlaybackSession(
    playbackSessionExpanded: PlaybackSession & {
      device?: { getOldDevice(): unknown }
    }
  ): oldPlaybackSession {
    const isPodcastEpisode = playbackSessionExpanded.mediaItemType === 'podcastEpisode'

    return new oldPlaybackSession({
      id: playbackSessionExpanded.id,
      userId: playbackSessionExpanded.userId,
      libraryId: playbackSessionExpanded.libraryId,
      libraryItemId:
        typeof playbackSessionExpanded.extraData?.libraryItemId === 'string'
          ? playbackSessionExpanded.extraData.libraryItemId
          : null,
      bookId: isPodcastEpisode ? null : playbackSessionExpanded.mediaItemId,
      episodeId: isPodcastEpisode ? playbackSessionExpanded.mediaItemId : null,
      mediaType: isPodcastEpisode ? 'podcast' : 'book',
      mediaMetadata: playbackSessionExpanded.mediaMetadata,
      chapters: null,
      displayTitle: playbackSessionExpanded.displayTitle,
      displayAuthor: playbackSessionExpanded.displayAuthor,
      coverPath: playbackSessionExpanded.coverPath,
      duration: playbackSessionExpanded.duration,
      playMethod: playbackSessionExpanded.playMethod,
      mediaPlayer: playbackSessionExpanded.mediaPlayer,
      deviceInfo: playbackSessionExpanded.device?.getOldDevice() ?? null,
      serverVersion: playbackSessionExpanded.serverVersion,
      date: playbackSessionExpanded.date,
      dayOfWeek: playbackSessionExpanded.dayOfWeek,
      timeListening: playbackSessionExpanded.timeListening,
      startTime: playbackSessionExpanded.startTime,
      currentTime: playbackSessionExpanded.currentTime,
      startedAt: playbackSessionExpanded.createdAt.valueOf(),
      updatedAt: playbackSessionExpanded.updatedAt.valueOf()
    })
  }

  static removeById(sessionId: string): Promise<number> {
    return this.destroy({
      where: {
        id: sessionId
      }
    })
  }

  static createFromOld(oldSession: {
    id: string
    bookId?: string | null
    episodeId?: string | null
    libraryId?: string | null
    displayTitle?: string | null
    displayAuthor?: string | null
    duration?: number
    playMethod?: number
    mediaPlayer?: string | null
    startTime?: number
    currentTime?: number
    serverVersion?: string | null
    startedAt?: number
    updatedAt?: number
    userId?: string | null
    deviceInfo?: { id?: string } | null
    timeListening?: number
    coverPath?: string | null
    mediaMetadata?: PlaybackSessionMediaMetadata | null
    date?: string | null
    dayOfWeek?: string | null
    libraryItemId?: string | null
  }): Promise<[PlaybackSession, boolean | null]> {
    const playbackSession = this.getFromOld(oldSession)
    return this.upsert(playbackSession, {
      silent: true
    } as Parameters<typeof this.upsert>[1])
  }

  static updateFromOld(oldSession: {
    id: string
    bookId?: string | null
    episodeId?: string | null
    libraryId?: string | null
    displayTitle?: string | null
    displayAuthor?: string | null
    duration?: number
    playMethod?: number
    mediaPlayer?: string | null
    startTime?: number
    currentTime?: number
    serverVersion?: string | null
    startedAt?: number
    updatedAt?: number
    userId?: string | null
    deviceInfo?: { id?: string } | null
    timeListening?: number
    coverPath?: string | null
    mediaMetadata?: PlaybackSessionMediaMetadata | null
    date?: string | null
    dayOfWeek?: string | null
    libraryItemId?: string | null
  }): Promise<[affectedCount: number]> {
    const playbackSession = this.getFromOld(oldSession)
    return this.update(playbackSession, {
      where: {
        id: playbackSession.id
      },
      silent: true
    })
  }

  static getFromOld(oldSession: {
    id: string
    bookId?: string | null
    episodeId?: string | null
    libraryId?: string | null
    displayTitle?: string | null
    displayAuthor?: string | null
    duration?: number
    playMethod?: number
    mediaPlayer?: string | null
    startTime?: number
    currentTime?: number
    serverVersion?: string | null
    startedAt?: number
    updatedAt?: number
    userId?: string | null
    deviceInfo?: { id?: string } | null
    timeListening?: number
    coverPath?: string | null
    mediaMetadata?: PlaybackSessionMediaMetadata | null
    date?: string | null
    dayOfWeek?: string | null
    libraryItemId?: string | null
  }): PlaybackSessionCreationAttributes {
    const mediaItemId = oldSession.episodeId ?? (oldSession.bookId ?? '')
    const mediaItemType = oldSession.episodeId ? 'podcastEpisode' : 'book'

    return {
      id: oldSession.id,
      mediaItemId,
      mediaItemType,
      libraryId: oldSession.libraryId ?? null,
      displayTitle: oldSession.displayTitle ?? null,
      displayAuthor: oldSession.displayAuthor ?? null,
      duration: oldSession.duration ?? 0,
      playMethod: oldSession.playMethod ?? 0,
      mediaPlayer: oldSession.mediaPlayer ?? null,
      startTime: oldSession.startTime ?? 0,
      currentTime: oldSession.currentTime ?? 0,
      serverVersion: oldSession.serverVersion ?? null,
      createdAt: oldSession.startedAt ? new Date(oldSession.startedAt) : new Date(),
      updatedAt: oldSession.updatedAt ? new Date(oldSession.updatedAt) : new Date(),
      userId: oldSession.userId ?? null,
      deviceId: oldSession.deviceInfo?.id ?? null,
      timeListening: oldSession.timeListening ?? 0,
      coverPath: oldSession.coverPath ?? null,
      mediaMetadata: oldSession.mediaMetadata ?? null,
      date: oldSession.date ?? null,
      dayOfWeek: oldSession.dayOfWeek ?? null,
      extraData: {
        libraryItemId: oldSession.libraryItemId ?? null
      }
    }
  }

  getMediaItem(options?: unknown): Promise<Book | PodcastEpisode | null> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const self = this as {
      getBook?: (options?: unknown) => Promise<Book | null>
      getPodcastEpisode?: (options?: unknown) => Promise<PodcastEpisode | null>
    }
    if (this.mediaItemType === 'book' && typeof self.getBook === 'function') {
      return self.getBook(options)
    }
    if (this.mediaItemType === 'podcastEpisode' && typeof self.getPodcastEpisode === 'function') {
      return self.getPodcastEpisode(options)
    }
    return Promise.resolve(null)
  }

  static initModel(sequelize: Sequelize): typeof PlaybackSession {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        displayTitle: DataTypes.STRING,
        displayAuthor: DataTypes.STRING,
        duration: DataTypes.FLOAT,
        playMethod: DataTypes.INTEGER,
        mediaPlayer: DataTypes.STRING,
        startTime: DataTypes.FLOAT,
        currentTime: DataTypes.FLOAT,
        serverVersion: DataTypes.STRING,
        coverPath: DataTypes.STRING,
        timeListening: DataTypes.INTEGER,
        mediaMetadata: DataTypes.JSON,
        date: DataTypes.STRING,
        dayOfWeek: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'playbackSession'
      }
    )

    const { book, podcastEpisode, user, device, library } = sequelize.models

    if (user) {
      user.hasMany(PlaybackSession)
      PlaybackSession.belongsTo(user)
    }

    if (device) {
      device.hasMany(PlaybackSession)
      PlaybackSession.belongsTo(device)
    }

    if (library) {
      library.hasMany(PlaybackSession)
      PlaybackSession.belongsTo(library)
    }

    if (book) {
      book.hasMany(PlaybackSession, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'book'
        }
      })
      PlaybackSession.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })
    }

    if (podcastEpisode) {
      podcastEpisode.hasOne(PlaybackSession, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'podcastEpisode'
        }
      })
      PlaybackSession.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })
    }

    PlaybackSession.addHook('afterFind', (findResult) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]
      for (const instance of instances) {
        if (instance.mediaItemType === 'book' && instance.book !== undefined) {
          instance.mediaItem = instance.book
          instance.dataValues.mediaItem = instance.dataValues.book
        } else if (
          instance.mediaItemType === 'podcastEpisode' &&
          instance.podcastEpisode !== undefined
        ) {
          instance.mediaItem = instance.podcastEpisode
          instance.dataValues.mediaItem = instance.dataValues.podcastEpisode
        }
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcastEpisode
        delete instance.dataValues.podcastEpisode
      }
    })

    return PlaybackSession
  }
}

export default PlaybackSession
