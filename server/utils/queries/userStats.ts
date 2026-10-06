import { Op } from 'sequelize'
import Database from '../../Database'
import fsExtra from '../../libs/fsExtra'

interface PlaybackSessionBookInclude {
  id: string
  coverPath?: string | null
  libraryItem: {
    id: string
    mediaId?: string
    mediaType?: string
  }
}

interface PlaybackSessionQueryResult {
  userId: string
  createdAt: Date
  timeListening?: number | null
  mediaItemType?: string
  displayTitle?: string
  mediaItem?: PlaybackSessionBookInclude | null
  mediaMetadata?: {
    authors?: Array<{ name: string }>
    narrators?: string[]
    genres?: string[]
  } | null
  [key: string]: unknown
}

interface MediaProgressBookInclude {
  id: string
  title: string
  coverPath?: string | null
  libraryItem: {
    id: string
    mediaId?: string
    mediaType?: string
  }
}

interface MediaProgressQueryResult {
  userId: string
  mediaItemType: string
  finishedAt: number | null
  duration?: number | null
  mediaItem: MediaProgressBookInclude
  [key: string]: unknown
}

interface UserStatsLongestAudiobook {
  id: string
  title: string
  duration: number
  finishedAt: number | null
}

interface UserStatsAuthor {
  name: string
  time: number
}

interface UserStatsGenre {
  genre: string
  time: number
}

interface UserStatsNarrator {
  name: string
  time: number
}

interface UserStatsMonth {
  month: number
  time: number
}

interface UserYearStats {
  totalListeningSessions: number
  totalListeningTime: number
  totalBookListeningTime: number
  totalPodcastListeningTime: number
  topAuthors: UserStatsAuthor[]
  topGenres: UserStatsGenre[]
  mostListenedNarrator: UserStatsNarrator | null
  mostListenedMonth: UserStatsMonth | null
  numBooksFinished: number
  numBooksListened: number
  longestAudiobookFinished: UserStatsLongestAudiobook | null
  booksWithCovers: string[]
  finishedBooksWithCovers: string[]
}

interface PlaybackSessionModelQueryable {
  findAll(options?: unknown): Promise<PlaybackSessionQueryResult[]>
}

interface MediaProgressModelQueryable {
  findAll(options?: unknown): Promise<MediaProgressQueryResult[]>
}

/**
 * Get user listening sessions for year
 */
async function getUserListeningSessionsForYear(userId: string, year: number): Promise<PlaybackSessionQueryResult[]> {
  const playbackSessionModel = Database.playbackSessionModel as unknown as PlaybackSessionModelQueryable
  const sessions = await playbackSessionModel.findAll({
    where: {
      userId,
      createdAt: {
        [Op.gte]: `${year}-01-01`,
        [Op.lt]: `${year + 1}-01-01`
      }
    },
    include: {
      model: Database.bookModel,
      attributes: ['id', 'coverPath'],
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'mediaId', 'mediaType']
      },
      required: false
    },
    order: Database.sequelize?.random()
  })
  return sessions
}

/**
 * Get book media progress finished for year
 */
async function getBookMediaProgressFinishedForYear(userId: string, year: number): Promise<MediaProgressQueryResult[]> {
  const mediaProgressModel = Database.mediaProgressModel as unknown as MediaProgressModelQueryable
  const progresses = await mediaProgressModel.findAll({
    where: {
      userId,
      mediaItemType: 'book',
      finishedAt: {
        [Op.gte]: `${year}-01-01`,
        [Op.lt]: `${year + 1}-01-01`
      }
    },
    include: {
      model: Database.bookModel,
      attributes: ['id', 'title', 'coverPath'],
      include: {
        model: Database.libraryItemModel,
        attributes: ['id', 'mediaId', 'mediaType']
      },
      required: true
    },
    order: Database.sequelize?.random()
  })
  return progresses
}

/**
 * Get stats for year
 */
async function getStatsForYear(userId: string, year: number): Promise<UserYearStats> {
  const listeningSessions = await getUserListeningSessionsForYear(userId, year)
  const bookProgressesFinished = await getBookMediaProgressFinishedForYear(userId, year)

  let totalBookListeningTime = 0
  let totalPodcastListeningTime = 0
  let totalListeningTime = 0

  const authorListeningMap: Record<string, number> = {}
  const genreListeningMap: Record<string, number> = {}
  const narratorListeningMap: Record<string, number> = {}
  const monthListeningMap: Record<number, number> = {}
  const bookListeningMap: Record<string, number> = {}

  const booksWithCovers: string[] = []
  const finishedBooksWithCovers: string[] = []

  // Get finished book stats
  const numBooksFinished = bookProgressesFinished.length
  let longestAudiobookFinished: UserStatsLongestAudiobook | null = null
  for (const mediaProgress of bookProgressesFinished) {
    // Grab first 5 that have a cover
    if (
      mediaProgress.mediaItem?.coverPath &&
      !finishedBooksWithCovers.includes(mediaProgress.mediaItem.libraryItem.id) &&
      finishedBooksWithCovers.length < 5 &&
      (await fsExtra.pathExists(mediaProgress.mediaItem.coverPath))
    ) {
      finishedBooksWithCovers.push(mediaProgress.mediaItem.libraryItem.id)
    }

    if (
      mediaProgress.duration &&
      (!longestAudiobookFinished?.duration || mediaProgress.duration > longestAudiobookFinished.duration)
    ) {
      longestAudiobookFinished = {
        id: mediaProgress.mediaItem.id,
        title: mediaProgress.mediaItem.title,
        duration: Math.round(mediaProgress.duration),
        finishedAt: mediaProgress.finishedAt
      }
    }
  }

  // Get listening session stats
  for (const ls of listeningSessions) {
    // Grab first 25 that have a cover
    if (
      ls.mediaItem?.coverPath &&
      !booksWithCovers.includes(ls.mediaItem.libraryItem.id) &&
      !finishedBooksWithCovers.includes(ls.mediaItem.libraryItem.id) &&
      booksWithCovers.length < 25 &&
      (await fsExtra.pathExists(ls.mediaItem.coverPath))
    ) {
      booksWithCovers.push(ls.mediaItem.libraryItem.id)
    }

    const listeningSessionListeningTime = ls.timeListening || 0

    const lsMonth = new Date(ls.createdAt).getMonth()
    if (!monthListeningMap[lsMonth]) monthListeningMap[lsMonth] = 0
    monthListeningMap[lsMonth] += listeningSessionListeningTime

    totalListeningTime += listeningSessionListeningTime
    if (ls.mediaItemType === 'book') {
      totalBookListeningTime += listeningSessionListeningTime

      if (ls.displayTitle && !bookListeningMap[ls.displayTitle]) {
        bookListeningMap[ls.displayTitle] = listeningSessionListeningTime
      } else if (ls.displayTitle) {
        bookListeningMap[ls.displayTitle] += listeningSessionListeningTime
      }

      const authors = ls.mediaMetadata?.authors || []
      authors.forEach((au) => {
        if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
        authorListeningMap[au.name] += listeningSessionListeningTime
      })

      const narrators = ls.mediaMetadata?.narrators || []
      narrators.forEach((narrator) => {
        if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
        narratorListeningMap[narrator] += listeningSessionListeningTime
      })

      // Filter out bad genres like "audiobook" and "audio book"
      const genres = (ls.mediaMetadata?.genres || []).filter(
        (g) => g && !g.toLowerCase().includes('audiobook') && !g.toLowerCase().includes('audio book')
      )
      genres.forEach((genre) => {
        if (!genreListeningMap[genre]) genreListeningMap[genre] = 0
        genreListeningMap[genre] += listeningSessionListeningTime
      })
    } else {
      totalPodcastListeningTime += listeningSessionListeningTime
    }
  }

  totalListeningTime = Math.round(totalListeningTime)
  totalBookListeningTime = Math.round(totalBookListeningTime)
  totalPodcastListeningTime = Math.round(totalPodcastListeningTime)

  const topAuthors: UserStatsAuthor[] = Object.keys(authorListeningMap)
    .map((authorName) => ({
      name: authorName,
      time: Math.round(authorListeningMap[authorName] ?? 0)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)

  let mostListenedNarrator: UserStatsNarrator | null = null
  for (const narrator in narratorListeningMap) {
    const time = narratorListeningMap[narrator] ?? 0
    if (!mostListenedNarrator?.time || time > mostListenedNarrator.time) {
      mostListenedNarrator = {
        time: Math.round(time),
        name: narrator
      }
    }
  }

  const topGenres: UserStatsGenre[] = Object.keys(genreListeningMap)
    .map((genre) => ({
      genre,
      time: Math.round(genreListeningMap[genre] ?? 0)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3)

  let mostListenedMonth: UserStatsMonth | null = null
  for (const monthStr in monthListeningMap) {
    const month = Number(monthStr)
    const time = monthListeningMap[month] ?? 0
    if (!mostListenedMonth?.time || time > mostListenedMonth.time) {
      mostListenedMonth = {
        month: month,
        time: Math.round(time)
      }
    }
  }

  return {
    totalListeningSessions: listeningSessions.length,
    totalListeningTime,
    totalBookListeningTime,
    totalPodcastListeningTime,
    topAuthors,
    topGenres,
    mostListenedNarrator,
    mostListenedMonth,
    numBooksFinished,
    numBooksListened: Object.keys(bookListeningMap).length,
    longestAudiobookFinished,
    booksWithCovers,
    finishedBooksWithCovers
  }
}

const userStats = {
  getUserListeningSessionsForYear,
  getBookMediaProgressFinishedForYear,
  getStatsForYear
}

export = userStats
