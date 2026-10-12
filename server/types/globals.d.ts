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
  var ServerSettings: import('./objects').ServerSettingsJsonObject
}

export {}
