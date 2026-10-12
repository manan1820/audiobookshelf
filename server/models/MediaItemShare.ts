import {
  DataTypes,
  Model,
  Sequelize,
  Optional,
  NonAttribute,
  FindOptions
} from 'sequelize'
import type User from './User'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'
import LibraryItem from './LibraryItem'
import type {
  MediaItemShareExtraData,
  MediaItemShareForClientObject
} from '../types'

export interface MediaItemShareAttributes {
  id: string
  mediaItemId: string
  mediaItemType: string
  slug: string
  pash: string
  userId?: string | null
  expiresAt?: Date | null
  extraData?: MediaItemShareExtraData | null
  isDownloadable: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface MediaItemShareCreationAttributes
  extends Optional<
    MediaItemShareAttributes,
    'id' | 'slug' | 'pash' | 'userId' | 'expiresAt' | 'extraData' | 'isDownloadable' | 'createdAt' | 'updatedAt'
  > {}

export class MediaItemShare
  extends Model<MediaItemShareAttributes, MediaItemShareCreationAttributes>
  implements MediaItemShareAttributes
{
  declare id: string
  declare mediaItemId: string
  declare mediaItemType: string
  declare slug: string
  declare pash: string
  declare userId: string | null
  declare expiresAt: Date | null
  declare extraData: MediaItemShareExtraData | null
  declare isDownloadable: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare user?: NonAttribute<User>
  declare book?: NonAttribute<Book>
  declare podcastEpisode?: NonAttribute<PodcastEpisode>
  declare mediaItem?: NonAttribute<Book | PodcastEpisode | null>

  // Association mixins
  declare getBook: (options?: FindOptions) => Promise<Book | null>
  declare getPodcastEpisode: (options?: FindOptions) => Promise<PodcastEpisode | null>

  toJSONForClient(): MediaItemShareForClientObject {
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

  /**
   * Expanded book that includes library settings
   */
  static async getMediaItemsLibraryItem(
    mediaItemId: string,
    mediaItemType: string
  ): Promise<LibraryItem | null> {
    if (!this.sequelize) return null

    if (mediaItemType === 'book') {
      const libraryItem = await LibraryItem.findOneExpanded(
        { mediaId: mediaItemId },
        null,
        {
          model: this.sequelize.models.library,
          attributes: ['settings']
        }
      )

      return libraryItem
    }
    return null
  }

  getMediaItem(options?: FindOptions): Promise<Book | PodcastEpisode | null> {
    if (this.mediaItemType === 'book' && typeof this.getBook === 'function') {
      return this.getBook(options)
    }
    if (this.mediaItemType === 'podcastEpisode' && typeof this.getPodcastEpisode === 'function') {
      return this.getPodcastEpisode(options)
    }
    return Promise.resolve(null)
  }

  static initModel(sequelize: Sequelize): typeof MediaItemShare {
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

    MediaItemShare.addHook('afterFind', (findResult) => {
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

    return MediaItemShare
  }
}

export default MediaItemShare
