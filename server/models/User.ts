import { v4 as uuidv4 } from 'uuid'
import {
  DataTypes,
  Model,
  Op,
  where,
  fn,
  col,
  literal,
  Sequelize,
  NonAttribute,
  Optional
} from 'sequelize'
import { LRUCache } from 'lru-cache'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import { isNullOrNaN } from '../utils'
import TokenManager from '../auth/TokenManager'
import type MediaProgress from './MediaProgress'
import type LibraryItem from './LibraryItem'

export interface AudioBookmarkObject {
  libraryItemId: string
  title: string
  time: number
  createdAt: number
}

export interface ProgressUpdatePayload {
  libraryItemId: string
  episodeId?: string | null
  duration?: number | null
  progress?: number | null
  currentTime?: number | null
  isFinished?: boolean | null
  hideFromContinueListening?: boolean | null
  ebookLocation?: string | null
  ebookProgress?: number | null
  finishedAt?: string | Date | null
  lastUpdate?: number | null
  markAsFinishedTimeRemaining?: number | null
  markAsFinishedPercentComplete?: number | null
  createdAt?: Date | null
}

export interface UserExtraData {
  oldUserId?: string
  authOpenIDSub?: string
  seriesHideFromContinueListening?: string[]
  [key: string]: unknown
}

export interface UserPermissions {
  download?: boolean
  update?: boolean
  delete?: boolean
  upload?: boolean
  accessExplicitContent?: boolean
  accessAllLibraries?: boolean
  accessAllTags?: boolean
  createEreader?: boolean
  selectedTagsNotAccessible?: boolean
  librariesAccessible?: string[]
  itemTagsSelected?: string[]
  [key: string]: unknown
}

export interface OpenIdUserInfo {
  sub: string
  email?: string
  email_verified?: boolean
  preferred_username?: string
  username?: string
  name?: string
  [key: string]: unknown
}

class UserCache {
  private cache: LRUCache<string, User>

  constructor() {
    this.cache = new LRUCache<string, User>({ max: 100 })
  }

  getById(id: string): User | undefined {
    return this.cache.get(id)
  }

  getByEmail(email: string): User | undefined {
    return this.cache.find((u) => u.email === email)
  }

  getByUsername(username: string): User | undefined {
    return this.cache.find((u) => u.username === username)
  }

  getByOldId(oldUserId: string): User | undefined {
    return this.cache.find((u) => u.extraData?.oldUserId === oldUserId)
  }

  getByOpenIDSub(sub: string): User | undefined {
    return this.cache.find((u) => u.extraData?.authOpenIDSub === sub)
  }

  set(user: User): void {
    user.fromCache = true
    this.cache.set(user.id, user)
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  maybeInvalidate(user: User): void {
    if (!user.fromCache) {
      this.delete(user.id)
    }
  }
}

const userCache = new UserCache()

export interface UserAttributes {
  id: string
  username: string
  email?: string | null
  pash?: string | null
  type: string
  token?: string | null
  isActive?: boolean
  isLocked?: boolean
  lastSeen?: Date | null
  permissions?: UserPermissions | null
  bookmarks?: AudioBookmarkObject[] | null
  extraData?: UserExtraData | null
  createdAt?: Date
  updatedAt?: Date
}

export interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | 'id'
    | 'email'
    | 'pash'
    | 'token'
    | 'isActive'
    | 'isLocked'
    | 'lastSeen'
    | 'permissions'
    | 'bookmarks'
    | 'extraData'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: string
  declare username: string
  declare email: string | null
  declare pash: string | null
  declare type: string
  declare token: string | null
  declare isActive: boolean
  declare isLocked: boolean
  declare lastSeen: Date | null
  declare permissions: UserPermissions | null
  declare bookmarks: AudioBookmarkObject[] | null
  declare extraData: UserExtraData | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Cache and temporary flags
  declare fromCache?: boolean
  declare isOldToken?: boolean

  // Associations
  declare mediaProgresses?: NonAttribute<MediaProgress[]>

  static accountTypes = ['admin', 'user', 'guest']

  static permissionMapping: Record<string, string> = {
    canDownload: 'download',
    canUpload: 'upload',
    canDelete: 'delete',
    canUpdate: 'update',
    canAccessExplicitContent: 'accessExplicitContent',
    canAccessAllLibraries: 'accessAllLibraries',
    canAccessAllTags: 'accessAllTags',
    canCreateEReader: 'createEreader',
    tagsAreDenylist: 'selectedTagsNotAccessible',
    allowedLibraries: 'librariesAccessible',
    allowedTags: 'itemTagsSelected'
  }

  static getSampleAbsPermissions(): string {
    const samplePermissions = Object.keys(User.permissionMapping).reduce(
      (acc: Record<string, unknown>, key) => {
        if (key === 'allowedLibraries') {
          acc[key] = ['5406ba8a-16e1-451d-96d7-4931b0a0d966', '918fd848-7c1d-4a02-818a-847435a879ca']
        } else if (key === 'allowedTags') {
          acc[key] = ['ExampleTag', 'AnotherTag', 'ThirdTag']
        } else {
          acc[key] = false
        }
        return acc
      },
      {}
    )
    return JSON.stringify(samplePermissions, null, 2)
  }

  static getDefaultPermissionsForUserType(type: string): UserPermissions {
    return {
      download: true,
      update: type === 'root' || type === 'admin',
      delete: type === 'root',
      upload: type === 'root' || type === 'admin',
      createEreader: type === 'root' || type === 'admin',
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: type === 'root' || type === 'admin',
      selectedTagsNotAccessible: false,
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  static async createRootUser(
    username: string,
    pash: string,
    auth: { generateAccessToken: (payload: { id: string; username: string }) => string }
  ): Promise<User> {
    const userId = uuidv4()
    const token = auth.generateAccessToken({ id: userId, username })

    const newUser: UserCreationAttributes = {
      id: userId,
      type: 'root',
      username,
      pash,
      token,
      isActive: true,
      permissions: this.getDefaultPermissionsForUserType('root'),
      bookmarks: [],
      extraData: {
        seriesHideFromContinueListening: []
      }
    }
    return this.create(newUser)
  }

  static async findUserFromOpenIdUserInfo(
    userinfo: OpenIdUserInfo
  ): Promise<User | { error: string } | null> {
    let user = await this.getUserByOpenIDSub(userinfo.sub)

    if (user) {
      Logger.debug(`[User] openid: User found by sub "${userinfo.sub}"`)
      return user
    }

    const serverSettings = (global as { ServerSettings?: { authOpenIDMatchExistingBy?: string } })
      .ServerSettings

    if (serverSettings?.authOpenIDMatchExistingBy === 'email') {
      if (userinfo.email) {
        if (userinfo.email_verified === false) {
          Logger.warn(`[User] openid: User not found and email "${userinfo.email}" is not verified`)
          return { error: 'Email not verified' }
        } else {
          Logger.info(`[User] openid: User not found, checking existing with email "${userinfo.email}"`)
          user = await this.getUserByEmail(userinfo.email)

          if (user?.authOpenIDSub) {
            Logger.warn(
              `[User] openid: User found with email "${userinfo.email}" but is already matched with sub "${user.authOpenIDSub}"`
            )
            return { error: 'User already linked to a different OpenID subject' }
          }
        }
      } else {
        Logger.warn(`[User] openid: User not found and no email in userinfo`)
        return { error: 'No email in userinfo' }
      }
    } else if (serverSettings?.authOpenIDMatchExistingBy === 'username') {
      let username: string | undefined

      if (userinfo.preferred_username) {
        Logger.info(
          `[User] openid: User not found, checking existing with userinfo.preferred_username "${userinfo.preferred_username}"`
        )
        username = userinfo.preferred_username
      } else if (userinfo.username) {
        Logger.info(
          `[User] openid: User not found, checking existing with userinfo.username "${userinfo.username}"`
        )
        username = userinfo.username
      } else {
        Logger.warn(
          `[User] openid: User not found and neither preferred_username nor username in userinfo`
        )
        return { error: 'No username in userinfo' }
      }

      user = await this.getUserByUsername(username)

      if (user?.authOpenIDSub) {
        Logger.warn(
          `[User] openid: User found with username "${username}" but is already matched with sub "${user.authOpenIDSub}"`
        )
        return { error: 'User already linked to a different OpenID subject' }
      }
    }

    if (!user) {
      return null
    }

    if (!user.isActive) {
      Logger.warn(`[User] openid: User found but is not active`)
      return user
    }

    if (!user.extraData) user.extraData = {}
    user.extraData.authOpenIDSub = userinfo.sub
    user.changed('extraData', true)
    await user.save()

    Logger.debug(`[User] openid: User found by email/username`)
    return user
  }

  static async createUserFromOpenIdUserInfo(userinfo: OpenIdUserInfo): Promise<User | null> {
    const userId = uuidv4()
    const username = userinfo.preferred_username || userinfo.name || userinfo.sub
    const email = userinfo.email && userinfo.email_verified ? userinfo.email : null

    const token = TokenManager.generateAccessToken({ id: userId, username })

    const newUser: UserCreationAttributes = {
      id: userId,
      type: 'user',
      username,
      email,
      pash: null,
      token,
      isActive: true,
      permissions: this.getDefaultPermissionsForUserType('user'),
      bookmarks: [],
      extraData: {
        authOpenIDSub: userinfo.sub,
        seriesHideFromContinueListening: []
      }
    }
    const user = await this.create(newUser)

    if (user) {
      SocketAuthority.adminEmitter('user_added', user.toOldJSONForBrowser())
      return user
    }
    return null
  }

  static async getUserByUsername(username?: string | null): Promise<User | null> {
    if (!username) return null

    const cachedUser = userCache.getByUsername(username)
    if (cachedUser) return cachedUser

    const include = this.sequelize ? [this.sequelize.models.mediaProgress] : []
    const user = await this.findOne({
      where: where(fn('lower', col('username')), username.toLowerCase()),
      include
    })

    if (user) userCache.set(user)
    return user
  }

  static async getUserByEmail(email?: string | null): Promise<User | null> {
    if (!email) return null

    const cachedUser = userCache.getByEmail(email)
    if (cachedUser) return cachedUser

    const include = this.sequelize ? [this.sequelize.models.mediaProgress] : []
    const user = await this.findOne({
      where: where(fn('lower', col('email')), email.toLowerCase()),
      include
    })

    if (user) userCache.set(user)
    return user
  }

  static async getUserById(userId?: string | null): Promise<User | null> {
    if (!userId) return null

    const cachedUser = userCache.getById(userId)
    if (cachedUser) return cachedUser

    const include = this.sequelize ? [this.sequelize.models.mediaProgress] : []
    const user = await this.findByPk(userId, {
      include
    })

    if (user) userCache.set(user)
    return user
  }

  static async getUserByIdOrOldId(userId?: string | null): Promise<User | null> {
    if (!userId) return null
    const cachedUser = userCache.getById(userId) || userCache.getByOldId(userId)
    if (cachedUser) return cachedUser

    const include = this.sequelize ? [this.sequelize.models.mediaProgress] : []
    const user = await this.findOne({
      where: {
        [Op.or]: [{ id: userId }, { 'extraData.oldUserId': userId }]
      },
      include
    })

    if (user) userCache.set(user)
    return user
  }

  static async getUserByOpenIDSub(sub?: string | null): Promise<User | null> {
    if (!sub) return null

    const cachedUser = userCache.getByOpenIDSub(sub)
    if (cachedUser) return cachedUser

    const include = this.sequelize ? [this.sequelize.models.mediaProgress] : []
    const user = await this.findOne({
      where: where(literal(`extraData->>"authOpenIDSub"`), sub),
      include
    })

    if (user) userCache.set(user)
    return user
  }

  static async getMinifiedUserObjects(): Promise<Array<{ id: string; username: string }>> {
    const users = await this.findAll({
      attributes: ['id', 'username']
    })
    return users.map((u) => ({
      id: u.id,
      username: u.username
    }))
  }

  static async getHasRootUser(): Promise<boolean> {
    const count = await this.count({
      where: {
        type: 'root'
      }
    })
    return count > 0
  }

  static async checkUserExistsWithUsername(username: string): Promise<boolean> {
    const count = await this.count({
      where: {
        username
      }
    })
    return count > 0
  }

  static mediaProgressRemoved(mediaProgress: { userId: string; id: string }): void {
    const cachedUser = userCache.getById(mediaProgress.userId)
    if (cachedUser && cachedUser.mediaProgresses) {
      Logger.debug(`[User] mediaProgressRemoved: ${mediaProgress.id} from user ${cachedUser.id}`)
      cachedUser.mediaProgresses = cachedUser.mediaProgresses.filter((mp) => mp.id !== mediaProgress.id)
    }
  }

  static initModel(sequelize: Sequelize): typeof User {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        username: DataTypes.STRING,
        email: DataTypes.STRING,
        pash: DataTypes.STRING,
        type: DataTypes.STRING,
        token: DataTypes.STRING,
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        isLocked: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        lastSeen: DataTypes.DATE,
        permissions: DataTypes.JSON,
        bookmarks: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'user',
        hooks: {
          beforeDestroy(user) {
            const u = user as User
            if (u.type === 'root') {
              throw new Error('Root user cannot be deleted')
            }
          }
        }
      }
    )

    return User
  }

  get isRoot(): boolean {
    return this.type === 'root'
  }
  get isAdminOrUp(): boolean {
    return this.isRoot || this.type === 'admin'
  }
  get isUser(): boolean {
    return this.type === 'user'
  }
  get isGuest(): boolean {
    return this.type === 'guest'
  }
  get canAccessExplicitContent(): boolean {
    return !!this.permissions?.accessExplicitContent && this.isActive
  }
  get canDelete(): boolean {
    return !!this.permissions?.delete && this.isActive
  }
  get canUpdate(): boolean {
    return !!this.permissions?.update && this.isActive
  }
  get canDownload(): boolean {
    return !!this.permissions?.download && this.isActive
  }
  get canUpload(): boolean {
    return !!this.permissions?.upload && this.isActive
  }
  get authOpenIDSub(): string | null {
    return typeof this.extraData?.authOpenIDSub === 'string' ? this.extraData.authOpenIDSub : null
  }

  toJSONForPublic(
    sessions?: Array<{ userId: string; toJSONForClient: () => unknown }>
  ): Record<string, unknown> {
    const session = sessions?.find((s) => s.userId === this.id)?.toJSONForClient() ?? null
    return {
      id: this.id,
      username: this.username,
      type: this.type,
      session,
      lastSeen: this.lastSeen?.valueOf() ?? null,
      createdAt: this.createdAt?.valueOf() ?? Date.now()
    }
  }

  toOldJSONForBrowser(hideRootToken = false, minimal = false): Record<string, unknown> {
    const seriesHideFromContinueListening = this.extraData?.seriesHideFromContinueListening ?? []
    const librariesAccessible = this.permissions?.librariesAccessible ?? []
    const itemTagsSelected = this.permissions?.itemTagsSelected ?? []
    const permissions: Record<string, unknown> = { ...this.permissions }
    delete permissions.librariesAccessible
    delete permissions.itemTagsSelected

    const json: Record<string, unknown> = {
      id: this.id,
      username: this.username,
      email: this.email,
      type: this.type,
      token: this.type === 'root' && hideRootToken ? '' : this.token,
      isOldToken: this.isOldToken,
      mediaProgress: this.mediaProgresses?.map((mp) => (mp as { getOldMediaProgress: () => unknown }).getOldMediaProgress()) ?? [],
      seriesHideFromContinueListening: [...seriesHideFromContinueListening],
      bookmarks: this.bookmarks?.map((b) => ({ ...b })) ?? [],
      isActive: this.isActive,
      isLocked: this.isLocked,
      lastSeen: this.lastSeen?.valueOf() ?? null,
      createdAt: this.createdAt?.valueOf() ?? Date.now(),
      permissions,
      librariesAccessible: [...librariesAccessible],
      itemTagsSelected: [...itemTagsSelected],
      hasOpenIDLink: !!this.authOpenIDSub
    }
    if (minimal) {
      delete json.mediaProgress
      delete json.bookmarks
    }
    return json
  }

  checkCanAccessLibrary(libraryId: string): boolean {
    if (this.permissions?.accessAllLibraries) return true
    if (!this.permissions?.librariesAccessible) return false
    return this.permissions.librariesAccessible.includes(libraryId)
  }

  checkCanAccessLibraryItemWithTags(tags?: string[]): boolean {
    if (this.permissions?.accessAllTags) return true
    const itemTagsSelected = this.permissions?.itemTagsSelected ?? []
    if (this.permissions?.selectedTagsNotAccessible) {
      if (!tags?.length) return true
      return tags.every((tag) => !itemTagsSelected.includes(tag))
    }
    if (!tags?.length) return false
    return itemTagsSelected.some((tag) => tags.includes(tag))
  }

  checkCanAccessLibraryItem(libraryItem: LibraryItem): boolean {
    if (!this.checkCanAccessLibrary(libraryItem.libraryId)) return false

    const media = libraryItem.media as
      | { explicit?: boolean; metadata?: { explicit?: boolean }; tags?: string[] }
      | undefined
    const libraryItemExplicit = !!media?.explicit || !!media?.metadata?.explicit

    if (libraryItemExplicit && !this.canAccessExplicitContent) return false

    return this.checkCanAccessLibraryItemWithTags(media?.tags)
  }

  getDefaultLibraryId(libraryIds: string[]): string | null {
    return libraryIds.find((lid) => this.checkCanAccessLibrary(lid)) ?? null
  }

  getMediaProgress(mediaItemId: string): MediaProgress | null {
    if (!this.mediaProgresses?.length) return null
    return (
      this.mediaProgresses.find(
        (mp) => (mp as { mediaItemId?: string }).mediaItemId === mediaItemId
      ) ?? null
    )
  }

  getOldMediaProgress(libraryItemId: string, episodeId: string | null = null): unknown {
    const mediaProgress = this.mediaProgresses?.find((mp) => {
      const p = mp as {
        mediaItemId?: string
        extraData?: { libraryItemId?: string }
        getOldMediaProgress?: () => unknown
      }
      if (episodeId && p.mediaItemId !== episodeId) return false
      return p.extraData?.libraryItemId === libraryItemId
    })
    return (
      (mediaProgress as { getOldMediaProgress?: () => unknown } | undefined)?.getOldMediaProgress?.() ??
      null
    )
  }

  async createUpdateMediaProgressFromPayload(progressPayload: ProgressUpdatePayload): Promise<{
    mediaProgress?: MediaProgress
    error?: string
    statusCode?: number
  }> {
    let mediaProgress: MediaProgress | null = null
    let mediaItemId: string | null = null
    let podcastId: string | null = null

    if (progressPayload.episodeId) {
      const podcastEpisodeModel = this.sequelize.models.podcastEpisode as {
        findByPk: (id: string, options: unknown) => Promise<{
          id: string
          podcastId: string
          mediaProgresses?: MediaProgress[]
        } | null>
      }
      const podcastEpisode = await podcastEpisodeModel.findByPk(progressPayload.episodeId, {
        attributes: ['id', 'podcastId'],
        include: [
          {
            model: this.sequelize.models.mediaProgress,
            where: { userId: this.id },
            required: false
          },
          {
            model: this.sequelize.models.podcast,
            attributes: ['id', 'title'],
            include: {
              model: this.sequelize.models.libraryItem,
              attributes: ['id']
            }
          }
        ]
      })
      if (!podcastEpisode) {
        Logger.error(`[User] createUpdateMediaProgress: episode ${progressPayload.episodeId} not found`)
        return {
          error: 'Episode not found',
          statusCode: 404
        }
      }
      mediaItemId = podcastEpisode.id
      mediaProgress = podcastEpisode.mediaProgresses?.[0] ?? null
      podcastId = podcastEpisode.podcastId
    } else {
      const libraryItemModel = this.sequelize.models.libraryItem as {
        findByPk: (id: string, options: unknown) => Promise<{
          id: string
          mediaType: string
          media?: {
            id: string
            title: string
            mediaProgresses?: MediaProgress[]
          }
        } | null>
      }
      const libraryItem = await libraryItemModel.findByPk(progressPayload.libraryItemId, {
        attributes: ['id', 'mediaId', 'mediaType'],
        include: {
          model: this.sequelize.models.book,
          attributes: ['id', 'title'],
          required: false,
          include: {
            model: this.sequelize.models.mediaProgress,
            where: { userId: this.id },
            required: false
          }
        }
      })
      if (!libraryItem) {
        Logger.error(
          `[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} not found`
        )
        return {
          error: 'Library item not found',
          statusCode: 404
        }
      } else if (libraryItem.mediaType !== 'book' || !libraryItem.media) {
        Logger.error(
          `[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} is not a book`
        )
        return {
          error: 'Library item is not a book',
          statusCode: 400
        }
      }

      mediaItemId = libraryItem.media.id
      mediaProgress = libraryItem.media.mediaProgresses?.[0] ?? null
    }

    if (mediaProgress) {
      const mp = mediaProgress as MediaProgress & {
        applyProgressUpdate: (payload: ProgressUpdatePayload) => Promise<MediaProgress>
      }
      const updatedMediaProgress = await mp.applyProgressUpdate(progressPayload)
      mediaProgress = updatedMediaProgress
      if (this.mediaProgresses) {
        this.mediaProgresses = this.mediaProgresses.map((m) =>
          m.id === updatedMediaProgress.id ? updatedMediaProgress : m
        )
      }
    } else {
      const newMediaProgressPayload: Record<string, unknown> = {
        userId: this.id,
        mediaItemId,
        podcastId,
        mediaItemType: progressPayload.episodeId ? 'podcastEpisode' : 'book',
        duration: isNullOrNaN(progressPayload.duration) ? 0 : Number(progressPayload.duration),
        currentTime: isNullOrNaN(progressPayload.currentTime)
          ? 0
          : Number(progressPayload.currentTime),
        isFinished: !!progressPayload.isFinished,
        hideFromContinueListening: !!progressPayload.hideFromContinueListening,
        ebookLocation: progressPayload.ebookLocation || null,
        ebookProgress: isNullOrNaN(progressPayload.ebookProgress)
          ? 0
          : Number(progressPayload.ebookProgress),
        finishedAt: progressPayload.finishedAt || null,
        createdAt: progressPayload.createdAt || new Date(),
        extraData: {
          libraryItemId: progressPayload.libraryItemId,
          progress: isNullOrNaN(progressPayload.progress) ? 0 : Number(progressPayload.progress)
        }
      }
      if (newMediaProgressPayload.isFinished) {
        newMediaProgressPayload.finishedAt = newMediaProgressPayload.finishedAt || new Date()
        const extra = newMediaProgressPayload.extraData as Record<string, unknown>
        extra.progress = 1
      } else {
        newMediaProgressPayload.finishedAt = null
      }
      const mediaProgressModel = this.sequelize.models.mediaProgress as {
        create: (payload: Record<string, unknown>) => Promise<MediaProgress>
      }
      mediaProgress = await mediaProgressModel.create(newMediaProgressPayload)
      if (!this.mediaProgresses) {
        this.mediaProgresses = []
      }
      this.mediaProgresses.push(mediaProgress)
    }
    userCache.maybeInvalidate(this)
    return {
      mediaProgress
    }
  }

  findBookmark(libraryItemId: string, time: number): AudioBookmarkObject | null {
    return (
      this.bookmarks?.find((bm) => bm.libraryItemId === libraryItemId && bm.time === time) ?? null
    )
  }

  async createBookmark(
    libraryItemId: string,
    time: number,
    title: string
  ): Promise<AudioBookmarkObject> {
    const existingBookmark = this.findBookmark(libraryItemId, time)
    if (existingBookmark) {
      Logger.warn('[User] Create Bookmark already exists for this time')
      if (existingBookmark.title !== title) {
        existingBookmark.title = title
        this.changed('bookmarks', true)
        await this.save()
      }
      return existingBookmark
    }

    const newBookmark: AudioBookmarkObject = {
      libraryItemId,
      time,
      title,
      createdAt: Date.now()
    }
    if (!this.bookmarks) {
      this.bookmarks = []
    }
    this.bookmarks.push(newBookmark)
    this.changed('bookmarks', true)
    await this.save()
    return newBookmark
  }

  async updateBookmark(
    libraryItemId: string,
    time: number,
    title: string
  ): Promise<AudioBookmarkObject | null> {
    const bookmark = this.findBookmark(libraryItemId, time)
    if (!bookmark) {
      Logger.error(`[User] updateBookmark not found`)
      return null
    }
    bookmark.title = title
    this.changed('bookmarks', true)
    await this.save()
    return bookmark
  }

  async removeBookmark(libraryItemId: string, time: number): Promise<boolean> {
    if (!this.findBookmark(libraryItemId, time)) {
      Logger.error(`[User] removeBookmark not found`)
      return false
    }
    if (this.bookmarks) {
      this.bookmarks = this.bookmarks.filter(
        (bm) => bm.libraryItemId !== libraryItemId || bm.time !== time
      )
    }
    this.changed('bookmarks', true)
    await this.save()
    return true
  }

  async addSeriesToHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    const seriesHide = this.extraData.seriesHideFromContinueListening ?? []
    if (seriesHide.includes(seriesId)) return false
    seriesHide.push(seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHide
    this.changed('extraData', true)
    await this.save()
    return true
  }

  async removeSeriesFromHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    let seriesHide = this.extraData.seriesHideFromContinueListening ?? []
    if (!seriesHide.includes(seriesId)) return false
    seriesHide = seriesHide.filter((sid) => sid !== seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHide
    this.changed('extraData', true)
    await this.save()
    return true
  }

  async updatePermissionsFromExternalJSON(
    absPermissions: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.permissions) this.permissions = {}
    let hasUpdates = false

    Object.keys(absPermissions).forEach((absKey) => {
      const userPermKey = User.permissionMapping[absKey]
      if (!userPermKey) {
        throw new Error(`Unexpected permission property: ${absKey}`)
      }

      if (!['librariesAccessible', 'itemTagsSelected'].includes(userPermKey)) {
        const currentVal = this.permissions?.[userPermKey]
        const newVal = !!absPermissions[absKey]
        if (currentVal !== newVal) {
          if (this.permissions) {
            this.permissions[userPermKey] = newVal
          }
          hasUpdates = true
        }
      }
    })

    const librariesAccessible = this.permissions.librariesAccessible ?? []
    if (this.permissions.accessAllLibraries) {
      if (librariesAccessible.length) {
        this.permissions.librariesAccessible = []
        hasUpdates = true
      }
    } else if (
      Array.isArray(absPermissions.allowedLibraries) &&
      absPermissions.allowedLibraries.join(',') !== librariesAccessible.join(',')
    ) {
      if (absPermissions.allowedLibraries.some((lid) => typeof lid !== 'string')) {
        throw new Error('Invalid permission property "allowedLibraries", expecting array of strings')
      }
      this.permissions.librariesAccessible = absPermissions.allowedLibraries as string[]
      hasUpdates = true
    }

    const itemTagsSelected = this.permissions.itemTagsSelected ?? []
    if (this.permissions.accessAllTags) {
      if (itemTagsSelected.length) {
        this.permissions.itemTagsSelected = []
        hasUpdates = true
      }
    } else if (
      Array.isArray(absPermissions.allowedTags) &&
      absPermissions.allowedTags.join(',') !== itemTagsSelected.join(',')
    ) {
      if (absPermissions.allowedTags.some((tag) => typeof tag !== 'string')) {
        throw new Error('Invalid permission property "allowedTags", expecting array of strings')
      }
      this.permissions.itemTagsSelected = absPermissions.allowedTags as string[]
      hasUpdates = true
    }

    if (hasUpdates) {
      this.changed('permissions', true)
      await this.save()
    }

    return hasUpdates
  }

  override async update(
    values: { [key in keyof UserAttributes]?: UserAttributes[key] },
    options?: Parameters<Model<UserAttributes, UserCreationAttributes>['update']>[1]
  ): Promise<this> {
    userCache.maybeInvalidate(this)
    return super.update(values, options)
  }

  override async save(
    options?: Parameters<Model<UserAttributes, UserCreationAttributes>['save']>[0]
  ): Promise<this> {
    userCache.maybeInvalidate(this)
    return super.save(options)
  }

  override async destroy(
    options?: Parameters<Model<UserAttributes, UserCreationAttributes>['destroy']>[0]
  ): Promise<void> {
    userCache.delete(this.id)
    return super.destroy(options)
  }
}

export default User
