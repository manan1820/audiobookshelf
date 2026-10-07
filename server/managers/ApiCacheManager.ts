import { LRUCache } from 'lru-cache'
import type { Request, Response, NextFunction } from 'express'
import Logger from '../Logger'
import Database from '../Database'

namespace ApiCacheManager {
  export interface CacheItem {
    body: unknown
    headers: Record<string, string | number | string[] | undefined>
    statusCode: number
  }

  export interface CacheOptions {
    max: number
    maxSize: number
    sizeCalculation: (item: CacheItem) => number
  }

  export interface TtlOptions {
    ttl: number
  }

  export interface CacheInterface {
    get: (key: string) => CacheItem | undefined | null
    set: (key: string, value: CacheItem, options?: TtlOptions) => unknown
    keys?: () => Iterable<string>
    delete?: (key: string) => boolean
    clear?: () => void
    size?: number
    calculatedSize?: number
  }

  export interface DatabaseWithSequelizeHooks {
    sequelize: {
      addHook: (hook: string, fn: (model: unknown) => void) => void
    } | null
  }
}

class ApiCacheManager {
  defaultCacheOptions: ApiCacheManager.CacheOptions = {
    max: 1000,
    maxSize: 10 * 1000 * 1000,
    sizeCalculation: (item: ApiCacheManager.CacheItem) => {
      const bodyLen =
        typeof item.body === 'string'
          ? item.body.length
          : JSON.stringify(item.body ?? '').length
      return bodyLen + JSON.stringify(item.headers).length
    }
  }

  defaultTtlOptions: ApiCacheManager.TtlOptions = { ttl: 30 * 60 * 1000 }
  highChurnModels = new Set(['session', 'mediaProgress', 'playbackSession', 'device'])
  modelsInvalidatingPersonalized = new Set(['mediaProgress'])
  modelsInvalidatingMe = new Set(['session', 'mediaProgress', 'playbackSession', 'device'])

  cache: LRUCache<string, ApiCacheManager.CacheItem> | ApiCacheManager.CacheInterface
  ttlOptions: ApiCacheManager.TtlOptions

  constructor(
    cache:
      | LRUCache<string, ApiCacheManager.CacheItem>
      | ApiCacheManager.CacheInterface = new LRUCache<
      string,
      ApiCacheManager.CacheItem
    >(this.defaultCacheOptions),
    ttlOptions: ApiCacheManager.TtlOptions = this.defaultTtlOptions
  ) {
    this.cache = cache
    this.ttlOptions = ttlOptions
  }

  init(database: ApiCacheManager.DatabaseWithSequelizeHooks = Database): void {
    if (!database.sequelize) return
    const hooks = [
      'afterCreate',
      'afterUpdate',
      'afterDestroy',
      'afterBulkCreate',
      'afterBulkUpdate',
      'afterBulkDestroy',
      'afterUpsert'
    ]
    hooks.forEach((hook) =>
      database.sequelize?.addHook(hook, (model: unknown) => this.clear(model, hook))
    )
  }

  getModelName(model: unknown): string {
    if (typeof model === 'object' && model !== null) {
      const m = model as {
        name?: unknown
        model?: { name?: unknown }
        constructor?: { name?: unknown }
      }
      if (typeof m.name === 'string') return m.name
      if (typeof m.model?.name === 'string') return m.model.name
      if (
        typeof m.constructor?.name === 'string' &&
        m.constructor.name !== 'Object'
      ) {
        return m.constructor.name
      }
    }
    return 'unknown'
  }

  clearByUrlPattern(urlPattern: RegExp): number {
    let removed = 0
    if (typeof this.cache.keys !== 'function') return 0

    for (const key of this.cache.keys()) {
      try {
        const parsed = JSON.parse(key) as { url?: unknown }
        if (typeof parsed?.url === 'string' && urlPattern.test(parsed.url)) {
          if (this.cache.delete?.(key)) removed++
        }
      } catch {
        if (this.cache.delete?.(key)) removed++
      }
    }
    return removed
  }

  clearUserProgressSlices(modelName: string, hook: string): void {
    let removedPersonalized = 0
    let removedRecentEpisodes = 0
    if (this.modelsInvalidatingPersonalized.has(modelName)) {
      removedPersonalized = this.clearByUrlPattern(/^\/libraries\/[^/]+\/personalized/)
      removedRecentEpisodes = this.clearByUrlPattern(/^\/libraries\/[^/]+\/recent-episodes/)
    }
    const removedMe = this.modelsInvalidatingMe.has(modelName)
      ? this.clearByUrlPattern(/^\/me(\/|\?|$)/)
      : 0
    Logger.debug(
      `[ApiCacheManager] ${modelName}.${hook}: cleared user-progress cache slices (personalized=${removedPersonalized}, recentEpisodes=${removedRecentEpisodes}, me=${removedMe})`
    )
  }

  clear(model: unknown, hook: string): void {
    const modelName = this.getModelName(model)
    if (this.highChurnModels.has(modelName)) {
      this.clearUserProgressSlices(modelName, hook)
      return
    }

    Logger.debug(`[ApiCacheManager] ${modelName}.${hook}: Clearing cache`)
    this.cache.clear?.()
  }

  /**
   * Reset hooks and clear cache. Used when applying backups
   */
  reset(): void {
    Logger.info(`[ApiCacheManager] Resetting cache`)

    this.init()
    this.cache.clear?.()
  }

  get middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (req.query?.sort === 'random') {
        Logger.debug(`[ApiCacheManager] Skipping cache for random sort`)
        return next()
      }

      const username = req.user?.username ?? ''
      const url = req.url ?? ''
      const key = { user: username, url }
      const stringifiedKey = JSON.stringify(key)
      Logger.debug(`[ApiCacheManager] count: ${this.cache.size} size: ${this.cache.calculatedSize}`)
      const cached = this.cache.get(stringifiedKey)
      if (cached) {
        Logger.debug(`[ApiCacheManager] Cache hit: ${stringifiedKey}`)
        res.set(cached.headers)
        res.status(cached.statusCode)
        res.send(cached.body)
        return
      }

      const resWithOriginal = res as Response & {
        originalSend?: (body?: unknown) => Response
      }
      resWithOriginal.originalSend = res.send
      res.send = ((body?: unknown): Response => {
        Logger.debug(`[ApiCacheManager] Cache miss: ${stringifiedKey}`)
        const headers = res.getHeaders() as Record<string, string | number | string[] | undefined>
        const cachedItem: ApiCacheManager.CacheItem = {
          body,
          headers,
          statusCode: res.statusCode
        }
        if (key.url.search(/^\/libraries\/.*?\/personalized/) !== -1) {
          Logger.debug(`[ApiCacheManager] Caching with ${this.ttlOptions.ttl} ms TTL`)
          this.cache.set(stringifiedKey, cachedItem, this.ttlOptions)
        } else {
          this.cache.set(stringifiedKey, cachedItem)
        }
        if (resWithOriginal.originalSend) {
          return resWithOriginal.originalSend(body)
        }
        return res
      }) as Response['send']

      next()
    }
  }
}

export = ApiCacheManager
