import Path from 'path'
import Logger from '../../Logger'
import fsExtra from '../../libs/fsExtra'
import fileUtils from '../fileUtils'
import LibraryFile from '../../objects/files/LibraryFile'
import type LibraryItem from '../../models/LibraryItem'
import type Database from '../../Database'

async function writeMetadataFileForItem(libraryItem: LibraryItem): Promise<boolean | null> {
  const storeMetadataWithItem = global.ServerSettings.storeMetadataWithItem && !libraryItem.isFile
  const metadataPath = storeMetadataWithItem ? libraryItem.path : Path.join(global.MetadataPath, 'items', libraryItem.id)
  const metadataFilepath = fileUtils.filePathToPOSIX(Path.join(metadataPath, 'metadata.json'))
  if (await fsExtra.pathExists(metadataFilepath)) {
    // Metadata file already exists do nothing
    return null
  }
  Logger.info(`[absMetadataMigration] metadata file not found at "${metadataFilepath}" - creating`)

  if (!storeMetadataWithItem) {
    // Ensure /metadata/items/<lid> dir
    await fsExtra.ensureDir(metadataPath)
  }

  if (!libraryItem.media) return false
  const metadataJson = libraryItem.media.getAbsMetadataJson()

  // Save to file
  const success = await fsExtra
    .writeFile(metadataFilepath, JSON.stringify(metadataJson, null, 2))
    .then(() => true)
    .catch((error) => {
      const errorMsg = (error as Error).message || String(error)
      Logger.error(`[absMetadataMigration] failed to save metadata file at "${metadataFilepath}"`, errorMsg)
      return false
    })

  if (!success) return false
  if (!storeMetadataWithItem) return true // No need to do anything else

  // Safety check to make sure library file with the same path isnt already there
  const existingFiles = (libraryItem.libraryFiles ?? []).filter((lf) => lf.metadata.path !== metadataFilepath)

  // Put new library file in library item
  const newLibraryFile = new LibraryFile()
  await newLibraryFile.setDataFromPath(metadataFilepath, 'metadata.json')
  existingFiles.push(newLibraryFile.toJSON())
  libraryItem.libraryFiles = existingFiles

  // Update library item timestamps and total size
  const libraryItemDirTimestamps = await fileUtils.getFileTimestampsWithIno(libraryItem.path)
  if (libraryItemDirTimestamps) {
    libraryItem.mtime = new Date(libraryItemDirTimestamps.mtimeMs)
    libraryItem.ctime = new Date(libraryItemDirTimestamps.ctimeMs)
    let size = 0
    libraryItem.libraryFiles.forEach((lf) => (size += !isNaN(Number(lf.metadata.size)) ? Number(lf.metadata.size) : 0))
    libraryItem.size = size
  }

  libraryItem.changed('libraryFiles', true)
  return libraryItem
    .save()
    .then(() => true)
    .catch((error) => {
      const errorMsg = (error as Error).message || String(error)
      Logger.error(`[absMetadataMigration] failed to save libraryItem "${libraryItem.id}"`, errorMsg)
      return false
    })
}

async function runMigration(database: typeof Database, offset = 0, totalCreated = 0): Promise<number> {
  const libraryItems = await database.libraryItemModel.getLibraryItemsIncrement(offset, 500, { isMissing: false })
  if (!libraryItems.length) return totalCreated

  let numCreated = 0
  for (const libraryItem of libraryItems) {
    const success = await writeMetadataFileForItem(libraryItem)
    if (success) numCreated++
  }

  if (libraryItems.length < 500) {
    return totalCreated + numCreated
  }
  return runMigration(database, offset + libraryItems.length, totalCreated + numCreated)
}

export async function migrate(database: typeof Database): Promise<void> {
  Logger.info(`[absMetadataMigration] Starting metadata.json migration`)
  const totalCreated = await runMigration(database)
  Logger.info(`[absMetadataMigration] Finished metadata.json migration (${totalCreated} files created)`)
}

export default {
  migrate
}
