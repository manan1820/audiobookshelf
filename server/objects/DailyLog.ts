import Path from 'path'
import date from '../libs/dateAndTime'
import * as fs from '../libs/fsExtra'
import * as fileUtils from '../utils/fileUtils'
import Logger from '../Logger'
import type { DailyLogJSON, LogObject } from '../types'

class DailyLog {
  id: string
  dailyLogDirPath: string
  filename: string
  fullPath: string
  createdAt: number
  logs: LogObject[]
  bufferedLogLines: string[]
  locked: boolean

  constructor(dailyLogDirPath: string) {
    this.id = date.format(new Date(), 'YYYY-MM-DD')

    this.dailyLogDirPath = dailyLogDirPath
    this.filename = this.id + '.txt'
    this.fullPath = Path.join(this.dailyLogDirPath, this.filename)

    this.createdAt = Date.now()

    this.logs = []
    this.bufferedLogLines = []

    this.locked = false
  }

  static getCurrentDailyLogFilename(): string {
    return date.format(new Date(), 'YYYY-MM-DD') + '.txt'
  }

  static getCurrentDateString(): string {
    return date.format(new Date(), 'YYYY-MM-DD')
  }

  toJSON(): DailyLogJSON {
    return {
      id: this.id,
      dailyLogDirPath: this.dailyLogDirPath,
      fullPath: this.fullPath,
      filename: this.filename,
      createdAt: this.createdAt
    }
  }

  appendBufferedLogs(): Promise<void> {
    const buffered = [...this.bufferedLogLines]
    this.bufferedLogLines = []

    let oneBigLog = ''
    buffered.forEach((logLine) => {
      oneBigLog += logLine
    })
    return this.appendLogLine(oneBigLog)
  }

  appendLog(logObj: LogObject): Promise<void> {
    this.logs.push(logObj)
    return this.appendLogLine(JSON.stringify(logObj) + '\n')
  }

  async appendLogLine(line: string): Promise<void> {
    if (this.locked) {
      this.bufferedLogLines.push(line)
      return
    }
    this.locked = true

    await fs.writeFile(this.fullPath, line, { flag: 'a+' }).catch((error: unknown) => {
      console.log('[DailyLog] Append log failed', error)
    })

    this.locked = false
    if (this.bufferedLogLines.length) {
      await this.appendBufferedLogs()
    }
  }

  async loadLogs(): Promise<void> {
    if (!(await fs.pathExists(this.fullPath))) {
      console.error('Daily log does not exist')
      return
    }

    const text = (await fileUtils.readTextFile(this.fullPath)) as string

    let hasFailures = false

    let logLines = text.split(/\r?\n/)
    if (logLines.length && !logLines[logLines.length - 1]) logLines = logLines.slice(0, -1)

    this.logs = logLines
      .map((t) => {
        if (!t) {
          hasFailures = true
          return null
        }
        try {
          return JSON.parse(t) as LogObject
        } catch (err) {
          console.error('Failed to parse log line', t, err)
          hasFailures = true
          return null
        }
      })
      .filter((l): l is LogObject => l !== null)

    if (hasFailures) {
      const newLogLines = this.logs.map((l) => JSON.stringify(l)).join('\n') + '\n'
      await fs.writeFile(this.fullPath, newLogLines)
      console.log('Re-Saved log file to remove bad lines')
    }

    Logger.debug(`[DailyLog] ${this.id}: Loaded ${this.logs.length} Logs`)
  }
}

export = DailyLog
