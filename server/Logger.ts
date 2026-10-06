import util from 'util'
import date from './libs/dateAndTime'
import { LogLevel, type LogLevelName } from './utils/constants'
import type { ILogManager, LogObject, SocketListener } from './types'

declare global {
  var isWin: boolean | undefined
}


class Logger {
  logManager: ILogManager | null
  isDev: boolean
  logLevel: number
  socketListeners: SocketListener[]

  constructor() {
    this.logManager = null
    this.isDev = process.env.NODE_ENV !== 'production'
    this.logLevel = !this.isDev ? LogLevel.INFO : LogLevel.TRACE
    this.socketListeners = []
  }

  get timestamp(): string {
    return date.format(new Date(), 'YYYY-MM-DD HH:mm:ss.SSS')
  }

  get levelString(): string {
    return this.getLogLevelString(this.logLevel)
  }

  get source(): string {
    const isWindows = global.isWin ?? process.platform === 'win32'
    const regex = isWindows ? /^.*\\([^\\:]*:[0-9]*):[0-9]*\)*/ : /^.*\/([^/:]*:[0-9]*):[0-9]*\)*/
    const stack = new Error().stack
    if (!stack) return 'unknown'
    const lines = stack.split('\n')
    const targetLine = lines[3] || ''
    return targetLine.replace(regex, '$1')
  }

  getLogLevelString(level: number): string {
    const keys = Object.keys(LogLevel) as LogLevelName[]
    for (const key of keys) {
      if (LogLevel[key] === level) {
        return key
      }
    }
    return 'UNKNOWN'
  }

  addSocketListener(socket: { id: string; emit(event: string, data: unknown): void }, level: number): void {
    const index = this.socketListeners.findIndex((s) => s.id === socket.id)
    if (index >= 0) {
      this.socketListeners.splice(index, 1, {
        id: socket.id,
        socket,
        level
      })
    } else {
      this.socketListeners.push({
        id: socket.id,
        socket,
        level
      })
    }
  }

  removeSocketListener(socketId: string): void {
    this.socketListeners = this.socketListeners.filter((s) => s.id !== socketId)
  }

  async #logToFileAndListeners(level: number, levelName: string, args: unknown[], src: string): Promise<void> {
    const expandedArgs = args.map((arg) => (typeof arg !== 'string' ? util.inspect(arg) : arg))
    const logObj: LogObject = {
      timestamp: this.timestamp,
      source: src,
      message: expandedArgs.join(' '),
      levelName,
      level
    }

    // Emit log to sockets that are listening to log events
    this.socketListeners.forEach((socketListener) => {
      if (level >= LogLevel.FATAL || level >= socketListener.level) {
        socketListener.socket.emit('log', logObj)
      }
    })

    // Save log to file
    if (level >= LogLevel.FATAL || level >= this.logLevel) {
      await this.logManager?.logToFile(logObj)
    }
  }

  setLogLevel(level: number): void {
    this.logLevel = level
    this.debug(`Set Log Level to ${this.levelString}`)
  }

  static readonly ConsoleMethods: Record<LogLevelName, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'log'> = {
    TRACE: 'trace',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'error',
    NOTE: 'log'
  }

  #log(levelName: LogLevelName, source: string, ...args: unknown[]): Promise<void> | void {
    const level = LogLevel[levelName]
    if (level < LogLevel.FATAL && level < this.logLevel) return
    const consoleMethod = Logger.ConsoleMethods[levelName]
    console[consoleMethod](`[${this.timestamp}] ${levelName}:`, ...args)
    return this.#logToFileAndListeners(level, levelName, args, source)
  }

  trace(...args: unknown[]): Promise<void> | void {
    return this.#log('TRACE', this.source, ...args)
  }

  debug(...args: unknown[]): Promise<void> | void {
    return this.#log('DEBUG', this.source, ...args)
  }

  info(...args: unknown[]): Promise<void> | void {
    return this.#log('INFO', this.source, ...args)
  }

  warn(...args: unknown[]): Promise<void> | void {
    return this.#log('WARN', this.source, ...args)
  }

  error(...args: unknown[]): Promise<void> | void {
    return this.#log('ERROR', this.source, ...args)
  }

  fatal(...args: unknown[]): Promise<void> | void {
    return this.#log('FATAL', this.source, ...args)
  }

  note(...args: unknown[]): Promise<void> | void {
    return this.#log('NOTE', this.source, ...args)
  }
}

const logger = new Logger()

export = logger
