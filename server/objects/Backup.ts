import Path from 'path'
import date from '../libs/dateAndTime'
import packageJson from '../../package.json'
import type { BackupData, BackupJsonObject } from '../types'

const version = packageJson.version

class Backup {
  id: string | null
  key: string | null
  datePretty: string | null
  backupDirPath: string | null
  filename: string | null
  path: string | null
  fullPath: string | null
  serverVersion: string | null
  fileSize: number | null
  createdAt: number | null

  constructor(data?: BackupData | null) {
    this.id = null
    this.key = null
    this.datePretty = null

    this.backupDirPath = null
    this.filename = null
    this.path = null
    this.fullPath = null
    this.serverVersion = null

    this.fileSize = null
    this.createdAt = null

    if (data) {
      this.construct(data)
    }
  }

  get detailsString(): string {
    const details: (string | number | null)[] = []
    details.push(this.id)
    details.push(this.key)
    details.push(this.createdAt)
    details.push(this.serverVersion)
    return details.join('\n')
  }

  construct(data: BackupData): void {
    this.id = String(data.details[0])
    this.key = data.details[1] ? String(data.details[1]) : null
    if (this.key === '1') this.key = null

    this.createdAt = Number(data.details[2])
    this.serverVersion = data.details[3] ? String(data.details[3]) : null

    this.datePretty = date.format(new Date(this.createdAt), 'ddd, MMM D YYYY HH:mm')

    this.backupDirPath = Path.dirname(data.fullPath)
    this.filename = Path.basename(data.fullPath)
    this.path = Path.join('backups', this.filename)
    this.fullPath = data.fullPath
  }

  toJSON(): BackupJsonObject {
    return {
      id: this.id,
      key: this.key,
      backupDirPath: this.backupDirPath,
      datePretty: this.datePretty,
      fullPath: this.fullPath,
      path: this.path,
      filename: this.filename,
      fileSize: this.fileSize,
      createdAt: this.createdAt,
      serverVersion: this.serverVersion
    }
  }

  setData(backupDirPath: string): void {
    this.id = date.format(new Date(), 'YYYY-MM-DD[T]HHmm')
    this.key = 'sqlite'
    this.datePretty = date.format(new Date(), 'ddd, MMM D YYYY HH:mm')

    this.backupDirPath = backupDirPath

    this.filename = this.id + '.audiobookshelf'
    this.path = Path.join('backups', this.filename)
    this.fullPath = Path.join(this.backupDirPath, this.filename)

    this.serverVersion = version

    this.createdAt = Date.now()
  }
}

export = Backup
