import OpenLibrary from '../providers/OpenLibrary'
import GoogleBooks from '../providers/GoogleBooks'
import Audible from '../providers/Audible'
import iTunes from '../providers/iTunes'
import Audnexus from '../providers/Audnexus'
import FantLab from '../providers/FantLab'
import AudiobookCovers from '../providers/AudiobookCovers'
import CustomProviderAdapter from '../providers/CustomProviderAdapter'
import Logger from '../Logger'
import { levenshteinDistance, levenshteinSimilarity, escapeRegExp, isValidASIN } from '../utils/index'
import htmlSanitizer from '../utils/htmlSanitizer'
import type LibraryItem from '../models/LibraryItem'

interface BookSearchSeries {
  series: string
  sequence?: string
}

interface BookSearchResult {
  title?: string
  subtitle?: string | null
  author?: string | null
  narrator?: string | null
  publisher?: string | null
  publishedYear?: string | null
  description?: string | null
  descriptionPlain?: string | null
  cover?: string | null
  covers?: string[]
  asin?: string | null
  isbn?: string | null
  genres?: string[] | null
  tags?: string[] | null
  series?: BookSearchSeries[] | string | null
  language?: string | null
  duration?: number | null
  region?: string | null
  rating?: string | number | null
  abridged?: boolean
  explicit?: boolean
  errorCode?: number | string
  errorMsg?: string
  cleanedTitle?: string
  cleanedAuthor?: string
  titleDistance?: number
  authorDistance?: number
  totalPossibleDistance?: number
  totalDistance?: number
  includesTitle?: string
  includesAuthor?: string
  matchConfidence?: number | null
}

interface AudnexusAuthorAsin {
  name: string
  asin?: string
}

interface AudnexusLike {
  authorASINsRequest: (name: string, region?: string) => Promise<AudnexusAuthorAsin[]>
}

interface AudnexusChapter {
  id?: number
  start?: number
  length?: number
  title?: string
}

interface AudnexusChapterData {
  asin?: string
  brand?: string
  chapters?: AudnexusChapter[]
}

interface BookFinderSearchOptions {
  titleDistance?: number | string
  authorDistance?: number | string
  maxFuzzySearches?: number | string
}

interface LibraryItemLike {
  media?: {
    duration?: number | null
  } | null
}

class TitleCandidates {
  candidates: Set<string>
  cleanAuthor: string | null
  priorities: { [key: string]: number }
  positions: { [key: string]: number }
  currentPosition: number

  constructor(cleanAuthor: string | null) {
    this.candidates = new Set()
    this.cleanAuthor = cleanAuthor
    this.priorities = {}
    this.positions = {}
    this.currentPosition = 0
  }

  add(title: string): void {
    // if title contains the author, remove it
    title = this.#removeAuthorFromTitle(title)

    const titleTransformers: [RegExp, string][] = [
      [/(: |[,;_]| by ).*/g, ''], // Remove subtitle
      [/(^| )\d+k(bps)?( |$)/, ' '], // Remove bitrate
      [/ (2nd|3rd|\d+th)\s+ed(\.|ition)?/g, ''], // Remove edition
      [/(^| |\.)(m4b|m4a|mp3)( |$)/g, ''], // Remove file-type
      [/ a novel.*$/g, ''], // Remove "a novel"
      [/(^| )(un)?abridged( |$)/g, ' '], // Remove "unabridged/abridged"
      [/^\d+ | \d+$/g, ''] // Remove preceding/trailing numbers
    ]

    // Main variant
    const cleanTitle = cleanTitleForCompares(title).trim()
    if (!cleanTitle) return
    this.candidates.add(cleanTitle)
    this.priorities[cleanTitle] = 0
    this.positions[cleanTitle] = this.currentPosition

    let candidate = cleanTitle

    for (const transformer of titleTransformers) candidate = candidate.replace(transformer[0], transformer[1]).trim()

    if (candidate !== cleanTitle) {
      if (candidate) {
        this.candidates.add(candidate)
        this.priorities[candidate] = 0
        this.positions[candidate] = this.currentPosition
      }
      this.priorities[cleanTitle] = 1
    }
    this.currentPosition++
  }

  get size(): number {
    return this.candidates.size
  }

  getCandidates(): string[] {
    const candidates = [...this.candidates]
    candidates.sort((a, b) => {
      // Candidates that include only digits are also likely low quality
      const onlyDigits = /^\d+$/
      const includesOnlyDigitsDiff = (onlyDigits.test(a) ? 1 : 0) - (onlyDigits.test(b) ? 1 : 0)
      if (includesOnlyDigitsDiff) return includesOnlyDigitsDiff
      // transformed candidates receive higher priority
      const priorityDiff = (this.priorities[a] ?? 0) - (this.priorities[b] ?? 0)
      if (priorityDiff) return priorityDiff
      // if same priority, prefer candidates that are closer to the beginning (e.g. titles before subtitles)
      const positionDiff = (this.positions[a] ?? 0) - (this.positions[b] ?? 0)
      return positionDiff // candidates with same priority always have different positions
    })
    Logger.debug(`[${this.constructor.name}] Found ${candidates.length} fuzzy title candidates`)
    Logger.debug(candidates)
    return candidates
  }

  delete(title: string): boolean {
    return this.candidates.delete(title)
  }

  #removeAuthorFromTitle(title: string): string {
    if (!this.cleanAuthor) return title
    const authorRe = new RegExp(`(^| | by |)${escapeRegExp(this.cleanAuthor)}(?= |$)`, 'g')
    const authorCleanedTitle = cleanAuthorForCompares(title)
    const authorCleanedTitleWithoutAuthor = authorCleanedTitle.replace(authorRe, '')
    if (authorCleanedTitleWithoutAuthor !== authorCleanedTitle) {
      return authorCleanedTitleWithoutAuthor.trim()
    }
    return title
  }
}

class AuthorCandidates {
  audnexus: AudnexusLike
  candidates: Set<string>
  cleanAuthor: string | null

  constructor(cleanAuthor: string | null, audnexus: AudnexusLike) {
    this.audnexus = audnexus
    this.candidates = new Set()
    this.cleanAuthor = cleanAuthor
    if (cleanAuthor) this.candidates.add(cleanAuthor)
  }

  validateAuthor(name: string, region = '', maxLevenshtein = 2): Promise<string> {
    return this.audnexus.authorASINsRequest(name, region).then((asins) => {
      for (const [i, asin] of asins.entries()) {
        if (i > 10) break
        const cleanName = cleanAuthorForCompares(asin.name)
        if (!cleanName) continue
        if (cleanName.includes(name)) return name
        if (name.includes(cleanName)) return cleanName
        if (levenshteinDistance(cleanName, name) <= maxLevenshtein) return cleanName
      }
      return ''
    })
  }

  add(author: string): void {
    const cleanAuthor = cleanAuthorForCompares(author).trim()
    if (!cleanAuthor) return
    this.candidates.add(cleanAuthor)
  }

  get size(): number {
    return this.candidates.size
  }

  get agressivelyCleanAuthor(): string {
    if (this.cleanAuthor) {
      const agressivelyCleanAuthor = this.cleanAuthor.replace(/[,/-].*$/, '').trim()
      return agressivelyCleanAuthor ? agressivelyCleanAuthor : this.cleanAuthor
    }
    return ''
  }

  async getCandidates(): Promise<string[]> {
    const promises: Promise<string>[] = []
    for (const candidate of this.candidates) {
      promises.push(this.validateAuthor(candidate))
    }
    const results = [...new Set(await Promise.all(promises))]
    const filteredCandidates = results.filter((author): author is string => Boolean(author))
    // If no valid candidates were found, add back an aggresively cleaned author version
    if (!filteredCandidates.length && this.cleanAuthor) filteredCandidates.push(this.agressivelyCleanAuthor)
    // Always add an empty author candidate
    filteredCandidates.push('')
    Logger.debug(`[${this.constructor.name}] Found ${filteredCandidates.length} fuzzy author candidates`)
    Logger.debug(filteredCandidates)
    return filteredCandidates
  }

  delete(author: string): boolean {
    return this.candidates.delete(author)
  }
}

class BookFinder {
  #providerResponseTimeout = 10000

  openLibrary: OpenLibrary
  googleBooks: GoogleBooks
  audible: Audible
  iTunesApi: iTunes
  audnexus: Audnexus
  fantLab: FantLab
  audiobookCovers: AudiobookCovers
  customProviderAdapter: CustomProviderAdapter
  providers: string[]
  verbose: boolean

  static TitleCandidates = TitleCandidates
  static AuthorCandidates = AuthorCandidates

  constructor() {
    this.openLibrary = new OpenLibrary()
    this.googleBooks = new GoogleBooks()
    this.audible = new Audible()
    this.iTunesApi = new iTunes()
    this.audnexus = new Audnexus()
    this.fantLab = new FantLab()
    this.audiobookCovers = new AudiobookCovers()
    this.customProviderAdapter = new CustomProviderAdapter()

    this.providers = ['google', 'itunes', 'openlibrary', 'fantlab', 'audiobookcovers', 'audible', 'audible.ca', 'audible.uk', 'audible.au', 'audible.fr', 'audible.de', 'audible.jp', 'audible.it', 'audible.in', 'audible.es']

    this.verbose = false
  }

  async findByISBN(isbn: string): Promise<BookSearchResult | null> {
    const book = await this.openLibrary.isbnLookup(isbn)
    if (book && 'errorCode' in book && book.errorCode) {
      Logger.error('Book not found')
    }
    return book
  }

  filterSearchResults(
    books: BookSearchResult[],
    title: string,
    author: string | null | undefined,
    maxTitleDistance: number,
    maxAuthorDistance: number
  ): BookSearchResult[] {
    const searchTitle = cleanTitleForCompares(title)
    const searchAuthor = cleanAuthorForCompares(author || '')
    return books
      .map((b) => {
        b.cleanedTitle = cleanTitleForCompares(b.title || '')
        b.titleDistance = levenshteinDistance(b.cleanedTitle, title)

        // Total length of search (title or both title & author)
        b.totalPossibleDistance = (b.title || '').length

        if (author) {
          if (!b.author) {
            b.authorDistance = author.length
          } else {
            b.totalPossibleDistance += b.author.length
            b.cleanedAuthor = cleanAuthorForCompares(b.author)

            const cleanedAuthorDistance = levenshteinDistance(b.cleanedAuthor, searchAuthor)
            const authorDistance = levenshteinDistance(b.author || '', author)

            // Use best distance
            b.authorDistance = Math.min(cleanedAuthorDistance, authorDistance)

            // Check book author contains searchAuthor
            if (searchAuthor.length > 4 && b.cleanedAuthor.includes(searchAuthor)) b.includesAuthor = searchAuthor
            else if (author.length > 4 && b.author.includes(author)) b.includesAuthor = author
          }
        }
        b.totalDistance = (b.titleDistance || 0) + (b.authorDistance || 0)

        // Check book title contains the searchTitle
        if (searchTitle.length > 4 && b.cleanedTitle.includes(searchTitle)) b.includesTitle = searchTitle
        else if (title.length > 4 && (b.title || '').includes(title)) b.includesTitle = title

        return b
      })
      .filter((b) => {
        if (b.includesTitle) {
          // If search title was found in result title then skip over leven distance check
          if (this.verbose) Logger.debug(`Exact title was included in "${b.title}", Search: "${b.includesTitle}"`)
        } else if (b.titleDistance !== undefined && b.titleDistance > maxTitleDistance) {
          if (this.verbose) Logger.debug(`Filtering out search result title distance = ${b.titleDistance}: "${b.cleanedTitle}"/"${searchTitle}"`)
          return false
        }

        if (author) {
          if (b.includesAuthor) {
            // If search author was found in result author then skip over leven distance check
            if (this.verbose) Logger.debug(`Exact author was included in "${b.author}", Search: "${b.includesAuthor}"`)
          } else if (b.authorDistance !== undefined && b.authorDistance > maxAuthorDistance) {
            if (this.verbose) Logger.debug(`Filtering out search result "${b.author}", author distance = ${b.authorDistance}: "${b.author}"/"${author}"`)
            return false
          }
        }

        // If book total search length < 5 and was not exact match, then filter out
        if (b.totalPossibleDistance !== undefined && b.totalPossibleDistance < 5 && b.totalDistance !== undefined && b.totalDistance > 0) return false
        return true
      })
  }

  async getOpenLibResults(
    title: string,
    author: string | null | undefined,
    maxTitleDistance: number,
    maxAuthorDistance: number
  ): Promise<BookSearchResult[]> {
    const books = await this.openLibrary.searchTitle(title, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`OpenLib Book Search Results: ${Array.isArray(books) ? books.length : 0}`)
    if (!books || !Array.isArray(books)) {
      if (books && 'errorCode' in books) {
        Logger.error(`OpenLib Search Error ${books.errorCode}`)
      }
      return []
    }
    const booksFiltered = this.filterSearchResults(books, title, author, maxTitleDistance, maxAuthorDistance)
    if (!booksFiltered.length && books.length) {
      if (this.verbose) Logger.debug(`Search has ${books.length} matches, but no close title matches`)
    }
    booksFiltered.sort((a, b) => {
      return (a.totalDistance || 0) - (b.totalDistance || 0)
    })

    return booksFiltered
  }

  async getGoogleBooksResults(title: string, author?: string | null): Promise<BookSearchResult[]> {
    const books = await this.googleBooks.search(title, author || '', this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`GoogleBooks Book Search Results: ${books?.length || 0}`)
    if (!books || !Array.isArray(books)) {
      if (books && 'errorCode' in books) {
        Logger.error(`GoogleBooks Search Error ${books.errorCode}`)
      }
      return []
    }
    return books
  }

  async getFantLabResults(title: string, author?: string | null): Promise<BookSearchResult[]> {
    const books = await this.fantLab.search(title, author || '', this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`FantLab Book Search Results: ${books?.length || 0}`)
    if (!books || !Array.isArray(books)) {
      if (books && 'errorCode' in books) {
        Logger.error(`FantLab Search Error ${books.errorCode}`)
      }
      return []
    }

    return books
  }

  async getAudiobookCoversResults(search: string): Promise<BookSearchResult[]> {
    const covers = await this.audiobookCovers.search(search, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`AudiobookCovers Search Results: ${covers?.length || 0}`)
    return covers || []
  }

  async getiTunesAudiobooksResults(title: string): Promise<BookSearchResult[]> {
    const books = await this.iTunesApi.searchAudiobooks(title, this.#providerResponseTimeout)
    return books || []
  }

  async getAudibleResults(title: string, author?: string | null, asin?: string | null, provider = ''): Promise<BookSearchResult[]> {
    const region = provider.includes('.') ? provider.split('.').pop() || '' : ''
    const books = await this.audible.search(title, author || '', asin || '', region, this.#providerResponseTimeout)
    if (this.verbose) Logger.debug(`Audible Book Search Results: ${books?.length || 0}`)
    if (!books || !Array.isArray(books)) return []
    return books
  }

  async getCustomProviderResults(title: string, author?: string | null, isbn?: string | null, providerSlug = ''): Promise<BookSearchResult[]> {
    try {
      const books = await this.customProviderAdapter.search(title, author || '', isbn || '', providerSlug, 'book', this.#providerResponseTimeout)
      if (this.verbose) Logger.debug(`Custom provider '${providerSlug}' Search Results: ${books?.length || 0}`)
      return books || []
    } catch (error) {
      Logger.error(`Error searching Custom provider '${providerSlug}':`, error)
      return []
    }
  }

  async search(
    libraryItem: LibraryItem | LibraryItemLike | null | undefined,
    provider: string,
    title: string,
    author?: string | null,
    isbn?: string | BookFinderSearchOptions | null,
    asin?: string | null,
    options?: BookFinderSearchOptions
  ): Promise<BookSearchResult[]> {
    const actualIsbn: string | undefined = typeof isbn === 'string' ? isbn : undefined
    const actualAsin: string | undefined = typeof asin === 'string' ? asin : undefined
    let opts: BookFinderSearchOptions = options || {}
    if (typeof isbn === 'object' && isbn !== null) {
      opts = isbn
    }

    let books: BookSearchResult[] = []
    const maxTitleDistance = opts.titleDistance !== undefined && !isNaN(Number(opts.titleDistance)) ? Number(opts.titleDistance) : 4
    const maxAuthorDistance = opts.authorDistance !== undefined && !isNaN(Number(opts.authorDistance)) ? Number(opts.authorDistance) : 4
    const maxFuzzySearches = opts.maxFuzzySearches !== undefined && !isNaN(Number(opts.maxFuzzySearches)) ? Number(opts.maxFuzzySearches) : 5
    let numFuzzySearches = 0

    // Custom providers are assumed to be correct
    if (provider.startsWith('custom-')) {
      return this.getCustomProviderResults(title, author, actualIsbn, provider)
    }

    if (!title) return books

    // Truncate excessively long inputs to prevent ReDoS attacks
    const MAX_INPUT_LENGTH = 500
    title = title.substring(0, MAX_INPUT_LENGTH)
    author = author?.substring(0, MAX_INPUT_LENGTH) || author

    const isTitleAsin = isValidASIN(title.toUpperCase())

    let actualTitleQuery = title
    let actualAuthorQuery = author || ''
    books = await this.runSearch(actualTitleQuery, actualAuthorQuery, provider, actualAsin, maxTitleDistance, maxAuthorDistance)

    if (!books.length && maxFuzzySearches > 0) {
      // Normalize title and author
      title = title.trim().toLowerCase()
      author = author?.trim().toLowerCase() || ''

      const cleanAuthor = cleanAuthorForCompares(author)

      // Now run up to maxFuzzySearches fuzzy searches
      const authorCandidatesInstance = new BookFinder.AuthorCandidates(cleanAuthor, this.audnexus)

      // Remove underscores and parentheses with their contents, and replace with a separator
      // Use negated character classes to prevent ReDoS vulnerability (input length validated at entry point)
      const cleanTitle = title.replace(/\[[^\]]*\]|\([^)]*\)|{[^}]*}|_/g, ' - ')
      // Split title into hypen-separated parts
      const titleParts = cleanTitle.split(/ - | -|- /)
      for (const titlePart of titleParts) authorCandidatesInstance.add(titlePart)
      const authorCandidates = await authorCandidatesInstance.getCandidates()
      loop_author: for (const authorCandidate of authorCandidates) {
        const titleCandidatesInstance = new BookFinder.TitleCandidates(authorCandidate)
        for (const titlePart of titleParts) titleCandidatesInstance.add(titlePart)
        const titleCandidates = titleCandidatesInstance.getCandidates()
        for (const titleCandidate of titleCandidates) {
          if (titleCandidate === actualTitleQuery && authorCandidate === actualAuthorQuery) continue // We already tried this
          if (++numFuzzySearches > maxFuzzySearches) break loop_author
          actualTitleQuery = titleCandidate
          actualAuthorQuery = authorCandidate
          books = await this.runSearch(actualTitleQuery, actualAuthorQuery, provider, actualAsin, maxTitleDistance, maxAuthorDistance)
          if (books.length) break loop_author
        }
      }
    }

    if (books.length && libraryItem) {
      const isAudibleProvider = provider.startsWith('audible')
      const media = libraryItem.media
      const duration = media && 'duration' in media && typeof media.duration === 'number' ? media.duration : null
      const libraryItemDurationMinutes = duration ? duration / 60 : null

      books.forEach((book) => {
        if (typeof book !== 'object' || !isAudibleProvider) return
        book.matchConfidence = this.calculateMatchConfidence(book, libraryItemDurationMinutes, actualTitleQuery, actualAuthorQuery, isTitleAsin)
      })

      if (isAudibleProvider && libraryItemDurationMinutes) {
        books.sort((a, b) => {
          const aDuration = a.duration || Number.POSITIVE_INFINITY
          const bDuration = b.duration || Number.POSITIVE_INFINITY
          const aDurationDiff = Math.abs(aDuration - libraryItemDurationMinutes)
          const bDurationDiff = Math.abs(bDuration - libraryItemDurationMinutes)
          return aDurationDiff - bDurationDiff
        })
      }
    }
    return books
  }

  calculateMatchConfidence(
    book: BookSearchResult,
    libraryItemDurationMinutes: number | null,
    actualTitleQuery: string,
    actualAuthorQuery: string,
    isTitleAsin: boolean
  ): number | null {
    // ASIN results are always a match
    if (isTitleAsin) return 1.0

    let durationScore: number
    if (libraryItemDurationMinutes && typeof book.duration === 'number') {
      const durationDiff = Math.abs(book.duration - libraryItemDurationMinutes)
      if (durationDiff <= 1) {
        durationScore = 1.0
      } else if (durationDiff <= 5) {
        durationScore = 1.1 - 0.1 * durationDiff
      } else if (durationDiff <= 10) {
        durationScore = 1.2 - 0.12 * durationDiff
      } else {
        durationScore = 0.0
      }
      Logger.debug(`[BookFinder] Duration diff: ${durationDiff}, durationScore: ${durationScore}`)
    } else {
      // Default score if library item duration or book duration is not available
      durationScore = 0.1
    }

    const calculateTitleScore = (titleQuery: string, bookObj: BookSearchResult, keepSubtitle = false): number => {
      const cleanTitle = cleanTitleForCompares(bookObj.title || '', keepSubtitle)
      const cleanSubtitle = keepSubtitle && bookObj.subtitle ? `: ${bookObj.subtitle}` : ''
      const normBookTitle = `${cleanTitle}${cleanSubtitle}`
      const normTitleQuery = cleanTitleForCompares(titleQuery, keepSubtitle)
      const titleSimilarity = levenshteinSimilarity(normTitleQuery, normBookTitle)
      Logger.debug(`[BookFinder] keepSubtitle: ${keepSubtitle}, normBookTitle: ${normBookTitle}, normTitleQuery: ${normTitleQuery}, titleSimilarity: ${titleSimilarity}`)
      return titleSimilarity
    }
    const titleQueryHasSubtitle = hasSubtitle(actualTitleQuery)
    const titleScore = calculateTitleScore(actualTitleQuery, book, titleQueryHasSubtitle)

    let authorScore: number
    const normAuthorQuery = cleanAuthorForCompares(actualAuthorQuery)
    const normBookAuthor = cleanAuthorForCompares(book.author || '')
    if (!normAuthorQuery) {
      authorScore = 1.0
    } else {
      if (normBookAuthor) {
        const bookAuthorParts = normBookAuthor.split(',').map((name) => name.trim().toLowerCase())
        const validBookAuthorParts = bookAuthorParts.filter((p) => p.length > 0)

        if (validBookAuthorParts.length === 0) {
          authorScore = 0.0
        } else {
          let maxPartScore = levenshteinSimilarity(normAuthorQuery, normBookAuthor)
          Logger.debug(`[BookFinder] normAuthorQuery: ${normAuthorQuery}, normBookAuthor: ${normBookAuthor}, similarity: ${maxPartScore}`)
          if (validBookAuthorParts.length > 1 || normBookAuthor.includes(',')) {
            validBookAuthorParts.forEach((part) => {
              const similarity = levenshteinSimilarity(normAuthorQuery, part)
              Logger.debug(`[BookFinder] normAuthorQuery: ${normAuthorQuery}, bookAuthorPart: ${part}, similarity: ${similarity}`)
              const currentPartScore = similarity
              maxPartScore = Math.max(maxPartScore, currentPartScore)
            })
          }
          authorScore = maxPartScore
        }
      } else {
        authorScore = 0.0
      }
    }

    const W_DURATION = 0.7
    const W_TITLE = 0.2
    const W_AUTHOR = 0.1

    Logger.debug(`[BookFinder] Duration score: ${durationScore}, Title score: ${titleScore}, Author score: ${authorScore}`)
    const confidence = W_DURATION * durationScore + W_TITLE * titleScore + W_AUTHOR * authorScore
    Logger.debug(`[BookFinder] Confidence: ${confidence}`)
    return Math.max(0, Math.min(1, confidence))
  }

  async runSearch(
    title: string,
    author: string | null | undefined,
    provider: string,
    asin?: string | null,
    maxTitleDistance = 4,
    maxAuthorDistance = 4
  ): Promise<BookSearchResult[]> {
    Logger.debug(`Book Search: title: "${title}", author: "${author || ''}", provider: ${provider}`)

    let books: BookSearchResult[] = []

    if (provider === 'google') {
      books = await this.getGoogleBooksResults(title, author)
    } else if (provider.startsWith('audible')) {
      books = await this.getAudibleResults(title, author, asin, provider)
    } else if (provider === 'itunes') {
      books = await this.getiTunesAudiobooksResults(title)
    } else if (provider === 'openlibrary') {
      books = await this.getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'fantlab') {
      books = await this.getFantLabResults(title, author)
    } else if (provider === 'audiobookcovers') {
      books = await this.getAudiobookCoversResults(title)
    } else {
      books = await this.getGoogleBooksResults(title, author)
    }

    books.forEach((book) => {
      if (book.description) {
        book.description = htmlSanitizer.sanitize(book.description)
        book.descriptionPlain = htmlSanitizer.stripAllTags(book.description)
      }
    })
    return books
  }

  async findCovers(
    provider: string,
    title: string,
    author?: string | null,
    options: BookFinderSearchOptions = {}
  ): Promise<string[]> {
    const searchResults: BookSearchResult[] = []

    if (provider === 'all') {
      for (const providerString of this.providers) {
        const providerResults = await this.search(null, providerString, title, author, undefined, undefined, options)
        Logger.debug(`[BookFinder] Found ${providerResults.length} covers from ${providerString}`)
        searchResults.push(...providerResults)
      }
    } else if (provider === 'best') {
      // Best providers: google, fantlab, and audible.com
      const bestProviders = ['google', 'fantlab', 'audible']
      for (const providerString of bestProviders) {
        const providerResults = await this.search(null, providerString, title, author, undefined, undefined, options)
        Logger.debug(`[BookFinder] Found ${providerResults.length} covers from ${providerString}`)
        searchResults.push(...providerResults)
      }
    } else {
      const providerResults = await this.search(null, provider, title, author, undefined, undefined, options)
      searchResults.push(...providerResults)
    }
    Logger.debug(`[BookFinder] FindCovers search results: ${searchResults.length}`)

    const covers: string[] = []
    searchResults.forEach((result) => {
      if (result.covers && result.covers.length) {
        covers.push(...result.covers)
      }
      if (result.cover) {
        covers.push(result.cover)
      }
    })
    return [...new Set(covers)]
  }

  findChapters(asin: string, region?: string): Promise<AudnexusChapterData | null> {
    return this.audnexus.getChaptersByASIN(asin, region || '')
  }
}

function hasSubtitle(title: string): boolean {
  return title.includes(': ') || title.includes(' - ')
}

function stripSubtitle(title: string): string {
  if (title.includes(': ')) {
    return title.split(': ')[0].trim()
  } else if (title.includes(' - ')) {
    return title.split(' - ')[0].trim()
  }
  return title
}

function replaceAccentedChars(str: string): string {
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch (error) {
    Logger.error('[BookFinder] str normalize error', error)
    return str
  }
}

function cleanTitleForCompares(title: string, keepSubtitle = false): string {
  if (!title) return ''
  title = stripRedundantSpaces(title)

  // Remove subtitle if there (i.e. "Cool Book: Coolest Ever" becomes "Cool Book")
  const stripped = keepSubtitle ? title : stripSubtitle(title)

  // Remove text in paranthesis (i.e. "Ender's Game (Ender's Saga)" becomes "Ender's Game")
  // Use negated character class to prevent ReDoS vulnerability (input length validated at entry point)
  let cleaned = stripped.replace(/\([^)]*\)/g, '') // Remove parenthetical content
  cleaned = cleaned.replace(/\s+/g, ' ').trim() // Clean up any resulting multiple spaces

  // Remove single quotes (i.e. "Ender's Game" becomes "Enders Game")
  cleaned = cleaned.replace(/'/g, '')
  return replaceAccentedChars(cleaned).toLowerCase()
}

function cleanAuthorForCompares(author: string): string {
  if (!author) return ''
  author = stripRedundantSpaces(author)

  let cleanAuthor = replaceAccentedChars(author).toLowerCase()
  // separate initials
  cleanAuthor = cleanAuthor.replace(/([a-z])\.([a-z])/g, '$1. $2')
  // remove middle initials
  cleanAuthor = cleanAuthor.replace(/(?<=\w\w)(\s+[a-z]\.?)+(?=\s+\w\w)/g, '')
  // remove et al.
  cleanAuthor = cleanAuthor.replace(/ et al\.?(?= |$)/g, '')
  return cleanAuthor
}

function stripRedundantSpaces(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}

const bookFinder = new BookFinder()
export = bookFinder
