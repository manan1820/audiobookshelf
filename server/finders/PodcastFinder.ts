import Logger from '../Logger'
import iTunes, { iTunesPodcastSearchResult } from '../providers/iTunes'

interface PodcastFinderSearchOptions {
  country?: string
}

class PodcastFinder {
  iTunesApi: iTunes

  constructor() {
    this.iTunesApi = new iTunes()
  }

  async search(
    term: string,
    options: PodcastFinderSearchOptions = {}
  ): Promise<iTunesPodcastSearchResult[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term, options)
    Logger.debug(`[iTunes] Podcast search for "${term}" returned ${results.length} results`)
    return results
  }

  async findCovers(term: string): Promise<string[] | null> {
    if (!term) return null
    Logger.debug(`[iTunes] Searching for podcast covers with term "${term}"`)
    const results = await this.iTunesApi.searchPodcasts(term)
    if (!results) return []
    return results
      .map((r: iTunesPodcastSearchResult) => r.cover)
      .filter((r): r is string => Boolean(r))
  }
}

const podcastFinder = new PodcastFinder()
export = podcastFinder
