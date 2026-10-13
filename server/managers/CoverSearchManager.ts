import { setMaxListeners } from 'events'
import Logger from '../Logger'
import BookFinder from '../finders/BookFinder'
import PodcastFinder from '../finders/PodcastFinder'

interface CoverSearchParams {
  title: string
  author?: string
  provider?: string
  podcast?: boolean
}

interface CoverSearchResultChunk {
  provider: string
  covers: string[]
  total: number
}

/**
 * Manager for handling streaming cover search across multiple providers
 */
class CoverSearchManager {
  activeSearches: Map<string, AbortController>
  providerTimeout: number
  maxListeners: number

  constructor() {
    this.activeSearches = new Map()

    // Default timeout for each provider search
    this.providerTimeout = 10000 // 10 seconds

    // Set to 0 to disable the max listeners limit
    // We need one listener per provider (15+) and may have multiple concurrent searches
    this.maxListeners = 0
  }

  /**
   * Start a streaming cover search
   */
  async startSearch(
    requestId: string,
    searchParams: CoverSearchParams,
    onResult: (result: CoverSearchResultChunk) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (this.activeSearches.has(requestId)) {
      Logger.warn(`[CoverSearchManager] Search with requestId ${requestId} already exists`)
      return
    }

    const abortController = new AbortController()

    // Increase max listeners on this signal to accommodate parallel provider searches
    // AbortSignal is an EventTarget, so we use the events module's setMaxListeners
    setMaxListeners(this.maxListeners, abortController.signal)

    this.activeSearches.set(requestId, abortController)

    Logger.info(`[CoverSearchManager] Starting search ${requestId} with params:`, searchParams)

    try {
      const { title, author, provider, podcast } = searchParams

      if (podcast) {
        await this.searchPodcastCovers(requestId, title, abortController.signal, onResult, onError)
      } else {
        await this.searchBookCovers(requestId, provider || 'all', title, author, abortController.signal, onResult, onError)
      }

      if (!abortController.signal.aborted) {
        onComplete()
      }
    } catch (error: unknown) {
      const err = error as Error
      if (err.name === 'AbortError') {
        Logger.info(`[CoverSearchManager] Search ${requestId} was cancelled`)
      } else {
        Logger.error(`[CoverSearchManager] Search ${requestId} failed:`, error)
        onError(err.message || 'Search failed')
      }
    } finally {
      this.activeSearches.delete(requestId)
    }
  }

  /**
   * Cancel an active search
   */
  cancelSearch(requestId: string): boolean {
    const abortController = this.activeSearches.get(requestId)
    if (abortController) {
      Logger.info(`[CoverSearchManager] Cancelling search ${requestId}`)
      abortController.abort()
      this.activeSearches.delete(requestId)
      return true
    }
    return false
  }

  /**
   * Search for podcast covers
   */
  async searchPodcastCovers(
    _requestId: string,
    title: string,
    signal: AbortSignal,
    onResult: (result: CoverSearchResultChunk) => void,
    onError: (provider: string, error: string) => void
  ): Promise<void> {
    try {
      const results = await this.executeWithTimeout(() => PodcastFinder.findCovers(title), this.providerTimeout, signal)

      if (signal.aborted) return

      const covers = this.extractCoversFromResults(results)
      if (covers.length > 0) {
        onResult({
          provider: 'itunes',
          covers,
          total: covers.length
        })
      }
    } catch (error: unknown) {
      const err = error as Error
      if (err.name !== 'AbortError') {
        Logger.error('[CoverSearchManager] Podcast search failed:', error)
        onError('itunes', err.message || 'Podcast search failed')
      }
    }
  }

  /**
   * Search for book covers across providers
   */
  async searchBookCovers(
    _requestId: string,
    provider: string,
    title: string,
    author: string | undefined,
    signal: AbortSignal,
    onResult: (result: CoverSearchResultChunk) => void,
    onError: (provider: string, error: string) => void
  ): Promise<void> {
    let providers: string[] = []

    if (provider === 'all') {
      providers = [...BookFinder.providers]
    } else if (provider === 'best') {
      // Best providers: google, fantlab, and audible.com
      providers = ['google', 'fantlab', 'audible']
    } else {
      providers = [provider]
    }

    Logger.debug(`[CoverSearchManager] Searching ${providers.length} providers in parallel`)

    // Search all providers in parallel
    const searchPromises = providers.map(async (providerName) => {
      if (signal.aborted) return

      try {
        const searchResults = await this.executeWithTimeout(
          () => BookFinder.search(null, providerName, title, author || ''),
          this.providerTimeout,
          signal
        )

        if (signal.aborted) return

        const covers = this.extractCoversFromResults(searchResults)

        Logger.debug(`[CoverSearchManager] Found ${covers.length} covers from ${providerName}`)

        if (covers.length > 0) {
          onResult({
            provider: providerName,
            covers,
            total: covers.length
          })
        }
      } catch (error: unknown) {
        const err = error as Error
        if (err.name !== 'AbortError') {
          Logger.warn(`[CoverSearchManager] Provider ${providerName} failed:`, err.message)
          onError(providerName, err.message)
        }
      }
    })

    await Promise.allSettled(searchPromises)
  }

  /**
   * Execute a promise with timeout and abort signal
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      let abortHandler: (() => void) | null = null
      let timeoutId: NodeJS.Timeout | null = null

      // Cleanup function to ensure we always remove listeners
      const cleanup = (): void => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (abortHandler) {
          signal.removeEventListener('abort', abortHandler)
          abortHandler = null
        }
      }

      // Set up timeout
      timeoutId = setTimeout(() => {
        cleanup()
        const error = new Error('Provider timeout')
        error.name = 'TimeoutError'
        reject(error)
      }, timeout)

      // Check if already aborted
      if (signal.aborted) {
        cleanup()
        const error = new Error('Search cancelled')
        error.name = 'AbortError'
        reject(error)
        return
      }

      // Set up abort handler
      abortHandler = () => {
        cleanup()
        const error = new Error('Search cancelled')
        error.name = 'AbortError'
        reject(error)
      }
      signal.addEventListener('abort', abortHandler)

      fn()
        .then((result) => {
          cleanup()
          resolve(result)
        })
        .catch((error: unknown) => {
          cleanup()
          reject(error)
        })
    })
  }

  /**
   * Extract cover URLs from search results
   */
  extractCoversFromResults(results: unknown): string[] {
    const covers: string[] = []
    if (!Array.isArray(results)) return covers

    results.forEach((result) => {
      if (typeof result === 'string') {
        covers.push(result)
      } else if (typeof result === 'object' && result !== null) {
        const resObj = result as { covers?: unknown; cover?: unknown }
        if (Array.isArray(resObj.covers)) {
          resObj.covers.forEach((c) => {
            if (typeof c === 'string') covers.push(c)
          })
        }
        if (typeof resObj.cover === 'string') {
          covers.push(resObj.cover)
        }
      }
    })

    // Remove duplicates
    return [...new Set(covers)]
  }

  /**
   * Cancel all active searches (cleanup on server shutdown)
   */
  cancelAllSearches(): void {
    Logger.info(`[CoverSearchManager] Cancelling ${this.activeSearches.size} active searches`)
    for (const abortController of this.activeSearches.values()) {
      abortController.abort()
    }
    this.activeSearches.clear()
  }
}

const coverSearchManager = new CoverSearchManager()

namespace CoverSearchManager {
  export type CoverSearchManagerInstance = CoverSearchManager
  export type CoverSearchParamsType = CoverSearchParams
  export type CoverSearchResultChunkType = CoverSearchResultChunk
}

export = coverSearchManager
