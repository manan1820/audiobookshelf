import { v4 as uuidv4 } from 'uuid'
import Path from 'path'
import packageJson from '../../package.json'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'
import date from '../libs/dateAndTime'
import fs from '../libs/fsExtra'
import uaParserJs from '../libs/uaParser'
import requestIp from '../libs/requestIp'
import { PlayMethod } from '../utils/constants'
import PlaybackSession from '../objects/PlaybackSession'
import DeviceInfo from '../objects/DeviceInfo'
import Stream from '../objects/Stream'
import type User from '../models/User'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type Book from '../models/Book'
import AudioTrackClass from '../objects/files/AudioTrack'
import type { AudioTrack } from '../types/dto'
import type { Request, Response } from 'express'
import type {
  ClientDeviceInfoPayload,
  BookOldMetadataJsonObject,
  PodcastOldMetadataJsonObject
} from '../types'

const serverVersion = packageJson.version

namespace PlaybackSessionManager {
  export interface StartSessionOptions {
    forceDirectPlay?: boolean
    forceTranscode?: boolean
    mediaPlayer?: string
    supportedMimeTypes?: string[]
  }

  export interface SyncSessionPayload {
    currentTime: number
    timeListened?: number
    duration?: number
    [key: string]: unknown
  }

  export interface LocalSessionPayload {
    id: string
    displayTitle?: string
    updatedAt: number
    libraryItemId: string
    episodeId?: string | null
    bookId?: string | null
    libraryId?: string | null
    currentTime: number
    timeListening?: number
    userId?: string
    serverVersion?: string
    [key: string]: unknown
  }

  export interface LocalSyncResult {
    id: string
    success: boolean
    progressSynced?: boolean
    error?: string
  }
}

class PlaybackSessionManager {
  StreamsPath: string
  oldPlaybackSessionMap: Record<string, string> = {}
  sessions: PlaybackSession[] = []

  constructor() {
    this.StreamsPath = Path.join(global.MetadataPath, 'streams')
    this.oldPlaybackSessionMap = {} // TODO: Remove after updated mobile versions
    this.sessions = []
  }

  /**
   * Get open session by id
   *
   * @param sessionId
   * @returns
   */
  getSession(sessionId: string): PlaybackSession | undefined {
    return this.sessions.find((s) => s.id === sessionId)
  }

  getUserSession(userId: string): PlaybackSession | undefined {
    return this.sessions.find((s) => s.userId === userId)
  }

  getStream(sessionId: string): Stream | null {
    const session = this.getSession(sessionId)
    return session?.stream || null
  }

  /**
   * @param req
   * @param clientDeviceInfo
   * @returns
   */
  async getDeviceInfo(req: Request, clientDeviceInfo: ClientDeviceInfoPayload | null = null): Promise<DeviceInfo> {
    const userAgentHeader = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null
    const ua = uaParserJs(userAgentHeader)
    const ip = requestIp.getClientIp(req)

    const deviceInfo = new DeviceInfo()
    deviceInfo.setData(ip, ua, clientDeviceInfo, serverVersion, req.user?.id)

    const clientDeviceId = typeof clientDeviceInfo?.deviceId === 'string' ? clientDeviceInfo.deviceId : null
    if (clientDeviceId) {
      const existingDevice = await Database.deviceModel.getOldDeviceByDeviceId(clientDeviceId)
      if (existingDevice) {
        if (existingDevice.update(deviceInfo)) {
          await Database.deviceModel.updateFromOld(existingDevice)
        }
        return existingDevice
      }
    }

    await Database.deviceModel.createFromOld(deviceInfo)

    return deviceInfo
  }

  /**
   * @param req
   * @param res
   * @param episodeId
   */
  async startSessionRequest(req: Request, res: Response, episodeId?: string): Promise<void> {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      deviceInfo?: ClientDeviceInfoPayload
    }
    const clientDeviceInfo = body.deviceInfo ?? null
    const deviceInfo = await this.getDeviceInfo(req, clientDeviceInfo)
    Logger.debug(`[PlaybackSessionManager] startSessionRequest for device ${deviceInfo.deviceDescription}`)
    const libraryItem = req.libraryItem
    const options = (req.body as PlaybackSessionManager.StartSessionOptions | undefined) ?? {}
    if (!req.user || !libraryItem) {
      res.sendStatus(400)
      return
    }
    const session = await this.startSession(req.user, deviceInfo, libraryItem, episodeId ?? null, options)
    res.json(session.toJSONForClient(libraryItem))
  }

  /**
   * @param user
   * @param session
   * @param payload
   * @param res
   */
  async syncSessionRequest(
    user: User,
    session: PlaybackSession,
    payload: PlaybackSessionManager.SyncSessionPayload,
    res: Response
  ): Promise<void> {
    if (await this.syncSession(user, session, payload)) {
      res.sendStatus(200)
    } else {
      res.sendStatus(500)
    }
  }

  async syncLocalSessionsRequest(req: Request, res: Response): Promise<void> {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      deviceInfo?: ClientDeviceInfoPayload
      sessions?: PlaybackSessionManager.LocalSessionPayload[]
    }
    const clientDeviceInfo = body.deviceInfo ?? null
    const deviceInfo = await this.getDeviceInfo(req, clientDeviceInfo)
    const user = req.user
    if (!user) {
      res.sendStatus(401)
      return
    }
    const sessions = body.sessions ?? []

    const syncResults: PlaybackSessionManager.LocalSyncResult[] = []
    for (const sessionJson of sessions) {
      Logger.info(
        `[PlaybackSessionManager] Syncing local session "${sessionJson.displayTitle ?? ''}" (${sessionJson.id}) (updatedAt: ${sessionJson.updatedAt})`
      )
      const result = await this.syncLocalSession(user, sessionJson, deviceInfo)
      syncResults.push(result)
    }

    res.json({
      results: syncResults
    })
  }

  /**
   * @param user
   * @param sessionJson
   * @param deviceInfo
   * @returns
   */
  async syncLocalSession(
    user: User,
    sessionJson: PlaybackSessionManager.LocalSessionPayload,
    deviceInfo: DeviceInfo
  ): Promise<PlaybackSessionManager.LocalSyncResult> {
    // TODO: Combine libraryItem query with library query
    const libraryItem = await Database.libraryItemModel.getExpandedById(sessionJson.libraryItemId)
    const podcastMedia = libraryItem?.media as Podcast | undefined
    const episode =
      sessionJson.episodeId && libraryItem && libraryItem.isPodcast && podcastMedia?.podcastEpisodes
        ? podcastMedia.podcastEpisodes.find((pe) => pe.id === sessionJson.episodeId)
        : null
    if (!libraryItem || (libraryItem.isPodcast && !episode)) {
      Logger.error(
        `[PlaybackSessionManager] syncLocalSession: Media item not found for session "${sessionJson.displayTitle ?? ''}" (${sessionJson.id})`
      )
      return {
        id: sessionJson.id,
        success: false,
        error: 'Media item not found'
      }
    }

    const library = await Database.libraryModel.findByPk(libraryItem.libraryId)
    if (!library) {
      Logger.error(
        `[PlaybackSessionManager] syncLocalSession: Library not found for session "${sessionJson.displayTitle ?? ''}" (${sessionJson.id})`
      )
      return {
        id: sessionJson.id,
        success: false,
        error: 'Library not found'
      }
    }

    sessionJson.userId = user.id
    sessionJson.serverVersion = serverVersion

    // TODO: Temp update local playback session id to uuidv4 & library item/book/episode ids
    if (sessionJson.id?.startsWith('play_local_')) {
      if (!this.oldPlaybackSessionMap[sessionJson.id]) {
        const newSessionId = uuidv4()
        this.oldPlaybackSessionMap[sessionJson.id] = newSessionId
        sessionJson.id = newSessionId
      } else {
        sessionJson.id = this.oldPlaybackSessionMap[sessionJson.id]
      }
    }
    const mediaId = typeof libraryItem.media?.id === 'string' ? libraryItem.media.id : null
    if (sessionJson.libraryItemId !== libraryItem.id) {
      Logger.info(`[PlaybackSessionManager] Mapped old libraryItemId "${sessionJson.libraryItemId}" to ${libraryItem.id}`)
      sessionJson.libraryItemId = libraryItem.id
      sessionJson.bookId = episode ? null : mediaId
    }
    if (!sessionJson.bookId && !episode) {
      sessionJson.bookId = mediaId
    }
    if (episode && sessionJson.episodeId !== episode.id) {
      Logger.info(`[PlaybackSessionManager] Mapped old episodeId "${sessionJson.episodeId}" to ${episode.id}`)
      sessionJson.episodeId = episode.id
    }
    if (sessionJson.libraryId !== libraryItem.libraryId) {
      sessionJson.libraryId = libraryItem.libraryId
    }

    let session = (await Database.getPlaybackSession(sessionJson.id)) as PlaybackSession | null
    if (!session) {
      // New session from local
      session = new PlaybackSession(sessionJson)
      session.deviceInfo = deviceInfo

      const libraryItemMedia = libraryItem.media as Book | Podcast | undefined
      const libraryItemMediaMetadata = libraryItemMedia?.oldMetadataToJSON?.() ?? null
      if (session.mediaMetadata == null) {
        session.mediaMetadata = libraryItemMediaMetadata ? structuredClone(libraryItemMediaMetadata) : null
      } else if (libraryItemMediaMetadata) {
        session.mediaMetadata = {
          ...libraryItemMediaMetadata,
          ...session.mediaMetadata
        }
      }

      if (session.displayTitle == null || session.displayTitle === '') {
        session.displayTitle = libraryItem.title
      }
      if (session.displayAuthor == null || session.displayAuthor === '') {
        session.displayAuthor = libraryItem.authorNamesFirstLast
      }
      const mediaWithPlayback = libraryItem.media as
        | { getPlaybackDuration?: (epId?: string | null) => number }
        | undefined
      session.duration = mediaWithPlayback?.getPlaybackDuration?.(sessionJson.episodeId) ?? 0

      Logger.debug(`[PlaybackSessionManager] Inserting new session for "${session.displayTitle}" (${session.id})`)
      await Database.createPlaybackSession(session)
    } else {
      session.currentTime = sessionJson.currentTime
      session.timeListening = sessionJson.timeListening ?? 0
      session.updatedAt = sessionJson.updatedAt

      let jsDate = new Date(sessionJson.updatedAt)
      if (isNaN(jsDate.getTime())) {
        jsDate = new Date()
      }
      session.date = date.format(jsDate, 'YYYY-MM-DD')
      session.dayOfWeek = date.format(jsDate, 'dddd')

      Logger.debug(`[PlaybackSessionManager] Updated session for "${session.displayTitle}" (${session.id})`)
      await Database.updatePlaybackSession(session)
    }

    const result: PlaybackSessionManager.LocalSyncResult = {
      id: session.id,
      success: true,
      progressSynced: false
    }

    const mediaItemId = session.episodeId || libraryItem.media?.id || ''
    let userProgressForItem = user.getMediaProgress(mediaItemId)
    if (userProgressForItem) {
      if (userProgressForItem.updatedAt.valueOf() > session.updatedAt) {
        Logger.info(
          `[PlaybackSessionManager] Not updating progress for "${session.displayTitle}" because it has been updated more recently (${userProgressForItem.updatedAt.valueOf()} > ${session.updatedAt}) (incoming currentTime: ${session.currentTime}) (current currentTime: ${userProgressForItem.currentTime})`
        )
      } else {
        Logger.info(
          `[PlaybackSessionManager] Updating progress for "${session.displayTitle}" with current time ${session.currentTime} (previously ${userProgressForItem.currentTime})`
        )
        const updateResponse = await user.createUpdateMediaProgressFromPayload({
          libraryItemId: libraryItem.id,
          episodeId: session.episodeId,
          ...session.mediaProgressObject,
          markAsFinishedPercentComplete: library.librarySettings?.markAsFinishedPercentComplete,
          markAsFinishedTimeRemaining: library.librarySettings?.markAsFinishedTimeRemaining
        })
        result.progressSynced = !!updateResponse.mediaProgress
        if (result.progressSynced && updateResponse.mediaProgress) {
          userProgressForItem = updateResponse.mediaProgress
        }
      }
    } else {
      Logger.info(`[PlaybackSessionManager] Creating new media progress for media item "${session.displayTitle}"`)
      const updateResponse = await user.createUpdateMediaProgressFromPayload({
        libraryItemId: libraryItem.id,
        episodeId: session.episodeId,
        ...session.mediaProgressObject,
        markAsFinishedPercentComplete: library.librarySettings?.markAsFinishedPercentComplete,
        markAsFinishedTimeRemaining: library.librarySettings?.markAsFinishedTimeRemaining
      })
      result.progressSynced = !!updateResponse.mediaProgress
      if (result.progressSynced && updateResponse.mediaProgress) {
        userProgressForItem = updateResponse.mediaProgress
      }
    }

    // Update user and emit socket event
    if (result.progressSynced && userProgressForItem) {
      SocketAuthority.clientEmitter(user.id, 'user_item_progress_updated', {
        id: userProgressForItem.id,
        sessionId: session.id,
        deviceDescription: session.deviceDescription,
        data: userProgressForItem.getOldMediaProgress()
      })
    }

    return result
  }

  /**
   * @param req
   * @param res
   */
  async syncLocalSessionRequest(req: Request, res: Response): Promise<void> {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      deviceInfo?: ClientDeviceInfoPayload
    }
    const clientDeviceInfo = body.deviceInfo ?? null
    const deviceInfo = await this.getDeviceInfo(req, clientDeviceInfo)
    const sessionJson = req.body as PlaybackSessionManager.LocalSessionPayload
    if (!req.user) {
      res.sendStatus(401)
      return
    }
    const result = await this.syncLocalSession(req.user, sessionJson, deviceInfo)
    if (result.error) {
      res.status(500).send(result.error)
    } else {
      res.sendStatus(200)
    }
  }

  /**
   * @param user
   * @param session
   * @param syncData
   * @param res
   */
  async closeSessionRequest(
    user: User,
    session: PlaybackSession,
    syncData: PlaybackSessionManager.SyncSessionPayload | null,
    res: Response
  ): Promise<void> {
    await this.closeSession(user, session, syncData)
    res.sendStatus(200)
  }

  /**
   * @param user
   * @param deviceInfo
   * @param libraryItem
   * @param episodeId
   * @param options
   * @returns
   */
  async startSession(
    user: User,
    deviceInfo: DeviceInfo,
    libraryItem: LibraryItem,
    episodeId: string | null,
    options: PlaybackSessionManager.StartSessionOptions = {}
  ): Promise<PlaybackSession> {
    // Close any sessions already open for user and device
    const userSessions = this.sessions.filter(
      (playbackSession) => playbackSession.userId === user.id && playbackSession.deviceId === deviceInfo.id
    )
    for (const session of userSessions) {
      Logger.info(
        `[PlaybackSessionManager] startSession: Closing open session "${session.displayTitle}" for user "${user.username}" (Device: ${session.deviceDescription})`
      )
      await this.closeSession(user, session, null)
    }

    const mediaObj = libraryItem.media as
      | {
          id?: string
          title?: string
          checkCanDirectPlay?: (mimeTypes?: string[], epId?: string | null) => boolean
        }
      | undefined

    const canDirectPlay = mediaObj?.checkCanDirectPlay?.(options.supportedMimeTypes, episodeId) ?? false
    const shouldDirectPlay = options.forceDirectPlay || (!options.forceTranscode && canDirectPlay)
    const mediaPlayer = options.mediaPlayer || 'unknown'

    const mediaItemId = episodeId || mediaObj?.id || ''
    const userProgress = user.getMediaProgress(mediaItemId)
    let userStartTime = 0
    if (userProgress) {
      if (userProgress.isFinished) {
        Logger.info(
          `[PlaybackSessionManager] Starting session for user "${user.username}" and resetting progress for finished item "${mediaObj?.title ?? ''}"`
        )
        // Keep userStartTime as 0 so the client restarts the media
      } else {
        userStartTime = Number.parseFloat(String(userProgress.currentTime)) || 0
      }
    }
    const newPlaybackSession = new PlaybackSession()
    newPlaybackSession.setData(libraryItem, user.id, mediaPlayer, deviceInfo, userStartTime, episodeId)

    let audioTracks: (AudioTrack | AudioTrackClass)[] = []
    if (shouldDirectPlay) {
      Logger.debug(
        `[PlaybackSessionManager] "${user.username}" starting direct play session for item "${libraryItem.id}" with id ${newPlaybackSession.id} (Device: ${newPlaybackSession.deviceDescription})`
      )
      audioTracks = libraryItem.getTrackList(episodeId ?? undefined)
      newPlaybackSession.playMethod = PlayMethod.DIRECTPLAY
    } else {
      Logger.debug(
        `[PlaybackSessionManager] "${user.username}" starting stream session for item "${libraryItem.id}" (Device: ${newPlaybackSession.deviceDescription})`
      )
      const stream = new Stream(newPlaybackSession.id, this.StreamsPath, user, libraryItem, episodeId, userStartTime)
      await stream.generatePlaylist()
      stream.start() // Start transcode

      audioTracks = [stream.getAudioTrack()]
      newPlaybackSession.stream = stream
      newPlaybackSession.playMethod = PlayMethod.TRANSCODE

      stream.on('closed', () => {
        Logger.debug(
          `[PlaybackSessionManager] Stream closed for session "${newPlaybackSession.id}" (Device: ${newPlaybackSession.deviceDescription})`
        )
        newPlaybackSession.stream = null
      })
    }
    newPlaybackSession.audioTracks = audioTracks

    this.sessions.push(newPlaybackSession)
    SocketAuthority.adminEmitter('user_stream_update', user.toJSONForPublic(this.sessions))

    return newPlaybackSession
  }

  /**
   * @param user
   * @param session
   * @param syncData
   * @returns
   */
  async syncSession(
    user: User,
    session: PlaybackSession,
    syncData: PlaybackSessionManager.SyncSessionPayload
  ): Promise<boolean> {
    if (!session.libraryItemId) {
      Logger.error(`[PlaybackSessionManager] syncSession Library Item id is missing "${session.id}"`)
      return false
    }
    const libraryItem = await Database.libraryItemModel.getExpandedById(session.libraryItemId)
    if (!libraryItem) {
      Logger.error(`[PlaybackSessionManager] syncSession Library Item not found "${session.libraryItemId}"`)
      return false
    }

    const library = await Database.libraryModel.findByPk(libraryItem.libraryId)
    if (!library) {
      Logger.error(`[PlaybackSessionManager] syncSession Library not found "${libraryItem.libraryId}"`)
      return false
    }

    session.currentTime = syncData.currentTime
    if (syncData.timeListened !== undefined) {
      session.addListeningTime(syncData.timeListened)
    }
    Logger.debug(
      `[PlaybackSessionManager] syncSession "${session.id}" (Device: ${session.deviceDescription}) | Total Time Listened: ${session.timeListening}`
    )

    const updateResponse = await user.createUpdateMediaProgressFromPayload({
      libraryItemId: libraryItem.id,
      episodeId: session.episodeId,
      // duration no longer required (v2.15.1) but used if available
      duration: syncData.duration || session.duration || 0,
      currentTime: syncData.currentTime,
      progress: session.progress,
      markAsFinishedTimeRemaining: library.librarySettings?.markAsFinishedTimeRemaining,
      markAsFinishedPercentComplete: library.librarySettings?.markAsFinishedPercentComplete
    })
    if (updateResponse.mediaProgress) {
      SocketAuthority.clientEmitter(user.id, 'user_item_progress_updated', {
        id: updateResponse.mediaProgress.id,
        sessionId: session.id,
        deviceDescription: session.deviceDescription,
        data: updateResponse.mediaProgress.getOldMediaProgress()
      })
    }
    this.saveSession(session)

    return true
  }

  /**
   * @param user
   * @param session
   * @param syncData
   * @returns
   */
  async closeSession(
    user: User,
    session: PlaybackSession,
    syncData: PlaybackSessionManager.SyncSessionPayload | null = null
  ): Promise<void> {
    if (syncData) {
      await this.syncSession(user, session, syncData)
    } else {
      this.saveSession(session)
    }
    Logger.debug(`[PlaybackSessionManager] closeSession "${session.id}"`)
    SocketAuthority.adminEmitter('user_stream_update', user.toJSONForPublic(this.sessions))
    SocketAuthority.clientEmitter(session.userId, 'user_session_closed', session.id)
    await this.removeSession(session.id)
  }

  saveSession(session: PlaybackSession): Promise<unknown> | undefined | false {
    if (!session.timeListening) return // Do not save a session with no listening time

    if (session.lastSave) {
      return Database.updatePlaybackSession(session)
    } else {
      session.lastSave = Date.now()
      return Database.createPlaybackSession(session)
    }
  }

  /**
   * @param sessionId
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.find((s) => s.id === sessionId)
    if (!session) return
    if (session.stream) {
      await session.stream.close()
    }
    this.sessions = this.sessions.filter((s) => s.id !== sessionId)
    Logger.debug(`[PlaybackSessionManager] Removed session "${sessionId}"`)
  }

  /**
   * Remove all stream folders in `/metadata/streams`
   */
  async removeOrphanStreams(): Promise<void> {
    try {
      await fs.ensureDir(this.StreamsPath)
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      Logger.error(`[PlaybackSessionManager] Failed to create streams directory at "${this.StreamsPath}": ${errorMsg}`)
      throw new Error(`[PlaybackSessionManager] Failed to create streams directory at "${this.StreamsPath}"`, {
        cause: error
      })
    }
    try {
      const streamsInPath = await fs.readdir(this.StreamsPath)
      for (const streamId of streamsInPath) {
        if (/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/.test(streamId)) {
          // Ensure is uuidv4
          const session = this.sessions.find((se) => se.id === streamId)
          if (!session) {
            const streamPath = Path.join(this.StreamsPath, streamId)
            Logger.debug(`[PlaybackSessionManager] Removing orphan stream "${streamPath}"`)
            await fs.remove(streamPath)
          }
        }
      }
    } catch (error: unknown) {
      Logger.error(`[PlaybackSessionManager] cleanOrphanStreams failed`, error)
    }
  }

  /**
   * Close all open sessions that have not been updated in the last 36 hours
   */
  async closeStaleOpenSessions(): Promise<void> {
    const updatedAtTimeCutoff = Date.now() - 1000 * 60 * 60 * 36
    const staleSessions = this.sessions.filter((session) => (session.updatedAt ?? 0) < updatedAtTimeCutoff)
    for (const session of staleSessions) {
      const sessionLastUpdate = new Date(session.updatedAt ?? 0)
      Logger.info(
        `[PlaybackSessionManager] Closing stale session "${session.displayTitle}" (${session.id}) last updated at ${sessionLastUpdate}`
      )
      await this.removeSession(session.id)
    }
  }
}

export = PlaybackSessionManager
