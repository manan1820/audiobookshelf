import Path from 'path'
import packageJson from '../../../package.json'
import { BookshelfView } from '../../utils/constants'
import Logger from '../../Logger'
import User from '../../models/User'
import { sanitize } from '../../utils/htmlSanitizer'
import type { ServerSettingsJsonObject, ServerSettingsClientObject } from '../../types'

const PATCHABLE_SETTINGS_KEYS = new Set<string>([
  'scannerParseSubtitle',
  'scannerFindCovers',
  'scannerCoverProvider',
  'scannerPreferMatchedMetadata',
  'scannerDisableWatcher',
  'storeCoverWithItem',
  'storeMetadataWithItem',
  'allowIframe',
  'allowedOrigins',
  'backupSchedule',
  'backupsToKeep',
  'maxBackupSize',
  'logLevel',
  'homeBookshelfView',
  'bookshelfView',
  'dateFormat',
  'timeFormat',
  'language',
  'chromecastEnabled',
  'sortingIgnorePrefix'
])

class ServerSettings {
  static patchableSettingsKeys = PATCHABLE_SETTINGS_KEYS

  id = 'server-settings'
  tokenSecret: string | null = null

  // Scanner
  scannerParseSubtitle = false
  scannerFindCovers = false
  scannerCoverProvider = 'google'
  scannerPreferMatchedMetadata = false
  scannerDisableWatcher = false

  // Metadata - choose to store inside users library item folder
  storeCoverWithItem = false
  storeMetadataWithItem = false
  metadataFileFormat = 'json'

  // Security/Rate limits
  rateLimitLoginRequests = 10
  rateLimitLoginWindow = 10 * 60 * 1000 // 10 Minutes
  allowIframe = false

  // Backups
  backupPath: string = Path.join(global.MetadataPath || '', 'backups')
  backupSchedule: string | boolean = false // If false then auto-backups are disabled
  backupsToKeep = 2
  maxBackupSize = 1

  // Logger
  loggerDailyLogsToKeep = 7
  loggerScannerLogsToKeep = 2

  // Bookshelf Display
  homeBookshelfView: number = BookshelfView.DETAIL
  bookshelfView: number = BookshelfView.DETAIL

  // Podcasts
  podcastEpisodeSchedule = '0 * * * *' // Every hour

  // Sorting
  sortingIgnorePrefix = false
  sortingPrefixes: string[] = ['the', 'a']

  // Misc Flags
  chromecastEnabled = false
  dateFormat = 'MM/dd/yyyy'
  timeFormat = 'HH:mm'
  language = 'en-us'
  allowedOrigins: string[] = []

  logLevel: number = Logger.logLevel

  version: string | null = packageJson.version
  buildNumber: number = (packageJson as { buildNumber?: number }).buildNumber || 0

  // Auth settings
  authLoginCustomMessage: string | null = null
  authActiveAuthMethods: string[] = ['local']

  // openid settings
  authOpenIDIssuerURL: string | null = null
  authOpenIDAuthorizationURL: string | null = null
  authOpenIDTokenURL: string | null = null
  authOpenIDUserInfoURL: string | null = null
  authOpenIDJwksURL: string | null = null
  authOpenIDLogoutURL: string | null = null
  authOpenIDClientID: string | null = null
  authOpenIDClientSecret: string | null = null
  authOpenIDTokenSigningAlgorithm = 'RS256'
  authOpenIDButtonText = 'Login with OpenId'
  authOpenIDAutoLaunch = false
  authOpenIDAutoRegister = false
  authOpenIDMatchExistingBy: string | null = null
  authOpenIDMobileRedirectURIs: string[] = ['audiobookshelf://oauth']
  authOpenIDGroupClaim = ''
  authOpenIDAdvancedPermsClaim = ''
  authOpenIDSubfolderForRedirectURLs: string | boolean | undefined = undefined

  constructor(settings?: Partial<ServerSettingsJsonObject> | null) {
    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: Partial<ServerSettingsJsonObject>): void {
    this.tokenSecret = settings.tokenSecret ?? null
    this.scannerFindCovers = Boolean(settings.scannerFindCovers)
    this.scannerCoverProvider = settings.scannerCoverProvider || 'google'
    this.scannerParseSubtitle = Boolean(settings.scannerParseSubtitle)
    this.scannerPreferMatchedMetadata = Boolean(settings.scannerPreferMatchedMetadata)
    this.scannerDisableWatcher = Boolean(settings.scannerDisableWatcher)

    this.storeCoverWithItem = Boolean(settings.storeCoverWithItem)
    this.storeMetadataWithItem = Boolean(settings.storeMetadataWithItem)
    this.metadataFileFormat = settings.metadataFileFormat || 'json'

    this.rateLimitLoginRequests =
      settings.rateLimitLoginRequests !== undefined && !isNaN(settings.rateLimitLoginRequests)
        ? Number(settings.rateLimitLoginRequests)
        : 10
    this.rateLimitLoginWindow =
      settings.rateLimitLoginWindow !== undefined && !isNaN(settings.rateLimitLoginWindow)
        ? Number(settings.rateLimitLoginWindow)
        : 10 * 60 * 1000
    this.allowIframe = Boolean(settings.allowIframe)

    this.backupPath = settings.backupPath || Path.join(global.MetadataPath || '', 'backups')
    this.backupSchedule = settings.backupSchedule || false
    this.backupsToKeep = settings.backupsToKeep || 2
    this.maxBackupSize = settings.maxBackupSize === 0 ? 0 : settings.maxBackupSize || 1

    this.loggerDailyLogsToKeep = settings.loggerDailyLogsToKeep || 7
    this.loggerScannerLogsToKeep = settings.loggerScannerLogsToKeep || 2

    this.homeBookshelfView = settings.homeBookshelfView || BookshelfView.STANDARD
    this.bookshelfView = settings.bookshelfView || BookshelfView.STANDARD

    this.sortingIgnorePrefix = Boolean(settings.sortingIgnorePrefix)
    this.sortingPrefixes = settings.sortingPrefixes ? [...settings.sortingPrefixes] : ['the']
    this.chromecastEnabled = Boolean(settings.chromecastEnabled)
    this.dateFormat = settings.dateFormat || 'MM/dd/yyyy'
    this.timeFormat = settings.timeFormat || 'HH:mm'
    this.language = settings.language || 'en-us'
    this.allowedOrigins = settings.allowedOrigins ? [...settings.allowedOrigins] : []
    this.logLevel = settings.logLevel || Logger.logLevel
    this.version = settings.version || null
    this.buildNumber = settings.buildNumber || 0

    this.authLoginCustomMessage = sanitize(settings.authLoginCustomMessage) || null
    this.authActiveAuthMethods = settings.authActiveAuthMethods ? [...settings.authActiveAuthMethods] : ['local']

    this.authOpenIDIssuerURL = settings.authOpenIDIssuerURL || null
    this.authOpenIDAuthorizationURL = settings.authOpenIDAuthorizationURL || null
    this.authOpenIDTokenURL = settings.authOpenIDTokenURL || null
    this.authOpenIDUserInfoURL = settings.authOpenIDUserInfoURL || null
    this.authOpenIDJwksURL = settings.authOpenIDJwksURL || null
    this.authOpenIDLogoutURL = settings.authOpenIDLogoutURL || null
    this.authOpenIDClientID = settings.authOpenIDClientID || null
    this.authOpenIDClientSecret = settings.authOpenIDClientSecret || null
    this.authOpenIDTokenSigningAlgorithm = settings.authOpenIDTokenSigningAlgorithm || 'RS256'
    this.authOpenIDButtonText = settings.authOpenIDButtonText || 'Login with OpenId'
    this.authOpenIDAutoLaunch = Boolean(settings.authOpenIDAutoLaunch)
    this.authOpenIDAutoRegister = Boolean(settings.authOpenIDAutoRegister)
    this.authOpenIDMatchExistingBy = settings.authOpenIDMatchExistingBy || null
    this.authOpenIDMobileRedirectURIs = settings.authOpenIDMobileRedirectURIs
      ? [...settings.authOpenIDMobileRedirectURIs]
      : ['audiobookshelf://oauth']
    this.authOpenIDGroupClaim = settings.authOpenIDGroupClaim || ''
    this.authOpenIDAdvancedPermsClaim = settings.authOpenIDAdvancedPermsClaim || ''
    this.authOpenIDSubfolderForRedirectURLs = settings.authOpenIDSubfolderForRedirectURLs

    if (!Array.isArray(this.authActiveAuthMethods)) {
      this.authActiveAuthMethods = ['local']
    }

    if (this.authActiveAuthMethods.includes('openid') && !this.isOpenIDAuthSettingsValid) {
      this.authActiveAuthMethods.splice(this.authActiveAuthMethods.indexOf('openid', 0), 1)
    }

    if (!Array.isArray(this.authActiveAuthMethods) || this.authActiveAuthMethods.length === 0) {
      this.authActiveAuthMethods = ['local']
    }

    // Migrations
    if (settings.storeCoverWithBook !== undefined) {
      this.storeCoverWithItem = Boolean(settings.storeCoverWithBook)
    }
    if (settings.storeMetadataWithBook !== undefined) {
      this.storeMetadataWithItem = Boolean(settings.storeMetadataWithBook)
    }
    if (settings.homeBookshelfView === undefined && settings.bookshelfView !== undefined) {
      this.homeBookshelfView = settings.bookshelfView
    }
    if (settings.metadataFileFormat === undefined) {
      this.metadataFileFormat = 'abs'
    }

    if (this.metadataFileFormat !== 'json') {
      Logger.warn(
        `[ServerSettings] Invalid metadataFileFormat ${this.metadataFileFormat} (as of v2.4.5 only json is supported)`
      )
      this.metadataFileFormat = 'json'
    }

    if (this.logLevel !== Logger.logLevel) {
      Logger.setLogLevel(this.logLevel)
    }

    if (process.env.BACKUP_PATH && this.backupPath !== process.env.BACKUP_PATH) {
      Logger.info(`[ServerSettings] Using backup path from environment variable ${process.env.BACKUP_PATH}`)
      this.backupPath = process.env.BACKUP_PATH
    }

    if (process.env.ALLOW_IFRAME === '1' && !this.allowIframe) {
      Logger.info(`[ServerSettings] Using allowIframe from environment variable`)
      this.allowIframe = true
    }
  }

  toJSON(): ServerSettingsJsonObject {
    return {
      id: this.id,
      tokenSecret: this.tokenSecret,
      scannerFindCovers: this.scannerFindCovers,
      scannerCoverProvider: this.scannerCoverProvider,
      scannerParseSubtitle: this.scannerParseSubtitle,
      scannerPreferMatchedMetadata: this.scannerPreferMatchedMetadata,
      scannerDisableWatcher: this.scannerDisableWatcher,
      storeCoverWithItem: this.storeCoverWithItem,
      storeMetadataWithItem: this.storeMetadataWithItem,
      metadataFileFormat: this.metadataFileFormat,
      rateLimitLoginRequests: this.rateLimitLoginRequests,
      rateLimitLoginWindow: this.rateLimitLoginWindow,
      allowIframe: this.allowIframe,
      backupPath: this.backupPath,
      backupSchedule: this.backupSchedule,
      backupsToKeep: this.backupsToKeep,
      maxBackupSize: this.maxBackupSize,
      loggerDailyLogsToKeep: this.loggerDailyLogsToKeep,
      loggerScannerLogsToKeep: this.loggerScannerLogsToKeep,
      homeBookshelfView: this.homeBookshelfView,
      bookshelfView: this.bookshelfView,
      podcastEpisodeSchedule: this.podcastEpisodeSchedule,
      sortingIgnorePrefix: this.sortingIgnorePrefix,
      sortingPrefixes: [...this.sortingPrefixes],
      chromecastEnabled: this.chromecastEnabled,
      dateFormat: this.dateFormat,
      timeFormat: this.timeFormat,
      language: this.language,
      allowedOrigins: [...this.allowedOrigins],
      logLevel: this.logLevel,
      version: this.version,
      buildNumber: this.buildNumber,
      authLoginCustomMessage: this.authLoginCustomMessage,
      authActiveAuthMethods: [...this.authActiveAuthMethods],
      authOpenIDIssuerURL: this.authOpenIDIssuerURL,
      authOpenIDAuthorizationURL: this.authOpenIDAuthorizationURL,
      authOpenIDTokenURL: this.authOpenIDTokenURL,
      authOpenIDUserInfoURL: this.authOpenIDUserInfoURL,
      authOpenIDJwksURL: this.authOpenIDJwksURL,
      authOpenIDLogoutURL: this.authOpenIDLogoutURL,
      authOpenIDClientID: this.authOpenIDClientID,
      authOpenIDClientSecret: this.authOpenIDClientSecret,
      authOpenIDTokenSigningAlgorithm: this.authOpenIDTokenSigningAlgorithm,
      authOpenIDButtonText: this.authOpenIDButtonText,
      authOpenIDAutoLaunch: this.authOpenIDAutoLaunch,
      authOpenIDAutoRegister: this.authOpenIDAutoRegister,
      authOpenIDMatchExistingBy: this.authOpenIDMatchExistingBy,
      authOpenIDMobileRedirectURIs: [...this.authOpenIDMobileRedirectURIs],
      authOpenIDGroupClaim: this.authOpenIDGroupClaim,
      authOpenIDAdvancedPermsClaim: this.authOpenIDAdvancedPermsClaim,
      authOpenIDSubfolderForRedirectURLs: this.authOpenIDSubfolderForRedirectURLs
    }
  }

  static getHostTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }

  toJSONForBrowser(): ServerSettingsClientObject {
    const json = this.toJSON()
    const {
      tokenSecret,
      authOpenIDClientID,
      authOpenIDClientSecret,
      authOpenIDMobileRedirectURIs,
      authOpenIDGroupClaim,
      authOpenIDAdvancedPermsClaim,
      ...browserJson
    } = json
    return {
      ...browserJson,
      timeZone: ServerSettings.getHostTimeZone()
    }
  }

  get supportedAuthMethods(): string[] {
    return ['local', 'openid']
  }

  get isOpenIDAuthSettingsValid(): boolean {
    return Boolean(
      this.authOpenIDIssuerURL &&
        this.authOpenIDAuthorizationURL &&
        this.authOpenIDTokenURL &&
        this.authOpenIDUserInfoURL &&
        this.authOpenIDJwksURL &&
        this.authOpenIDClientID &&
        this.authOpenIDClientSecret &&
        this.authOpenIDTokenSigningAlgorithm
    )
  }

  get authenticationSettings(): Record<string, string | boolean | string[] | null | undefined> {
    return {
      authLoginCustomMessage: this.authLoginCustomMessage,
      authActiveAuthMethods: this.authActiveAuthMethods,
      authOpenIDIssuerURL: this.authOpenIDIssuerURL,
      authOpenIDAuthorizationURL: this.authOpenIDAuthorizationURL,
      authOpenIDTokenURL: this.authOpenIDTokenURL,
      authOpenIDUserInfoURL: this.authOpenIDUserInfoURL,
      authOpenIDJwksURL: this.authOpenIDJwksURL,
      authOpenIDLogoutURL: this.authOpenIDLogoutURL,
      authOpenIDClientID: this.authOpenIDClientID,
      authOpenIDClientSecret: this.authOpenIDClientSecret,
      authOpenIDTokenSigningAlgorithm: this.authOpenIDTokenSigningAlgorithm,
      authOpenIDButtonText: this.authOpenIDButtonText,
      authOpenIDAutoLaunch: this.authOpenIDAutoLaunch,
      authOpenIDAutoRegister: this.authOpenIDAutoRegister,
      authOpenIDMatchExistingBy: this.authOpenIDMatchExistingBy,
      authOpenIDMobileRedirectURIs: this.authOpenIDMobileRedirectURIs,
      authOpenIDGroupClaim: this.authOpenIDGroupClaim,
      authOpenIDAdvancedPermsClaim: this.authOpenIDAdvancedPermsClaim,
      authOpenIDSubfolderForRedirectURLs: this.authOpenIDSubfolderForRedirectURLs,
      authOpenIDSamplePermissions: User.getSampleAbsPermissions()
    }
  }

  get authFormData(): {
    authLoginCustomMessage: string
    authOpenIDButtonText?: string
    authOpenIDAutoLaunch?: boolean
  } {
    const clientFormData: {
      authLoginCustomMessage: string
      authOpenIDButtonText?: string
      authOpenIDAutoLaunch?: boolean
    } = {
      authLoginCustomMessage: sanitize(this.authLoginCustomMessage)
    }
    if (this.authActiveAuthMethods.includes('openid')) {
      clientFormData.authOpenIDButtonText = this.authOpenIDButtonText
      clientFormData.authOpenIDAutoLaunch = this.authOpenIDAutoLaunch
    }
    return clientFormData
  }

  update(payload: Partial<ServerSettingsJsonObject>): boolean {
    let hasUpdates = false

    if (payload.logLevel !== undefined && this.logLevel !== payload.logLevel) {
      Logger.setLogLevel(payload.logLevel)
      this.logLevel = payload.logLevel
      hasUpdates = true
    }
    if (payload.scannerParseSubtitle !== undefined && this.scannerParseSubtitle !== payload.scannerParseSubtitle) {
      this.scannerParseSubtitle = Boolean(payload.scannerParseSubtitle)
      hasUpdates = true
    }
    if (payload.scannerFindCovers !== undefined && this.scannerFindCovers !== payload.scannerFindCovers) {
      this.scannerFindCovers = Boolean(payload.scannerFindCovers)
      hasUpdates = true
    }
    if (payload.scannerCoverProvider !== undefined && this.scannerCoverProvider !== payload.scannerCoverProvider) {
      this.scannerCoverProvider = payload.scannerCoverProvider
      hasUpdates = true
    }
    if (payload.scannerPreferMatchedMetadata !== undefined && this.scannerPreferMatchedMetadata !== payload.scannerPreferMatchedMetadata) {
      this.scannerPreferMatchedMetadata = Boolean(payload.scannerPreferMatchedMetadata)
      hasUpdates = true
    }
    if (payload.scannerDisableWatcher !== undefined && this.scannerDisableWatcher !== payload.scannerDisableWatcher) {
      this.scannerDisableWatcher = Boolean(payload.scannerDisableWatcher)
      hasUpdates = true
    }
    if (payload.storeCoverWithItem !== undefined && this.storeCoverWithItem !== payload.storeCoverWithItem) {
      this.storeCoverWithItem = Boolean(payload.storeCoverWithItem)
      hasUpdates = true
    }
    if (payload.storeMetadataWithItem !== undefined && this.storeMetadataWithItem !== payload.storeMetadataWithItem) {
      this.storeMetadataWithItem = Boolean(payload.storeMetadataWithItem)
      hasUpdates = true
    }
    if (payload.allowIframe !== undefined && this.allowIframe !== payload.allowIframe) {
      this.allowIframe = Boolean(payload.allowIframe)
      hasUpdates = true
    }
    if (payload.allowedOrigins !== undefined && JSON.stringify(this.allowedOrigins) !== JSON.stringify(payload.allowedOrigins)) {
      this.allowedOrigins = [...payload.allowedOrigins]
      hasUpdates = true
    }
    if (payload.backupSchedule !== undefined && this.backupSchedule !== payload.backupSchedule) {
      this.backupSchedule = payload.backupSchedule
      hasUpdates = true
    }
    if (payload.backupsToKeep !== undefined && this.backupsToKeep !== payload.backupsToKeep) {
      this.backupsToKeep = payload.backupsToKeep
      hasUpdates = true
    }
    if (payload.maxBackupSize !== undefined && this.maxBackupSize !== payload.maxBackupSize) {
      this.maxBackupSize = payload.maxBackupSize
      hasUpdates = true
    }
    if (payload.homeBookshelfView !== undefined && this.homeBookshelfView !== payload.homeBookshelfView) {
      this.homeBookshelfView = payload.homeBookshelfView
      hasUpdates = true
    }
    if (payload.bookshelfView !== undefined && this.bookshelfView !== payload.bookshelfView) {
      this.bookshelfView = payload.bookshelfView
      hasUpdates = true
    }
    if (payload.dateFormat !== undefined && this.dateFormat !== payload.dateFormat) {
      this.dateFormat = payload.dateFormat
      hasUpdates = true
    }
    if (payload.timeFormat !== undefined && this.timeFormat !== payload.timeFormat) {
      this.timeFormat = payload.timeFormat
      hasUpdates = true
    }
    if (payload.language !== undefined && this.language !== payload.language) {
      this.language = payload.language
      hasUpdates = true
    }
    if (payload.chromecastEnabled !== undefined && this.chromecastEnabled !== payload.chromecastEnabled) {
      this.chromecastEnabled = Boolean(payload.chromecastEnabled)
      hasUpdates = true
    }
    if (payload.sortingIgnorePrefix !== undefined && this.sortingIgnorePrefix !== payload.sortingIgnorePrefix) {
      this.sortingIgnorePrefix = Boolean(payload.sortingIgnorePrefix)
      hasUpdates = true
    }

    return hasUpdates
  }
}

export = ServerSettings
