import { DataTypes, Model, Sequelize } from 'sequelize'
import Logger from '../Logger'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils'
import * as parseNameString from '../utils/parsers/parseNameString'
import * as htmlSanitizer from '../utils/htmlSanitizer'
import libraryItemsBookFilters from '../utils/queries/libraryItemsBookFilters'
import SocketAuthority from '../SocketAuthority'
import type Author from './Author'
import type Series from './Series'
import type BookAuthor from './BookAuthor'
import type BookSeries from './BookSeries'
import type { AudioFileObject, AudioTrack, ChapterObject, EBookFileObject } from '../types'

class Book extends Model {
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string
  declare subtitle: string | null
  declare publishedYear: string | null
  declare publishedDate: string | null
  declare publisher: string | null
  declare description: string | null
  declare isbn: string | null
  declare asin: string | null
  declare language: string | null
  declare explicit: boolean
  declare abridged: boolean
  declare coverPath: string | null
  declare duration: number
  declare narrators: string[] | null
  declare audioFiles: AudioFileObject[]
  declare ebookFile: EBookFileObject | null
  declare chapters: ChapterObject[] | null
  declare tags: string[] | null
  declare genres: string[] | null
  declare updatedAt: Date
  declare createdAt: Date

  // Expanded properties
  declare authors?: Author[]
  declare series?: Array<Series & { bookSeries?: BookSeries }>

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof Book
  static override init(attributes: unknown, options: unknown): typeof Book
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Book {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Book
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        title: DataTypes.STRING,
        titleIgnorePrefix: DataTypes.STRING,
        subtitle: DataTypes.STRING,
        publishedYear: DataTypes.STRING,
        publishedDate: DataTypes.STRING,
        publisher: DataTypes.STRING,
        description: DataTypes.TEXT,
        isbn: DataTypes.STRING,
        asin: DataTypes.STRING,
        language: DataTypes.STRING,
        explicit: DataTypes.BOOLEAN,
        abridged: DataTypes.BOOLEAN,
        coverPath: DataTypes.STRING,
        duration: DataTypes.FLOAT,

        narrators: DataTypes.JSON,
        audioFiles: DataTypes.JSON,
        ebookFile: DataTypes.JSON,
        chapters: DataTypes.JSON,
        tags: DataTypes.JSON,
        genres: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'book',
        indexes: [
          {
            fields: [
              {
                name: 'title',
                collate: 'NOCASE'
              }
            ]
          },
          {
            fields: ['publishedYear']
          },
          {
            fields: ['duration']
          }
        ]
      }
    )

    Book.addHook('afterDestroy', async () => {
      libraryItemsBookFilters.clearCountCache('afterDestroy')
    })

    Book.addHook('afterCreate', async () => {
      libraryItemsBookFilters.clearCountCache('afterCreate')
    })

    return Book
  }

  /**
   * Comma separated array of author names
   * Requires authors to be loaded
   */
  get authorName(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorName: Cannot get authorName because authors are not loaded`)
      return ''
    }
    return this.authors.map((au) => au.name).join(', ')
  }

  /**
   * Comma separated array of author names in Last, First format
   * Requires authors to be loaded
   */
  get authorNameLF(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorNameLF: Cannot get authorNameLF because authors are not loaded`)
      return ''
    }

    // Last, First
    if (!this.authors.length) return ''
    return this.authors.map((au) => parseNameString.nameToLastFirst(au.name)).join(', ')
  }

  /**
   * Comma separated array of series with sequence
   * Requires series to be loaded
   */
  get seriesName(): string {
    if (this.series === undefined) {
      Logger.error(`[Book] seriesName: Cannot get seriesName because series are not loaded`)
      return ''
    }

    if (!this.series.length) return ''
    return this.series
      .map((se) => {
        const sequence = se.bookSeries?.sequence || ''
        if (!sequence) return se.name
        return `${se.name} #${sequence}`
      })
      .join(', ')
  }

  get includedAudioFiles(): AudioFileObject[] {
    return (this.audioFiles || []).filter((af) => !af.exclude)
  }

  get hasMediaFiles(): boolean {
    return !!this.hasAudioTracks || !!this.ebookFile
  }

  get hasAudioTracks(): boolean {
    return !!this.includedAudioFiles.length
  }

  /**
   * Supported mime types are sent from the web client and are retrieved using the browser Audio player "canPlayType" function.
   */
  checkCanDirectPlay(supportedMimeTypes: string[]): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error(`[Book] checkCanDirectPlay: supportedMimeTypes is not an array`, supportedMimeTypes)
      return false
    }
    return this.includedAudioFiles.every((af) => af.mimeType && supportedMimeTypes.includes(af.mimeType))
  }

  /**
   * Get the track list to be used in client audio players
   * AudioTrack is the AudioFile with startOffset, contentUrl and title
   */
  getTracklist(libraryItemId: string): AudioTrack[] {
    let startOffset = 0
    return this.includedAudioFiles.map((af) => {
      const track = structuredClone(af) as AudioTrack
      track.title = af.metadata.filename
      track.startOffset = startOffset
      track.contentUrl = `/api/items/${libraryItemId}/file/${track.ino}`
      startOffset += track.duration || 0
      return track
    })
  }

  getChapters(): ChapterObject[] {
    return structuredClone(this.chapters) || []
  }

  getPlaybackTitle(): string {
    return this.title
  }

  getPlaybackAuthor(): string {
    return this.authorName
  }

  getPlaybackDuration(): number {
    return this.duration
  }

  /**
   * Total file size of all audio files and ebook file
   */
  get size(): number {
    let total = 0
    this.audioFiles?.forEach((af) => (total += af.metadata.size || 0))
    if (this.ebookFile) {
      total += this.ebookFile.metadata.size || 0
    }
    return total
  }

  getAbsMetadataJson(): Record<string, unknown> {
    return {
      tags: this.tags || [],
      chapters: this.chapters?.map((c) => ({ ...c })) || [],
      title: this.title,
      subtitle: this.subtitle,
      authors: (this.authors || []).map((a) => a.name),
      narrators: this.narrators,
      series: (this.series || []).map((se) => {
        const sequence = se.bookSeries?.sequence || ''
        if (!sequence) return se.name
        return `${se.name} #${sequence}`
      }),
      genres: this.genres || [],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: !!this.explicit,
      abridged: !!this.abridged
    }
  }

  /**
   * Update book from request payload
   */
  async updateFromRequest(payload: {
    metadata?: Record<string, unknown>
    tags?: string[]
    [key: string]: unknown
  }): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false
    const self = this as unknown as Record<string, unknown>

    if (payload.metadata) {
      const metadataStringKeys = ['title', 'subtitle', 'publishedYear', 'publishedDate', 'publisher', 'description', 'isbn', 'asin', 'language']
      metadataStringKeys.forEach((key) => {
        if (typeof payload.metadata![key] === 'number') {
          payload.metadata![key] = String(payload.metadata![key])
        }

        if ((typeof payload.metadata![key] === 'string' || payload.metadata![key] === null) && self[key] !== payload.metadata![key]) {
          // Sanitize description HTML
          if (key === 'description' && payload.metadata![key]) {
            const sanitizedDescription = htmlSanitizer.sanitize(payload.metadata![key] as string)
            if (sanitizedDescription !== payload.metadata![key]) {
              Logger.debug(`[Book] "${this.title}" Sanitized description from "${payload.metadata![key]}" to "${sanitizedDescription}"`)
              payload.metadata![key] = sanitizedDescription
            }
          }

          self[key] = payload.metadata![key] || null

          if (key === 'title') {
            this.titleIgnorePrefix = this.title ? getTitleIgnorePrefix(this.title) : ''
          }

          hasUpdates = true
        }
      })
      if (payload.metadata.explicit !== undefined && this.explicit !== !!payload.metadata.explicit) {
        this.explicit = !!payload.metadata.explicit
        hasUpdates = true
      }
      if (payload.metadata.abridged !== undefined && this.abridged !== !!payload.metadata.abridged) {
        this.abridged = !!payload.metadata.abridged
        hasUpdates = true
      }
      const arrayOfStringsKeys = ['narrators', 'genres']
      arrayOfStringsKeys.forEach((key) => {
        if (
          Array.isArray(payload.metadata![key]) &&
          !(payload.metadata![key] as unknown[]).some((item: unknown) => typeof item !== 'string') &&
          JSON.stringify(self[key]) !== JSON.stringify(payload.metadata![key])
        ) {
          self[key] = payload.metadata![key]
          this.changed(key as never, true)
          hasUpdates = true
        }
      })
    }

    if (Array.isArray(payload.tags) && !payload.tags.some((tag) => typeof tag !== 'string') && JSON.stringify(this.tags) !== JSON.stringify(payload.tags)) {
      this.tags = payload.tags
      this.changed('tags', true)
      hasUpdates = true
    }

    if (hasUpdates) {
      Logger.debug(`[Book] "${this.title}" changed keys:`, this.changed())
      await this.save()
    }

    return hasUpdates
  }

  /**
   * Creates or removes authors from the book using the author names from the request
   */
  async updateAuthorsFromRequest(
    authors: string[],
    libraryId: string
  ): Promise<{ authorsRemoved: Author[]; authorsAdded: Author[] } | null> {
    if (!Array.isArray(authors)) return null

    if (!this.authors) {
      throw new Error(`[Book] Cannot update authors because authors are not loaded for book ${this.id}`)
    }

    const authorModel = this.sequelize!.models.author as unknown as typeof Author
    const bookAuthorModel = this.sequelize!.models.bookAuthor as unknown as typeof BookAuthor

    const authorsCleaned = authors.map((a) => a.toLowerCase()).filter((a) => a)
    const authorsRemoved = this.authors.filter((au) => !authorsCleaned.includes(au.name.toLowerCase()))
    const newAuthorNames = authors.filter((a) => !this.authors!.some((au) => au.name.toLowerCase() === a.toLowerCase()))

    for (const author of authorsRemoved) {
      await bookAuthorModel.removeByIds(author.id, this.id)
      const numBooks = await bookAuthorModel.getCountForAuthor(author.id)
      if (numBooks > 0) {
        SocketAuthority.emitter('author_updated', author.toOldJSONExpanded(numBooks))
      }
      Logger.debug(`[Book] "${this.title}" Removed author "${author.name}"`)
      this.authors = this.authors.filter((au) => au.id !== author.id)
    }
    const authorsAdded: Author[] = []
    for (const authorName of newAuthorNames) {
      const { author, created } = await authorModel.findOrCreateByNameAndLibrary(authorName, libraryId)
      await bookAuthorModel.create({ bookId: this.id, authorId: author.id })
      if (created) {
        SocketAuthority.emitter('author_added', author.toOldJSON())
      } else {
        const numBooks = await bookAuthorModel.getCountForAuthor(author.id)
        SocketAuthority.emitter('author_updated', author.toOldJSONExpanded(numBooks))
      }
      Logger.debug(`[Book] "${this.title}" Added author "${author.name}"`)
      this.authors.push(author)
      authorsAdded.push(author)
    }

    return {
      authorsRemoved,
      authorsAdded
    }
  }

  /**
   * Creates or removes series from the book using the series names from the request.
   * Updates series sequence if it has changed.
   */
  async updateSeriesFromRequest(
    seriesObjects: Array<{ name: string; sequence?: string | null }>,
    libraryId: string
  ): Promise<{ seriesRemoved: Series[]; seriesAdded: Series[]; hasUpdates: boolean } | null> {
    if (!Array.isArray(seriesObjects) || seriesObjects.some((se) => !se.name || typeof se.name !== 'string')) return null

    if (!this.series) {
      throw new Error(`[Book] Cannot update series because series are not loaded for book ${this.id}`)
    }

    const seriesModel = this.sequelize!.models.series as unknown as typeof Series
    const bookSeriesModel = this.sequelize!.models.bookSeries as unknown as typeof BookSeries

    const seriesNamesCleaned = seriesObjects.map((se) => se.name.toLowerCase())
    const seriesRemoved = this.series.filter((se) => !seriesNamesCleaned.includes(se.name.toLowerCase()))
    const seriesAdded: Series[] = []
    let hasUpdates = false
    for (const seriesObj of seriesObjects) {
      const seriesObjSequence = typeof seriesObj.sequence === 'string' ? seriesObj.sequence : null

      const existingSeries = this.series.find((se) => se.name.toLowerCase() === seriesObj.name.toLowerCase())
      if (existingSeries) {
        if (existingSeries.bookSeries?.sequence !== seriesObjSequence) {
          if (existingSeries.bookSeries) {
            existingSeries.bookSeries.sequence = seriesObjSequence
            await existingSeries.bookSeries.save()
          }
          hasUpdates = true
          Logger.debug(`[Book] "${this.title}" Updated series "${existingSeries.name}" sequence ${seriesObjSequence}`)
        }
      } else {
        const series = (await seriesModel.findOrCreateByNameAndLibrary(seriesObj.name, libraryId)) as Series & { bookSeries: BookSeries }
        series.bookSeries = await bookSeriesModel.create({ bookId: this.id, seriesId: series.id, sequence: seriesObjSequence })
        this.series.push(series)
        seriesAdded.push(series)
        hasUpdates = true
        Logger.debug(`[Book] "${this.title}" Added series "${series.name}"`)
      }
    }

    for (const series of seriesRemoved) {
      await bookSeriesModel.removeByIds(series.id, this.id)
      this.series = this.series.filter((se) => se.id !== series.id)
      Logger.debug(`[Book] "${this.title}" Removed series ${series.id}`)
      hasUpdates = true
    }

    return {
      seriesRemoved,
      seriesAdded,
      hasUpdates
    }
  }

  /**
   * Old model kept metadata in a separate object
   */
  oldMetadataToJSON(): Record<string, unknown> {
    const authors = (this.authors || []).map((au) => ({ id: au.id, name: au.name }))
    const series = (this.series || []).map((se) => ({ id: se.id, name: se.name, sequence: se.bookSeries?.sequence }))
    return {
      title: this.title,
      subtitle: this.subtitle,
      authors,
      narrators: [...(this.narrators || [])],
      series,
      genres: [...(this.genres || [])],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: this.explicit,
      abridged: this.abridged
    }
  }

  oldMetadataToJSONMinified(): Record<string, unknown> {
    return {
      title: this.title,
      titleIgnorePrefix: this.title ? getTitlePrefixAtEnd(this.title) : '',
      subtitle: this.subtitle,
      authorName: this.authorName,
      authorNameLF: this.authorNameLF,
      narratorName: (this.narrators || []).join(', '),
      seriesName: this.seriesName,
      genres: [...(this.genres || [])],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: this.explicit,
      abridged: this.abridged
    }
  }

  oldMetadataToJSONExpanded(): Record<string, unknown> {
    const oldMetadataJSON = this.oldMetadataToJSON()
    oldMetadataJSON.titleIgnorePrefix = this.title ? getTitlePrefixAtEnd(this.title) : ''
    oldMetadataJSON.authorName = this.authorName
    oldMetadataJSON.authorNameLF = this.authorNameLF
    oldMetadataJSON.narratorName = (this.narrators || []).join(', ')
    oldMetadataJSON.seriesName = this.seriesName
    oldMetadataJSON.descriptionPlain = this.description ? htmlSanitizer.stripAllTags(this.description) : null
    return oldMetadataJSON
  }

  toOldJSON(libraryItemId: string): Record<string, unknown> {
    if (!libraryItemId) {
      throw new Error(`[Book] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      id: this.id,
      libraryItemId,
      metadata: this.oldMetadataToJSON(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      audioFiles: structuredClone(this.audioFiles),
      chapters: structuredClone(this.chapters),
      ebookFile: structuredClone(this.ebookFile)
    }
  }

  toOldJSONMinified(): Record<string, unknown> {
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      id: this.id,
      metadata: this.oldMetadataToJSONMinified(),
      coverPath: this.coverPath,
      tags: [...(this.tags || [])],
      numTracks: this.includedAudioFiles.length,
      numAudioFiles: this.audioFiles?.length || 0,
      numChapters: this.chapters?.length || 0,
      duration: this.duration,
      size: this.size,
      ebookFormat: this.ebookFile?.ebookFormat
    }
  }

  toOldJSONExpanded(libraryItemId: string): Record<string, unknown> {
    if (!libraryItemId) {
      throw new Error(`[Book] Cannot convert to old JSON because libraryItemId is not provided`)
    }
    if (!this.authors) {
      throw new Error(`[Book] Cannot convert to old JSON because authors are not loaded`)
    }
    if (!this.series) {
      throw new Error(`[Book] Cannot convert to old JSON because series are not loaded`)
    }

    return {
      ...this.toOldJSONMinified(),
      libraryItemId,
      metadata: this.oldMetadataToJSONExpanded(),
      audioFiles: structuredClone(this.audioFiles),
      chapters: structuredClone(this.chapters),
      ebookFile: structuredClone(this.ebookFile),
      tracks: this.getTracklist(libraryItemId)
    }
  }
}

export = Book
