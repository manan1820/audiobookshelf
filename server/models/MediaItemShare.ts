import { DataTypes, Model, Sequelize } from 'sequelize'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'
import type LibraryItem from './LibraryItem'

interface MediaItemShareForClient {
  id: string
  mediaItemId: string
  mediaItemType: string
  slug: string
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
  isDownloadable: boolean
}

class MediaItemShare extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare slug: string
  declare pash: string | null
  declare userId: string
  declare expiresAt: Date | null
  declare extraData: Record<string, unknown> | null
  declare createdAt: Date
  declare updatedAt: Date
  declare isDownloadable: boolean

  // Expanded properties
  declare mediaItem?: Book | PodcastEpisode

  toJSONForClient(): MediaItemShareForClient {
    return {
      id: this.id,
      mediaItemId: this.mediaItemId,
      mediaItemType: this.mediaItemType,
      slug: this.slug,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isDownloadable: this.isDownloadable
    }
  }

  static async getMediaItemsLibraryItem(mediaItemId: string, mediaItemType: string): Promise<LibraryItem | null> {
    const libraryItemModel = this.sequelize!.models.libraryItem as unknown as {
      findOneExpanded(where: unknown, options: unknown, include: unknown): Promise<LibraryItem | null>
    }

    if (mediaItemType === 'book') {
      const libraryItem = await libraryItemModel.findOneExpanded({ mediaId: mediaItemId }, null, {
        model: this.sequelize!.models.library,
        attributes: ['settings']
      })

      return libraryItem
    }
    return null
  }

  getMediaItem(options?: unknown): Promise<unknown> {
    if (!this.mediaItemType) return Promise.resolve(null)
    const sequelize = this.sequelize as unknown as { uppercaseFirst(str: string): string }
    const mixinMethodName = `get${sequelize.uppercaseFirst(this.mediaItemType)}`
    const self = this as unknown as Record<string, (opts?: unknown) => Promise<unknown>>
    if (typeof self[mixinMethodName] === 'function') {
      return self[mixinMethodName](options)
    }
    return Promise.resolve(null)
  }

  static override init(sequelize: Sequelize): typeof MediaItemShare
  static override init(attributes: unknown, options: unknown): typeof MediaItemShare
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof MediaItemShare {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof MediaItemShare
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
        slug: DataTypes.STRING,
        pash: DataTypes.STRING,
        expiresAt: DataTypes.DATE,
        extraData: DataTypes.JSON,
        isDownloadable: DataTypes.BOOLEAN
      },
      {
        sequelize,
        modelName: 'mediaItemShare'
      }
    )

    const { user, book, podcastEpisode } = sequelize.models

    user.hasMany(MediaItemShare)
    MediaItemShare.belongsTo(user)

    book.hasMany(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    MediaItemShare.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(MediaItemShare, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    MediaItemShare.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    MediaItemShare.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]

      for (const inst of instances) {
        const instance = inst as MediaItemShare & {
          book?: unknown
          podcastEpisode?: unknown
          dataValues: Record<string, unknown>
        }
        if (instance.mediaItemType === 'book' && instance.book !== undefined) {
          instance.mediaItem = instance.book as Book
          instance.dataValues.mediaItem = instance.dataValues.book
        } else if (instance.mediaItemType === 'podcastEpisode' && instance.podcastEpisode !== undefined) {
          instance.mediaItem = instance.podcastEpisode as PodcastEpisode
          instance.dataValues.mediaItem = instance.dataValues.podcastEpisode
        }
        // To prevent mistakes:
        delete instance.book
        delete instance.dataValues.book
        delete instance.podcastEpisode
        delete instance.dataValues.podcastEpisode
      }
    })

    return MediaItemShare
  }
}

export = MediaItemShare
