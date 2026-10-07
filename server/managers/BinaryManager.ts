import child_process from 'child_process'
import { promisify } from 'util'
import os from 'os'
import axios from 'axios'
import path from 'path'
import which from '../libs/which'
import fs from '../libs/fsExtra'
import Logger from '../Logger'
import fileUtils from '../utils/fileUtils'
import StreamZip from '../libs/nodeStreamZip'

const exec = promisify(child_process.exec)

interface FileToExtract {
  pathInsideZip: string
  outputFileName: string
}

abstract class ZippedAssetDownloader {
  assetCache: Record<string, unknown> = {}

  abstract getReleaseUrl(releaseTag: string): string
  abstract extractAssetUrl(assets: unknown, assetName: string): string
  abstract getAssetName(binaryName: string, releaseTag: string): string
  abstract getAssetFileName(binaryName: string): string

  async getAssetUrl(releaseTag: string, assetName: string): Promise<string> {
    if (this.assetCache[releaseTag]) {
      Logger.debug(`[ZippedAssetDownloader] release ${releaseTag}: assets found in cache.`)
    } else {
      const releaseUrl = this.getReleaseUrl(releaseTag)
      const releaseResponse = await axios.get(releaseUrl, {
        headers: { 'User-Agent': 'axios' }
      })
      this.assetCache[releaseTag] = releaseResponse.data
      Logger.debug(`[ZippedAssetDownloader] release ${releaseTag}: assets fetched from API.`)
    }

    const assets = this.assetCache[releaseTag]
    const assetUrl = this.extractAssetUrl(assets, assetName)
    return assetUrl
  }

  async downloadAsset(assetUrl: string, destDir: string): Promise<string> {
    const zipPath = path.join(destDir, 'temp.zip')
    const writer = fs.createWriteStream(zipPath)

    const assetResponse = await axios({
      url: assetUrl,
      responseType: 'stream'
    })

    const dataStream = assetResponse.data as NodeJS.ReadableStream
    dataStream.pipe(writer)

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => {
        Logger.debug(`[ZippedAssetDownloader] Downloaded asset ${assetUrl} to ${zipPath}`)
        resolve()
      })
      writer.on('error', (err: Error) => {
        Logger.error(`[ZippedAssetDownloader] Error downloading asset ${assetUrl}: ${err.message}`)
        reject(err)
      })
    })

    return zipPath
  }

  async extractFiles(
    zipPath: string,
    filesToExtract: FileToExtract[],
    destDir: string
  ): Promise<void> {
    const zip = new StreamZip.async({ file: zipPath })

    try {
      for (const file of filesToExtract) {
        const outputPath = path.join(destDir, file.outputFileName)
        if (!(await zip.entry(file.pathInsideZip))) {
          Logger.error(
            `[ZippedAssetDownloader] File ${file.pathInsideZip} not found in zip file ${zipPath}`
          )
          continue
        }
        await zip.extract(file.pathInsideZip, outputPath)
        Logger.debug(
          `[ZippedAssetDownloader] Extracted file ${file.pathInsideZip} to ${outputPath}`
        )

        if (process.platform !== 'win32') {
          await fs.chmod(outputPath, 0o755)
        }
      }
    } catch (error) {
      Logger.error('[ZippedAssetDownloader] Error extracting files:', error)
      throw error
    } finally {
      await zip.close()
    }
  }

  async downloadAndExtractFiles(
    releaseTag: string,
    assetName: string,
    filesToExtract: FileToExtract[],
    destDir: string
  ): Promise<void> {
    let zipPath: string | null = null
    try {
      await fs.ensureDir(destDir)
      const assetUrl = await this.getAssetUrl(releaseTag, assetName)
      zipPath = await this.downloadAsset(assetUrl, destDir)
      await this.extractFiles(zipPath, filesToExtract, destDir)
    } catch (error) {
      const err = error as Error
      Logger.error(
        `[ZippedAssetDownloader] Error downloading or extracting files: ${err.message}`
      )
    } finally {
      if (zipPath) {
        await fs.remove(zipPath)
      }
    }
  }

  async downloadBinary(
    binaryName: string,
    releaseTag: string,
    destDir: string
  ): Promise<void> {
    const assetName = this.getAssetName(binaryName, releaseTag)
    const fileName = this.getAssetFileName(binaryName)
    const filesToExtract: FileToExtract[] = [
      { pathInsideZip: fileName, outputFileName: fileName }
    ]

    await this.downloadAndExtractFiles(releaseTag, assetName, filesToExtract, destDir)
  }
}

class FFBinariesDownloader extends ZippedAssetDownloader {
  platformSuffix: string | null

  constructor() {
    super()
    this.platformSuffix = this.getPlatformSuffix()
  }

  getPlatformSuffix(): string | null {
    const type = os.type().toLowerCase()
    const arch = os.arch().toLowerCase()

    if (type === 'darwin') {
      return 'osx-64'
    }

    if (type === 'windows_nt') {
      return arch === 'x64' ? 'windows-64' : 'windows-32'
    }

    if (type === 'linux') {
      if (arch === 'arm') return 'linux-armel'
      if (arch === 'arm64') return 'linux-arm64'
      return arch === 'x64' ? 'linux-64' : 'linux-32'
    }

    return null
  }

  getReleaseUrl(releaseTag: string): string {
    return `https://ffbinaries.com/api/v1/version/${releaseTag}`
  }

  extractAssetUrl(assets: unknown, assetName: string): string {
    const binRecord = (
      assets as { bin?: Record<string, Record<string, string>> }
    )?.bin
    const assetUrl = binRecord?.[this.platformSuffix ?? '']?.[assetName]

    if (!assetUrl) {
      throw new Error(
        `[FFBinariesDownloader] Asset ${assetName} not found for platform ${this.platformSuffix}`
      )
    }

    return assetUrl
  }

  getAssetName(binaryName: string, _releaseTag: string): string {
    return binaryName
  }

  getAssetFileName(binaryName: string): string {
    return process.platform === 'win32' ? `${binaryName}.exe` : binaryName
  }
}

class NunicodeDownloader extends ZippedAssetDownloader {
  platformSuffix: string | null

  constructor() {
    super()
    this.platformSuffix = this.getPlatformSuffix()
  }

  getPlatformSuffix(): string | null {
    const platform = process.platform
    const arch = process.arch

    if (platform === 'win32' && arch === 'x64') {
      return 'win-x64'
    } else if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
      return 'osx-arm64'
    } else if (platform === 'linux' && arch === 'x64') {
      return 'linux-x64'
    } else if (platform === 'linux' && arch === 'arm64') {
      return 'linux-arm64'
    }

    return null
  }

  getReleaseUrl(_releaseTag: string): string {
    throw new Error('Not implemented')
  }

  extractAssetUrl(_assets: unknown, _assetName: string): string {
    throw new Error('Not implemented')
  }

  override async getAssetUrl(releaseTag: string, assetName: string): Promise<string> {
    return `https://github.com/mikiher/nunicode-sqlite/releases/download/v${releaseTag}/${assetName}`
  }

  getAssetName(binaryName: string, _releaseTag: string): string {
    if (!this.platformSuffix) {
      throw new Error(
        `[NunicodeDownloader] Platform ${process.platform}-${process.arch} not supported`
      )
    }
    return `${binaryName}-${this.platformSuffix}.zip`
  }

  getAssetFileName(binaryName: string): string {
    if (process.platform === 'win32') {
      return `${binaryName}.dll`
    } else if (process.platform === 'darwin') {
      return `${binaryName}.dylib`
    } else if (process.platform === 'linux') {
      return `${binaryName}.so`
    }

    throw new Error(`[NunicodeDownloader] Platform ${process.platform} not supported`)
  }
}

class Binary {
  name: string
  type: string
  envVariable: string
  validVersions: string[]
  source: ZippedAssetDownloader
  fileName: string
  required: boolean
  exec: (command: string) => Promise<{ stdout: string; stderr: string }>

  constructor(
    name: string,
    type: string,
    envVariable: string,
    validVersions: string[],
    source: ZippedAssetDownloader,
    required = true
  ) {
    if (!name) throw new Error('Binary name is required')
    this.name = name
    if (!type) throw new Error('Binary type is required')
    this.type = type
    if (!envVariable) throw new Error('Binary environment variable name is required')
    this.envVariable = envVariable
    if (!validVersions || !validVersions.length) {
      throw new Error(
        `No valid versions specified for ${type} ${name}. At least one version is required.`
      )
    }
    this.validVersions = validVersions
    if (!source || !(source instanceof ZippedAssetDownloader)) {
      throw new Error(
        'Binary source is required, and must be an instance of ZippedAssetDownloader'
      )
    }
    this.source = source
    this.fileName = this.getFileName()
    this.required = required
    this.exec = exec
  }

  async find(mainInstallDir: string, altInstallDir: string): Promise<string | null> {
    const defaultPath = process.env[this.envVariable]
    if (await this.isGood(defaultPath)) return defaultPath ?? null

    if (this.type === 'executable') {
      const whichResult = which.sync(this.fileName, { nothrow: true })
      const whichPath = Array.isArray(whichResult) ? whichResult[0] : whichResult
      if (await this.isGood(whichPath)) return whichPath ?? null
    }

    const mainInstallPath = path.join(mainInstallDir, this.fileName)
    if (await this.isGood(mainInstallPath)) return mainInstallPath

    const altInstallPath = path.join(altInstallDir, this.fileName)
    if (await this.isGood(altInstallPath)) return altInstallPath

    return null
  }

  getFileName(): string {
    const platform = process.platform

    if (this.type === 'executable') {
      return this.name + (platform === 'win32' ? '.exe' : '')
    } else if (this.type === 'library') {
      return (
        this.name +
        (platform === 'win32' ? '.dll' : platform === 'darwin' ? '.dylib' : '.so')
      )
    } else {
      return this.name
    }
  }

  async isLibraryVersionValid(libraryPath: string): Promise<boolean> {
    try {
      const versionFilePath = libraryPath + '.ver'
      if (!(await fs.pathExists(versionFilePath))) return false
      const version = (await fs.readFile(versionFilePath, 'utf8')).trim()
      return this.validVersions.some((validVersion) => version.startsWith(validVersion))
    } catch (err) {
      Logger.error(`[Binary] Failed to check version of ${libraryPath}`, err)
      return false
    }
  }

  async isExecutableVersionValid(executablePath: string): Promise<boolean> {
    try {
      const { stdout } = await this.exec('"' + executablePath + '"' + ' -version')
      const match = stdout.match(/version\s([\d\.]+)/)
      const version = match?.[1]
      if (!version) return false
      return this.validVersions.some((validVersion) => version.startsWith(validVersion))
    } catch (err) {
      Logger.error(`[Binary] Failed to check version of ${executablePath}`, err)
      return false
    }
  }

  async isGood(binaryPath: string | null | undefined): Promise<boolean> {
    try {
      if (!binaryPath || !(await fs.pathExists(binaryPath))) return false
      if (this.type === 'library') return await this.isLibraryVersionValid(binaryPath)
      else if (this.type === 'executable')
        return await this.isExecutableVersionValid(binaryPath)
      else return true
    } catch (err) {
      Logger.error(
        `[Binary] Failed to check ${this.type} ${this.name} at ${binaryPath}`,
        err
      )
      return false
    }
  }

  async download(destination: string): Promise<void> {
    const version = this.validVersions[0]
    try {
      await this.source.downloadBinary(this.name, version, destination)
      if (this.type === 'library') {
        const libraryPath = path.join(destination, this.fileName)
        await fs.writeFile(libraryPath + '.ver', version)
      }
    } catch (err) {
      Logger.error(
        `[Binary] Failed to download ${this.type} ${this.name} version ${version} to ${destination}`,
        err
      )
    }
  }
}

const ffbinaries = new FFBinariesDownloader()
const nunicode = new NunicodeDownloader()

class BinaryManager {
  static Binary = Binary
  static ffbinaries = ffbinaries
  static nunicode = nunicode

  defaultRequiredBinaries: Binary[] = [
    new Binary('ffmpeg', 'executable', 'FFMPEG_PATH', ['5.1'], ffbinaries),
    new Binary('ffprobe', 'executable', 'FFPROBE_PATH', ['5.1'], ffbinaries),
    new Binary('libnusqlite3', 'library', 'NUSQLITE3_PATH', ['1.2'], nunicode, false)
  ]

  requiredBinaries: Binary[]
  mainInstallDir: string
  altInstallDir: string
  initialized: boolean

  constructor(requiredBinaries?: Binary[]) {
    this.requiredBinaries = requiredBinaries ?? this.defaultRequiredBinaries
    const proc = process as NodeJS.Process & { pkg?: unknown }
    const glob = global as typeof globalThis & { appRoot?: string; ConfigPath?: string }
    this.mainInstallDir = proc.pkg
      ? path.dirname(process.execPath)
      : (glob.appRoot ?? '')
    this.altInstallDir = glob.ConfigPath ?? ''
    this.initialized = false
  }

  async init(): Promise<void> {
    if (process.env.SKIP_BINARIES_CHECK === '1') {
      for (const binary of this.requiredBinaries) {
        if (!process.env[binary.envVariable] && binary.required) {
          await Logger.fatal(
            `[BinaryManager] Environment variable ${binary.envVariable} must be set`
          )
          process.exit(1)
        }
      }
      Logger.info('[BinaryManager] Skipping check for binaries')
      return
    }

    if (this.initialized) return

    const missingBinaries = await this.findRequiredBinaries()
    if (missingBinaries.length === 0) return
    await this.removeOldBinaries(missingBinaries)
    await this.install(missingBinaries)
    const missingBinariesAfterInstall = await this.findRequiredBinaries()
    const missingRequiredBinryNames = missingBinariesAfterInstall
      .filter((binary) => binary.required)
      .map((binary) => binary.name)
    if (missingRequiredBinryNames.length) {
      Logger.error(
        `[BinaryManager] Failed to find or install required binaries: ${missingRequiredBinryNames.join(', ')}`
      )
      process.exit(1)
    }
    this.initialized = true
  }

  async removeBinary(destination: string, binary: Binary): Promise<void> {
    const binaryPath = path.join(destination, binary.fileName)
    try {
      if (await fs.pathExists(binaryPath)) {
        Logger.debug(`[BinaryManager] Removing binary: ${binaryPath}`)
        await fs.remove(binaryPath)
      }
    } catch {
      Logger.error(`[BinaryManager] Error removing binary: ${binaryPath}`)
    }
  }

  async removeOldBinaries(binaries: Binary[]): Promise<void> {
    for (const binary of binaries) {
      await this.removeBinary(this.mainInstallDir, binary)
      await this.removeBinary(this.altInstallDir, binary)
    }
  }

  async findRequiredBinaries(): Promise<Binary[]> {
    const missingBinaries: Binary[] = []
    for (const binary of this.requiredBinaries) {
      const binaryPath = await binary.find(this.mainInstallDir, this.altInstallDir)
      if (binaryPath) {
        Logger.info(
          `[BinaryManager] Found valid ${binary.type} ${binary.name} at ${binaryPath}`
        )
        if (process.env[binary.envVariable] !== binaryPath) {
          Logger.info(`[BinaryManager] Updating process.env.${binary.envVariable}`)
          process.env[binary.envVariable] = binaryPath
        }
      } else {
        Logger.info(`[BinaryManager] ${binary.name} not found or not a valid version`)
        missingBinaries.push(binary)
      }
    }
    return missingBinaries
  }

  async install(binaries: Binary[]): Promise<void> {
    if (!binaries.length) return
    Logger.info(
      `[BinaryManager] Installing binaries: ${binaries.map((binary) => binary.name).join(', ')}`
    )
    const destination = (await fileUtils.isWritable(this.mainInstallDir))
      ? this.mainInstallDir
      : this.altInstallDir
    for (const binary of binaries) {
      await binary.download(destination)
    }
    Logger.info(`[BinaryManager] Binaries installed to ${destination}`)
  }
}

namespace BinaryManager {
  export type BinaryClass = typeof Binary
  export type BinaryInstance = Binary
  export type FFBinariesDownloaderInstance = FFBinariesDownloader
  export type NunicodeDownloaderInstance = NunicodeDownloader
  export type ZippedAssetDownloaderInstance = ZippedAssetDownloader
}

export = BinaryManager
