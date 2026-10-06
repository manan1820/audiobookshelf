import { DataTypes, Model, Sequelize, type WhereOptions } from 'sequelize'
import oldPlaybackSession from '../objects/PlaybackSession'
import type Device from './Device'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'

class PlaybackSession extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare displayTitle: string
  declare displayAuthor: string
  declare duration: number
  declare playMethod: number
  declare mediaPlayer: string
  declare startTime: number
  declare currentTime: number
  declare serverVersion: string | null
  declare coverPath: string | null
  declare timeListening: number
  declare mediaMetadata: Record<string, unknown> | null
  declare date: string
  declare dayOfWeek: string
  declare extraData: { libraryItemId?: string | null; [key: string]: unknown } | null
  declare userId: string
  declare deviceId: string | null
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date

  declare device?: Device | null
  declare mediaItem?: Book | PodcastEpisode | null

  static async getOldPlaybackSessions(where: WhereOptions | null = null): Promise<InstanceType<typeof oldPlaybackSession>[]> {
    const { device } = this.sequelize!.models
    const playbackSessions = (await this.findAll({
      where: where || undefined,
      include: [
        {
          model: device
        }
      ]
    })) as PlaybackSession[]
    return playbackSessions.map((session) => this.getOldPlaybackSession(session))
  }

  static async getById(sessionId: string): Promise<InstanceType<typeof oldPlaybackSession> | null> {
    const { device } = this.sequelize!.models
    const playbackSession = (await this.findByPk(sessionId, {
      include: [
        {
          model: device
        }
      ]
    })) as PlaybackSession | null
    if (!playbackSession) return null
    return this.getOldPlaybackSession(playbackSession)
  }

  static getOldPlaybackSession(playbackSessionExpanded: PlaybackSession): InstanceType<typeof oldPlaybackSession> {
    const isPodcastEpisode = playbackSessionExpanded.mediaItemType === 'podcastEpisode'

    return new oldPlaybackSession({
      id: playbackSessionExpanded.id,
      userId: playbackSessionExpanded.userId,
      libraryId: playbackSessionExpanded.libraryId,
      libraryItemId: playbackSessionExpanded.extraData?.libraryItemId || null,
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
      deviceInfo: playbackSessionExpanded.device?.getOldDevice() || null,
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

  static createFromOld(oldSession: InstanceType<typeof oldPlaybackSession>): Promise<[PlaybackSession, boolean | null]> {
    const playbackSession = this.getFromOld(oldSession)
    return this.upsert(playbackSession as never, {
      silent: true
    } as never) as unknown as Promise<[PlaybackSession, boolean | null]>
  }

  static updateFromOld(oldSession: InstanceType<typeof oldPlaybackSession>): Promise<[affectedCount: number]> {
    const playbackSession = this.getFromOld(oldSession)
    return this.update(playbackSession as never, {
      where: {
        id: playbackSession.id
      },
      silent: true
    })
  }

  static getFromOld(oldSession: InstanceType<typeof oldPlaybackSession>): Record<string, unknown> {
    return {
      id: oldSession.id,
      mediaItemId: oldSession.episodeId || oldSession.bookId,
      mediaItemType: oldSession.episodeId ? 'podcastEpisode' : 'book',
      libraryId: oldSession.libraryId,
      displayTitle: oldSession.displayTitle,
      displayAuthor: oldSession.displayAuthor,
      duration: oldSession.duration,
      playMethod: oldSession.playMethod,
      mediaPlayer: oldSession.mediaPlayer,
      startTime: oldSession.startTime,
      currentTime: oldSession.currentTime,
      serverVersion: oldSession.serverVersion || null,
      createdAt: oldSession.startedAt,
      updatedAt: oldSession.updatedAt,
      userId: oldSession.userId,
      deviceId: oldSession.deviceInfo?.id || null,
      timeListening: oldSession.timeListening,
      coverPath: oldSession.coverPath,
      mediaMetadata: oldSession.mediaMetadata,
      date: oldSession.date,
      dayOfWeek: oldSession.dayOfWeek,
      extraData: {
        libraryItemId: oldSession.libraryItemId
      }
    }
  }

  getMediaItem(options?: unknown): Promise<unknown> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const sequelize = this.sequelize as (Sequelize & { uppercaseFirst?: (str: string) => string }) | undefined
    const uppercaseFirst = sequelize?.uppercaseFirst || ((str: string) => str.charAt(0).toUpperCase() + str.slice(1))
    const mixinMethodName = `get${uppercaseFirst(this.mediaItemType)}`
    const self = this as unknown as Record<string, (opts?: unknown) => Promise<unknown>>
    if (typeof self[mixinMethodName] === 'function') {
      return self[mixinMethodName](options)
    }
    return Promise.resolve(null)
  }

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof PlaybackSession
  static override init(attributes: unknown, options: unknown): typeof PlaybackSession
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof PlaybackSession {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof PlaybackSession
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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

    user.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(user)

    device.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(device)

    library.hasMany(PlaybackSession)
    PlaybackSession.belongsTo(library)

    book.hasMany(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    PlaybackSession.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(PlaybackSession, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    PlaybackSession.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    PlaybackSession.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      let results: unknown[]
      if (!Array.isArray(findResult)) {
        results = [findResult]
      } else {
        results = findResult
      }

      for (const inst of results) {
        const instance = inst as Record<string, unknown> & { dataValues: Record<string, unknown> }
        if (instance.mediaItemType === 'book' && instance.book !== undefined) {
          instance.mediaItem = instance.book
          instance.dataValues.mediaItem = instance.dataValues.book
        } else if (instance.mediaItemType === 'podcastEpisode' && instance.podcastEpisode !== undefined) {
          instance.mediaItem = instance.podcastEpisode
          instance.dataValues.mediaItem = instance.dataValues.podcastEpisode
        }
        // To prevent mistakes:
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcastEpisode
        delete instance.dataValues.podcastEpisode
      }
    })

    return PlaybackSession
  }
}

export = PlaybackSession
