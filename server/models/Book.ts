import { DataTypes, Model, Sequelize, NonAttribute, Optional } from 'sequelize'
import Logger from '../Logger'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils'
import parseNameString from '../utils/parsers/parseNameString'
import htmlSanitizer from '../utils/htmlSanitizer'
import libraryItemsBookFilters from '../utils/queries/libraryItemsBookFilters'
import SocketAuthority from '../SocketAuthority'
import Author from './Author'
import { BookAuthor } from './BookAuthor'
import Series from './Series'
import { BookSeries } from './BookSeries'
import type LibraryItem from './LibraryItem'
import type MediaProgress from './MediaProgress'
import type {
  EBookFileObject,
  ChapterObject,
  AudioFileObject,
  AudioTrack,
  AudioFileMetaTags,
  BookAuthorMetadataObject,
  BookSeriesMetadataObject,
  BookOldMetadataJsonObject,
  BookOldMetadataMinifiedJsonObject,
  BookOldMetadataExpandedJsonObject,
  BookAbsMetadataJsonObject,
  BookUpdateMetadataPayload,
  BookUpdateRequestPayload,
  BookOldJsonObject,
  BookOldJsonMinifiedObject,
  BookOldJsonExpandedObject
} from '../types'

export type {
  EBookFileObject,
  ChapterObject,
  AudioFileObject,
  AudioTrack,
  AudioFileMetaTags,
  BookAuthorMetadataObject,
  BookSeriesMetadataObject,
  BookOldMetadataJsonObject,
  BookOldMetadataMinifiedJsonObject,
  BookOldMetadataExpandedJsonObject,
  BookAbsMetadataJsonObject,
  BookUpdateMetadataPayload,
  BookUpdateRequestPayload,
  BookOldJsonObject,
  BookOldJsonMinifiedObject,
  BookOldJsonExpandedObject
}

export interface SeriesExpandedItem extends Omit<Series, 'bookSeries'> {
  bookSeries?: BookSeries
}

export interface BookAttributes {
  id: string
  title: string
  titleIgnorePrefix?: string | null
  subtitle?: string | null
  publishedYear?: string | null
  publishedDate?: string | null
  publisher?: string | null
  description?: string | null
  isbn?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean
  abridged?: boolean
  coverPath?: string | null
  duration?: number
  narrators?: string[] | null
  audioFiles?: AudioFileObject[] | null
  ebookFile?: EBookFileObject | null
  chapters?: ChapterObject[] | null
  tags?: string[] | null
  genres?: string[] | null
  createdAt?: Date
  updatedAt?: Date
}

export interface BookCreationAttributes
  extends Optional<
    BookAttributes,
    | 'id'
    | 'titleIgnorePrefix'
    | 'subtitle'
    | 'publishedYear'
    | 'publishedDate'
    | 'publisher'
    | 'description'
    | 'isbn'
    | 'asin'
    | 'language'
    | 'explicit'
    | 'abridged'
    | 'coverPath'
    | 'duration'
    | 'narrators'
    | 'audioFiles'
    | 'ebookFile'
    | 'chapters'
    | 'tags'
    | 'genres'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class Book
  extends Model<BookAttributes, BookCreationAttributes>
  implements BookAttributes
{
  declare id: string
  declare title: string
  declare titleIgnorePrefix: string | null
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
  declare audioFiles: AudioFileObject[] | null
  declare ebookFile: EBookFileObject | null
  declare chapters: ChapterObject[] | null
  declare tags: string[] | null
  declare genres: string[] | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Expanded properties
  declare authors?: NonAttribute<Author[]>
  declare series?: NonAttribute<SeriesExpandedItem[]>
  declare libraryItem?: NonAttribute<LibraryItem>
  declare mediaProgresses?: NonAttribute<MediaProgress[]>

  static initModel(sequelize: Sequelize): typeof Book {
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

  get authorName(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorName: Cannot get authorName because authors are not loaded`)
      return ''
    }
    return this.authors.map((au) => au.name).join(', ')
  }

  get authorNameLF(): string {
    if (this.authors === undefined) {
      Logger.error(`[Book] authorNameLF: Cannot get authorNameLF because authors are not loaded`)
      return ''
    }
    if (!this.authors.length) return ''
    return this.authors.map((au) => parseNameString.nameToLastFirst(au.name)).join(', ')
  }

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
    return (this.audioFiles ?? []).filter((af) => !af.exclude)
  }

  get hasMediaFiles(): boolean {
    return !!this.hasAudioTracks || !!this.ebookFile
  }

  get hasAudioTracks(): boolean {
    return !!this.includedAudioFiles.length
  }

  checkCanDirectPlay(supportedMimeTypes: string[]): boolean {
    if (!Array.isArray(supportedMimeTypes)) {
      Logger.error(`[Book] checkCanDirectPlay: supportedMimeTypes is not an array`, supportedMimeTypes)
      return false
    }
    return this.includedAudioFiles.every((af) => supportedMimeTypes.includes(af.mimeType))
  }

  getTracklist(libraryItemId: string): AudioTrack[] {
    let startOffset = 0
    return this.includedAudioFiles.map((af) => {
      const track: AudioTrack = {
        ...af,
        title: af.metadata.filename,
        startOffset,
        contentUrl: `/api/items/${libraryItemId}/file/${af.ino}`
      }
      startOffset += af.duration
      return track
    })
  }

  getChapters(): ChapterObject[] {
    return (this.chapters ?? []).map((c) => ({ ...c }))
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

  get size(): number {
    let total = 0
    ;(this.audioFiles ?? []).forEach((af) => {
      total += af.metadata.size
    })
    if (this.ebookFile) {
      total += this.ebookFile.metadata.size
    }
    return total
  }

  getAbsMetadataJson(): BookAbsMetadataJsonObject {
    return {
      tags: this.tags ?? [],
      chapters: this.chapters?.map((c) => ({ ...c })) ?? [],
      title: this.title,
      subtitle: this.subtitle,
      authors: (this.authors ?? []).map((a) => a.name),
      narrators: this.narrators ?? [],
      series: (this.series ?? []).map((se) => {
        const sequence = se.bookSeries?.sequence || ''
        if (!sequence) return se.name
        return `${se.name} #${sequence}`
      }),
      genres: this.genres ?? [],
      publishedYear: this.publishedYear,
      publishedDate: this.publishedDate,
      publisher: this.publisher,
      description: this.description,
      isbn: this.isbn,
      asin: this.asin,
      language: this.language,
      explicit: Boolean(this.explicit),
      abridged: Boolean(this.abridged)
    }
  }

  async updateFromRequest(payload?: BookUpdateRequestPayload | null): Promise<boolean> {
    if (!payload) return false

    let hasUpdates = false

    const metadata = payload.metadata
    if (metadata) {
      const metadataStringKeys: Array<
        | 'title'
        | 'subtitle'
        | 'publishedYear'
        | 'publishedDate'
        | 'publisher'
        | 'description'
        | 'isbn'
        | 'asin'
        | 'language'
      > = [
        'title',
        'subtitle',
        'publishedYear',
        'publishedDate',
        'publisher',
        'description',
        'isbn',
        'asin',
        'language'
      ]

      metadataStringKeys.forEach((key) => {
        if (typeof metadata[key] === 'number') {
          metadata[key] = String(metadata[key])
        }

        if (
          (typeof metadata[key] === 'string' || metadata[key] === null) &&
          this[key] !== metadata[key]
        ) {
          if (key === 'description' && typeof metadata[key] === 'string') {
            const sanitizedDescription = htmlSanitizer.sanitize(metadata[key] as string)
            if (sanitizedDescription !== metadata[key]) {
              Logger.debug(
                `[Book] "${this.title}" Sanitized description from "${metadata[key]}" to "${sanitizedDescription}"`
              )
              metadata[key] = sanitizedDescription
            }
          }

          const val = metadata[key]
          if (key === 'title') {
            this.title = typeof val === 'string' ? val : ''
            this.titleIgnorePrefix = getTitleIgnorePrefix(this.title)
          } else if (key === 'subtitle') {
            this.subtitle = typeof val === 'string' ? val : null
          } else if (key === 'publishedYear') {
            this.publishedYear = typeof val === 'string' ? val : null
          } else if (key === 'publishedDate') {
            this.publishedDate = typeof val === 'string' ? val : null
          } else if (key === 'publisher') {
            this.publisher = typeof val === 'string' ? val : null
          } else if (key === 'description') {
            this.description = typeof val === 'string' ? val : null
          } else if (key === 'isbn') {
            this.isbn = typeof val === 'string' ? val : null
          } else if (key === 'asin') {
            this.asin = typeof val === 'string' ? val : null
          } else if (key === 'language') {
            this.language = typeof val === 'string' ? val : null
          }

          hasUpdates = true
        }
      })

      if (metadata.explicit !== undefined && this.explicit !== !!metadata.explicit) {
        this.explicit = !!metadata.explicit
        hasUpdates = true
      }
      if (metadata.abridged !== undefined && this.abridged !== !!metadata.abridged) {
        this.abridged = !!metadata.abridged
        hasUpdates = true
      }

      if (
        Array.isArray(metadata.narrators) &&
        !metadata.narrators.some((item) => typeof item !== 'string') &&
        JSON.stringify(this.narrators) !== JSON.stringify(metadata.narrators)
      ) {
        this.narrators = metadata.narrators as string[]
        this.changed('narrators', true)
        hasUpdates = true
      }

      if (
        Array.isArray(metadata.genres) &&
        !metadata.genres.some((item) => typeof item !== 'string') &&
        JSON.stringify(this.genres) !== JSON.stringify(metadata.genres)
      ) {
        this.genres = metadata.genres as string[]
        this.changed('genres', true)
        hasUpdates = true
      }
    }

    if (
      Array.isArray(payload.tags) &&
      !payload.tags.some((tag) => typeof tag !== 'string') &&
      JSON.stringify(this.tags) !== JSON.stringify(payload.tags)
    ) {
      this.tags = payload.tags as string[]
      this.changed('tags', true)
      hasUpdates = true
    }

    if (hasUpdates) {
      Logger.debug(`[Book] "${this.title}" changed keys:`, this.changed())
      await this.save()
    }

    return hasUpdates
  }

  async updateAuthorsFromRequest(
    authors?: string[] | null,
    libraryId?: string
  ): Promise<{
    authorsRemoved: Author[]
    authorsAdded: Author[]
  } | null> {
    if (!Array.isArray(authors) || !libraryId) return null

    if (!this.authors) {
      throw new Error(`[Book] Cannot update authors because authors are not loaded for book ${this.id}`)
    }

    const authorModel = Author
    const bookAuthorModel = BookAuthor

    const authorsCleaned = authors.map((a) => a.toLowerCase()).filter(Boolean)
    const authorsRemoved = this.authors.filter(
      (au) => !authorsCleaned.includes(au.name.toLowerCase())
    )
    const newAuthorNames = authors.filter(
      (a) => !this.authors?.some((au) => au.name.toLowerCase() === a.toLowerCase())
    )

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

  async updateSeriesFromRequest(
    seriesObjects?: Array<{ name?: string; sequence?: string | null }> | null,
    libraryId?: string
  ): Promise<{
    seriesRemoved: Series[]
    seriesAdded: Series[]
    hasUpdates: boolean
  } | null> {
    if (
      !Array.isArray(seriesObjects) ||
      !libraryId ||
      seriesObjects.some((se) => !se.name || typeof se.name !== 'string')
    ) {
      return null
    }

    if (!this.series) {
      throw new Error(`[Book] Cannot update series because series are not loaded for book ${this.id}`)
    }

    const seriesModel = Series
    const bookSeriesModel = BookSeries

    const seriesNamesCleaned = seriesObjects.map((se) => (se.name ?? '').toLowerCase())
    const seriesRemoved = this.series.filter(
      (se) => !seriesNamesCleaned.includes(se.name.toLowerCase())
    )
    const seriesAdded: Series[] = []
    let hasUpdates = false

    for (const seriesObj of seriesObjects) {
      const name = seriesObj.name ?? ''
      const seriesObjSequence =
        typeof seriesObj.sequence === 'string' ? seriesObj.sequence : null

      const existingSeries = this.series.find(
        (se) => se.name.toLowerCase() === name.toLowerCase()
      )
      if (existingSeries) {
        if (existingSeries.bookSeries && existingSeries.bookSeries.sequence !== seriesObjSequence) {
          existingSeries.bookSeries.sequence = seriesObjSequence
          await existingSeries.bookSeries.save()
          hasUpdates = true
          Logger.debug(
            `[Book] "${this.title}" Updated series "${existingSeries.name}" sequence ${seriesObjSequence}`
          )
        }
      } else {
        const series = (await seriesModel.findOrCreateByNameAndLibrary(name, libraryId)) as SeriesExpandedItem
        series.bookSeries = await bookSeriesModel.create({
          bookId: this.id,
          seriesId: series.id,
          sequence: seriesObjSequence
        })
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

  oldMetadataToJSON(): BookOldMetadataJsonObject {
    const authors = (this.authors ?? []).map((au) => ({ id: au.id, name: au.name }))
    const series = (this.series ?? []).map((se) => ({
      id: se.id,
      name: se.name,
      sequence: se.bookSeries?.sequence ?? null
    }))
    return {
      title: this.title,
      subtitle: this.subtitle,
      authors,
      narrators: [...(this.narrators ?? [])],
      series,
      genres: [...(this.genres ?? [])],
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

  oldMetadataToJSONMinified(): BookOldMetadataMinifiedJsonObject {
    return {
      title: this.title,
      titleIgnorePrefix: getTitlePrefixAtEnd(this.title),
      subtitle: this.subtitle,
      authorName: this.authorName,
      authorNameLF: this.authorNameLF,
      narratorName: (this.narrators ?? []).join(', '),
      seriesName: this.seriesName,
      genres: [...(this.genres ?? [])],
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

  oldMetadataToJSONExpanded(): BookOldMetadataExpandedJsonObject {
    return {
      ...this.oldMetadataToJSON(),
      titleIgnorePrefix: getTitlePrefixAtEnd(this.title),
      authorName: this.authorName,
      authorNameLF: this.authorNameLF,
      narratorName: (this.narrators ?? []).join(', '),
      seriesName: this.seriesName,
      descriptionPlain: this.description
        ? htmlSanitizer.stripAllTags(this.description)
        : null
    }
  }

  toOldJSON(libraryItemId: string): BookOldJsonObject {
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
      tags: [...(this.tags ?? [])],
      audioFiles: structuredClone(this.audioFiles),
      chapters: structuredClone(this.chapters),
      ebookFile: structuredClone(this.ebookFile)
    }
  }

  toOldJSONMinified(): BookOldJsonMinifiedObject {
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
      tags: [...(this.tags ?? [])],
      numTracks: this.includedAudioFiles.length,
      numAudioFiles: this.audioFiles?.length ?? 0,
      numChapters: this.chapters?.length ?? 0,
      duration: this.duration,
      size: this.size,
      ebookFormat: this.ebookFile?.ebookFormat
    }
  }

  toOldJSONExpanded(libraryItemId: string): BookOldJsonExpandedObject {
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

export default Book
