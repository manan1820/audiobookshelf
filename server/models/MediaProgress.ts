import { DataTypes, Model, Sequelize } from 'sequelize'
import Logger from '../Logger'
import { isNullOrNaN } from '../utils'
import type { ProgressUpdatePayload } from '../types'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'

interface MediaProgressOldJSON {
  id: string
  userId: string
  libraryItemId: string | null
  episodeId: string | null
  mediaItemId: string
  mediaItemType: string
  duration: number
  progress: number
  currentTime: number
  isFinished: boolean
  hideFromContinueListening: boolean
  ebookLocation: string | null
  ebookProgress: number | null
  lastUpdate: number
  startedAt: number
  finishedAt: number | null
}

class MediaProgress extends Model {
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
  declare extraData: { libraryItemId?: string | null; progress?: number; [key: string]: unknown } | null
  declare userId: string
  declare updatedAt: Date
  declare createdAt: Date
  declare podcastId: string | null

  declare mediaItem?: Book | PodcastEpisode | null

  static removeById(mediaProgressId: string): Promise<number> {
    return this.destroy({
      where: {
        id: mediaProgressId
      }
    })
  }

  /**
   * Initialize model
   *
   * Polymorphic association: Book has many MediaProgress. PodcastEpisode has many MediaProgress.
   */
  static override init(sequelize: Sequelize): typeof MediaProgress
  static override init(attributes: unknown, options: unknown): typeof MediaProgress
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof MediaProgress {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof MediaProgress
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

    book.hasMany(MediaProgress, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    MediaProgress.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasMany(MediaProgress, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    MediaProgress.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    MediaProgress.addHook('afterFind', (findResult: unknown) => {
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

    // make sure to call the afterDestroy hook for each instance
    MediaProgress.addHook('beforeBulkDestroy', (options: { individualHooks?: boolean }) => {
      options.individualHooks = true
    })

    // update the potentially cached user after destroying the media progress
    MediaProgress.addHook('afterDestroy', (instance: MediaProgress) => {
      const userModel = user as unknown as { mediaProgressRemoved?: (inst: MediaProgress) => void }
      userModel.mediaProgressRemoved?.(instance)
    })

    user.hasMany(MediaProgress, {
      onDelete: 'CASCADE'
    })
    MediaProgress.belongsTo(user)

    return MediaProgress
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

  getOldMediaProgress(): MediaProgressOldJSON {
    const isPodcastEpisode = this.mediaItemType === 'podcastEpisode'

    return {
      id: this.id,
      userId: this.userId,
      libraryItemId: this.extraData?.libraryItemId || null,
      episodeId: isPodcastEpisode ? this.mediaItemId : null,
      mediaItemId: this.mediaItemId,
      mediaItemType: this.mediaItemType,
      duration: this.duration,
      progress: this.extraData?.progress || 0,
      currentTime: this.currentTime,
      isFinished: !!this.isFinished,
      hideFromContinueListening: !!this.hideFromContinueListening,
      ebookLocation: this.ebookLocation,
      ebookProgress: this.ebookProgress,
      lastUpdate: this.updatedAt.valueOf(),
      startedAt: this.createdAt.valueOf(),
      finishedAt: this.finishedAt?.valueOf() || null
    }
  }

  get progress(): number {
    // Value between 0 and 1
    if (!this.duration) return 0
    return Math.max(0, Math.min(this.currentTime / this.duration, 1))
  }

  /**
   * Apply update to media progress
   */
  async applyProgressUpdate(progressPayload: ProgressUpdatePayload): Promise<MediaProgress> {
    if (!this.extraData) this.extraData = {}
    if (progressPayload.isFinished !== undefined) {
      if (progressPayload.isFinished && !this.isFinished) {
        this.finishedAt = progressPayload.finishedAt ? new Date(progressPayload.finishedAt) : new Date()
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
    } else if (progressPayload.progress !== undefined && !isNaN(progressPayload.progress) && progressPayload.progress !== this.progress) {
      // Old model stored progress on object
      this.extraData.progress = Math.min(1, Math.max(0, progressPayload.progress))
      this.changed('extraData', true)
    }

    this.set(progressPayload as never)

    // Reset hideFromContinueListening if the progress has changed
    if (this.changed('currentTime') && !progressPayload.hideFromContinueListening) {
      this.hideFromContinueListening = false
    }

    const timeRemaining = this.duration - this.currentTime

    // Check if progress is far enough to mark as finished
    //   - If markAsFinishedPercentComplete is provided, use that otherwise use markAsFinishedTimeRemaining (default 10 seconds)
    let shouldMarkAsFinished = false
    if (this.duration) {
      if (!isNullOrNaN(progressPayload.markAsFinishedPercentComplete) && Number(progressPayload.markAsFinishedPercentComplete) > 0) {
        const markAsFinishedPercentComplete = Number(progressPayload.markAsFinishedPercentComplete) / 100
        shouldMarkAsFinished = markAsFinishedPercentComplete < this.progress
        if (shouldMarkAsFinished) {
          Logger.info(`[MediaProgress] Marking media progress as finished because progress (${this.progress}) is greater than ${markAsFinishedPercentComplete} (media item ${this.mediaItemId})`)
        }
      } else {
        const markAsFinishedTimeRemaining = isNullOrNaN(progressPayload.markAsFinishedTimeRemaining) ? 10 : Number(progressPayload.markAsFinishedTimeRemaining)
        shouldMarkAsFinished = timeRemaining < markAsFinishedTimeRemaining
        if (shouldMarkAsFinished) {
          Logger.info(`[MediaProgress] Marking media progress as finished because time remaining (${timeRemaining}) is less than ${markAsFinishedTimeRemaining} seconds (media item ${this.mediaItemId})`)
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

    // For local sync
    if (progressPayload.lastUpdate) {
      const dateVal = new Date(progressPayload.lastUpdate)
      if (isNaN(dateVal.getTime())) {
        Logger.warn(`[MediaProgress] Invalid date provided for lastUpdate: ${progressPayload.lastUpdate} (media item ${this.mediaItemId})`)
      } else {
        const escapedDate = this.sequelize!.escape(dateVal)
        Logger.info(`[MediaProgress] Manually setting updatedAt to ${escapedDate} (media item ${this.mediaItemId})`)

        await this.sequelize!.query(`UPDATE "mediaProgresses" SET "updatedAt" = ${escapedDate} WHERE "id" = '${this.id}'`)

        await this.reload()
      }
    }

    return this
  }
}

export = MediaProgress
