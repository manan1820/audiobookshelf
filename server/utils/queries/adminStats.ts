import { Op, Sequelize } from 'sequelize'
import Database from '../../Database'
import type PlaybackSessionModel from '../../models/PlaybackSession'
import type Book from '../../models/Book'
import type LibraryItem from '../../models/LibraryItem'
import fsExtra from '../../libs/fsExtra'
import type {
  AdminTopAuthor,
  AdminTopNarrator,
  AdminTopGenre,
  AdminStatsForYear,
  SizeObject,
  TotalSizeResult,
  NumAudioFilesResult
} from '../../types'

interface TotalStatRow {
  totalSize: number | null
  totalDuration: number | null
  totalItems: number | null
}

interface MediaTypeStatRow {
  mediaType: string
  totalSize: number | null
  numItems: number | null
}

interface AudioFileCountRow {
  numAudioFiles: number | null
}

const adminStats = {
  /**
   * Get listening sessions for year
   *
   * @param year YYYY
   * @returns
   */
  async getListeningSessionsForYear(year: number): Promise<PlaybackSessionModel[]> {
    const sessions = await Database.playbackSessionModel.findAll({
      where: {
        createdAt: {
          [Op.gte]: `${year}-01-01`,
          [Op.lt]: `${year + 1}-01-01`
        }
      }
    })
    return sessions
  },

  /**
   * Get number of authors added for year
   *
   * @param year YYYY
   * @returns
   */
  async getNumAuthorsAddedForYear(year: number): Promise<number> {
    const count = await Database.authorModel.count({
      where: {
        createdAt: {
          [Op.gte]: `${year}-01-01`,
          [Op.lt]: `${year + 1}-01-01`
        }
      }
    })
    return count
  },

  /**
   * Get books added for year
   *
   * @param year YYYY
   * @returns
   */
  async getBooksAddedForYear(year: number): Promise<Book[]> {
    const books = await Database.bookModel.findAll({
      attributes: ['id', 'title', 'coverPath', 'duration', 'createdAt'],
      where: {
        createdAt: {
          [Op.gte]: `${year}-01-01`,
          [Op.lt]: `${year + 1}-01-01`
        }
      },
      include: [
        {
          model: Database.libraryItemModel,
          attributes: ['id', 'mediaId', 'mediaType', 'size'],
          required: true
        }
      ],
      order: Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')
    })
    return books
  },

  /**
   * Get stats for year
   *
   * @param year YYYY
   */
  async getStatsForYear(year: number): Promise<AdminStatsForYear> {
    const booksAdded = await this.getBooksAddedForYear(year)

    let totalBooksAddedSize = 0
    let totalBooksAddedDuration = 0
    const booksWithCovers: string[] = []

    for (const book of booksAdded) {
      const bookMedia = book as Book & { libraryItem?: LibraryItem }
      // Grab first 25 that have a cover
      if (
        bookMedia.coverPath &&
        bookMedia.libraryItem?.id &&
        !booksWithCovers.includes(bookMedia.libraryItem.id) &&
        booksWithCovers.length < 25 &&
        (await fsExtra.pathExists(bookMedia.coverPath))
      ) {
        booksWithCovers.push(bookMedia.libraryItem.id)
      }
      if (bookMedia.duration && !isNaN(bookMedia.duration)) {
        totalBooksAddedDuration += bookMedia.duration
      }
      if (bookMedia.libraryItem?.size && !isNaN(Number(bookMedia.libraryItem.size))) {
        totalBooksAddedSize += Number(bookMedia.libraryItem.size)
      }
    }

    const numAuthorsAdded = await this.getNumAuthorsAddedForYear(year)

    const authorListeningMap: Record<string, number> = {}
    const narratorListeningMap: Record<string, number> = {}
    const genreListeningMap: Record<string, number> = {}

    const listeningSessions = await this.getListeningSessionsForYear(year)
    let totalListeningTime = 0
    for (const ls of listeningSessions) {
      totalListeningTime += ls.timeListening || 0

      const authors = (ls.mediaMetadata && 'authors' in ls.mediaMetadata ? ls.mediaMetadata.authors : null) || []
      authors.forEach((au) => {
        if (au.name) {
          if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
          authorListeningMap[au.name] += ls.timeListening || 0
        }
      })

      const narrators = (ls.mediaMetadata && 'narrators' in ls.mediaMetadata ? ls.mediaMetadata.narrators : null) || []
      narrators.forEach((narrator) => {
        if (narrator) {
          if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
          narratorListeningMap[narrator] += ls.timeListening || 0
        }
      })

      // Filter out bad genres like "audiobook" and "audio book"
      const genres = (ls.mediaMetadata?.genres || []).filter(
        (g) => g && !g.toLowerCase().includes('audiobook') && !g.toLowerCase().includes('audio book')
      )
      genres.forEach((genre) => {
        if (!genreListeningMap[genre]) genreListeningMap[genre] = 0
        genreListeningMap[genre] += ls.timeListening || 0
      })
    }

    const topAuthors: AdminTopAuthor[] = Object.keys(authorListeningMap)
      .map((authorName) => ({
        name: authorName,
        time: Math.round(authorListeningMap[authorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    const topNarrators: AdminTopNarrator[] = Object.keys(narratorListeningMap)
      .map((narratorName) => ({
        name: narratorName,
        time: Math.round(narratorListeningMap[narratorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    const topGenres: AdminTopGenre[] = Object.keys(genreListeningMap)
      .map((genre) => ({
        genre,
        time: Math.round(genreListeningMap[genre])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    // Stats for total books, size and duration for everything added this year or earlier
    const [totalStatResultsRow] = (await Database.sequelize.query(
      `SELECT SUM(li.size) AS totalSize, SUM(b.duration) AS totalDuration, COUNT(*) AS totalItems FROM libraryItems li, books b WHERE b.id = li.mediaId AND li.mediaType = 'book' AND li.createdAt < :nextYearBound;`,
      {
        replacements: {
          nextYearBound: `${year + 1}-01-01`
        }
      }
    )) as [TotalStatRow[], unknown]
    const totalStatResults = totalStatResultsRow[0]

    return {
      numListeningSessions: listeningSessions.length,
      numBooksAdded: booksAdded.length,
      numAuthorsAdded,
      totalBooksAddedSize,
      totalBooksAddedDuration: Math.round(totalBooksAddedDuration),
      booksAddedWithCovers: booksWithCovers,
      totalBooksSize: totalStatResults?.totalSize || 0,
      totalBooksDuration: totalStatResults?.totalDuration || 0,
      totalListeningTime,
      numBooks: totalStatResults?.totalItems || 0,
      topAuthors,
      topNarrators,
      topGenres
    }
  },

  /**
   * Get total file size and number of items for books and podcasts
   */
  async getTotalSize(): Promise<TotalSizeResult> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const [mediaTypeStats] = (await Database.sequelize.query(
      `SELECT li.mediaType, SUM(li.size) AS totalSize, COUNT(*) AS numItems FROM libraryItems li group by li.mediaType;`
    )) as [MediaTypeStatRow[], unknown]
    const bookStats = mediaTypeStats.find((m) => m.mediaType === 'book')
    const podcastStats = mediaTypeStats.find((m) => m.mediaType === 'podcast')

    return {
      books: {
        totalSize: bookStats?.totalSize || 0,
        numItems: bookStats?.numItems || 0
      },
      podcasts: {
        totalSize: podcastStats?.totalSize || 0,
        numItems: podcastStats?.numItems || 0
      },
      total: {
        totalSize: (bookStats?.totalSize || 0) + (podcastStats?.totalSize || 0),
        numItems: (bookStats?.numItems || 0) + (podcastStats?.numItems || 0)
      }
    }
  },

  /**
   * Get total number of audio files for books and podcasts
   */
  async getNumAudioFiles(): Promise<NumAudioFilesResult> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const [numBookAudioFilesRow] = (await Database.sequelize.query(
      `SELECT SUM(json_array_length(b.audioFiles)) AS numAudioFiles FROM books b;`
    )) as [AudioFileCountRow[], unknown]
    const numBookAudioFiles = numBookAudioFilesRow[0]?.numAudioFiles || 0
    const numPodcastAudioFiles = await Database.podcastEpisodeModel.count()
    return {
      numBookAudioFiles,
      numPodcastAudioFiles,
      numAudioFiles: numBookAudioFiles + numPodcastAudioFiles
    }
  }
}

export = adminStats
