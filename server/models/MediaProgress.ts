import { DataTypes, Model, NonAttribute, Optional, Sequelize } from 'sequelize'
import Logger from '../Logger'
import { isNullOrNaN } from '../utils'
import type { ProgressUpdatePayload } from './User'
import type User from './User'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'

export interface MediaProgressAttributes {
  id: string
  mediaItemId: string
  mediaItemType: string
  duration: number
  currentTime: number
  isFinished: boolean
  hideFromContinueListening: boolean
  ebookLocation: string | null
  ebookProgress: number | null
  finishedAt: Date | null
  extraData: Record<string, unknown> | null
  userId: string
  podcastId: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface MediaProgressCreationAttributes
  extends Optional<
    MediaProgressAttributes,
    | 'id'
    | 'duration'
    | 'currentTime'
    | 'isFinished'
    | 'hideFromContinueListening'
    | 'ebookLocation'
    | 'ebookProgress'
    | 'finishedAt'
    | 'extraData'
    | 'podcastId'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class MediaProgress
  extends Model<MediaProgressAttributes, MediaProgressCreationAttributes>
  implements MediaProgressAttributes
{
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare duration: number
  declare currentTime: number
  declare isFinished: boolean
  declare hideFromContinueListening: boolean
  declare ebookLocation: string | null
  declare ebookProgress: number | null
  declare finishedAt: Date | null
  declare extraData: Record<string, unknown> | null
  declare userId: string
  declare podcastId: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare user?: NonAttribute<User>
  declare mediaItem?: NonAttribute<unknown>
  declare book?: NonAttribute<Book>
  declare podcastEpisode?: NonAttribute<PodcastEpisode>

  static removeById(mediaProgressId: string): Promise<number> {
    return this.destroy({
      where: {
        id: mediaProgressId
      }
    })
  }

  static initModel(sequelize: Sequelize): typeof MediaProgress {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        mediaItemId: DataTypes.UUID,
        mediaItemType: DataTypes.STRING,
        duration: DataTypes.FLOAT,
        currentTime: DataTypes.FLOAT,
        isFinished: DataTypes.BOOLEAN,
        hideFromContinueListening: DataTypes.BOOLEAN,
        ebookLocation: DataTypes.STRING,
        ebookProgress: DataTypes.FLOAT,
        finishedAt: DataTypes.DATE,
        extraData: DataTypes.JSON,
        podcastId: DataTypes.UUID
      },
      {
        sequelize,
        modelName: 'mediaProgress',
        indexes: [
          {
            fields: ['updatedAt']
          },
          {
            name: 'media_progresses_user_item_finished_time',
            fields: ['userId', 'mediaItemId', 'isFinished', 'currentTime']
          }
        ]
      }
    )

    const { book, podcastEpisode, user } = sequelize.models

    if (book) {
      book.hasMany(MediaProgress, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'book'
        }
      })
      MediaProgress.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })
    }

    if (podcastEpisode) {
      podcastEpisode.hasMany(MediaProgress, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'podcastEpisode'
        }
      })
      MediaProgress.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })
    }

    MediaProgress.addHook('afterFind', (findResult) => {
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

    MediaProgress.addHook('beforeBulkDestroy', (options) => {
      options.individualHooks = true
    })

    if (user) {
      MediaProgress.addHook('afterDestroy', (instance) => {
        const userModel = user as typeof User & {
          mediaProgressRemoved?: (inst: unknown) => void
        }
        userModel.mediaProgressRemoved?.(instance)
      })

      user.hasMany(MediaProgress, {
        onDelete: 'CASCADE'
      })
      MediaProgress.belongsTo(user)
    }

    return MediaProgress
  }

  getMediaItem(options?: unknown): Promise<unknown> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const upperFirst = this.mediaItemType.charAt(0).toUpperCase() + this.mediaItemType.slice(1)
    const mixinMethodName = `get${upperFirst}`
    const method = (this as Record<string, unknown>)[mixinMethodName]
    if (typeof method === 'function') {
      return Promise.resolve(method.call(this, options))
    }
    return Promise.resolve(null)
  }

  getOldMediaProgress(): Record<string, unknown> {
    const isPodcastEpisode = this.mediaItemType === 'podcastEpisode'

    return {
      id: this.id,
      userId: this.userId,
      libraryItemId: this.extraData?.libraryItemId ?? null,
      episodeId: isPodcastEpisode ? this.mediaItemId : null,
      mediaItemId: this.mediaItemId,
      mediaItemType: this.mediaItemType,
      duration: this.duration,
      progress: this.extraData?.progress ?? 0,
      currentTime: this.currentTime,
      isFinished: Boolean(this.isFinished),
      hideFromContinueListening: Boolean(this.hideFromContinueListening),
      ebookLocation: this.ebookLocation,
      ebookProgress: this.ebookProgress,
      lastUpdate: this.updatedAt.valueOf(),
      startedAt: this.createdAt.valueOf(),
      finishedAt: this.finishedAt?.valueOf() ?? null
    }
  }

  get progress(): number {
    if (!this.duration) return 0
    return Math.max(0, Math.min(this.currentTime / this.duration, 1))
  }

  async applyProgressUpdate(progressPayload: ProgressUpdatePayload): Promise<this> {
    if (!this.extraData) this.extraData = {}
    if (progressPayload.isFinished !== undefined && progressPayload.isFinished !== null) {
      if (progressPayload.isFinished && !this.isFinished) {
        this.finishedAt = progressPayload.finishedAt
          ? new Date(progressPayload.finishedAt)
          : new Date()
        this.extraData.progress = 1
        this.changed('extraData', true)
        delete progressPayload.finishedAt
      } else if (!progressPayload.isFinished && this.isFinished) {
        this.finishedAt = null
        this.extraData.progress = 0
        this.currentTime = 0
        this.changed('extraData', true)
        delete progressPayload.finishedAt
        delete progressPayload.currentTime
      }
    } else if (
      progressPayload.progress !== undefined &&
      progressPayload.progress !== null &&
      !isNaN(progressPayload.progress) &&
      progressPayload.progress !== this.progress
    ) {
      this.extraData.progress = Math.min(1, Math.max(0, progressPayload.progress))
      this.changed('extraData', true)
    }

    const setPayload: Record<string, unknown> = {}
    if (progressPayload.currentTime !== undefined && progressPayload.currentTime !== null) {
      setPayload.currentTime = progressPayload.currentTime
    }
    if (progressPayload.duration !== undefined && progressPayload.duration !== null) {
      setPayload.duration = progressPayload.duration
    }
    if (
      progressPayload.hideFromContinueListening !== undefined &&
      progressPayload.hideFromContinueListening !== null
    ) {
      setPayload.hideFromContinueListening = progressPayload.hideFromContinueListening
    }
    if (progressPayload.ebookLocation !== undefined) {
      setPayload.ebookLocation = progressPayload.ebookLocation
    }
    if (progressPayload.ebookProgress !== undefined) {
      setPayload.ebookProgress = progressPayload.ebookProgress
    }

    this.set(setPayload)

    if (this.changed('currentTime') && !progressPayload.hideFromContinueListening) {
      this.hideFromContinueListening = false
    }

    const timeRemaining = this.duration - this.currentTime

    let shouldMarkAsFinished = false
    if (this.duration) {
      if (
        !isNullOrNaN(progressPayload.markAsFinishedPercentComplete) &&
        Number(progressPayload.markAsFinishedPercentComplete) > 0
      ) {
        const markAsFinishedPercentComplete =
          Number(progressPayload.markAsFinishedPercentComplete) / 100
        shouldMarkAsFinished = markAsFinishedPercentComplete < this.progress
        if (shouldMarkAsFinished) {
          Logger.info(
            `[MediaProgress] Marking media progress as finished because progress (${this.progress}) is greater than ${markAsFinishedPercentComplete} (media item ${this.mediaItemId})`
          )
        }
      } else {
        const markAsFinishedTimeRemaining = isNullOrNaN(
          progressPayload.markAsFinishedTimeRemaining
        )
          ? 10
          : Number(progressPayload.markAsFinishedTimeRemaining)
        shouldMarkAsFinished = timeRemaining < markAsFinishedTimeRemaining
        if (shouldMarkAsFinished) {
          Logger.info(
            `[MediaProgress] Marking media progress as finished because time remaining (${timeRemaining}) is less than ${markAsFinishedTimeRemaining} seconds (media item ${this.mediaItemId})`
          )
        }
      }
    }

    if (!this.isFinished && shouldMarkAsFinished) {
      this.isFinished = true
      this.finishedAt = this.finishedAt || new Date()
      this.extraData.progress = 1
      this.changed('extraData', true)
    } else if (this.isFinished && this.changed('currentTime') && !shouldMarkAsFinished) {
      this.isFinished = false
      this.finishedAt = null
    }

    await this.save()

    if (progressPayload.lastUpdate) {
      const parsedLastUpdate = new Date(progressPayload.lastUpdate)
      if (isNaN(parsedLastUpdate.valueOf())) {
        Logger.warn(
          `[MediaProgress] Invalid date provided for lastUpdate: ${progressPayload.lastUpdate} (media item ${this.mediaItemId})`
        )
      } else {
        const escapedDate = this.sequelize.escape(parsedLastUpdate)
        Logger.info(
          `[MediaProgress] Manually setting updatedAt to ${escapedDate} (media item ${this.mediaItemId})`
        )

        await this.sequelize.query(
          `UPDATE "mediaProgresses" SET "updatedAt" = ${escapedDate} WHERE "id" = '${this.id}'`
        )

        await this.reload()
      }
    }

    return this
  }
}

export default MediaProgress
