import { DataTypes, Model, Op, Sequelize } from 'sequelize'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import type PlaylistMediaItem from './PlaylistMediaItem'

interface PlaylistOldJSON {
  id: string
  name: string
  libraryId: string
  userId: string
  description: string | null
  lastUpdate: number
  createdAt: number
  items?: unknown[]
}

class Playlist extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare userId: string
  declare createdAt: Date
  declare updatedAt: Date

  // Expanded properties
  declare playlistMediaItems?: PlaylistMediaItem[]

  declare getPlaylistMediaItems: (options?: unknown) => Promise<PlaylistMediaItem[]>

  /**
   * Get old playlists for user and library
   */
  static async getOldPlaylistsForUserAndLibrary(userId?: string, libraryId?: string): Promise<PlaylistOldJSON[]> {
    if (!userId && !libraryId) return []

    const whereQuery: Record<string, string> = {}
    if (userId) {
      whereQuery.userId = userId
    }
    if (libraryId) {
      whereQuery.libraryId = libraryId
    }
    const { playlistMediaItem, book, libraryItem, author, series, podcastEpisode, podcast } = this.sequelize!.models
    const playlistsExpanded = (await this.findAll({
      where: whereQuery,
      include: [
        {
          model: playlistMediaItem,
          include: [
            {
              model: book,
              include: [
                {
                  model: libraryItem
                },
                {
                  model: author,
                  through: {
                    attributes: []
                  }
                },
                {
                  model: series,
                  through: {
                    attributes: ['sequence']
                  }
                }
              ]
            },
            {
              model: podcastEpisode,
              include: [
                {
                  model: podcast,
                  include: [
                    {
                      model: libraryItem
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [['playlistMediaItems', 'order', 'ASC']]
    })) as Playlist[]

    // Sort by name asc
    playlistsExpanded.sort((a, b) => a.name.localeCompare(b.name))

    return playlistsExpanded.map((playlist) => playlist.toOldJSONExpanded())
  }

  /**
   * Get number of playlists for a user and library
   */
  static async getNumPlaylistsForUserAndLibrary(userId: string, libraryId: string): Promise<number> {
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
  static async getPlaylistsForMediaItemIds(mediaItemIds: string[]): Promise<Playlist[]> {
    if (!mediaItemIds?.length) return []

    const { playlistMediaItem, playlist: playlistModel, book, libraryItem, podcastEpisode, podcast } = this.sequelize!.models

    const playlistMediaItemsExpanded = (await playlistMediaItem.findAll({
      where: {
        mediaItemId: {
          [Op.in]: mediaItemIds
        }
      },
      include: [
        {
          model: playlistModel,
          include: [
            {
              model: playlistMediaItem,
              include: [
                {
                  model: book,
                  include: [libraryItem]
                },
                {
                  model: podcastEpisode,
                  include: [
                    {
                      model: podcast,
                      include: [libraryItem]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [['playlist', 'playlistMediaItems', 'order', 'ASC']]
    })) as Array<PlaylistMediaItem & { playlist: Playlist }>

    const playlists: Playlist[] = []
    for (const pmiItem of playlistMediaItemsExpanded) {
      const playlist = pmiItem.playlist
      if (playlists.some((p) => p.id === playlist.id)) continue

      if (playlist.playlistMediaItems) {
        playlist.playlistMediaItems = playlist.playlistMediaItems.map((pmi) => {
          const item = pmi as unknown as Record<string, unknown> & { dataValues: Record<string, unknown> }
          if (item.mediaItemType === 'book' && item.book !== undefined) {
            item.mediaItem = item.book
            item.dataValues.mediaItem = item.dataValues.book
          } else if (item.mediaItemType === 'podcastEpisode' && item.podcastEpisode !== undefined) {
            item.mediaItem = item.podcastEpisode
            item.dataValues.mediaItem = item.dataValues.podcastEpisode
          }
          delete item.book
          delete item.dataValues.book
          delete item.podcastEpisode
          delete item.dataValues.podcastEpisode
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
      // Remove items in playlist and re-order
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

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof Playlist
  static override init(attributes: unknown, options: unknown): typeof Playlist
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Playlist {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Playlist
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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

    const { library, user } = sequelize.models
    library.hasMany(Playlist)
    Playlist.belongsTo(library)

    user.hasMany(Playlist, {
      onDelete: 'CASCADE'
    })
    Playlist.belongsTo(user)

    Playlist.addHook('afterFind', (findResult: unknown) => {
      if (!findResult) return

      let results: unknown[]
      if (!Array.isArray(findResult)) {
        results = [findResult]
      } else {
        results = findResult
      }

      for (const inst of results) {
        const instance = inst as Playlist
        if (instance.playlistMediaItems?.length) {
          instance.playlistMediaItems = instance.playlistMediaItems.map((pmi) => {
            const item = pmi as unknown as Record<string, unknown> & { dataValues: Record<string, unknown> }
            if (item.mediaItemType === 'book' && item.book !== undefined) {
              item.mediaItem = item.book
              item.dataValues.mediaItem = item.dataValues.book
            } else if (item.mediaItemType === 'podcastEpisode' && item.podcastEpisode !== undefined) {
              item.mediaItem = item.podcastEpisode
              item.dataValues.mediaItem = item.dataValues.podcastEpisode
            }
            // To prevent mistakes:
            delete item.book
            delete item.dataValues.book
            delete item.podcastEpisode
            delete item.dataValues.podcastEpisode
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
    const { book, libraryItem, author, series, podcastEpisode, podcast } = this.sequelize!.models
    return this.getPlaylistMediaItems({
      include: [
        {
          model: book,
          include: [
            {
              model: libraryItem
            },
            {
              model: author,
              through: {
                attributes: []
              }
            },
            {
              model: series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        {
          model: podcastEpisode,
          include: [
            {
              model: podcast,
              include: [libraryItem]
            }
          ]
        }
      ],
      order: [['order', 'ASC']]
    })
  }

  /**
   * Get playlists toOldJSONExpanded
   */
  async getOldJsonExpanded(): Promise<PlaylistOldJSON> {
    this.playlistMediaItems = await this.getMediaItemsExpandedWithLibraryItem()
    return this.toOldJSONExpanded()
  }

  /**
   * Old model used libraryItemId instead of bookId
   */
  checkHasMediaItem(libraryItemId: string, episodeId?: string): boolean {
    if (!this.playlistMediaItems) {
      throw new Error('playlistMediaItems are required to check Playlist')
    }
    if (episodeId) {
      return this.playlistMediaItems.some((pmi) => pmi.mediaItemId === episodeId)
    }
    return this.playlistMediaItems.some((pmi) => {
      const mediaItem = (pmi as unknown as { mediaItem?: { libraryItem?: { id?: string } } }).mediaItem
      return mediaItem?.libraryItem?.id === libraryItemId
    })
  }

  toOldJSON(): PlaylistOldJSON {
    return {
      id: this.id,
      name: this.name,
      libraryId: this.libraryId,
      userId: this.userId,
      description: this.description,
      lastUpdate: this.updatedAt.valueOf(),
      createdAt: this.createdAt.valueOf()
    }
  }

  toOldJSONExpanded(): PlaylistOldJSON {
    if (!this.playlistMediaItems) {
      throw new Error('playlistMediaItems are required to expand Playlist')
    }

    const json = this.toOldJSON()
    json.items = this.playlistMediaItems.map((pmi) => {
      const pmiObj = pmi as unknown as {
        mediaItemType: string
        mediaItemId: string
        mediaItem: {
          libraryItem?: { id: string; media?: unknown; toOldJSONExpanded: () => unknown }
          podcast?: { libraryItem?: { id: string; media?: unknown; toOldJSONMinified: () => unknown } }
          toOldJSONExpanded: (libId: string) => unknown
        }
      }
      if (pmiObj.mediaItemType === 'book') {
        const libraryItem = pmiObj.mediaItem.libraryItem!
        delete pmiObj.mediaItem.libraryItem
        libraryItem.media = pmiObj.mediaItem
        return {
          libraryItemId: libraryItem.id,
          libraryItem: libraryItem.toOldJSONExpanded()
        }
      }

      const libraryItem = pmiObj.mediaItem.podcast!.libraryItem!
      delete pmiObj.mediaItem.podcast!.libraryItem
      libraryItem.media = pmiObj.mediaItem.podcast
      return {
        episodeId: pmiObj.mediaItemId,
        episode: pmiObj.mediaItem.toOldJSONExpanded(libraryItem.id),
        libraryItemId: libraryItem.id,
        libraryItem: libraryItem.toOldJSONMinified()
      }
    })

    return json
  }
}

export = Playlist
