import {
  DataTypes,
  Model,
  Sequelize,
  Optional,
  NonAttribute,
  FindOptions
} from 'sequelize'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'
import type Playlist from './Playlist'

export interface PlaylistMediaItemAttributes {
  id: string
  mediaItemId: string
  mediaItemType: string
  order?: number | null
  playlistId: string
  createdAt?: Date
}

export interface PlaylistMediaItemCreationAttributes
  extends Optional<PlaylistMediaItemAttributes, 'id' | 'order' | 'createdAt'> {}

export class PlaylistMediaItem
  extends Model<PlaylistMediaItemAttributes, PlaylistMediaItemCreationAttributes>
  implements PlaylistMediaItemAttributes
{
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare order: number | null
  declare playlistId: string
  declare readonly createdAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare book?: NonAttribute<Book>
  declare podcastEpisode?: NonAttribute<PodcastEpisode>
  declare playlist?: NonAttribute<Playlist>
  declare mediaItem?: NonAttribute<Book | PodcastEpisode | null>

  // Mixins
  declare getBook: (options?: FindOptions) => Promise<Book | null>
  declare getPodcastEpisode: (options?: FindOptions) => Promise<PodcastEpisode | null>

  getMediaItem(options?: FindOptions): Promise<Book | PodcastEpisode | null> {
    if (this.mediaItemType === 'book' && typeof this.getBook === 'function') {
      return this.getBook(options)
    }
    if (this.mediaItemType === 'podcastEpisode' && typeof this.getPodcastEpisode === 'function') {
      return this.getPodcastEpisode(options)
    }
    return Promise.resolve(null)
  }

  static initModel(sequelize: Sequelize): typeof PlaylistMediaItem {
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

    PlaylistMediaItem.addHook('afterFind', (findResult) => {
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

    return PlaylistMediaItem
  }
}

export default PlaylistMediaItem
