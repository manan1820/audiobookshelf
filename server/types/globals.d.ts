declare global {
  var ConfigPath: string
  var MetadataPath: string
  var RouterBasePath: string
  var ServerVersion: string
  var XAccel: string | boolean
  var isWin: boolean
  var appRoot: string
  var DisableSsrfRequestFilter: ((url: string) => boolean) | undefined
  var PodcastDownloadTimeout: number
  var MaxFailedEpisodeChecks: number
  var ServerSettings: Record<string, unknown> & {
    storeCoverWithItem?: boolean
    storeMetadataWithItem?: boolean
    metadataFileFormat?: string
    sortingPrefixes?: string[]
    podcastEpisodeSchedule?: string
    backupPath?: string
    backupSchedule?: string
    backupsToKeep?: number
    maxBackupSize?: number
    loggerDailyLogsToKeep?: number
    authOpenIDSubfolderForRedirectURLs?: string
    authOpenIDIssuerURL?: string
    authOpenIDAuthorizationURL?: string
    authOpenIDTokenURL?: string
    authOpenIDUserInfoURL?: string
    authOpenIDJwksURL?: string
    authOpenIDLogoutURL?: string
    authOpenIDClientID?: string
    authOpenIDClientSecret?: string
    authOpenIDTokenSigningAlgorithm?: string
    authOpenIDGroupClaim?: string
    authOpenIDAdvancedPermsClaim?: string
    authOpenIDAutoRegister?: boolean
  }
}

export {}
