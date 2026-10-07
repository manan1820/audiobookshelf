import type { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'

import { toNumber } from '../utils/index'
import type User from '../models/User'
import type { UserPermissions } from '../models/User'
import type MediaProgress from '../models/MediaProgress'

interface RequestWithUser extends Request {
  user?: User | null
}

interface UserControllerRequest extends RequestWithUser {
  reqUser?: User | null
}

interface ApiRouterContext {
  auth?: {
    localAuthStrategy?: { hashPassword: (password: string) => Promise<string> }
    generateAccessToken?: (user: { id?: string; username?: string }) => string
    invalidateJwtSessionsForUser?: (
      user: User,
      req: Request,
      res: Response
    ) => Promise<unknown>
  }
  playbackSessionManager?: {
    sessions?: unknown
  }
  getUserListeningSessionsHelper?: (
    userId: string
  ) => Promise<Array<Record<string, unknown>>>
  getUserListeningStatsHelpers?: (userId: string) => Promise<unknown>
}

class UserController {
  /**
   * GET: /api/users
   */
  async findAll(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user?.isAdminOrUp) return res.sendStatus(403)
    const hideRootToken = !req.user.isRoot

    const includeQuery = typeof req.query.include === 'string' ? req.query.include : ''
    const includes = includeQuery.split(',').map((i) => i.trim())

    const allUsers = await Database.userModel.findAll()
    const users = allUsers.map((u) =>
      u.toOldJSONForBrowser(hideRootToken, true)
    ) as Array<Record<string, unknown> & { id: string; latestSession?: unknown }>

    if (includes.includes('latestSession')) {
      for (const user of users) {
        const userSessions = (await Database.getPlaybackSessions({
          userId: user.id
        })) as Array<{ updatedAt: number }>
        user.latestSession =
          userSessions.sort((a, b) => b.updatedAt - a.updatedAt).shift() ?? null
      }
    }

    res.json({
      users
    })
  }

  /**
   * GET: /api/users/:id
   */
  async findOne(req: UserControllerRequest, res: Response): Promise<Response | void> {
    if (!req.user?.isAdminOrUp) {
      Logger.error(`Non-admin user "${req.user?.username}" attempted to get user`)
      return res.sendStatus(403)
    }

    if (!req.reqUser) {
      return res.sendStatus(404)
    }

    const mediaProgresses = (await Database.mediaProgressModel.findAll({
      where: {
        userId: req.reqUser.id
      },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title', 'coverPath', 'updatedAt']
        },
        {
          model: Database.podcastEpisodeModel,
          attributes: ['id', 'title'],
          include: [
            {
              model: Database.podcastModel,
              attributes: ['id', 'title', 'coverPath', 'updatedAt']
            }
          ]
        }
      ]
    })) as MediaProgress[]

    const oldMediaProgresses = mediaProgresses.map((mp) => {
      const oldMediaProgress = (
        typeof mp.getOldMediaProgress === 'function' ? mp.getOldMediaProgress() : mp.toJSON()
      ) as Record<string, unknown>
      const mediaItem = (
        mp as MediaProgress & {
          mediaItem?: {
            title?: string
            coverPath?: string
            updatedAt?: Date
            podcast?: { title?: string; coverPath?: string; updatedAt?: Date }
          }
        }
      ).mediaItem

      oldMediaProgress.displayTitle = mediaItem?.title
      if (mediaItem?.podcast) {
        oldMediaProgress.displaySubtitle = mediaItem.podcast?.title
        oldMediaProgress.coverPath = mediaItem.podcast?.coverPath
        oldMediaProgress.mediaUpdatedAt = mediaItem.podcast?.updatedAt
      } else if (mediaItem) {
        oldMediaProgress.coverPath = mediaItem.coverPath
        oldMediaProgress.mediaUpdatedAt = mediaItem.updatedAt
      }
      return oldMediaProgress
    })

    const userJson = req.reqUser.toOldJSONForBrowser(!req.user.isRoot)
    userJson.mediaProgress = oldMediaProgresses

    res.json(userJson)
  }

  /**
   * POST: /api/users
   */
  async create(req: RequestWithUser, res: Response): Promise<Response | void> {
    const body = (req.body as Record<string, unknown>) ?? {}
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!username || !password) {
      return res.status(400).send('Username and password are required')
    }
    const reqType = typeof body.type === 'string' ? body.type : ''
    if (reqType && !Database.userModel.accountTypes.includes(reqType)) {
      return res.status(400).send('Invalid account type')
    }

    const usernameExists = await Database.userModel.checkUserExistsWithUsername(username)
    if (usernameExists) {
      return res.status(400).send('Username already taken')
    }

    const userId = uuidv4()
    const routerCtx = this as ApiRouterContext
    const pash = routerCtx.auth?.localAuthStrategy
      ? await routerCtx.auth.localAuthStrategy.hashPassword(password)
      : ''
    const token = routerCtx.auth?.generateAccessToken
      ? routerCtx.auth.generateAccessToken({ id: userId, username })
      : ''
    const userType = reqType || 'user'

    const bodyPermissions = (body.permissions as Record<string, unknown>) ?? {}
    let reqLibrariesAccessible =
      body.librariesAccessible ?? bodyPermissions.librariesAccessible
    if (
      reqLibrariesAccessible &&
      (!Array.isArray(reqLibrariesAccessible) ||
        reqLibrariesAccessible.some((libId: unknown) => typeof libId !== 'string'))
    ) {
      Logger.warn(
        `[UserController] create: Invalid librariesAccessible value: ${String(reqLibrariesAccessible)}`
      )
      reqLibrariesAccessible = null
    }

    let reqItemTagsSelected = body.itemTagsSelected ?? bodyPermissions.itemTagsSelected
    if (
      reqItemTagsSelected &&
      (!Array.isArray(reqItemTagsSelected) ||
        reqItemTagsSelected.some((tagId: unknown) => typeof tagId !== 'string'))
    ) {
      Logger.warn(
        `[UserController] create: Invalid itemTagsSelected value: ${String(reqItemTagsSelected)}`
      )
      reqItemTagsSelected = null
    }

    if (bodyPermissions.itemTagsSelected || bodyPermissions.librariesAccessible) {
      delete bodyPermissions.itemTagsSelected
      delete bodyPermissions.librariesAccessible
    }

    const permissions: UserPermissions =
      Database.userModel.getDefaultPermissionsForUserType(userType)
    if (typeof body.permissions === 'object' && body.permissions !== null) {
      for (const key in bodyPermissions) {
        if (permissions[key] !== undefined) {
          if (typeof bodyPermissions[key] !== 'boolean') {
            Logger.warn(
              `[UserController] create: Invalid permission value for key ${key}. Should be boolean`
            )
          } else {
            permissions[key] = bodyPermissions[key]
          }
        } else {
          Logger.warn(`[UserController] create: Invalid permission key: ${key}`)
        }
      }
    }

    permissions.itemTagsSelected = (reqItemTagsSelected as string[]) || []
    permissions.librariesAccessible = (reqLibrariesAccessible as string[]) || []

    const newUser = {
      id: userId,
      type: userType,
      username,
      email: typeof body.email === 'string' ? body.email : null,
      pash,
      token,
      isActive: Boolean(body.isActive),
      permissions,
      bookmarks: [],
      extraData: {
        seriesHideFromContinueListening: []
      }
    }

    const user = await Database.userModel.create(newUser)
    if (user) {
      SocketAuthority.adminEmitter('user_added', user.toOldJSONForBrowser())
      res.json({
        user: user.toOldJSONForBrowser()
      })
    } else {
      return res.status(500).send('Failed to save new user')
    }
  }

  /**
   * PATCH: /api/users/:id
   */
  async update(req: UserControllerRequest, res: Response): Promise<Response | void> {
    const user = req.reqUser
    if (!user || !req.user) {
      return res.sendStatus(404)
    }

    if (user.isRoot && !req.user.isRoot) {
      Logger.error(
        `[UserController] Admin user "${req.user.username}" attempted to update root user`
      )
      return res.sendStatus(403)
    } else if (user.isRoot) {
      delete (req.body as Record<string, unknown>)?.type
    }

    const updatePayload = (req.body as Record<string, unknown>) ?? {}

    const keysThatCannotBeUpdated = ['id', 'pash', 'token', 'extraData', 'bookmarks']
    for (const key of keysThatCannotBeUpdated) {
      if (updatePayload[key] !== undefined) {
        return res.status(400).send(`Key "${key}" cannot be updated`)
      }
    }
    if (updatePayload.email && typeof updatePayload.email !== 'string') {
      return res.status(400).send('Invalid email')
    }
    if (updatePayload.username && typeof updatePayload.username !== 'string') {
      return res.status(400).send('Invalid username')
    }
    if (
      updatePayload.type &&
      typeof updatePayload.type === 'string' &&
      !Database.userModel.accountTypes.includes(updatePayload.type)
    ) {
      return res.status(400).send('Invalid account type')
    }
    if (
      updatePayload.permissions &&
      (typeof updatePayload.permissions !== 'object' || updatePayload.permissions === null)
    ) {
      return res.status(400).send('Invalid permissions')
    }

    let hasUpdates = false
    let shouldUpdateToken = false
    let shouldInvalidateJwtSessions = false
    const routerCtx = this as ApiRouterContext

    if (
      typeof updatePayload.username === 'string' &&
      updatePayload.username !== user.username
    ) {
      const usernameExists = await Database.userModel.checkUserExistsWithUsername(
        updatePayload.username
      )
      if (usernameExists) {
        return res.status(400).send('Username already taken')
      }
      user.username = updatePayload.username
      shouldUpdateToken = true
      shouldInvalidateJwtSessions = true
      hasUpdates = true
    }

    if (typeof updatePayload.password === 'string' && updatePayload.password) {
      if (routerCtx.auth?.localAuthStrategy) {
        user.pash = await routerCtx.auth.localAuthStrategy.hashPassword(
          updatePayload.password
        )
      }
      shouldInvalidateJwtSessions = true
      hasUpdates = true
    }

    let hasPermissionsUpdates = false
    const updatePermissions =
      (updatePayload.permissions as Record<string, unknown>) ?? null

    let updateLibrariesAccessible =
      updatePayload.librariesAccessible ?? updatePermissions?.librariesAccessible
    if (
      updateLibrariesAccessible &&
      (!Array.isArray(updateLibrariesAccessible) ||
        updateLibrariesAccessible.some((libId: unknown) => typeof libId !== 'string'))
    ) {
      Logger.warn(
        `[UserController] update: Invalid librariesAccessible value: ${String(updateLibrariesAccessible)}`
      )
      updateLibrariesAccessible = null
    }

    let updateItemTagsSelected =
      updatePayload.itemTagsSelected ?? updatePermissions?.itemTagsSelected
    if (
      updateItemTagsSelected &&
      (!Array.isArray(updateItemTagsSelected) ||
        updateItemTagsSelected.some((tagId: unknown) => typeof tagId !== 'string'))
    ) {
      Logger.warn(
        `[UserController] update: Invalid itemTagsSelected value: ${String(updateItemTagsSelected)}`
      )
      updateItemTagsSelected = null
    }

    if (updatePermissions?.itemTagsSelected || updatePermissions?.librariesAccessible) {
      delete updatePermissions.itemTagsSelected
      delete updatePermissions.librariesAccessible
    }

    if (updatePermissions && typeof updatePermissions === 'object') {
      const permissions: UserPermissions = {
        ...user.permissions
      }
      const targetType =
        (typeof updatePayload.type === 'string' ? updatePayload.type : null) ||
        user.type ||
        'user'
      const defaultPermissions: UserPermissions =
        Database.userModel.getDefaultPermissionsForUserType(targetType)

      for (const key in updatePermissions) {
        if (permissions[key] !== undefined || defaultPermissions[key] !== undefined) {
          if (typeof updatePermissions[key] !== 'boolean') {
            Logger.warn(
              `[UserController] update: Invalid permission value for key ${key}. Should be boolean`
            )
          } else if (permissions[key] !== updatePermissions[key]) {
            permissions[key] = updatePermissions[key]
            hasPermissionsUpdates = true
          }
        } else {
          Logger.warn(`[UserController] update: Invalid permission key: ${key}`)
        }
      }

      if (
        updateItemTagsSelected &&
        (updateItemTagsSelected as string[]).join(',') !==
          (user.permissions?.itemTagsSelected ?? []).join(',')
      ) {
        permissions.itemTagsSelected = updateItemTagsSelected as string[]
        hasPermissionsUpdates = true
      }
      if (
        updateLibrariesAccessible &&
        (updateLibrariesAccessible as string[]).join(',') !==
          (user.permissions?.librariesAccessible ?? []).join(',')
      ) {
        permissions.librariesAccessible = updateLibrariesAccessible as string[]
        hasPermissionsUpdates = true
      }
      updatePayload.permissions = permissions
    }

    if (hasPermissionsUpdates && updatePayload.permissions) {
      user.permissions = updatePayload.permissions as UserPermissions
      user.changed('permissions', true)
      hasUpdates = true
    }

    if (
      typeof updatePayload.email === 'string' &&
      updatePayload.email !== user.email
    ) {
      user.email = updatePayload.email
      hasUpdates = true
    }
    if (typeof updatePayload.type === 'string' && updatePayload.type !== user.type) {
      user.type = updatePayload.type
      hasUpdates = true
    }
    if (
      updatePayload.isActive !== undefined &&
      Boolean(updatePayload.isActive) !== user.isActive
    ) {
      user.isActive = Boolean(updatePayload.isActive)
      hasUpdates = true
    }
    if (updatePayload.lastSeen && typeof updatePayload.lastSeen === 'number') {
      user.lastSeen = new Date(updatePayload.lastSeen)
      hasUpdates = true
    }

    if (hasUpdates) {
      if (shouldUpdateToken && routerCtx.auth?.generateAccessToken) {
        user.token = routerCtx.auth.generateAccessToken(user)
        Logger.info(`[UserController] User ${user.username} has generated a new api token`)
      }

      if (shouldInvalidateJwtSessions && routerCtx.auth?.invalidateJwtSessionsForUser) {
        const newTokens = await routerCtx.auth.invalidateJwtSessionsForUser(
          user,
          req,
          res
        )
        if (newTokens) {
          Logger.info(
            `[UserController] Invalidated JWT sessions for user ${user.username} and rotated tokens for current session`
          )
        } else {
          Logger.info(
            `[UserController] Invalidated JWT sessions for user ${user.username}`
          )
        }
      }

      await user.save()
      SocketAuthority.clientEmitter(
        req.user.id,
        'user_updated',
        user.toOldJSONForBrowser()
      )
    }

    res.json({
      success: true,
      user: user.toOldJSONForBrowser()
    })
  }

  /**
   * DELETE: /api/users/:id
   */
  async delete(req: UserControllerRequest, res: Response): Promise<Response | void> {
    const user = req.reqUser

    if (!user || !req.user) {
      return res.sendStatus(404)
    }

    if (req.user.id === req.params.id) {
      Logger.error(`[UserController] User ${req.user.username} is attempting to delete self`)
      return res.sendStatus(400)
    }
    if (user.isRoot) {
      Logger.error(
        `[UserController] Admin user "${req.user.username}" attempted to delete root user`
      )
      return res.sendStatus(403)
    }

    const userPlaylists = await Database.playlistModel.findAll({
      where: {
        userId: user.id
      }
    })
    for (const playlist of userPlaylists) {
      await playlist.destroy()
    }

    const [sessionsUpdated] = await Database.playbackSessionModel.update(
      {
        userId: null
      },
      {
        where: {
          userId: user.id
        }
      }
    )
    Logger.info(
      `[UserController] Updated ${sessionsUpdated} playback sessions to remove user id`
    )

    const userJson = user.toOldJSONForBrowser()
    await user.destroy()
    SocketAuthority.adminEmitter('user_removed', userJson)
    res.json({
      success: true
    })
  }

  /**
   * PATCH: /api/users/:id/openid-unlink
   */
  async unlinkFromOpenID(
    req: UserControllerRequest,
    res: Response
  ): Promise<Response | void> {
    if (!req.reqUser || !req.user) {
      return res.sendStatus(404)
    }

    Logger.debug(
      `[UserController] Unlinking user "${req.reqUser.username}" from OpenID with sub "${req.reqUser.authOpenIDSub}"`
    )

    if (!req.reqUser.authOpenIDSub) {
      return res.sendStatus(200)
    }

    if (req.reqUser.extraData) {
      req.reqUser.extraData.authOpenIDSub = undefined
    }
    req.reqUser.changed('extraData', true)
    await req.reqUser.save()
    SocketAuthority.clientEmitter(
      req.user.id,
      'user_updated',
      req.reqUser.toOldJSONForBrowser()
    )
    res.sendStatus(200)
  }

  /**
   * GET: /api/users/:id/listening-sessions
   */
  async getListeningSessions(
    req: UserControllerRequest,
    res: Response
  ): Promise<Response | void> {
    if (!req.reqUser) {
      return res.sendStatus(404)
    }

    const routerCtx = this as ApiRouterContext
    const listeningSessions = routerCtx.getUserListeningSessionsHelper
      ? await routerCtx.getUserListeningSessionsHelper(req.params.id)
      : []

    const itemsPerPage = toNumber(req.query.itemsPerPage, 10) || 10
    const page = toNumber(req.query.page, 0)

    const start = page * itemsPerPage
    const sessions = listeningSessions.slice(start, start + itemsPerPage).map((session) => {
      return {
        ...session,
        user: {
          id: req.reqUser?.id,
          username: req.reqUser?.username
        }
      }
    })

    const payload = {
      total: listeningSessions.length,
      numPages: Math.ceil(listeningSessions.length / itemsPerPage),
      page,
      itemsPerPage,
      sessions
    }

    res.json(payload)
  }

  /**
   * GET: /api/users/:id/listening-stats
   */
  async getListeningStats(
    req: UserControllerRequest,
    res: Response
  ): Promise<Response | void> {
    const routerCtx = this as ApiRouterContext
    const listeningStats = routerCtx.getUserListeningStatsHelpers
      ? await routerCtx.getUserListeningStatsHelpers(req.params.id)
      : {}
    res.json(listeningStats)
  }

  /**
   * GET: /api/users/online
   */
  async getOnlineUsers(req: RequestWithUser, res: Response): Promise<Response | void> {
    if (!req.user?.isAdminOrUp) {
      return res.sendStatus(403)
    }

    const routerCtx = this as ApiRouterContext
    res.json({
      usersOnline: SocketAuthority.getUsersOnline(),
      openSessions: routerCtx.playbackSessionManager?.sessions ?? []
    })
  }

  /**
   * Middleware for authorization and loading target user
   */
  async middleware(
    req: UserControllerRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    if (!req.user?.isAdminOrUp && req.user?.id !== req.params.id) {
      return res.sendStatus(403)
    } else if (
      (req.method === 'PATCH' || req.method === 'POST' || req.method === 'DELETE') &&
      !req.user?.isAdminOrUp
    ) {
      return res.sendStatus(403)
    }

    if (req.params.id) {
      req.reqUser = await Database.userModel.getUserById(req.params.id)
      if (!req.reqUser) {
        return res.sendStatus(404)
      }
    }

    next()
  }
}

const userController = new UserController()

namespace userController {
  export type UserControllerRequestType = UserControllerRequest
  export type RequestWithUserType = RequestWithUser
}

export = userController
