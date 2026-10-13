import sqlite3 from 'sqlite3'
import Path from 'path'
import type { Request, Response, UploadedFile } from 'express'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'

import cron from '../libs/nodeCron'
import fs from '../libs/fsExtra'
import archiver from '../libs/archiver'
import StreamZip, { type ZipEntry, type async as StreamZipAsync } from '../libs/nodeStreamZip'
import fileUtils from '../utils/fileUtils'

import { getFileSize } from '../utils/fileUtils'

import Backup from '../objects/Backup'
import CacheManager from './CacheManager'
import NotificationManager from './NotificationManager'
import type ApiCacheManager from './ApiCacheManager'

interface CronScheduleTask {
  stop?: () => void
}

class BackupManager {
  ItemsMetadataPath: string
  AuthorsMetadataPath: string
  scheduleTask: CronScheduleTask | null
  backups: Backup[]

  constructor() {
    this.ItemsMetadataPath = Path.join(global.MetadataPath, 'items')
    this.AuthorsMetadataPath = Path.join(global.MetadataPath, 'authors')
    this.scheduleTask = null
    this.backups = []
  }

  get backupPath(): string {
    return global.ServerSettings?.backupPath || ''
  }

  get backupPathEnvSet(): boolean {
    return Boolean(process.env.BACKUP_PATH)
  }

  get backupSchedule(): string | null {
    const schedule = global.ServerSettings?.backupSchedule
    return typeof schedule === 'string' && schedule ? schedule : null
  }

  get backupsToKeep(): number {
    return global.ServerSettings?.backupsToKeep || 2
  }

  get maxBackupSize(): number {
    return global.ServerSettings?.maxBackupSize || Infinity
  }

  async init(): Promise<void> {
    try {
      const backupsDirExists = await fs.pathExists(this.backupPath)
      if (!backupsDirExists) {
        await fs.ensureDir(this.backupPath)
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      Logger.error(`[BackupManager] Failed to ensure backup directory at "${this.backupPath}": ${errMsg}`)
      throw new Error(`[BackupManager] Failed to ensure backup directory at "${this.backupPath}"`, { cause: error })
    }

    await this.loadBackups()
    this.scheduleCron()
  }

  /**
   * Reload backups after updating backup path
   */
  async reload(): Promise<void> {
    Logger.info(`[BackupManager] Reloading backups with backup path "${this.backupPath}"`)
    this.backups = []
    await this.loadBackups()
    this.updateCronSchedule()
  }

  scheduleCron(): void {
    if (!this.backupSchedule) {
      Logger.info('[BackupManager] Auto Backups are disabled')
      return
    }
    try {
      const cronSchedule = this.backupSchedule
      this.scheduleTask = cron.schedule(cronSchedule, () => {
        void this.runBackup()
      }) as CronScheduleTask
    } catch (error: unknown) {
      Logger.error(`[BackupManager] Failed to schedule backup cron ${this.backupSchedule}`, error)
    }
  }

  updateCronSchedule(): void {
    if (this.scheduleTask && !this.backupSchedule) {
      Logger.info('[BackupManager] Disabling backup schedule')
      if (this.scheduleTask.stop) this.scheduleTask.stop()
      this.scheduleTask = null
    } else if (!this.scheduleTask && this.backupSchedule) {
      Logger.info(`[BackupManager] Starting backup schedule ${this.backupSchedule}`)
      this.scheduleCron()
    } else if (this.backupSchedule) {
      Logger.info(`[BackupManager] Restarting backup schedule ${this.backupSchedule}`)
      if (this.scheduleTask?.stop) this.scheduleTask.stop()
      this.scheduleCron()
    }
  }

  async uploadBackup(req: Request, res: Response): Promise<Response | void> {
    const backupFile = req.files?.file as UploadedFile | undefined
    if (!backupFile) {
      return res.status(400).send('No backup file uploaded')
    }

    if (Path.extname(backupFile.name) !== '.audiobookshelf') {
      Logger.error(`[BackupManager] Invalid backup file uploaded "${backupFile.name}"`)
      return res.status(500).send('Invalid backup file')
    }

    const sanitizedFilename = fileUtils.sanitizeFilename(backupFile.name)
    if (!sanitizedFilename) {
      Logger.error(`[BackupManager] Failed to sanitize backup filename "${backupFile.name}"`)
      return res.status(400).send('Invalid backup filename')
    }

    const tempPath = Path.join(this.backupPath, sanitizedFilename)
    const success = await backupFile
      .mv(tempPath)
      .then(() => true)
      .catch((error: unknown) => {
        Logger.error('[BackupManager] Failed to move backup file', tempPath, error)
        return false
      })
    if (!success) {
      return res.status(500).send('Failed to move backup file into backups directory')
    }

    const zip = new StreamZip.async({ file: tempPath })
    let entries: { [key: string]: ZipEntry }
    try {
      entries = await zip.entries()
    } catch (error: unknown) {
      // Not a valid zip file
      Logger.error('[BackupManager] Failed to read backup file - backup might not be a valid .zip file', tempPath, error)
      await zip.close().catch(() => {})
      await fs.remove(tempPath).catch((err: unknown) => Logger.error(`[BackupManager] Failed to remove rejected backup file "${tempPath}"`, err))
      return res.status(400).send('Failed to read backup file - backup might not be a valid .zip file')
    }
    if (!entries['absdatabase.sqlite']) {
      Logger.error('[BackupManager] Invalid backup with no absdatabase.sqlite file - might be a backup created on an old Audiobookshelf server.')
      await zip.close().catch(() => {})
      await fs.remove(tempPath).catch((err: unknown) => Logger.error(`[BackupManager] Failed to remove rejected backup file "${tempPath}"`, err))
      return res.status(500).send('Invalid backup with no absdatabase.sqlite file - might be a backup created on an old Audiobookshelf server.')
    }

    const detailsEntry = entries['details']
    if (!detailsEntry) {
      Logger.error('[BackupManager] Invalid backup - missing details entry')
      await zip.close().catch(() => {})
      await fs.remove(tempPath).catch((err: unknown) => Logger.error(`[BackupManager] Failed to remove rejected backup file "${tempPath}"`, err))
      return res.status(400).send('Invalid backup file - missing details entry')
    }
    if (detailsEntry.size > 1024 * 1024) {
      Logger.error(`[BackupManager] Backup details entry too large: ${detailsEntry.size} bytes`)
      await zip.close().catch(() => {})
      await fs.remove(tempPath).catch((err: unknown) => Logger.error(`[BackupManager] Failed to remove rejected backup file "${tempPath}"`, err))
      return res.status(400).send('Invalid backup file - details entry too large')
    }

    const data = await zip.entryData('details')
    const details = data.toString('utf8').split('\n')

    const backup = new Backup({ details, fullPath: tempPath })

    if (!backup.serverVersion) {
      Logger.error('[BackupManager] Invalid backup with no server version - might be a backup created before version 2.0.0')
      await zip.close().catch(() => {})
      await fs.remove(tempPath).catch((err: unknown) => Logger.error(`[BackupManager] Failed to remove rejected backup file "${tempPath}"`, err))
      return res.status(500).send('Invalid backup. Might be a backup created before version 2.0.0.')
    }

    await zip.close().catch(() => {})

    backup.fileSize = await getFileSize(tempPath)

    const existingBackupIndex = this.backups.findIndex((b) => b.id === backup.id)
    if (existingBackupIndex >= 0) {
      Logger.warn(`[BackupManager] Backup already exists with id ${backup.id} - overwriting`)
      this.backups.splice(existingBackupIndex, 1, backup)
    } else {
      this.backups.push(backup)
    }

    res.json({
      backups: this.backups.map((b) => b.toJSON())
    })
  }

  async requestCreateBackup(res: Response): Promise<Response | void> {
    const backupSuccess = await this.runBackup()
    if (backupSuccess) {
      res.json({
        backups: this.backups.map((b) => b.toJSON())
      })
    } else {
      res.sendStatus(500)
    }
  }

  async requestApplyBackup(apiCacheManager: ApiCacheManager, backup: Backup, res: Response): Promise<Response | void> {
    if (!backup.fullPath) {
      return res.status(400).send('Invalid backup file path')
    }
    Logger.info(`[BackupManager] Applying backup at "${backup.fullPath}"`)

    const zip = new StreamZip.async({ file: backup.fullPath })

    const entries = await zip.entries()

    // Ensure backup has an absdatabase.sqlite file
    if (!Object.keys(entries).includes('absdatabase.sqlite')) {
      Logger.error(`[BackupManager] Cannot apply old backup ${backup.fullPath}`)
      await zip.close()
      return res.status(500).send('Invalid backup file. Does not include absdatabase.sqlite. This might be from an older Audiobookshelf server.')
    }

    await Database.disconnect()

    const dbPath = Path.join(global.ConfigPath, 'absdatabase.sqlite')
    const tempDbPath = Path.join(global.ConfigPath, 'absdatabase-temp.sqlite')

    // Extract backup sqlite file to temporary path
    await zip.extract('absdatabase.sqlite', tempDbPath)
    Logger.info(`[BackupManager] Extracted backup sqlite db to temp path ${tempDbPath}`)

    // Verify extract - Abandon backup if sqlite file did not extract
    if (!(await fs.pathExists(tempDbPath))) {
      Logger.error('[BackupManager] Sqlite file not found after extract - abandon backup apply and reconnect db')
      await zip.close()
      await Database.reconnect()
      return res.status(500).send('Failed to extract sqlite db from backup')
    }

    // Attempt to remove existing db file
    try {
      await fs.remove(dbPath)
    } catch (error: unknown) {
      // Abandon backup and remove extracted sqlite file if unable to remove existing db file
      Logger.error('[BackupManager] Unable to overwrite existing db file - abandon backup apply and reconnect db', error)
      await fs.remove(tempDbPath)
      await zip.close()
      await Database.reconnect()
      const errMsg = error instanceof Error ? error.message : 'Unknown Error'
      return res.status(500).send(`Failed to overwrite sqlite db: ${errMsg}`)
    }

    // Rename temp db
    await fs.move(tempDbPath, dbPath)
    Logger.info(`[BackupManager] Saved backup sqlite file at "${dbPath}"`)

    // Extract /metadata/items and /metadata/authors folders
    await fs.ensureDir(this.ItemsMetadataPath)
    await zip.extract('metadata-items/', this.ItemsMetadataPath)
    await fs.ensureDir(this.AuthorsMetadataPath)
    await zip.extract('metadata-authors/', this.AuthorsMetadataPath)
    await zip.close()

    // Reconnect db
    await Database.reconnect()

    // Reset api cache, set hooks again
    await apiCacheManager.reset()

    // Clear metadata cache
    await CacheManager.purgeAll()

    res.sendStatus(200)

    // Triggers browser refresh for all clients
    SocketAuthority.emitter('backup_applied')
  }

  async loadBackups(): Promise<void> {
    try {
      const filesInDir = await fs.readdir(this.backupPath)

      for (let i = 0; i < filesInDir.length; i++) {
        const filename = filesInDir[i]
        if (filename.endsWith('.audiobookshelf')) {
          const fullFilePath = Path.join(this.backupPath, filename)

          let zip: StreamZipAsync | null = null
          let data: Buffer | null = null
          try {
            zip = new StreamZip.async({ file: fullFilePath })
            const entries = await zip.entries()

            const detailsEntry = entries['details']
            if (!detailsEntry) {
              Logger.error(`[BackupManager] Backup "${fullFilePath}" missing details entry - skipping`)
              await zip.close().catch(() => {})
              continue
            }
            if (detailsEntry.size > 1024 * 1024) {
              Logger.error(`[BackupManager] Backup "${fullFilePath}" details entry too large (${detailsEntry.size} bytes) - skipping`)
              await zip.close().catch(() => {})
              continue
            }

            data = await zip.entryData('details')
          } catch (error: unknown) {
            Logger.error(`[BackupManager] Failed to unzip backup "${fullFilePath}"`, error)
            if (zip) await zip.close().catch(() => {})
            continue
          }

          if (!data) {
            if (zip) await zip.close().catch(() => {})
            continue
          }

          const details = data.toString('utf8').split('\n')

          const backup = new Backup({ details, fullPath: fullFilePath })

          if (!backup.serverVersion) {
            // Backups before v2
            Logger.error(`[BackupManager] Old unsupported backup was found "${backup.filename}"`)
          } else if (!backup.key) {
            // Backups before sqlite migration
            Logger.warn(`[BackupManager] Old unsupported backup was found "${backup.filename}" (pre sqlite migration)`)
          }

          backup.fileSize = await getFileSize(fullFilePath)
          const existingBackupWithId = this.backups.find((b) => b.id === backup.id)
          if (existingBackupWithId) {
            Logger.warn(`[BackupManager] Backup already loaded with id ${backup.id} - ignoring`)
          } else {
            this.backups.push(backup)
          }

          Logger.debug(`[BackupManager] Backup found "${backup.id}"`)
          await zip.close()
        }
      }
      Logger.info(`[BackupManager] ${this.backups.length} Backups Found`)
    } catch (error: unknown) {
      Logger.error('[BackupManager] Failed to load backups', error)
    }
  }

  async runBackup(): Promise<boolean> {
    Logger.info('[BackupManager] Running Backup')
    const newBackup = new Backup()
    newBackup.setData(this.backupPath)

    await fs.ensureDir(this.AuthorsMetadataPath)

    // Create backup sqlite file
    const sqliteBackupPath = await this.backupSqliteDb(newBackup).catch((error: unknown) => {
      Logger.error('[BackupManager] Failed to backup sqlite db', error)
      const errorMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown Error'
      void NotificationManager.onBackupFailed(errorMsg)
      return null
    })

    if (!sqliteBackupPath) {
      return false
    }

    // Zip sqlite file, /metadata/items, and /metadata/authors folders
    const zipResult = await this.zipBackup(sqliteBackupPath, newBackup).catch((error: unknown) => {
      Logger.error(`[BackupManager] Backup Failed ${error}`)
      const errorMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown Error'
      void NotificationManager.onBackupFailed(errorMsg)
      return false
    })

    // Remove sqlite backup
    await fs.remove(sqliteBackupPath)

    if (!zipResult) return false

    Logger.info(`[BackupManager] Backup successful ${newBackup.id}`)

    if (!newBackup.fullPath) {
      return false
    }
    newBackup.fileSize = await getFileSize(newBackup.fullPath)

    const existingIndex = this.backups.findIndex((b) => b.id === newBackup.id)
    if (existingIndex >= 0) {
      this.backups.splice(existingIndex, 1, newBackup)
    } else {
      this.backups.push(newBackup)
    }

    // Check remove oldest backup
    const removeOldest = this.backups.length > this.backupsToKeep
    if (removeOldest) {
      this.backups.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

      const oldBackup = this.backups.shift()
      if (oldBackup) {
        Logger.debug(`[BackupManager] Removing old backup ${oldBackup.id}`)
        void this.removeBackup(oldBackup)
      }
    }

    // Notification for backup successfully completed
    void NotificationManager.onBackupCompleted(newBackup, this.backups.length, removeOldest)

    return true
  }

  async removeBackup(backup: Backup): Promise<void> {
    try {
      if (!backup.fullPath) return
      Logger.debug(`[BackupManager] Removing Backup "${backup.fullPath}"`)
      await fs.remove(backup.fullPath)
      this.backups = this.backups.filter((b) => b.id !== backup.id)
      Logger.info(`[BackupManager] Backup "${backup.id}" Removed`)
    } catch (error: unknown) {
      Logger.error('[BackupManager] Failed to remove backup', error)
    }
  }

  backupSqliteDb(backup: Backup): Promise<string> {
    if (!Database.dbPath) {
      return Promise.reject(new Error('Database path not configured'))
    }
    const db = new sqlite3.Database(Database.dbPath)
    const dbFilePath = Path.join(global.ConfigPath, `absdatabase.${backup.id}.sqlite`)
    return new Promise(async (resolve, reject) => {
      const backupProcess = db.backup(dbFilePath)
      backupProcess.step(-1)
      backupProcess.finish()

      // Max time ~2 mins
      for (let i = 0; i < 240; i++) {
        if (backupProcess.completed) {
          return resolve(dbFilePath)
        } else if (backupProcess.failed) {
          return reject(backupProcess.message || 'Unknown failure reason')
        }
        await new Promise((r) => setTimeout(r, 500))
      }

      Logger.error('[BackupManager] Backup sqlite timed out')
      reject('Backup timed out')
    })
  }

  zipBackup(sqliteBackupPath: string, backup: Backup): Promise<boolean> {
    if (!backup.fullPath) {
      return Promise.reject(new Error('Backup full path not set'))
    }
    const fullPath = backup.fullPath
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(fullPath)
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      output.on('close', () => {
        Logger.info('[BackupManager]', archive.pointer() + ' total bytes')
        resolve(true)
      })

      output.on('end', () => {
        Logger.debug('Data has been drained')
      })

      output.on('finish', () => {
        Logger.debug('Write Stream Finished')
      })

      output.on('error', (err: unknown) => {
        Logger.debug('Write Stream Error', err)
        reject(err)
      })

      archive.on('warning', function (err: { code?: string; message: string }) {
        if (err.code === 'ENOENT') {
          Logger.warn(`[BackupManager] Archiver warning: ${err.message}`)
        } else {
          Logger.error(`[BackupManager] Archiver error: ${err.message}`)
          reject(err)
        }
      })
      archive.on('error', function (err: Error) {
        Logger.error(`[BackupManager] Archiver error: ${err.message}`)
        reject(err)
      })
      archive.on('progress', ({ fs: fsobj }: { fs: { processedBytes: number } }) => {
        if (this.maxBackupSize !== Infinity) {
          const maxBackupSizeInBytes = this.maxBackupSize * 1000 * 1000 * 1000
          if (fsobj.processedBytes > maxBackupSizeInBytes) {
            Logger.error(`[BackupManager] Archiver is too large - aborting to prevent endless loop, Bytes Processed: ${fsobj.processedBytes}`)
            archive.abort()
            setTimeout(() => {
              void this.removeBackup(backup)
              output.destroy(new Error('Backup too large'))
            }, 500)
          }
        }
      })

      archive.pipe(output)

      archive.file(sqliteBackupPath, { name: 'absdatabase.sqlite' })
      archive.directory(this.ItemsMetadataPath, 'metadata-items')
      archive.directory(this.AuthorsMetadataPath, 'metadata-authors')

      archive.append(backup.detailsString, { name: 'details' })

      void archive.finalize()
    })
  }
}

namespace BackupManager {
  export type BackupManagerInstance = BackupManager
}

export = BackupManager
