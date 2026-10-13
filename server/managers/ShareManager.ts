import Database from '../Database'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import LongTimeout from '../utils/longTimeout'
import { elapsedPretty } from '../utils/index'
import type MediaItemShare from '../models/MediaItemShare'
import type { MediaItemShareAttributes } from '../models/MediaItemShare'
import type PlaybackSession from '../objects/PlaybackSession'
import type { MediaItemShareForClientObject } from '../types'

interface OpenMediaItemShareObject {
  id: string
  mediaItemShare: MediaItemShareAttributes
  timeout?: LongTimeout
}

class ShareManager {
  openMediaItemShares: OpenMediaItemShareObject[]
  openSharePlaybackSessions: PlaybackSession[]

  constructor() {
    this.openMediaItemShares = []
    this.openSharePlaybackSessions = []
  }

  init(): void {
    void this.loadMediaItemShares()
  }

  addOpenSharePlaybackSession(playbackSession: PlaybackSession): void {
    Logger.info(`[ShareManager] Adding new open share playback session "${playbackSession.displayTitle || ''}"`)
    this.openSharePlaybackSessions.push(playbackSession)
  }

  closeSharePlaybackSession(playbackSession: PlaybackSession): void {
    Logger.info(`[ShareManager] Closing share playback session "${playbackSession.displayTitle || ''}"`)
    this.openSharePlaybackSessions = this.openSharePlaybackSessions.filter((s) => s.id !== playbackSession.id)
  }

  /**
   * Find an open media item share by media item ID
   */
  findByMediaItemId(mediaItemId: string): MediaItemShareForClientObject | null {
    const mediaItemShareObject = this.openMediaItemShares.find((s) => s.mediaItemShare.mediaItemId === mediaItemId)?.mediaItemShare
    if (mediaItemShareObject) {
      const mediaItemShareObjectForClient: Partial<MediaItemShareAttributes> = { ...mediaItemShareObject }
      delete mediaItemShareObjectForClient.pash
      delete mediaItemShareObjectForClient.userId
      delete mediaItemShareObjectForClient.extraData
      return mediaItemShareObjectForClient as MediaItemShareForClientObject
    }
    return null
  }

  /**
   * Find an open media item share by slug
   */
  findBySlug(slug: string): MediaItemShareForClientObject | null {
    const mediaItemShareObject = this.openMediaItemShares.find((s) => s.mediaItemShare.slug === slug)?.mediaItemShare
    if (mediaItemShareObject) {
      const mediaItemShareObjectForClient: Partial<MediaItemShareAttributes> = { ...mediaItemShareObject }
      delete mediaItemShareObjectForClient.pash
      delete mediaItemShareObjectForClient.userId
      delete mediaItemShareObjectForClient.extraData
      return mediaItemShareObjectForClient as MediaItemShareForClientObject
    }
    return null
  }

  findPlaybackSessionBySessionId(shareSessionId?: string | null): PlaybackSession | undefined {
    return this.openSharePlaybackSessions.find((s) => s.shareSessionId === shareSessionId)
  }

  /**
   * Load all media item shares from the database
   * Remove expired & schedule active
   */
  async loadMediaItemShares(): Promise<void> {
    const mediaItemShares = await Database.mediaItemShareModel.findAll()

    for (const mediaItemShare of mediaItemShares) {
      if (mediaItemShare.expiresAt && mediaItemShare.expiresAt.valueOf() < Date.now()) {
        Logger.info(`[ShareManager] Removing expired media item share "${mediaItemShare.id}"`)
        await this.destroyMediaItemShare(mediaItemShare.id)
      } else if (mediaItemShare.expiresAt) {
        this.scheduleMediaItemShare(mediaItemShare)
      } else {
        Logger.info(`[ShareManager] Loaded permanent media item share "${mediaItemShare.id}"`)
        this.openMediaItemShares.push({
          id: mediaItemShare.id,
          mediaItemShare: mediaItemShare.toJSON()
        })
      }
    }
  }

  scheduleMediaItemShare(mediaItemShare: MediaItemShare): void {
    if (!mediaItemShare?.expiresAt) return

    const expiresAtDuration = mediaItemShare.expiresAt.valueOf() - Date.now()
    if (expiresAtDuration <= 0) {
      Logger.warn(`[ShareManager] Attempted to schedule expired media item share "${mediaItemShare.id}"`)
      void this.destroyMediaItemShare(mediaItemShare.id)
      return
    }
    const timeout = new LongTimeout()
    timeout.set(() => {
      Logger.info(`[ShareManager] Removing expired media item share "${mediaItemShare.id}"`)
      void this.removeMediaItemShare(mediaItemShare.id)
    }, expiresAtDuration)
    this.openMediaItemShares.push({ id: mediaItemShare.id, mediaItemShare: mediaItemShare.toJSON(), timeout })
    Logger.info(`[ShareManager] Scheduled media item share "${mediaItemShare.id}" to expire in ${elapsedPretty(expiresAtDuration / 1000)}`)
  }

  openMediaItemShare(mediaItemShare: MediaItemShare): void {
    if (mediaItemShare.expiresAt) {
      this.scheduleMediaItemShare(mediaItemShare)
    } else {
      this.openMediaItemShares.push({ id: mediaItemShare.id, mediaItemShare: mediaItemShare.toJSON() })
    }
    SocketAuthority.adminEmitter('share_open', mediaItemShare.toJSONForClient())
  }

  async removeMediaItemShare(mediaItemShareId: string): Promise<void> {
    const mediaItemShare = this.openMediaItemShares.find((s) => s.id === mediaItemShareId)
    if (!mediaItemShare) return

    if (mediaItemShare.timeout) {
      mediaItemShare.timeout.clear()
    }

    this.openMediaItemShares = this.openMediaItemShares.filter((s) => s.id !== mediaItemShareId)
    this.openSharePlaybackSessions = this.openSharePlaybackSessions.filter((s) => s.mediaItemShareId !== mediaItemShareId)
    await this.destroyMediaItemShare(mediaItemShareId)

    const mediaItemShareObjectForClient: Partial<MediaItemShareAttributes> = { ...mediaItemShare.mediaItemShare }
    delete mediaItemShareObjectForClient.pash
    delete mediaItemShareObjectForClient.userId
    delete mediaItemShareObjectForClient.extraData
    SocketAuthority.adminEmitter('share_closed', mediaItemShareObjectForClient)
  }

  destroyMediaItemShare(mediaItemShareId: string): Promise<number> {
    return Database.mediaItemShareModel.destroy({ where: { id: mediaItemShareId } })
  }

  /**
   * Close open share sessions that have not been updated in the last 24 hours
   */
  closeStaleOpenShareSessions(): void {
    const updatedAtTimeCutoff = Date.now() - 1000 * 60 * 60 * 24
    const staleSessions = this.openSharePlaybackSessions.filter((session) => session.updatedAt < updatedAtTimeCutoff)
    for (const session of staleSessions) {
      const sessionLastUpdate = new Date(session.updatedAt)
      Logger.info(`[PlaybackSessionManager] Closing stale session "${session.displayTitle || ''}" (${session.id}) last updated at ${sessionLastUpdate}`)
      this.closeSharePlaybackSession(session)
    }
  }
}

const shareManager = new ShareManager()

namespace ShareManager {
  export type ShareManagerInstance = ShareManager
  export type OpenMediaItemShareObjectType = OpenMediaItemShareObject
}

export = shareManager
