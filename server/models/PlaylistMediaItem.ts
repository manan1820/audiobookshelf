import { DataTypes, Model, Sequelize } from 'sequelize'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'

class PlaylistMediaItem extends Model {
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare order: number
  declare playlistId: string
  declare createdAt: Date

  // Expanded properties
  declare mediaItem?: Book | PodcastEpisode

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

  static override init(sequelize: Sequelize): typeof PlaylistMediaItem
  static override init(attributes: unknown, options: unknown): typeof PlaylistMediaItem
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof PlaylistMediaItem {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof PlaylistMediaItem
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
        order: DataTypes.INTEGER
      },
      {
        sequelize,
        timestamps: true,
        updatedAt: false,
        modelName: 'playlistMediaItem'
      }
    )

    const { book, podcastEpisode, playlist } = sequelize.models

    book.hasMany(PlaylistMediaItem, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'book'
      }
    })
    PlaylistMediaItem.belongsTo(book, { foreignKey: 'mediaItemId', constraints: false })

    podcastEpisode.hasOne(PlaylistMediaItem, {
      foreignKey: 'mediaItemId',
      constraints: false,
      scope: {
        mediaItemType: 'podcastEpisode'
      }
    })
    PlaylistMediaItem.belongsTo(podcastEpisode, { foreignKey: 'mediaItemId', constraints: false })

    PlaylistMediaItem.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]

      for (const inst of instances) {
        const instance = inst as PlaylistMediaItem & {
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

    playlist.hasMany(PlaylistMediaItem, {
      onDelete: 'CASCADE'
    })
    PlaylistMediaItem.belongsTo(playlist)

    return PlaylistMediaItem
  }
}

export = PlaylistMediaItem
