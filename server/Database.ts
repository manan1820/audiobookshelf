import Path from 'path'
import { Sequelize, Op, QueryTypes, Transaction, type WhereOptions } from 'sequelize'

import packageJson from '../package.json'
import fs from './libs/fsExtra'
import Logger from './Logger'

import dbMigration, { type MigrationDatabaseModels } from './utils/migrations/dbMigration'
import type Auth from './Auth'
import MigrationManager from './managers/MigrationManager'

import type { DatabaseModels } from './types/models'
import type { LibraryFilterDataStore } from './types/queries'
import type { TextSearchQuery } from './types/common'
import type ServerSettings from './objects/settings/ServerSettings'
import type NotificationSettings from './objects/settings/NotificationSettings'
import type EmailSettings from './objects/settings/EmailSettings'
import type oldPlaybackSession from './objects/PlaybackSession'
import type { SettingValueObject } from './types'

// Statically import all 25 models
import User from './models/User'
import Session from './models/Session'
import ApiKey from './models/ApiKey'
import Library from './models/Library'
import LibraryFolder from './models/LibraryFolder'
import Book from './models/Book'
import Podcast from './models/Podcast'
import PodcastEpisode from './models/PodcastEpisode'
import LibraryItem from './models/LibraryItem'
import MediaProgress from './models/MediaProgress'
import Series from './models/Series'
import BookSeries from './models/BookSeries'
import Author from './models/Author'
import BookAuthor from './models/BookAuthor'
import Collection from './models/Collection'
import CollectionBook from './models/CollectionBook'
import Playlist from './models/Playlist'
import PlaylistMediaItem from './models/PlaylistMediaItem'
import Device from './models/Device'
import PlaybackSession, { type PlaybackSessionAttributes } from './models/PlaybackSession'
import Feed from './models/Feed'
import FeedEpisode from './models/FeedEpisode'
import Setting from './models/Setting'
import CustomMetadataProvider from './models/CustomMetadataProvider'
import MediaItemShare from './models/MediaItemShare'

interface ConnectionWithLoadExtension {
  loadExtension: (path: string, callback: (err?: Error | null) => void) => void
}

function hasLoadExtension(conn: unknown): conn is ConnectionWithLoadExtension {
  return typeof conn === 'object' && conn !== null && 'loadExtension' in conn && typeof (conn as ConnectionWithLoadExtension).loadExtension === 'function'
}

interface SequelizeWithDialect extends Sequelize {
  dialect: {
    connectionManager: {
      getConnection(): Promise<unknown>
    }
  }
  uppercaseFirst?: (str?: string) => string
}

interface DuplicateMediaProgressRow {
  id: string
  mediaItemId: string
}

class TextSearchQueryImpl implements TextSearchQuery {
  sequelize: Sequelize
  supportsUnaccent: boolean
  query: string
  hasAccents: boolean

  constructor(sequelize: Sequelize, supportsUnaccent: boolean, query: string) {
    this.sequelize = sequelize
    this.supportsUnaccent = supportsUnaccent
    this.query = query
    this.hasAccents = false
  }

  normalize(value: string): string {
    return `unaccent(${value})`
  }

  async init(): Promise<void> {
    if (!this.supportsUnaccent) return
    const escapedQuery = this.sequelize.escape(this.query)
    const normalizedQueryExpression = this.normalize(escapedQuery)
    const normalizedQueryResult = await this.sequelize.query<{ normalized_query: string }>(
      `SELECT ${normalizedQueryExpression} as normalized_query`,
      { type: QueryTypes.SELECT }
    )
    const normalizedQuery = normalizedQueryResult?.[0]?.normalized_query ?? ''
    this.hasAccents = escapedQuery !== this.sequelize.escape(normalizedQuery)
  }

  matchExpression(column: string): string {
    const pattern = this.sequelize.escape(`%${this.query}%`)
    if (!this.supportsUnaccent) return `${column} LIKE ${pattern}`
    const normalizedColumn = this.hasAccents ? column : this.normalize(column)
    return `${normalizedColumn} LIKE ${pattern}`
  }
}

class Database implements DatabaseModels {
  sequelize: Sequelize | null
  dbPath: string | null
  isNew: boolean
  hasRootUser: boolean

  settings: SettingValueObject[]
  libraryFilterData: LibraryFilterDataStore

  serverSettings: ServerSettings | null
  notificationSettings: NotificationSettings | null
  emailSettings: EmailSettings | null

  supportsUnaccent: boolean
  supportsUnicodeFoldings: boolean

  TextSearchQuery = TextSearchQueryImpl

  constructor() {
    this.sequelize = null
    this.dbPath = null
    this.isNew = false
    this.hasRootUser = false

    this.settings = []
    this.libraryFilterData = {}

    this.serverSettings = null
    this.notificationSettings = null
    this.emailSettings = null

    this.supportsUnaccent = false
    this.supportsUnicodeFoldings = false
  }

  get models() {
    return this.sequelize?.models || {}
  }

  get userModel(): typeof User {
    return User
  }

  get sessionModel(): typeof Session {
    return Session
  }

  get apiKeyModel(): typeof ApiKey {
    return ApiKey
  }

  get libraryModel(): typeof Library {
    return Library
  }

  get libraryFolderModel(): typeof LibraryFolder {
    return LibraryFolder
  }

  get authorModel(): typeof Author {
    return Author
  }

  get seriesModel(): typeof Series {
    return Series
  }

  get bookModel(): typeof Book {
    return Book
  }

  get bookSeriesModel(): typeof BookSeries {
    return BookSeries
  }

  get bookAuthorModel(): typeof BookAuthor {
    return BookAuthor
  }

  get podcastModel(): typeof Podcast {
    return Podcast
  }

  get podcastEpisodeModel(): typeof PodcastEpisode {
    return PodcastEpisode
  }

  get libraryItemModel(): typeof LibraryItem {
    return LibraryItem
  }

  get mediaProgressModel(): typeof MediaProgress {
    return MediaProgress
  }

  get collectionModel(): typeof Collection {
    return Collection
  }

  get collectionBookModel(): typeof CollectionBook {
    return CollectionBook
  }

  get playlistModel(): typeof Playlist {
    return Playlist
  }

  get playlistMediaItemModel(): typeof PlaylistMediaItem {
    return PlaylistMediaItem
  }

  get feedModel(): typeof Feed {
    return Feed
  }

  get feedEpisodeModel(): typeof FeedEpisode {
    return FeedEpisode
  }

  get playbackSessionModel(): typeof PlaybackSession {
    return PlaybackSession
  }

  get customMetadataProviderModel(): typeof CustomMetadataProvider {
    return CustomMetadataProvider
  }

  get mediaItemShareModel(): typeof MediaItemShare {
    return MediaItemShare
  }

  get deviceModel(): typeof Device {
    return Device
  }

  get settingModel(): typeof Setting {
    return Setting
  }

  get migrationModels(): MigrationDatabaseModels {
    return {
      library: this.libraryModel,
      libraryFolder: this.libraryFolderModel,
      setting: this.settingModel,
      author: this.authorModel,
      series: this.seriesModel,
      libraryItem: this.libraryItemModel,
      book: this.bookModel,
      podcast: this.podcastModel,
      podcastEpisode: this.podcastEpisodeModel,
      bookAuthor: this.bookAuthorModel,
      bookSeries: this.bookSeriesModel,
      user: this.userModel,
      mediaProgress: this.mediaProgressModel,
      playbackSession: this.playbackSessionModel,
      device: this.deviceModel,
      collection: this.collectionModel,
      collectionBook: this.collectionBookModel,
      playlist: this.playlistModel,
      playlistMediaItem: this.playlistMediaItemModel,
      feed: this.feedModel,
      feedEpisode: this.feedEpisodeModel
    }
  }

  async checkHasDb(): Promise<boolean> {
    if (!this.dbPath) return false
    if (!(await fs.pathExists(this.dbPath))) {
      Logger.info(`[Database] absdatabase.sqlite not found at ${this.dbPath}`)
      return false
    }
    return true
  }

  async init(forceOrStorage: boolean | string = false, force = false): Promise<void> {
    if (typeof forceOrStorage === 'string') {
      this.dbPath = forceOrStorage
    } else {
      force = Boolean(forceOrStorage)
      this.dbPath = Path.join(global.ConfigPath || '', 'absdatabase.sqlite')
    }

    if (this.dbPath === ':memory:') {
      this.isNew = true
      if (!(await this.connect())) {
        throw new Error('Database connection failed')
      }
      await this.buildModels(force)
      if (this.sequelize) {
        Logger.info(`[Database] Db initialized with models:`, Object.keys(this.sequelize.models).join(', '))
      }
      return
    }

    // First check if this is a new database
    this.isNew = !(await this.checkHasDb()) || force

    if (!(await this.connect())) {
      throw new Error('Database connection failed')
    }

    if (!this.sequelize) throw new Error('Sequelize not initialized')

    try {
      const migrationManager = new MigrationManager(this.sequelize, this.isNew, global.ConfigPath)
      await migrationManager.init(packageJson.version)
      await migrationManager.runMigrations()
    } catch (error) {
      Logger.error(`[Database] Failed to run migrations`, error)
      throw new Error('Database migration failed')
    }

    await this.buildModels(force)
    Logger.info(`[Database] Db initialized with models:`, Object.keys(this.sequelize.models).join(', '))

    await this.addTriggers()

    await this.loadData()

    Logger.info(`[Database] running ANALYZE`)
    await this.sequelize.query('ANALYZE')
    Logger.info(`[Database] ANALYZE completed`)
  }

  async connect(): Promise<boolean> {
    Logger.info(`[Database] Initializing db at "${this.dbPath}"`)

    let logging: boolean | ((query: string, time?: number) => void) = false
    let benchmark = false
    if (process.env.QUERY_LOGGING === 'log') {
      Logger.info(`[Database] Query logging enabled`)
      logging = (query: string) => Logger.debug(`Running the following query:\n ${query}`)
    } else if (process.env.QUERY_LOGGING === 'benchmark') {
      Logger.info(`[Database] Query benchmarking enabled`)
      logging = (query: string, time?: number) => Logger.debug(`Ran the following query in ${time}ms:\n ${query}`)
      benchmark = true
    }

    this.sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: this.dbPath || undefined,
      logging,
      benchmark,
      transactionType: Transaction.TYPES.IMMEDIATE
    })

    const seqWithUppercase = this.sequelize as SequelizeWithDialect
    seqWithUppercase.uppercaseFirst = (str?: string) => (str ? `${str[0].toUpperCase()}${str.substring(1)}` : '')

    try {
      await this.sequelize.authenticate()

      const allowedPragmas = [
        { name: 'mmap_size', env: 'SQLITE_MMAP_SIZE' },
        { name: 'cache_size', env: 'SQLITE_CACHE_SIZE' },
        { name: 'temp_store', env: 'SQLITE_TEMP_STORE' }
      ]

      for (const pragma of allowedPragmas) {
        const value = process.env[pragma.env]
        if (value !== undefined) {
          try {
            Logger.info(`[Database] Running "PRAGMA ${pragma.name} = ${value}"`)
            await this.sequelize.query(`PRAGMA ${pragma.name} = ${value}`)
            const [result] = await this.sequelize.query(`PRAGMA ${pragma.name}`)
            Logger.debug(`[Database] "PRAGMA ${pragma.name}" query result:`, result)
          } catch (error) {
            Logger.error(`[Database] Failed to set SQLite pragma ${pragma.name}`, error)
          }
        }
      }

      if (process.env.NUSQLITE3_PATH) {
        await this.loadExtension(process.env.NUSQLITE3_PATH)
        Logger.info(`[Database] Db supports unaccent and unicode foldings`)
        this.supportsUnaccent = true
        this.supportsUnicodeFoldings = true
      }
      Logger.info(`[Database] Db connection was successful`)
      return true
    } catch (error) {
      Logger.error(`[Database] Failed to connect to db`, error)
      return false
    }
  }

  async loadExtension(extension: string): Promise<void> {
    if (!this.sequelize) throw new Error('Database not connected')
    const seqWithDialect = this.sequelize as SequelizeWithDialect
    const db = await seqWithDialect.dialect.connectionManager.getConnection()
    if (!hasLoadExtension(db)) throw new Error('Failed to get db connection for loading extensions')

    Logger.info(`[Database] Loading extension ${extension}`)
    await new Promise<void>((resolve, reject) => {
      db.loadExtension(extension, (err?: Error | null) => {
        if (err) {
          Logger.error(`[Database] Failed to load extension ${extension}`, err)
          reject(err)
          return
        }
        Logger.info(`[Database] Successfully loaded extension ${extension}`)
        resolve()
      })
    })
  }

  async disconnect(): Promise<void> {
    Logger.info(`[Database] Disconnecting sqlite db`)
    if (this.sequelize) {
      await this.sequelize.close()
    }
  }

  async reconnect(): Promise<void> {
    Logger.info(`[Database] Reconnecting sqlite db`)
    await this.init()
  }

  buildModels(force = false): Promise<Sequelize> {
    if (!this.sequelize) throw new Error('Database not connected')

    User.initModel(this.sequelize)
    Session.initModel(this.sequelize)
    ApiKey.initModel(this.sequelize)
    Library.initModel(this.sequelize)
    LibraryFolder.initModel(this.sequelize)
    Book.initModel(this.sequelize)
    Podcast.initModel(this.sequelize)
    PodcastEpisode.initModel(this.sequelize)
    LibraryItem.initModel(this.sequelize)
    MediaProgress.initModel(this.sequelize)
    Series.initModel(this.sequelize)
    BookSeries.initModel(this.sequelize)
    Author.initModel(this.sequelize)
    BookAuthor.initModel(this.sequelize)
    Collection.initModel(this.sequelize)
    CollectionBook.initModel(this.sequelize)
    Playlist.initModel(this.sequelize)
    PlaylistMediaItem.initModel(this.sequelize)
    Device.initModel(this.sequelize)
    PlaybackSession.initModel(this.sequelize)
    Feed.initModel(this.sequelize)
    FeedEpisode.initModel(this.sequelize)
    Setting.initModel(this.sequelize)
    CustomMetadataProvider.initModel(this.sequelize)
    MediaItemShare.initModel(this.sequelize)

    this.initAssociations()

    return this.sequelize.sync({ force, alter: false })
  }

  initAssociations(): void {
    if (User && Device) {
      User.hasMany(Device, {
        onDelete: 'CASCADE'
      })
      Device.belongsTo(User)
    }

    if (User && Session) {
      User.hasMany(Session, {
        onDelete: 'CASCADE',
        foreignKey: {
          allowNull: false
        }
      })
      Session.belongsTo(User)
    }

    if (User && ApiKey) {
      User.hasMany(ApiKey, {
        onDelete: 'CASCADE'
      })
      ApiKey.belongsTo(User)

      User.hasMany(ApiKey, {
        foreignKey: 'createdByUserId',
        onDelete: 'SET NULL'
      })
      ApiKey.belongsTo(User, { as: 'createdByUser', foreignKey: 'createdByUserId' })
    }

    if (User && MediaItemShare) {
      User.hasMany(MediaItemShare)
      MediaItemShare.belongsTo(User)
    }

    if (Book && MediaItemShare) {
      Book.hasMany(MediaItemShare, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'book'
        }
      })
      MediaItemShare.belongsTo(Book, { foreignKey: 'mediaItemId', constraints: false })
    }

    if (PodcastEpisode && MediaItemShare) {
      PodcastEpisode.hasOne(MediaItemShare, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'podcastEpisode'
        }
      })
      MediaItemShare.belongsTo(PodcastEpisode, { foreignKey: 'mediaItemId', constraints: false })
    }

    if (Library && Collection) {
      Library.hasMany(Collection)
      Collection.belongsTo(Library)
    }

    if (Book && Collection && CollectionBook) {
      Book.belongsToMany(Collection, { through: CollectionBook })
      Collection.belongsToMany(Book, { through: CollectionBook })
      Book.hasMany(CollectionBook, {
        foreignKey: 'bookId',
        onDelete: 'CASCADE'
      })
      CollectionBook.belongsTo(Book)
      Collection.hasMany(CollectionBook, {
        foreignKey: 'collectionId',
        onDelete: 'CASCADE'
      })
      CollectionBook.belongsTo(Collection)
    }

    if (Library && Playlist) {
      Library.hasMany(Playlist)
      Playlist.belongsTo(Library)
    }

    if (User && Playlist) {
      User.hasMany(Playlist, {
        onDelete: 'CASCADE'
      })
      Playlist.belongsTo(User)
    }

    if (Playlist && PlaylistMediaItem) {
      Playlist.hasMany(PlaylistMediaItem, {
        onDelete: 'CASCADE'
      })
      PlaylistMediaItem.belongsTo(Playlist)
    }

    if (Book && PlaylistMediaItem) {
      Book.hasMany(PlaylistMediaItem, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'book'
        }
      })
      PlaylistMediaItem.belongsTo(Book, { foreignKey: 'mediaItemId', constraints: false })
    }

    if (PodcastEpisode && PlaylistMediaItem) {
      PodcastEpisode.hasOne(PlaylistMediaItem, {
        foreignKey: 'mediaItemId',
        constraints: false,
        scope: {
          mediaItemType: 'podcastEpisode'
        }
      })
      PlaylistMediaItem.belongsTo(PodcastEpisode, { foreignKey: 'mediaItemId', constraints: false })
    }
  }

  compareVersions(v1: string, v2?: string | null): number {
    if (!v1 || !v2) return 0
    return v1.localeCompare(v2, undefined, { numeric: true, sensitivity: 'case', caseFirst: 'upper' })
  }

  async loadData(): Promise<void> {
    if (this.isNew && (await dbMigration.checkShouldMigrate())) {
      Logger.info(`[Database] New database was created and old database was detected - migrating old to new`)
      await dbMigration.migrate(this.migrationModels)
    }

    const settingsData = await Setting.getOldSettings()
    this.settings = settingsData.settings
    this.emailSettings = settingsData.emailSettings
    this.serverSettings = settingsData.serverSettings
    this.notificationSettings = settingsData.notificationSettings
    global.ServerSettings = this.serverSettings.toJSON()

    // Version specific migrations
    if (this.serverSettings) {
      if (packageJson.version !== this.serverSettings.version) {
        if (this.serverSettings.version === '2.3.0' && this.compareVersions(packageJson.version, '2.3.0') === 1) {
          await dbMigration.migrationPatch(this)
        }
        if (this.serverSettings.version && ['2.3.0', '2.3.1', '2.3.2', '2.3.3'].includes(this.serverSettings.version) && this.compareVersions(packageJson.version, '2.3.3') >= 0) {
          await dbMigration.migrationPatch2(this)
        }
      }
      // Build migrations
      if (this.serverSettings.buildNumber <= 0) {
        const absMetadataMigration = require('./utils/migrations/absMetadataMigration')
        await absMetadataMigration.migrate(this)
      }
    }

    await this.cleanDatabase()

    this.hasRootUser = await User.getHasRootUser()

    let updateServerSettings = false
    if (this.serverSettings) {
      if (packageJson.version !== this.serverSettings.version) {
        Logger.info(`[Database] Server upgrade detected from ${this.serverSettings.version} to ${packageJson.version}`)
        this.serverSettings.version = packageJson.version
        this.serverSettings.buildNumber = packageJson.buildNumber
        updateServerSettings = true
      } else if (packageJson.buildNumber !== this.serverSettings.buildNumber) {
        Logger.info(`[Database] Server v${packageJson.version} build upgraded from ${this.serverSettings.buildNumber} to ${packageJson.buildNumber}`)
        this.serverSettings.buildNumber = packageJson.buildNumber
        updateServerSettings = true
      }
      if (updateServerSettings) {
        await this.updateServerSettings()
      }
    }
  }

  async createRootUser(username: string, pash: string, auth: Auth): Promise<boolean> {
    if (!this.sequelize) return false
    await User.createRootUser(username, pash, auth)
    this.hasRootUser = true
    return true
  }

  updateServerSettings(): Promise<[Setting, boolean | null]> | false {
    if (!this.sequelize || !this.serverSettings) return false
    global.ServerSettings = this.serverSettings.toJSON()
    return this.updateSetting(this.serverSettings)
  }

  updateSetting(settings: ServerSettings | NotificationSettings | EmailSettings): Promise<[Setting, boolean | null]> | false {
    if (!this.sequelize) return false
    return Setting.updateSettingObj(settings.toJSON())
  }

  getPlaybackSessions(where: WhereOptions<PlaybackSessionAttributes> | null = null): Promise<oldPlaybackSession[]> | false {
    if (!this.sequelize) return false
    return PlaybackSession.getOldPlaybackSessions(where)
  }

  getPlaybackSession(sessionId: string): Promise<oldPlaybackSession | null> | false {
    if (!this.sequelize) return false
    return PlaybackSession.getById(sessionId)
  }

  createPlaybackSession(oldSession: Parameters<typeof PlaybackSession.createFromOld>[0]): Promise<[PlaybackSession, boolean | null]> | false {
    if (!this.sequelize) return false
    return PlaybackSession.createFromOld(oldSession)
  }

  updatePlaybackSession(oldSession: Parameters<typeof PlaybackSession.updateFromOld>[0]): Promise<[affectedCount: number]> | false {
    if (!this.sequelize) return false
    return PlaybackSession.updateFromOld(oldSession)
  }

  removePlaybackSession(sessionId: string): Promise<number> | false {
    if (!this.sequelize) return false
    return PlaybackSession.removeById(sessionId)
  }

  replaceTagInFilterData(oldTag: string, newTag: string): void {
    for (const libraryId in this.libraryFilterData) {
      const data = this.libraryFilterData[libraryId]
      if (!data) continue
      const currentTags = data.tags
      if (Array.isArray(currentTags)) {
        const indexOf = currentTags.findIndex((n) => n === oldTag)
        if (indexOf >= 0) {
          currentTags.splice(indexOf, 1, newTag)
        }
      } else if (currentTags instanceof Set) {
        if (currentTags.has(oldTag)) {
          currentTags.delete(oldTag)
          currentTags.add(newTag)
        }
      }
    }
  }

  removeTagFromFilterData(tag: string): void {
    for (const libraryId in this.libraryFilterData) {
      const data = this.libraryFilterData[libraryId]
      if (!data) continue
      const currentTags = data.tags
      if (Array.isArray(currentTags)) {
        data.tags = currentTags.filter((t) => t !== tag)
      } else if (currentTags instanceof Set) {
        currentTags.delete(tag)
      }
    }
  }

  addTagsToFilterData(libraryId: string, tags?: string[]): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !tags?.length) return
    const currentTags = data.tags
    if (Array.isArray(currentTags)) {
      tags.forEach((t) => {
        if (!currentTags.includes(t)) {
          currentTags.push(t)
        }
      })
    } else if (currentTags instanceof Set) {
      tags.forEach((t) => currentTags.add(t))
    }
  }

  replaceGenreInFilterData(oldGenre: string, newGenre: string): void {
    for (const libraryId in this.libraryFilterData) {
      const data = this.libraryFilterData[libraryId]
      if (!data) continue
      const currentGenres = data.genres
      if (Array.isArray(currentGenres)) {
        const indexOf = currentGenres.findIndex((n) => n === oldGenre)
        if (indexOf >= 0) {
          currentGenres.splice(indexOf, 1, newGenre)
        }
      } else if (currentGenres instanceof Set) {
        if (currentGenres.has(oldGenre)) {
          currentGenres.delete(oldGenre)
          currentGenres.add(newGenre)
        }
      }
    }
  }

  removeGenreFromFilterData(genre: string): void {
    for (const libraryId in this.libraryFilterData) {
      const data = this.libraryFilterData[libraryId]
      if (!data) continue
      const currentGenres = data.genres
      if (Array.isArray(currentGenres)) {
        data.genres = currentGenres.filter((g) => g !== genre)
      } else if (currentGenres instanceof Set) {
        currentGenres.delete(genre)
      }
    }
  }

  addGenresToFilterData(libraryId: string, genres?: string[]): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !genres?.length) return
    const currentGenres = data.genres
    if (Array.isArray(currentGenres)) {
      genres.forEach((g) => {
        if (!currentGenres.includes(g)) {
          currentGenres.push(g)
        }
      })
    } else if (currentGenres instanceof Set) {
      genres.forEach((g) => currentGenres.add(g))
    }
  }

  replaceNarratorInFilterData(libraryId: string, oldNarrator: string, newNarrator: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    const currentNarrators = data.narrators
    if (Array.isArray(currentNarrators)) {
      const indexOf = currentNarrators.findIndex((n) => n === oldNarrator)
      if (indexOf >= 0) {
        currentNarrators.splice(indexOf, 1, newNarrator)
      }
    } else if (currentNarrators instanceof Set) {
      if (currentNarrators.has(oldNarrator)) {
        currentNarrators.delete(oldNarrator)
        currentNarrators.add(newNarrator)
      }
    }
  }

  removeNarratorFromFilterData(libraryId: string, narrator: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    const currentNarrators = data.narrators
    if (Array.isArray(currentNarrators)) {
      data.narrators = currentNarrators.filter((n) => n !== narrator)
    } else if (currentNarrators instanceof Set) {
      currentNarrators.delete(narrator)
    }
  }

  addNarratorsToFilterData(libraryId: string, narrators?: string[]): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !narrators?.length) return
    const currentNarrators = data.narrators
    if (Array.isArray(currentNarrators)) {
      narrators.forEach((n) => {
        if (!currentNarrators.includes(n)) {
          currentNarrators.push(n)
        }
      })
    } else if (currentNarrators instanceof Set) {
      narrators.forEach((n) => currentNarrators.add(n))
    }
  }

  removeSeriesFromFilterData(libraryId: string, seriesId: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    data.series = data.series.filter((se) => se.id !== seriesId)
  }

  addSeriesToFilterData(libraryId: string, seriesName: string, seriesId: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    if (data.series.some((se) => se.id === seriesId)) return
    data.series.push({
      id: seriesId,
      name: seriesName
    })
  }

  removeAuthorFromFilterData(libraryId: string, authorId: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    data.authors = data.authors.filter((au) => au.id !== authorId)
  }

  addAuthorToFilterData(libraryId: string, authorName: string, authorId: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data) return
    if (data.authors.some((au) => au.id === authorId)) return
    data.authors.push({
      id: authorId,
      name: authorName
    })
  }

  addPublisherToFilterData(libraryId: string, publisher: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !publisher) return
    const publishers = data.publishers
    if (Array.isArray(publishers)) {
      if (!publishers.includes(publisher)) {
        publishers.push(publisher)
      }
    } else if (publishers instanceof Set) {
      publishers.add(publisher)
    }
  }

  addPublishedDecadeToFilterData(libraryId: string, decade: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !decade) return
    const publishedDecades = data.publishedDecades
    if (Array.isArray(publishedDecades)) {
      if (!publishedDecades.includes(decade)) {
        publishedDecades.push(decade)
      }
    } else if (publishedDecades instanceof Set) {
      publishedDecades.add(decade)
    }
  }

  addLanguageToFilterData(libraryId: string, language: string): void {
    const data = this.libraryFilterData[libraryId]
    if (!data || !language) return
    const languages = data.languages
    if (Array.isArray(languages)) {
      if (!languages.includes(language)) {
        languages.push(language)
      }
    } else if (languages instanceof Set) {
      languages.add(language)
    }
  }

  async checkAuthorExists(libraryId: string, authorId: string): Promise<boolean> {
    const data = this.libraryFilterData[libraryId]
    if (!data) {
      return this.authorModel.checkExistsById(authorId)
    }
    return data.authors.some((au) => au.id === authorId)
  }

  async checkSeriesExists(libraryId: string, seriesId: string): Promise<boolean> {
    const data = this.libraryFilterData[libraryId]
    if (!data) {
      return this.seriesModel.checkExistsById(seriesId)
    }
    return data.series.some((se) => se.id === seriesId)
  }

  async getAuthorIdByName(libraryId: string, authorName: string): Promise<string | null> {
    const data = this.libraryFilterData[libraryId]
    if (!data) {
      return (await this.authorModel.getByNameAndLibrary(authorName, libraryId))?.id || null
    }
    return data.authors.find((au) => au.name === authorName)?.id || null
  }

  async getSeriesIdByName(libraryId: string, seriesName: string): Promise<string | null> {
    const data = this.libraryFilterData[libraryId]
    if (!data) {
      return (await this.seriesModel.getByNameAndLibrary(seriesName, libraryId))?.id || null
    }
    return data.series.find((se) => se.name === seriesName)?.id || null
  }

  async resetLibraryIssuesFilterData(libraryId: string): Promise<void> {
    const data = this.libraryFilterData[libraryId]
    if (!data) return

    data.numIssues = await this.libraryItemModel.count({
      where: {
        libraryId,
        [Op.or]: [
          {
            isMissing: true
          },
          {
            isInvalid: true
          }
        ]
      }
    })
  }

  async cleanDatabase(): Promise<void> {
    if (!this.sequelize) return

    // Remove invalid Podcast records
    const podcastsWithNoLibraryItem = await this.podcastModel.findAll({
      include: [
        {
          model: this.libraryItemModel,
          required: false
        }
      ],
      where: { '$libraryItem.id$': null }
    })
    for (const podcast of podcastsWithNoLibraryItem) {
      Logger.warn(`Found podcast "${podcast.title}" with no libraryItem - removing it`)
      await podcast.destroy()
    }

    // Remove invalid Book records
    const booksWithNoLibraryItem = await this.bookModel.findAll({
      include: [
        {
          model: this.libraryItemModel,
          required: false
        }
      ],
      where: { '$libraryItem.id$': null }
    })
    for (const book of booksWithNoLibraryItem) {
      Logger.warn(`Found book "${book.title}" with no libraryItem - removing it`)
      await book.destroy()
    }

    // Remove invalid LibraryItem records
    const libraryItemsWithNoMedia = await this.libraryItemModel.findAll({
      include: [
        {
          model: this.bookModel,
          attributes: ['id']
        },
        {
          model: this.podcastModel,
          attributes: ['id']
        }
      ],
      where: {
        '$book.id$': null,
        '$podcast.id$': null
      }
    })
    for (const libraryItem of libraryItemsWithNoMedia) {
      Logger.warn(`Found libraryItem "${libraryItem.id}" with no media - removing it`)
      await libraryItem.destroy()
    }

    // Remove invalid PlaylistMediaItem records
    const playlistMediaItemsWithNoMediaItem = await this.playlistMediaItemModel.findAll({
      include: [
        {
          model: this.bookModel,
          attributes: ['id']
        },
        {
          model: this.podcastEpisodeModel,
          attributes: ['id']
        }
      ],
      where: {
        '$book.id$': null,
        '$podcastEpisode.id$': null
      }
    })
    for (const playlistMediaItem of playlistMediaItemsWithNoMediaItem) {
      Logger.warn(`Found playlistMediaItem with no book or podcastEpisode - removing it`)
      await playlistMediaItem.destroy()
    }

    // Remove invalid CollectionBook records
    const collectionBooksWithNoBook = await this.collectionBookModel.findAll({
      include: [
        {
          model: this.bookModel,
          required: false
        }
      ],
      where: { '$book.id$': null }
    })
    for (const collectionBook of collectionBooksWithNoBook) {
      Logger.warn(`Found collectionBook with no book - removing it`)
      await collectionBook.destroy()
    }

    // Remove empty series
    const emptySeries = await this.seriesModel.findAll({
      include: [
        {
          model: this.bookSeriesModel,
          required: false
        }
      ],
      where: { '$bookSeries.id$': null }
    })
    for (const series of emptySeries) {
      Logger.warn(`Found series "${series.name}" with no books - removing it`)
      await series.destroy()
    }

    // Remove playback sessions that were 3 seconds or less
    const badSessionsRemoved = await this.playbackSessionModel.destroy({
      where: {
        timeListening: {
          [Op.lte]: 3
        }
      }
    })
    if (badSessionsRemoved > 0) {
      Logger.warn(`Removed ${badSessionsRemoved} sessions that were 3 seconds or less`)
    }

    // Remove mediaProgresses with duplicate mediaItemId
    const [duplicateMediaProgresses] = await this.sequelize.query(`SELECT mp1.id, mp1.mediaItemId
FROM mediaProgresses mp1
WHERE EXISTS (
    SELECT 1
    FROM mediaProgresses mp2
    WHERE mp2.mediaItemId = mp1.mediaItemId
    AND mp2.userId = mp1.userId
    AND (
        mp2.updatedAt > mp1.updatedAt
        OR (mp2.updatedAt = mp1.updatedAt AND mp2.id < mp1.id)
    )
)`)
    for (const duplicateMediaProgress of (duplicateMediaProgresses as DuplicateMediaProgressRow[])) {
      Logger.warn(`Found duplicate mediaProgress for mediaItem "${duplicateMediaProgress.mediaItemId}" - removing it`)
      await this.mediaProgressModel.destroy({
        where: { id: duplicateMediaProgress.id }
      })
    }

    await this.cleanupExpiredSessions()
    await this.deactivateExpiredApiKeys()
  }

  async deactivateExpiredApiKeys(): Promise<void> {
    try {
      const affectedCount = await ApiKey.deactivateExpiredApiKeys()
      if (affectedCount > 0) {
        Logger.info(`[Database] Deactivated ${affectedCount} expired api keys`)
      }
    } catch (error) {
      const errorMsg = (error as Error).message || 'Unknown error'
      Logger.error(`[Database] Error deactivating expired api keys: ${errorMsg}`)
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    try {
      const deletedCount = await Session.cleanupExpiredSessions()
      if (deletedCount > 0) {
        Logger.info(`[Database] Cleaned up ${deletedCount} expired sessions`)
      }
    } catch (error) {
      const errorMsg = (error as Error).message || 'Unknown error'
      Logger.error(`[Database] Error cleaning up expired sessions: ${errorMsg}`)
    }
  }

  async createTextSearchQuery(query: string): Promise<TextSearchQueryImpl> {
    if (!this.sequelize) throw new Error('Database not connected')
    const textQuery = new this.TextSearchQuery(this.sequelize, this.supportsUnaccent, query)
    await textQuery.init()
    return textQuery
  }

  async addTriggers(): Promise<void> {
    await this.addTriggerIfNotExists('books', 'title', 'id', 'libraryItems', 'title', 'mediaId')
    await this.addTriggerIfNotExists('books', 'titleIgnorePrefix', 'id', 'libraryItems', 'titleIgnorePrefix', 'mediaId')
    await this.addTriggerIfNotExists('podcasts', 'title', 'id', 'libraryItems', 'title', 'mediaId')
    await this.addTriggerIfNotExists('podcasts', 'titleIgnorePrefix', 'id', 'libraryItems', 'titleIgnorePrefix', 'mediaId')
    await this.addAuthorNamesTriggersIfNotExist()
  }

  async addTriggerIfNotExists(
    sourceTable: string,
    sourceColumn: string,
    sourceIdColumn: string,
    targetTable: string,
    targetColumn: string,
    targetIdColumn: string
  ): Promise<void> {
    if (!this.sequelize) return
    const action = `update_${targetTable}_${targetColumn}`
    const fromSource = sourceTable === 'books' ? '' : `_from_${sourceTable}_${sourceColumn}`
    const triggerName = this.convertToSnakeCase(`${action}${fromSource}`)

    const [results] = await this.sequelize.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='trigger' AND name='${triggerName}'`,
      { type: QueryTypes.SELECT }
    )
    if (results && results.count > 0) return

    Logger.info(`[Database] Adding trigger ${triggerName}`)

    await this.sequelize.query(`
      CREATE TRIGGER ${triggerName}
        AFTER UPDATE OF ${sourceColumn} ON ${sourceTable}
        FOR EACH ROW
        BEGIN
          UPDATE ${targetTable}
            SET ${targetColumn} = NEW.${sourceColumn}
          WHERE ${targetTable}.${targetIdColumn} = NEW.${sourceIdColumn};
        END;
    `)
  }

  async addAuthorNamesTriggersIfNotExist(): Promise<void> {
    if (!this.sequelize) return
    const libraryItems = 'libraryItems'
    const bookAuthors = 'bookAuthors'
    const authors = 'authors'
    const columns = [
      { name: 'authorNamesFirstLast', source: `${authors}.name` },
      { name: 'authorNamesLastFirst', source: `${authors}.lastFirst` }
    ]
    const authorsSort = `${bookAuthors}.createdAt ASC`
    const columnNames = columns.map((column) => column.name).join(', ')
    const columnSourcesExpression = columns.map((column) => `GROUP_CONCAT(${column.source}, ', ' ORDER BY ${authorsSort})`).join(', ')
    const authorsJoin = `${authors} JOIN ${bookAuthors} ON ${authors}.id = ${bookAuthors}.authorId`

    const addBookAuthorsTriggerIfNotExists = async (action: string) => {
      if (!this.sequelize) return
      const modifiedRecord = action === 'delete' ? 'OLD' : 'NEW'
      const triggerName = this.convertToSnakeCase(`update_${libraryItems}_authorNames_on_${bookAuthors}_${action}`)
      const authorNamesSubQuery = `
        SELECT ${columnSourcesExpression}
        FROM ${authorsJoin}
        WHERE ${bookAuthors}.bookId = ${modifiedRecord}.bookId
      `
      const [result] = await this.sequelize.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='trigger' AND name='${triggerName}'`,
        { type: QueryTypes.SELECT }
      )
      if (result && result.count > 0) return

      Logger.info(`[Database] Adding trigger ${triggerName}`)

      await this.sequelize.query(`
        CREATE TRIGGER ${triggerName}
          AFTER ${action} ON ${bookAuthors}
          FOR EACH ROW
          BEGIN
            UPDATE ${libraryItems}
              SET (${columnNames}) = (${authorNamesSubQuery})
            WHERE mediaId = ${modifiedRecord}.bookId;
          END;
      `)
    }

    const addAuthorsUpdateTriggerIfNotExists = async () => {
      if (!this.sequelize) return
      const triggerName = this.convertToSnakeCase(`update_${libraryItems}_authorNames_on_authors_update`)
      const authorNamesSubQuery = `
        SELECT ${columnSourcesExpression}
        FROM ${authorsJoin}
        WHERE ${bookAuthors}.bookId = ${libraryItems}.mediaId
      `

      const [result] = await this.sequelize.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='trigger' AND name='${triggerName}'`,
        { type: QueryTypes.SELECT }
      )
      if (result && result.count > 0) return

      Logger.info(`[Database] Adding trigger ${triggerName}`)

      await this.sequelize.query(`
        CREATE TRIGGER ${triggerName}
          AFTER UPDATE OF name ON ${authors}
          FOR EACH ROW
          BEGIN
            UPDATE ${libraryItems}
              SET (${columnNames}) = (${authorNamesSubQuery})
            WHERE mediaId IN (SELECT bookId FROM ${bookAuthors} WHERE authorId = NEW.id);
        END;
      `)
    }

    await addBookAuthorsTriggerIfNotExists('insert')
    await addBookAuthorsTriggerIfNotExists('delete')
    await addAuthorsUpdateTriggerIfNotExists()
  }

  convertToSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase()
  }
}

const database = new Database()
export = database
