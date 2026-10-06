import { Op } from 'sequelize'
import Database from '../../Database'
import fsExtra from '../../libs/fsExtra'

interface PlaybackSessionQueryResult {
  timeListening?: number | null
  mediaMetadata?: {
    authors?: Array<{ name: string }>
    narrators?: string[]
    genres?: string[]
  } | null
  [key: string]: unknown
}

interface BookAddedQueryResult {
  id: string
  title: string
  coverPath?: string | null
  duration?: number | null
  createdAt: Date
  libraryItem: {
    id: string
    mediaId?: string
    mediaType?: string
    size?: number | null
  }
}

interface TotalStatRow {
  totalSize?: number | null
  totalDuration?: number | null
  totalItems?: number | null
}

interface MediaTypeStatRow {
  mediaType: string
  totalSize?: number | null
  numItems?: number | null
}

interface AudioFilesCountRow {
  numAudioFiles?: number | null
}

interface PlaybackSessionModelQueryable {
  findAll(options?: unknown): Promise<PlaybackSessionQueryResult[]>
}

interface AuthorModelQueryable {
  count(options?: unknown): Promise<number>
}

interface BookModelQueryable {
  findAll(options?: unknown): Promise<BookAddedQueryResult[]>
}

interface PodcastEpisodeModelQueryable {
  count(options?: unknown): Promise<number>
}

interface SizeObject {
  totalSize: number
  numItems: number
}

interface AdminYearStats {
  numListeningSessions: number
  numBooksAdded: number
  numAuthorsAdded: number
  totalBooksAddedSize: number
  totalBooksAddedDuration: number
  booksAddedWithCovers: string[]
  totalBooksSize: number
  totalBooksDuration: number
  totalListeningTime: number
  numBooks: number
  topAuthors: Array<{ name: string; time: number }>
  topNarrators: Array<{ name: string; time: number }>
  topGenres: Array<{ genre: string; time: number }>
}

interface AdminTotalSizeStats {
  books: SizeObject
  podcasts: SizeObject
  total: SizeObject
}

interface AdminNumAudioFilesStats {
  numBookAudioFiles: number
  numPodcastAudioFiles: number
  numAudioFiles: number
}

/**
 * Get listening sessions for year
 */
async function getListeningSessionsForYear(year: number): Promise<PlaybackSessionQueryResult[]> {
  const playbackSessionModel = Database.playbackSessionModel as unknown as PlaybackSessionModelQueryable
  const sessions = await playbackSessionModel.findAll({
    where: {
      createdAt: {
        [Op.gte]: `${year}-01-01`,
        [Op.lt]: `${year + 1}-01-01`
      }
    }
  })
  return sessions
}

/**
 * Get number of authors added for year
 */
async function getNumAuthorsAddedForYear(year: number): Promise<number> {
  const authorModel = Database.authorModel as unknown as AuthorModelQueryable
  const count = await authorModel.count({
    where: {
      createdAt: {
        [Op.gte]: `${year}-01-01`,
        [Op.lt]: `${year + 1}-01-01`
      }
    }
  })
  return count
}

/**
 * Get books added for year
 */
async function getBooksAddedForYear(year: number): Promise<BookAddedQueryResult[]> {
  const bookModel = Database.bookModel as unknown as BookModelQueryable
  const books = await bookModel.findAll({
    attributes: ['id', 'title', 'coverPath', 'duration', 'createdAt'],
    where: {
      createdAt: {
        [Op.gte]: `${year}-01-01`,
        [Op.lt]: `${year + 1}-01-01`
      }
    },
    include: {
      model: Database.libraryItemModel,
      attributes: ['id', 'mediaId', 'mediaType', 'size'],
      required: true
    },
    order: Database.sequelize?.random()
  })
  return books
}

/**
 * Get stats for year
 */
async function getStatsForYear(year: number): Promise<AdminYearStats> {
  const booksAdded = await getBooksAddedForYear(year)

  let totalBooksAddedSize = 0
  let totalBooksAddedDuration = 0
  const booksWithCovers: string[] = []

  for (const book of booksAdded) {
    // Grab first 25 that have a cover
    if (
      book.coverPath &&
      !booksWithCovers.includes(book.libraryItem.id) &&
      booksWithCovers.length < 25 &&
      (await fsExtra.pathExists(book.coverPath))
    ) {
      booksWithCovers.push(book.libraryItem.id)
    }
    if (book.duration && !isNaN(book.duration)) {
      totalBooksAddedDuration += book.duration
    }
    if (book.libraryItem.size && !isNaN(book.libraryItem.size)) {
      totalBooksAddedSize += book.libraryItem.size
    }
  }

  const numAuthorsAdded = await getNumAuthorsAddedForYear(year)

  const authorListeningMap: Record<string, number> = {}
  const narratorListeningMap: Record<string, number> = {}
  const genreListeningMap: Record<string, number> = {}

  const listeningSessions = await getListeningSessionsForYear(year)
  let totalListeningTime = 0
  for (const ls of listeningSessions) {
    const time = ls.timeListening || 0
    totalListeningTime += time

    const authors = ls.mediaMetadata?.authors || []
    authors.forEach((au) => {
      if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
      authorListeningMap[au.name] += time
    })

    const narrators = ls.mediaMetadata?.narrators || []
    narrators.forEach((narrator) => {
      if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
      narratorListeningMap[narrator] += time
    })

    // Filter out bad genres like "audiobook" and "audio book"
    const genres = (ls.mediaMetadata?.genres || []).filter(
      (g) => g && !g.toLowerCase().includes('audiobook') && !g.toLowerCase().includes('audio book')
    )
    genres.forEach((genre) => {
      if (!genreListeningMap[genre]) genreListeningMap[genre] = 0
      genreListeningMap[genre] += time
    })
  }

  const topAuthors = Object.keys(authorListeningMap)
    .map((authorName) => ({
      name: authorName,
      time: Math.round(authorListeningMap[authorName] ?? 0)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)

  const topNarrators = Object.keys(narratorListeningMap)
    .map((narratorName) => ({
      name: narratorName,
      time: Math.round(narratorListeningMap[narratorName] ?? 0)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)

  const topGenres = Object.keys(genreListeningMap)
    .map((genre) => ({
      genre,
      time: Math.round(genreListeningMap[genre] ?? 0)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)

  // Stats for total books, size and duration for everything added this year or earlier
  const queryResult = Database.sequelize
    ? ((await Database.sequelize.query(
        `SELECT SUM(li.size) AS totalSize, SUM(b.duration) AS totalDuration, COUNT(*) AS totalItems FROM libraryItems li, books b WHERE b.id = li.mediaId AND li.mediaType = 'book' AND li.createdAt < ":nextYear-01-01";`,
        {
          replacements: {
            nextYear: year + 1
          }
        }
      )) as [TotalStatRow[], unknown])
    : null

  const totalStatResultsRow = queryResult?.[0]
  const totalStatResults = totalStatResultsRow?.[0]

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
}

/**
 * Get total file size and number of items for books and podcasts
 */
async function getTotalSize(): Promise<AdminTotalSizeStats> {
  const queryResult = Database.sequelize
    ? ((await Database.sequelize.query(
        `SELECT li.mediaType, SUM(li.size) AS totalSize, COUNT(*) AS numItems FROM libraryItems li group by li.mediaType;`
      )) as [MediaTypeStatRow[], unknown])
    : null

  const mediaTypeStats = queryResult?.[0] || []
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
}

/**
 * Get total number of audio files for books and podcasts
 */
async function getNumAudioFiles(): Promise<AdminNumAudioFilesStats> {
  const queryResult = Database.sequelize
    ? ((await Database.sequelize.query(
        `SELECT SUM(json_array_length(b.audioFiles)) AS numAudioFiles FROM books b;`
      )) as [AudioFilesCountRow[], unknown])
    : null

  const numBookAudioFilesRow = queryResult?.[0]
  const numBookAudioFiles = numBookAudioFilesRow?.[0]?.numAudioFiles || 0
  const podcastEpisodeModel = Database.podcastEpisodeModel as unknown as PodcastEpisodeModelQueryable
  const numPodcastAudioFiles = await podcastEpisodeModel.count()
  return {
    numBookAudioFiles,
    numPodcastAudioFiles,
    numAudioFiles: numBookAudioFiles + numPodcastAudioFiles
  }
}

const adminStats = {
  getListeningSessionsForYear,
  getNumAuthorsAddedForYear,
  getBooksAddedForYear,
  getStatsForYear,
  getTotalSize,
  getNumAudioFiles
}

export = adminStats
