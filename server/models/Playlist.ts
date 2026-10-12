import {
  DataTypes,
  Model,
  Op,
  Sequelize,
  Optional,
  NonAttribute,
  FindOptions,
  WhereOptions
} from 'sequelize'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import type Library from './Library'
import type User from './User'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'
import PlaylistMediaItem, { PlaylistMediaItemAttributes } from './PlaylistMediaItem'
import type {
  PlaylistOldJsonObject,
  PlaylistOldJsonExpandedObject,
  PlaylistItemObject
} from '../types'

interface PlaylistMediaItemExpandedDataValues {
  mediaItem?: Book | PodcastEpisode | null
  book?: Book | null
  podcastEpisode?: PodcastEpisode | null
}

export interface PlaylistAttributes {
  id: string
  name: string
  description?: string | null
  libraryId: string
  userId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface PlaylistCreationAttributes
  extends Optional<PlaylistAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

export class Playlist
  extends Model<PlaylistAttributes, PlaylistCreationAttributes>
  implements PlaylistAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare userId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare library?: NonAttribute<Library>
  declare user?: NonAttribute<User>
  declare playlistMediaItems?: NonAttribute<PlaylistMediaItem[]>

  // Mixins
  declare getPlaylistMediaItems: (options?: FindOptions) => Promise<PlaylistMediaItem[]>

  /**
   * Get old playlists for user and library
   */
  static async getOldPlaylistsForUserAndLibrary(
    userId?: string,
    libraryId?: string
  ): Promise<PlaylistOldJsonExpandedObject[]> {
    if (!userId && !libraryId) return []
    if (!this.sequelize) return []

    const whereQuery: WhereOptions = {}
    if (userId) {
      whereQuery.userId = userId
    }
    if (libraryId) {
      whereQuery.libraryId = libraryId
    }

    const playlistsExpanded = await this.findAll({
      where: whereQuery,
      include: [
        {
          model: this.sequelize.models.playlistMediaItem,
          include: [
            {
              model: this.sequelize.models.book,
              include: [
                {
                  model: this.sequelize.models.libraryItem
                },
                {
                  model: this.sequelize.models.author,
                  through: {
                    attributes: []
                  }
                },
                {
                  model: this.sequelize.models.series,
                  through: {
                    attributes: ['sequence']
                  }
                }
              ]
            },
            {
              model: this.sequelize.models.podcastEpisode,
              include: [
                {
                  model: this.sequelize.models.podcast,
                  include: [
                    {
                      model: this.sequelize.models.libraryItem
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [['playlistMediaItems', 'order', 'ASC']]
    })

    // Sort by name asc
    playlistsExpanded.sort((a, b) => a.name.localeCompare(b.name))

    return playlistsExpanded.map((playlist) => playlist.toOldJSONExpanded())
  }

  /**
   * Get number of playlists for a user and library
   */
  static async getNumPlaylistsForUserAndLibrary(
    userId: string,
    libraryId: string
  ): Promise<number> {
    return this.count({
      where: {
        userId,
        libraryId
      }
    })
  }

  /**
   * Get all playlists for mediaItemIds
   */
  static async getPlaylistsForMediaItemIds(
    mediaItemIds: string[]
  ): Promise<Playlist[]> {
    if (!mediaItemIds?.length || !this.sequelize) return []

    const playlistMediaItemsExpanded = await PlaylistMediaItem.findAll({
      where: {
        mediaItemId: {
          [Op.in]: mediaItemIds
        }
      },
      include: [
        {
          model: this.sequelize.models.playlist,
          include: [
            {
              model: this.sequelize.models.playlistMediaItem,
              include: [
                {
                  model: this.sequelize.models.book,
                  include: [
                    {
                      model: this.sequelize.models.libraryItem
                    }
                  ]
                },
                {
                  model: this.sequelize.models.podcastEpisode,
                  include: [
                    {
                      model: this.sequelize.models.podcast,
                      include: [
                        {
                          model: this.sequelize.models.libraryItem
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [[this.sequelize.models.playlist, this.sequelize.models.playlistMediaItem, 'order', 'ASC']]
    })

    const playlists: Playlist[] = []
    for (const playlistMediaItem of playlistMediaItemsExpanded) {
      const playlist = playlistMediaItem.playlist
      if (!playlist || playlists.some((p) => p.id === playlist.id)) continue

      if (playlist.playlistMediaItems) {
        playlist.playlistMediaItems = playlist.playlistMediaItems.map((pmi: PlaylistMediaItem) => {
          const dv = pmi.dataValues as PlaylistMediaItemAttributes & PlaylistMediaItemExpandedDataValues
          if (pmi.mediaItemType === 'book' && pmi.book !== undefined) {
            pmi.mediaItem = pmi.book
            dv.mediaItem = dv.book
          } else if (pmi.mediaItemType === 'podcastEpisode' && pmi.podcastEpisode !== undefined) {
            pmi.mediaItem = pmi.podcastEpisode
            dv.mediaItem = dv.podcastEpisode
          }
          delete pmi.book
          delete dv.book
          delete pmi.podcastEpisode
          delete dv.podcastEpisode
          return pmi
        })
      }
      playlists.push(playlist)
    }
    return playlists
  }

  /**
   * Removes media items and re-orders playlists
   */
  static async removeMediaItemsFromPlaylists(mediaItemIds: string[]): Promise<void> {
    if (!mediaItemIds?.length) return

    const playlistsWithItem = await this.getPlaylistsForMediaItemIds(mediaItemIds)

    if (!playlistsWithItem.length) return

    for (const playlist of playlistsWithItem) {
      if (!playlist.playlistMediaItems) continue
      let numMediaItems = playlist.playlistMediaItems.length

      let order = 1
      for (const playlistMediaItem of playlist.playlistMediaItems) {
        if (mediaItemIds.includes(playlistMediaItem.mediaItemId)) {
          await playlistMediaItem.destroy()
          numMediaItems--
        } else {
          if (playlistMediaItem.order !== order) {
            await playlistMediaItem.update({
              order
            })
          }
          order++
        }
      }

      // If playlist is now empty then remove it
      const jsonExpanded = await playlist.getOldJsonExpanded()
      if (!numMediaItems) {
        Logger.info(`[ApiRouter] Playlist "${playlist.name}" has no more items - removing it`)
        await playlist.destroy()
        SocketAuthority.clientEmitter(playlist.userId, 'playlist_removed', jsonExpanded)
      } else {
        SocketAuthority.clientEmitter(playlist.userId, 'playlist_updated', jsonExpanded)
      }
    }
  }

  static initModel(sequelize: Sequelize): typeof Playlist {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'playlist'
      }
    )

    Playlist.addHook('afterFind', (findResult) => {
      if (!findResult) return

      const instances = Array.isArray(findResult) ? findResult : [findResult]

      for (const instance of instances) {
        if (instance.playlistMediaItems?.length) {
          instance.playlistMediaItems = instance.playlistMediaItems.map((pmi: PlaylistMediaItem) => {
            const dv = pmi.dataValues as PlaylistMediaItemAttributes & PlaylistMediaItemExpandedDataValues
            if (pmi.mediaItemType === 'book' && pmi.book !== undefined) {
              pmi.mediaItem = pmi.book
              dv.mediaItem = dv.book
            } else if (pmi.mediaItemType === 'podcastEpisode' && pmi.podcastEpisode !== undefined) {
              pmi.mediaItem = pmi.podcastEpisode
              dv.mediaItem = dv.podcastEpisode
            }
            delete pmi.book
            delete dv.book
            delete pmi.podcastEpisode
            delete dv.podcastEpisode
            return pmi
          })
        }
      }
    })

    return Playlist
  }

  /**
   * Get all media items in playlist expanded with library item
   */
  getMediaItemsExpandedWithLibraryItem(): Promise<PlaylistMediaItem[]> {
    if (!this.sequelize || typeof this.getPlaylistMediaItems !== 'function') return Promise.resolve([])
    return this.getPlaylistMediaItems({
      include: [
        {
          model: this.sequelize.models.book,
          include: [
            {
              model: this.sequelize.models.libraryItem
            },
            {
              model: this.sequelize.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize.models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        {
          model: this.sequelize.models.podcastEpisode,
          include: [
            {
              model: this.sequelize.models.podcast,
              include: [
                {
                  model: this.sequelize.models.libraryItem
                }
              ]
            }
          ]
        }
      ],
      order: [['order', 'ASC']]
    })
  }

  async getOldJsonExpanded(): Promise<PlaylistOldJsonExpandedObject> {
    this.playlistMediaItems = await this.getMediaItemsExpandedWithLibraryItem()
    return this.toOldJSONExpanded()
  }

  checkHasMediaItem(libraryItemId: string, episodeId?: string): boolean {
    if (!this.playlistMediaItems) {
      throw new Error('[Playlist] playlistMediaItems are required to check Playlist')
    }
    if (episodeId) {
      return this.playlistMediaItems.some((pmi) => pmi.mediaItemId === episodeId)
    }
    return this.playlistMediaItems.some((pmi) => {
      const mediaItem = pmi.mediaItem
      if (!mediaItem) return false
      if ('libraryItem' in mediaItem && mediaItem.libraryItem?.id === libraryItemId) {
        return true
      }
      if ('podcast' in mediaItem && mediaItem.podcast?.libraryItem?.id === libraryItemId) {
        return true
      }
      return false
    })
  }

  toOldJSON(): PlaylistOldJsonObject {
    return {
      id: this.id,
      name: this.name,
      libraryId: this.libraryId,
      userId: this.userId,
      description: this.description ?? null,
      lastUpdate: this.updatedAt?.valueOf() ?? Date.now(),
      createdAt: this.createdAt?.valueOf() ?? Date.now()
    }
  }

  toOldJSONExpanded(): PlaylistOldJsonExpandedObject {
    if (!this.playlistMediaItems) {
      throw new Error('[Playlist] playlistMediaItems are required to expand Playlist')
    }

    const json = this.toOldJSON()
    const items: PlaylistItemObject[] = this.playlistMediaItems.map((pmi) => {
      if (pmi.mediaItemType === 'book') {
        const book = pmi.mediaItem as Book | undefined
        const libraryItem = book?.libraryItem
        if (!libraryItem) {
          throw new Error(`[Playlist] Book in playlist "${this.name}" does not have libraryItem loaded`)
        }
        libraryItem.media = book
        return {
          libraryItemId: libraryItem.id,
          libraryItem: libraryItem.toOldJSONExpanded()
        }
      }

      const episode = pmi.mediaItem as PodcastEpisode | undefined
      const podcast = episode?.podcast
      const libraryItem = podcast?.libraryItem
      if (!episode || !libraryItem) {
        throw new Error(`[Playlist] Episode in playlist "${this.name}" does not have podcast libraryItem loaded`)
      }
      libraryItem.media = podcast
      return {
        episodeId: pmi.mediaItemId,
        episode: episode.toOldJSONExpanded(libraryItem.id),
        libraryItemId: libraryItem.id,
        libraryItem: libraryItem.toOldJSONMinified()
      }
    })

    return {
      ...json,
      items
    }
  }
}

export default Playlist
