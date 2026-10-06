import { v4 as uuidv4 } from 'uuid'
import sequelize, { DataTypes, Model, Op, type Sequelize, type Transaction } from 'sequelize'
import { LRUCache } from 'lru-cache'

import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import { isNullOrNaN } from '../utils'
import TokenManager from '../auth/TokenManager'
import type { AudioBookmarkObject, OpenIdUserInfo, ProgressUpdatePayload, UserExtraData, UserPermissions } from '../types'
import type MediaProgress from './MediaProgress'
import type LibraryItem from './LibraryItem'
import type Book from './Book'
import type PodcastEpisode from './PodcastEpisode'

class UserCache {
  private cache: LRUCache<string, User>

  constructor() {
    this.cache = new LRUCache<string, User>({ max: 100 })
  }

  getById(id: string): User | undefined {
    const user = this.cache.get(id)
    return user
  }

  getByEmail(email: string): User | undefined {
    const user = this.cache.find((u) => u.email === email)
    return user
  }

  getByUsername(username: string): User | undefined {
    const user = this.cache.find((u) => u.username === username)
    return user
  }

  getByOldId(oldUserId: string): User | undefined {
    const user = this.cache.find((u) => u.extraData?.oldUserId === oldUserId)
    return user
  }

  getByOpenIDSub(sub: string): User | undefined {
    const user = this.cache.find((u) => u.extraData?.authOpenIDSub === sub)
    return user
  }

  set(user: User): void {
    user.fromCache = true
    this.cache.set(user.id, user)
  }

  delete(userId: string): void {
    this.cache.delete(userId)
  }

  maybeInvalidate(user: User): void {
    if (!user.fromCache) this.delete(user.id)
  }
}

const userCache = new UserCache()

class User extends Model {
  declare id: string
  declare username: string
  declare email: string | null
  declare pash: string | null
  declare type: string
  declare token: string | null
  declare isActive: boolean
  declare isLocked: boolean
  declare lastSeen: Date | null
  declare permissions: UserPermissions
  declare bookmarks: AudioBookmarkObject[]
  declare extraData: UserExtraData
  declare createdAt: Date
  declare updatedAt: Date

  declare mediaProgresses?: MediaProgress[]
  declare isOldToken?: boolean
  declare fromCache?: boolean

  // Excludes "root" since their can only be 1 root user
  static accountTypes = ['admin', 'user', 'guest']

  /**
   * List of expected permission properties from the client
   * Only used for OpenID
   */
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
    // Direct mapping for array-based permissions
    allowedLibraries: 'librariesAccessible',
    allowedTags: 'itemTagsSelected'
  }

  /**
   * Get a sample to show how a JSON for updatePermissionsFromExternalJSON should look like
   * Only used for OpenID
   *
   * @returns JSON string
   */
  static getSampleAbsPermissions(): string {
    // Start with a template object where all permissions are false for simplicity
    const samplePermissions = Object.keys(User.permissionMapping).reduce<Record<string, unknown>>((acc, key) => {
      // For array-based permissions, provide a sample array
      if (key === 'allowedLibraries') {
        acc[key] = ['5406ba8a-16e1-451d-96d7-4931b0a0d966', '918fd848-7c1d-4a02-818a-847435a879ca']
      } else if (key === 'allowedTags') {
        acc[key] = ['ExampleTag', 'AnotherTag', 'ThirdTag']
      } else {
        acc[key] = false
      }
      return acc
    }, {})

    return JSON.stringify(samplePermissions, null, 2) // Pretty print the JSON
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

  /**
   * Create root user
   */
  static async createRootUser(
    username: string,
    pash: string,
    auth: { generateAccessToken(user: { id: string; username: string }): string },
    transaction: Transaction | null = null
  ): Promise<User> {
    const userId = uuidv4()

    const token = auth.generateAccessToken({ id: userId, username })

    const newUser = {
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
    return (await this.create(newUser, { transaction: transaction || undefined })) as User
  }

  /**
   * Finds an existing user by OpenID subject identifier, or by email/username based on server settings
   * Returns null if no user is found
   */
  static async findUserFromOpenIdUserInfo(userinfo: OpenIdUserInfo): Promise<User | { error: string } | null> {
    let user = await this.getUserByOpenIDSub(userinfo.sub)

    // Matched by sub
    if (user) {
      Logger.debug(`[User] openid: User found by sub "${userinfo.sub}"`)
      return user
    }

    // Match existing user by email
    if (global.ServerSettings.authOpenIDMatchExistingBy === 'email') {
      if (userinfo.email) {
        // Only disallow when email_verified explicitly set to false (allow both if not set or true)
        if (userinfo.email_verified === false) {
          Logger.warn(`[User] openid: User not found and email "${userinfo.email}" is not verified`)
          return {
            error: 'Email not verified'
          }
        } else {
          Logger.info(`[User] openid: User not found, checking existing with email "${userinfo.email}"`)
          user = await this.getUserByEmail(userinfo.email)

          if (user?.authOpenIDSub) {
            Logger.warn(`[User] openid: User found with email "${userinfo.email}" but is already matched with sub "${user.authOpenIDSub}"`)
            // User is linked to a different OpenID subject; do not proceed.
            return {
              error: 'User already linked to a different OpenID subject'
            }
          }
        }
      } else {
        Logger.warn(`[User] openid: User not found and no email in userinfo`)
        // We deny login, because if the admin whishes to match email, it makes sense to require it
        return {
          error: 'No email in userinfo'
        }
      }
    } else if (global.ServerSettings.authOpenIDMatchExistingBy === 'username') {
      let username: string | undefined

      if (userinfo.preferred_username) {
        Logger.info(`[User] openid: User not found, checking existing with userinfo.preferred_username "${userinfo.preferred_username}"`)
        username = userinfo.preferred_username
      } else if (userinfo.username) {
        Logger.info(`[User] openid: User not found, checking existing with userinfo.username "${userinfo.username}"`)
        username = userinfo.username
      } else {
        Logger.warn(`[User] openid: User not found and neither preferred_username nor username in userinfo`)
        return {
          error: 'No username in userinfo'
        }
      }

      user = await this.getUserByUsername(username)

      if (user?.authOpenIDSub) {
        Logger.warn(`[User] openid: User found with username "${username}" but is already matched with sub "${user.authOpenIDSub}"`)
        // User is linked to a different OpenID subject; do not proceed.
        return {
          error: 'User already linked to a different OpenID subject'
        }
      }
    }

    if (!user) {
      return null
    }

    // Found existing user via email or username
    if (!user.isActive) {
      Logger.warn(`[User] openid: User found but is not active`)
      return user
    }

    // Update user with OpenID sub
    if (!user.extraData) user.extraData = {}
    user.extraData.authOpenIDSub = userinfo.sub
    user.changed('extraData', true)
    await user.save()

    Logger.debug(`[User] openid: User found by email/username`)
    return user
  }

  /**
   * Create user from openid userinfo
   */
  static async createUserFromOpenIdUserInfo(userinfo: OpenIdUserInfo): Promise<User | null> {
    const userId = uuidv4()
    // TODO: Ensure username is unique?
    const username = (userinfo.preferred_username || userinfo.name || userinfo.sub) as string
    const email = userinfo.email && userinfo.email_verified ? userinfo.email : null

    const token = TokenManager.generateAccessToken({ id: userId, username })

    const newUser = {
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
    const user = (await this.create(newUser)) as User

    if (user) {
      SocketAuthority.adminEmitter('user_added', user.toOldJSONForBrowser())
      return user
    }
    return null
  }

  /**
   * Get user by username case insensitive
   */
  static async getUserByUsername(username: string): Promise<User | null> {
    if (!username) return null

    const cachedUser = userCache.getByUsername(username)
    if (cachedUser) return cachedUser

    const user = (await this.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('username')), username.toLowerCase()),
      include: [this.sequelize!.models.mediaProgress]
    })) as User | null

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by email case insensitive
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    if (!email) return null

    const cachedUser = userCache.getByEmail(email)
    if (cachedUser) return cachedUser

    const user = (await this.findOne({
      where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), email.toLowerCase()),
      include: [this.sequelize!.models.mediaProgress]
    })) as User | null

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by id
   */
  static async getUserById(userId: string): Promise<User | null> {
    if (!userId) return null

    const cachedUser = userCache.getById(userId)
    if (cachedUser) return cachedUser

    const user = (await this.findByPk(userId, {
      include: [this.sequelize!.models.mediaProgress]
    })) as User | null

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by id or old id
   * JWT tokens generated before 2.3.0 used old user ids
   */
  static async getUserByIdOrOldId(userId: string): Promise<User | null> {
    if (!userId) return null
    const cachedUser = userCache.getById(userId) || userCache.getByOldId(userId)
    if (cachedUser) return cachedUser

    const user = (await this.findOne({
      where: {
        [Op.or]: [{ id: userId }, { 'extraData.oldUserId': userId }]
      },
      include: [this.sequelize!.models.mediaProgress]
    })) as User | null

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get user by openid sub
   */
  static async getUserByOpenIDSub(sub: string): Promise<User | null> {
    if (!sub) return null

    const cachedUser = userCache.getByOpenIDSub(sub)
    if (cachedUser) return cachedUser

    const user = (await this.findOne({
      where: sequelize.where(sequelize.literal(`extraData->>"authOpenIDSub"`), sub),
      include: [this.sequelize!.models.mediaProgress]
    })) as User | null

    if (user) userCache.set(user)

    return user
  }

  /**
   * Get array of user id and username
   */
  static async getMinifiedUserObjects(): Promise<Array<{ id: string; username: string }>> {
    const users = (await this.findAll({
      attributes: ['id', 'username']
    })) as User[]
    return users.map((u) => {
      return {
        id: u.id,
        username: u.username
      }
    })
  }

  /**
   * Return true if root user exists
   */
  static async getHasRootUser(): Promise<boolean> {
    const count = await this.count({
      where: {
        type: 'root'
      }
    })
    return count > 0
  }

  /**
   * Check if user exists with username
   */
  static async checkUserExistsWithUsername(username: string): Promise<boolean> {
    const count = await this.count({
      where: {
        username
      }
    })
    return count > 0
  }

  static mediaProgressRemoved(mediaProgress: { id: string; userId: string }): void {
    const cachedUser = userCache.getById(mediaProgress.userId)
    if (cachedUser) {
      Logger.debug(`[User] mediaProgressRemoved: ${mediaProgress.id} from user ${cachedUser.id}`)
      if (cachedUser.mediaProgresses) {
        cachedUser.mediaProgresses = cachedUser.mediaProgresses.filter((mp) => mp.id !== mediaProgress.id)
      }
    }
  }

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof User
  static override init(attributes: unknown, options: unknown): typeof User
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof User {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof User
    }
    const sequelizeInstance = sequelizeOrAttributes as Sequelize
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
        sequelize: sequelizeInstance,
        modelName: 'user',
        hooks: {
          beforeDestroy(user: User) {
            if (user.type === 'root') {
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
    return (this.extraData?.authOpenIDSub as string | undefined) || null
  }

  /**
   * User data for clients
   * Emitted on socket events user_online, user_offline and user_stream_update
   */
  toJSONForPublic(sessions?: Array<{ userId: string; toJSONForClient(): unknown }> | null): {
    id: string
    username: string
    type: string
    session: unknown
    lastSeen: number | null
    createdAt: number
  } {
    const session = sessions?.find((s) => s.userId === this.id)?.toJSONForClient() || null
    return {
      id: this.id,
      username: this.username,
      type: this.type,
      session,
      lastSeen: this.lastSeen ? this.lastSeen.valueOf() : null,
      createdAt: this.createdAt.valueOf()
    }
  }

  /**
   * User data for browser using old model
   */
  toOldJSONForBrowser(hideRootToken = false, minimal = false): Record<string, unknown> {
    const seriesHideFromContinueListening = (this.extraData?.seriesHideFromContinueListening as string[] | undefined) || []
    const librariesAccessible = (this.permissions?.librariesAccessible || []) as string[]
    const itemTagsSelected = (this.permissions?.itemTagsSelected || []) as string[]
    const permissions: Record<string, unknown> = { ...this.permissions }
    delete permissions.librariesAccessible
    delete permissions.itemTagsSelected

    const json: Record<string, unknown> = {
      id: this.id,
      username: this.username,
      email: this.email,
      type: this.type,
      // TODO: Old non-expiring token
      token: this.type === 'root' && hideRootToken ? '' : this.token,
      // TODO: Temporary flag not saved in db that is set in Auth.js jwtAuthCheck
      // Necessary to detect apps using old tokens that no longer match the old token stored on the user
      isOldToken: this.isOldToken,
      mediaProgress: this.mediaProgresses?.map((mp) => mp.getOldMediaProgress()) || [],
      seriesHideFromContinueListening: [...seriesHideFromContinueListening],
      bookmarks: this.bookmarks?.map((b) => ({ ...b })) || [],
      isActive: this.isActive,
      isLocked: this.isLocked,
      lastSeen: this.lastSeen ? this.lastSeen.valueOf() : null,
      createdAt: this.createdAt.valueOf(),
      permissions: permissions,
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

  /**
   * Check user has access to library
   */
  checkCanAccessLibrary(libraryId: string): boolean {
    if (this.permissions?.accessAllLibraries) return true
    if (!this.permissions?.librariesAccessible) return false
    return (this.permissions.librariesAccessible as string[]).includes(libraryId)
  }

  /**
   * Check user has access to library item with tags
   */
  checkCanAccessLibraryItemWithTags(tags?: string[] | null): boolean {
    if (this.permissions?.accessAllTags) return true
    const itemTagsSelected = (this.permissions?.itemTagsSelected || []) as string[]
    if (this.permissions?.selectedTagsNotAccessible) {
      if (!tags?.length) return true
      return tags.every((tag) => !itemTagsSelected.includes(tag))
    }
    if (!tags?.length) return false
    return itemTagsSelected.some((tag) => tags.includes(tag))
  }

  /**
   * Check user can access library item
   */
  checkCanAccessLibraryItem(libraryItem: LibraryItem): boolean {
    if (!this.checkCanAccessLibrary(libraryItem.libraryId)) return false

    const itemMedia = (libraryItem as unknown as { media?: { explicit?: boolean; metadata?: { explicit?: boolean }; tags?: string[] } }).media
    const libraryItemExplicit = !!itemMedia?.explicit || !!itemMedia?.metadata?.explicit

    if (libraryItemExplicit && !this.canAccessExplicitContent) return false

    return this.checkCanAccessLibraryItemWithTags(itemMedia?.tags)
  }

  /**
   * Get first available library id for user
   */
  getDefaultLibraryId(libraryIds: string[]): string | null {
    // Libraries should already be in ascending display order, find first accessible
    return libraryIds.find((lid) => this.checkCanAccessLibrary(lid)) || null
  }

  /**
   * Get media progress by media item id
   */
  getMediaProgress(mediaItemId: string): MediaProgress | null {
    if (!this.mediaProgresses?.length) return null
    return this.mediaProgresses.find((mp) => mp.mediaItemId === mediaItemId) || null
  }

  /**
   * Get old media progress
   * TODO: Update to new model
   */
  getOldMediaProgress(libraryItemId: string, episodeId: string | null = null): unknown {
    const mediaProgress = this.mediaProgresses?.find((mp) => {
      if (episodeId && mp.mediaItemId !== episodeId) return false
      return mp.extraData?.libraryItemId === libraryItemId
    })
    return mediaProgress?.getOldMediaProgress() || null
  }

  /**
   * TODO: Uses old model and should account for the different between ebook/audiobook progress
   */
  async createUpdateMediaProgressFromPayload(
    progressPayload: ProgressUpdatePayload
  ): Promise<{ mediaProgress: MediaProgress } | { error: string; statusCode: number }> {
    let mediaProgress: MediaProgress | null = null
    let mediaItemId: string | null = null
    let podcastId: string | null = null
    if (progressPayload.episodeId) {
      const podcastEpisode = (await this.sequelize!.models.podcastEpisode.findByPk(progressPayload.episodeId, {
        attributes: ['id', 'podcastId'],
        include: [
          {
            model: this.sequelize!.models.mediaProgress,
            where: { userId: this.id },
            required: false
          },
          {
            model: this.sequelize!.models.podcast,
            attributes: ['id', 'title'],
            include: [
              {
                model: this.sequelize!.models.libraryItem,
                attributes: ['id']
              }
            ]
          }
        ]
      })) as (PodcastEpisode & { mediaProgresses?: MediaProgress[] }) | null
      if (!podcastEpisode) {
        Logger.error(`[User] createUpdateMediaProgress: episode ${progressPayload.episodeId} not found`)
        return {
          error: 'Episode not found',
          statusCode: 404
        }
      }
      mediaItemId = podcastEpisode.id
      mediaProgress = podcastEpisode.mediaProgresses?.[0] || null
      podcastId = podcastEpisode.podcastId
    } else {
      const libraryItem = (await this.sequelize!.models.libraryItem.findByPk(progressPayload.libraryItemId as string, {
        attributes: ['id', 'mediaId', 'mediaType'],
        include: [
          {
            model: this.sequelize!.models.book,
            attributes: ['id', 'title'],
            required: false,
            include: [
              {
                model: this.sequelize!.models.mediaProgress,
                where: { userId: this.id },
                required: false
              }
            ]
          }
        ]
      })) as (LibraryItem & { book?: Book & { mediaProgresses?: MediaProgress[] } }) | null
      if (!libraryItem) {
        Logger.error(`[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} not found`)
        return {
          error: 'Library item not found',
          statusCode: 404
        }
      } else if (libraryItem.mediaType !== 'book') {
        Logger.error(`[User] createUpdateMediaProgress: library item ${progressPayload.libraryItemId} is not a book`)
        return {
          error: 'Library item is not a book',
          statusCode: 400
        }
      }

      const media = (libraryItem.media || libraryItem.book) as (Book & { mediaProgresses?: MediaProgress[] }) | undefined
      mediaItemId = media ? media.id : null
      mediaProgress = media?.mediaProgresses?.[0] || null
    }

    if (!this.mediaProgresses) {
      this.mediaProgresses = []
    }

    if (mediaProgress) {
      mediaProgress = await mediaProgress.applyProgressUpdate(progressPayload)
      this.mediaProgresses = this.mediaProgresses.map((mp) => (mp.id === mediaProgress!.id ? mediaProgress! : mp))
    } else {
      const newMediaProgressPayload: Record<string, unknown> = {
        userId: this.id,
        mediaItemId,
        podcastId,
        mediaItemType: progressPayload.episodeId ? 'podcastEpisode' : 'book',
        duration: isNullOrNaN(progressPayload.duration) ? 0 : Number(progressPayload.duration),
        currentTime: isNullOrNaN(progressPayload.currentTime) ? 0 : Number(progressPayload.currentTime),
        isFinished: !!progressPayload.isFinished,
        hideFromContinueListening: !!progressPayload.hideFromContinueListening,
        ebookLocation: progressPayload.ebookLocation || null,
        ebookProgress: isNullOrNaN(progressPayload.ebookProgress) ? 0 : Number(progressPayload.ebookProgress),
        finishedAt: progressPayload.finishedAt || null,
        createdAt: progressPayload.createdAt || new Date(),
        extraData: {
          libraryItemId: progressPayload.libraryItemId,
          progress: isNullOrNaN(progressPayload.progress) ? 0 : Number(progressPayload.progress)
        }
      }
      if (newMediaProgressPayload.isFinished) {
        newMediaProgressPayload.finishedAt = newMediaProgressPayload.finishedAt || new Date()
        ;(newMediaProgressPayload.extraData as { progress: number }).progress = 1
      } else {
        newMediaProgressPayload.finishedAt = null
      }
      mediaProgress = (await this.sequelize!.models.mediaProgress.create(newMediaProgressPayload)) as MediaProgress
      this.mediaProgresses.push(mediaProgress)
    }
    userCache.maybeInvalidate(this)
    return {
      mediaProgress
    }
  }

  /**
   * Find bookmark
   * TODO: Bookmarks should use mediaItemId instead of libraryItemId to support podcast episodes
   */
  findBookmark(libraryItemId: string, time: number): AudioBookmarkObject | null {
    return this.bookmarks?.find((bm) => bm.libraryItemId === libraryItemId && Number(bm.time) === Number(time)) || null
  }

  /**
   * Create bookmark
   */
  async createBookmark(libraryItemId: string, time: number, title: string): Promise<AudioBookmarkObject> {
    if (!this.bookmarks) this.bookmarks = []
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
    this.bookmarks.push(newBookmark)
    this.changed('bookmarks', true)
    await this.save()
    return newBookmark
  }

  /**
   * Update bookmark
   */
  async updateBookmark(libraryItemId: string, time: number, title: string): Promise<AudioBookmarkObject | null> {
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

  /**
   * Remove bookmark
   *
   * @returns true if bookmark was removed
   */
  async removeBookmark(libraryItemId: string, time: number): Promise<boolean> {
    if (!this.findBookmark(libraryItemId, time)) {
      Logger.error(`[User] removeBookmark not found`)
      return false
    }
    this.bookmarks = (this.bookmarks || []).filter((bm) => bm.libraryItemId !== libraryItemId || Number(bm.time) !== Number(time))
    this.changed('bookmarks', true)
    await this.save()
    return true
  }

  async addSeriesToHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    const seriesHideFromContinueListening = (this.extraData.seriesHideFromContinueListening as string[] | undefined) || []
    if (seriesHideFromContinueListening.includes(seriesId)) return false
    seriesHideFromContinueListening.push(seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHideFromContinueListening
    this.changed('extraData', true)
    await this.save()
    return true
  }

  async removeSeriesFromHideFromContinueListening(seriesId: string): Promise<boolean> {
    if (!this.extraData) this.extraData = {}
    let seriesHideFromContinueListening = (this.extraData.seriesHideFromContinueListening as string[] | undefined) || []
    if (!seriesHideFromContinueListening.includes(seriesId)) return false
    seriesHideFromContinueListening = seriesHideFromContinueListening.filter((sid) => sid !== seriesId)
    this.extraData.seriesHideFromContinueListening = seriesHideFromContinueListening
    this.changed('extraData', true)
    await this.save()
    return true
  }

  /**
   * Update user permissions from external JSON
   *
   * @param absPermissions JSON containing user permissions
   * @returns true if updates were made
   */
  async updatePermissionsFromExternalJSON(absPermissions: Record<string, unknown>): Promise<boolean> {
    if (!this.permissions) this.permissions = {}
    let hasUpdates = false

    // Map the boolean permissions from absPermissions
    Object.keys(absPermissions).forEach((absKey) => {
      const userPermKey = User.permissionMapping[absKey]
      if (!userPermKey) {
        throw new Error(`Unexpected permission property: ${absKey}`)
      }

      if (!['librariesAccessible', 'itemTagsSelected'].includes(userPermKey)) {
        if (this.permissions[userPermKey] !== !!absPermissions[absKey]) {
          this.permissions[userPermKey] = !!absPermissions[absKey]
          hasUpdates = true
        }
      }
    })

    // Handle allowedLibraries
    const librariesAccessible = (this.permissions.librariesAccessible || []) as string[]
    const allowedLibraries = absPermissions.allowedLibraries as string[] | undefined
    if (this.permissions.accessAllLibraries) {
      if (librariesAccessible.length) {
        this.permissions.librariesAccessible = []
        hasUpdates = true
      }
    } else if (allowedLibraries?.length && allowedLibraries.join(',') !== librariesAccessible.join(',')) {
      if (allowedLibraries.some((lid) => typeof lid !== 'string')) {
        throw new Error('Invalid permission property "allowedLibraries", expecting array of strings')
      }
      this.permissions.librariesAccessible = allowedLibraries
      hasUpdates = true
    }

    // Handle allowedTags
    const itemTagsSelected = (this.permissions.itemTagsSelected || []) as string[]
    const allowedTags = absPermissions.allowedTags as string[] | undefined
    if (this.permissions.accessAllTags) {
      if (itemTagsSelected.length) {
        this.permissions.itemTagsSelected = []
        hasUpdates = true
      }
    } else if (allowedTags?.length && allowedTags.join(',') !== itemTagsSelected.join(',')) {
      if (allowedTags.some((tag) => typeof tag !== 'string')) {
        throw new Error('Invalid permission property "allowedTags", expecting array of strings')
      }
      this.permissions.itemTagsSelected = allowedTags
      hasUpdates = true
    }

    if (hasUpdates) {
      this.changed('permissions', true)
      await this.save()
    }

    return hasUpdates
  }

  override async update(values: Record<string, unknown>, options?: unknown): Promise<this> {
    userCache.maybeInvalidate(this)
    return await super.update(values as never, options as never)
  }

  override async save(options?: unknown): Promise<this> {
    userCache.maybeInvalidate(this)
    return await super.save(options as never)
  }

  override async destroy(options?: unknown): Promise<void> {
    userCache.delete(this.id)
    await super.destroy(options as never)
  }
}

export = User
