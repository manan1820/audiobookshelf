import { LRUCache } from 'lru-cache'
import type { Request, Response, NextFunction } from 'express'
import Logger from '../Logger'
import Database from '../Database'

interface ApiCacheItem {
  body: unknown
  headers: Record<string, unknown>
  statusCode: number
}

interface IApiCache {
  get(key: string): ApiCacheItem | undefined | null
  set(key: string, value: ApiCacheItem, options?: { ttl?: number }): unknown
  delete?(key: string): boolean
  clear?(): void
  keys?(): Iterable<string>
  size?: number
  calculatedSize?: number
}

interface TtlOptions {
  ttl: number
}

interface DatabaseLike {
  sequelize: {
    addHook: (hook: string, fn: (model: unknown) => void) => void
  }
}

class ApiCacheManager {
  defaultCacheOptions: LRUCache.Options<string, ApiCacheItem, unknown> = {
    max: 1000,
    maxSize: 10 * 1000 * 1000,
    sizeCalculation: (item: ApiCacheItem) => {
      const bodyLen = typeof item.body === 'string' ? item.body.length : (item.body as Buffer)?.length || 0
      return bodyLen + JSON.stringify(item.headers).length
    }
  }

  defaultTtlOptions: TtlOptions = { ttl: 30 * 60 * 1000 }
  highChurnModels = new Set(['session', 'mediaProgress', 'playbackSession', 'device'])
  modelsInvalidatingPersonalized = new Set(['mediaProgress'])
  modelsInvalidatingMe = new Set(['session', 'mediaProgress', 'playbackSession', 'device'])

  cache: IApiCache
  ttlOptions: TtlOptions

  constructor(cache?: IApiCache, ttlOptions: TtlOptions = { ttl: 30 * 60 * 1000 }) {
    this.cache = cache || new LRUCache<string, ApiCacheItem>(this.defaultCacheOptions)
    this.ttlOptions = ttlOptions
  }

  init(database: DatabaseLike = Database as unknown as DatabaseLike): void {
    const hooks = ['afterCreate', 'afterUpdate', 'afterDestroy', 'afterBulkCreate', 'afterBulkUpdate', 'afterBulkDestroy', 'afterUpsert']
    hooks.forEach((hook) => database.sequelize.addHook(hook, (model: unknown) => this.clear(model, hook)))
  }

  getModelName(model: unknown): string {
    const m = model as { name?: unknown; model?: { name?: unknown }; constructor?: { name?: unknown } } | null
    if (typeof m?.name === 'string') return m.name
    if (typeof m?.model?.name === 'string') return m.model.name
    if (typeof m?.constructor?.name === 'string' && m.constructor.name !== 'Object') return m.constructor.name
    return 'unknown'
  }

  clearByUrlPattern(urlPattern: RegExp): number {
    let removed = 0
    if (!this.cache.keys) return 0
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
    const removedMe = this.modelsInvalidatingMe.has(modelName) ? this.clearByUrlPattern(/^\/me(\/|\?|$)/) : 0
    Logger.debug(`[ApiCacheManager] ${modelName}.${hook}: cleared user-progress cache slices (personalized=${removedPersonalized}, recentEpisodes=${removedRecentEpisodes}, me=${removedMe})`)
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
      if (req.query.sort === 'random') {
        Logger.debug(`[ApiCacheManager] Skipping cache for random sort`)
        return next()
      }

      const user = (req as Request & { user?: { username?: string } }).user
      const key = { user: user?.username, url: req.url }
      const stringifiedKey = JSON.stringify(key)
      Logger.debug(`[ApiCacheManager] count: ${this.cache.size ?? 0} size: ${this.cache.calculatedSize ?? 0}`)
      const cached = this.cache.get(stringifiedKey)
      if (cached) {
        Logger.debug(`[ApiCacheManager] Cache hit: ${stringifiedKey}`)
        res.set(cached.headers as Record<string, string>)
        res.status(cached.statusCode)
        res.send(cached.body)
        return
      }

      const resWithOriginal = res as Response & { originalSend?: (body?: unknown) => unknown }
      resWithOriginal.originalSend = res.send
      res.send = ((body: unknown) => {
        Logger.debug(`[ApiCacheManager] Cache miss: ${stringifiedKey}`)
        const cachedItem: ApiCacheItem = { body, headers: res.getHeaders() as Record<string, unknown>, statusCode: res.statusCode }
        if (key.url.search(/^\/libraries\/.*?\/personalized/) !== -1) {
          Logger.debug(`[ApiCacheManager] Caching with ${this.ttlOptions.ttl} ms TTL`)
          this.cache.set(stringifiedKey, cachedItem, this.ttlOptions)
        } else {
          this.cache.set(stringifiedKey, cachedItem)
        }
        resWithOriginal.originalSend!(body)
        return res
      }) as unknown as Response['send']
      next()
    }
  }
}

export = ApiCacheManager
