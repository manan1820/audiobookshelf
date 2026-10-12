import { once } from 'events'
import { createInterface } from 'readline'
import Path from 'path'
import Logger from '../../Logger'
import fs from '../../libs/fsExtra'
import archiver from '../../libs/archiver'
import StreamZip from '../../libs/nodeStreamZip'
import type {
  LibraryOldJsonObject,
  LibraryItemOldJsonObject,
  UserOldJsonObject,
  PlaybackSessionOldJsonObject,
  SettingValueObject,
  CollectionOldJsonObject,
  PlaylistOldJsonObject,
  AuthorOldJsonObject,
  SeriesOldJsonObject,
  FeedOldJsonObject
} from '../../types'

export type OldDbEntity =
  | LibraryOldJsonObject
  | LibraryItemOldJsonObject
  | UserOldJsonObject
  | PlaybackSessionOldJsonObject
  | SettingValueObject
  | CollectionOldJsonObject
  | PlaylistOldJsonObject
  | AuthorOldJsonObject
  | SeriesOldJsonObject
  | FeedOldJsonObject

async function processDbFile(filepath: string): Promise<OldDbEntity[]> {
  if (!fs.pathExistsSync(filepath)) {
    Logger.error(`[oldDbFiles] Db file does not exist at "${filepath}"`)
    return []
  }

  const entities: OldDbEntity[] = []

  try {
    const fileStream = fs.createReadStream(filepath)

    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    rl.on('line', (line: string) => {
      if (line && line.trim()) {
        try {
          const entity = JSON.parse(line) as OldDbEntity
          if (entity && Object.keys(entity).length) entities.push(entity)
        } catch (jsonParseError) {
          Logger.error(`[oldDbFiles] Failed to parse line "${line}" in db file "${filepath}"`, jsonParseError)
        }
      }
    })

    await once(rl, 'close')

    console.log(`[oldDbFiles] Db file "${filepath}" processed`)

    return entities
  } catch (error) {
    Logger.error(`[oldDbFiles] Failed to read db file "${filepath}"`, error)
    return []
  }
}

async function loadDbData(dbpath: string): Promise<OldDbEntity[] | null> {
  try {
    Logger.info(`[oldDbFiles] Loading db data at "${dbpath}"`)
    const files = await fs.readdir(dbpath)

    const entities: OldDbEntity[] = []
    for (const filename of files) {
      if (Path.extname(filename).toLowerCase() !== '.json') {
        Logger.warn(`[oldDbFiles] Ignoring filename "${filename}" in db folder "${dbpath}"`)
        continue
      }

      const filepath = Path.join(dbpath, filename)
      Logger.info(`[oldDbFiles] Loading db data file "${filepath}"`)
      const someEntities = await processDbFile(filepath)
      Logger.info(`[oldDbFiles] Processed db data file with ${someEntities.length} entities`)
      entities.push(...someEntities)
    }

    Logger.info(`[oldDbFiles] Finished loading db data with ${entities.length} entities`)
    return entities
  } catch (error) {
    Logger.error(`[oldDbFiles] Failed to load db data "${dbpath}"`, error)
    return null
  }
}

export async function loadOldData<T extends OldDbEntity = OldDbEntity>(dbName: string): Promise<T[]> {
  const dbPath = Path.join(global.ConfigPath, dbName, 'data')
  const dbData = (await loadDbData(dbPath)) || []
  Logger.info(`[oldDbFiles] ${dbData.length} ${dbName} loaded`)
  return dbData as T[]
}

export async function zipWrapOldDb(): Promise<boolean> {
  const dbs: { [key: string]: string } = {
    libraryItems: Path.join(global.ConfigPath, 'libraryItems'),
    users: Path.join(global.ConfigPath, 'users'),
    sessions: Path.join(global.ConfigPath, 'sessions'),
    libraries: Path.join(global.ConfigPath, 'libraries'),
    settings: Path.join(global.ConfigPath, 'settings'),
    collections: Path.join(global.ConfigPath, 'collections'),
    playlists: Path.join(global.ConfigPath, 'playlists'),
    authors: Path.join(global.ConfigPath, 'authors'),
    series: Path.join(global.ConfigPath, 'series'),
    feeds: Path.join(global.ConfigPath, 'feeds')
  }

  return new Promise((resolve) => {
    const oldDbPath = Path.join(global.ConfigPath, 'oldDb.zip')
    const output = fs.createWriteStream(oldDbPath)
    const archive = archiver('zip', {
      zlib: { level: 9 }
    })

    output.on('close', async () => {
      Logger.info(`[oldDbFiles] Old db files have been zipped in ${oldDbPath}. ${archive.pointer()} total bytes`)

      for (const db in dbs) {
        await fs.remove(dbs[db])
      }

      resolve(true)
    })

    output.on('end', () => {
      Logger.debug('[oldDbFiles] Data has been drained')
    })

    archive.on('error', (err: Error) => {
      Logger.error(`[oldDbFiles] Failed to zip old db folders`, err)
      resolve(false)
    })

    archive.pipe(output)

    for (const db in dbs) {
      archive.directory(dbs[db], db)
    }

    archive.finalize()
  })
}

export async function checkHasOldDb(): Promise<boolean> {
  const dbs: { [key: string]: string } = {
    libraryItems: Path.join(global.ConfigPath, 'libraryItems'),
    users: Path.join(global.ConfigPath, 'users'),
    sessions: Path.join(global.ConfigPath, 'sessions'),
    libraries: Path.join(global.ConfigPath, 'libraries'),
    settings: Path.join(global.ConfigPath, 'settings'),
    collections: Path.join(global.ConfigPath, 'collections'),
    playlists: Path.join(global.ConfigPath, 'playlists'),
    authors: Path.join(global.ConfigPath, 'authors'),
    series: Path.join(global.ConfigPath, 'series'),
    feeds: Path.join(global.ConfigPath, 'feeds')
  }
  for (const db in dbs) {
    if (await fs.pathExists(dbs[db])) {
      return true
    }
  }
  return false
}

export async function checkHasOldDbZip(): Promise<boolean> {
  const oldDbPath = Path.join(global.ConfigPath, 'oldDb.zip')
  if (!(await fs.pathExists(oldDbPath))) {
    return false
  }

  const zip = new StreamZip.async({ file: oldDbPath })
  await zip.extract(null, global.ConfigPath)
  await zip.close()

  return checkHasOldDb()
}

export async function checkExtractItemsUsersAndLibraries(): Promise<boolean> {
  const oldDbPath = Path.join(global.ConfigPath, 'oldDb.zip')

  const zip = new StreamZip.async({ file: oldDbPath })
  const libraryItemsPath = Path.join(global.ConfigPath, 'libraryItems')
  await zip.extract('libraryItems/', libraryItemsPath)

  if (!(await fs.pathExists(libraryItemsPath))) {
    Logger.error(`[oldDbFiles] Failed to extract old libraryItems from oldDb.zip`)
    return false
  }

  const usersPath = Path.join(global.ConfigPath, 'users')
  await zip.extract('users/', usersPath)

  if (!(await fs.pathExists(usersPath))) {
    Logger.error(`[oldDbFiles] Failed to extract old users from oldDb.zip`)
    await fs.remove(libraryItemsPath)
    return false
  }

  const librariesPath = Path.join(global.ConfigPath, 'libraries')
  await zip.extract('libraries/', librariesPath)

  if (!(await fs.pathExists(librariesPath))) {
    Logger.error(`[oldDbFiles] Failed to extract old libraries from oldDb.zip`)
    await fs.remove(usersPath)
    await fs.remove(libraryItemsPath)
    return false
  }

  await zip.close()

  return true
}

export async function removeOldItemsUsersAndLibrariesFolders(): Promise<void> {
  const libraryItemsPath = Path.join(global.ConfigPath, 'libraryItems')
  const usersPath = Path.join(global.ConfigPath, 'users')
  const librariesPath = Path.join(global.ConfigPath, 'libraries')
  await fs.remove(libraryItemsPath)
  await fs.remove(usersPath)
  await fs.remove(librariesPath)
}

export default {
  loadOldData,
  zipWrapOldDb,
  checkHasOldDb,
  checkHasOldDbZip,
  checkExtractItemsUsersAndLibraries,
  removeOldItemsUsersAndLibrariesFolders
}
