import { Op, Sequelize } from 'sequelize'
import Database from '../../Database'
import type PlaybackSessionModel from '../../models/PlaybackSession'
import type MediaProgressModel from '../../models/MediaProgress'
import type Book from '../../models/Book'
import type LibraryItem from '../../models/LibraryItem'
import fsExtra from '../../libs/fsExtra'
import type {
  MostListenedNarrator,
  MostListenedMonth,
  TopAuthor,
  TopGenre,
  LongestAudiobookFinished,
  UserStatsForYear
} from '../../types'

const userStats = {
  /**
   * Get user listening sessions for year
   *
   * @param userId
   * @param year YYYY
   * @returns
   */
  async getUserListeningSessionsForYear(userId: string, year: number): Promise<PlaybackSessionModel[]> {
    const sessions = await Database.playbackSessionModel.findAll({
      where: {
        userId,
        createdAt: {
          [Op.gte]: `${year}-01-01`,
          [Op.lt]: `${year + 1}-01-01`
        }
      },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'coverPath'],
          include: [
            {
              model: Database.libraryItemModel,
              attributes: ['id', 'mediaId', 'mediaType']
            }
          ],
          required: false
        }
      ],
      order: Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')
    })
    return sessions
  },

  /**
   * Get finished book media progresses for year
   *
   * @param userId
   * @param year YYYY
   * @returns
   */
  async getBookMediaProgressFinishedForYear(userId: string, year: number): Promise<MediaProgressModel[]> {
    const progresses = await Database.mediaProgressModel.findAll({
      where: {
        userId,
        mediaItemType: 'book',
        finishedAt: {
          [Op.gte]: `${year}-01-01`,
          [Op.lt]: `${year + 1}-01-01`
        }
      },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title', 'coverPath'],
          include: [
            {
              model: Database.libraryItemModel,
              attributes: ['id', 'mediaId', 'mediaType']
            }
          ],
          required: true
        }
      ],
      order: Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')
    })
    return progresses
  },

  /**
   * Get stats for year
   *
   * @param userId
   * @param year YYYY
   */
  async getStatsForYear(userId: string, year: number): Promise<UserStatsForYear> {
    const listeningSessions = await this.getUserListeningSessionsForYear(userId, year)
    const bookProgressesFinished = await this.getBookMediaProgressFinishedForYear(userId, year)

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
    let longestAudiobookFinished: LongestAudiobookFinished | null = null
    for (const mediaProgress of bookProgressesFinished) {
      const bookMedia = mediaProgress.mediaItem as (Book & { libraryItem?: LibraryItem }) | undefined
      // Grab first 5 that have a cover
      if (
        bookMedia?.coverPath &&
        bookMedia.libraryItem?.id &&
        !finishedBooksWithCovers.includes(bookMedia.libraryItem.id) &&
        finishedBooksWithCovers.length < 5 &&
        (await fsExtra.pathExists(bookMedia.coverPath))
      ) {
        finishedBooksWithCovers.push(bookMedia.libraryItem.id)
      }

      if (
        mediaProgress.duration &&
        (!longestAudiobookFinished?.duration || mediaProgress.duration > longestAudiobookFinished.duration)
      ) {
        longestAudiobookFinished = {
          id: mediaProgress.mediaItemId,
          title: bookMedia?.title ?? '',
          duration: Math.round(mediaProgress.duration),
          finishedAt: mediaProgress.finishedAt
        }
      }
    }

    // Get listening session stats
    for (const ls of listeningSessions) {
      const bookMedia = ls.mediaItem as (Book & { libraryItem?: LibraryItem }) | undefined
      // Grab first 25 that have a cover
      if (
        bookMedia?.coverPath &&
        bookMedia.libraryItem?.id &&
        !booksWithCovers.includes(bookMedia.libraryItem.id) &&
        !finishedBooksWithCovers.includes(bookMedia.libraryItem.id) &&
        booksWithCovers.length < 25 &&
        (await fsExtra.pathExists(bookMedia.coverPath))
      ) {
        booksWithCovers.push(bookMedia.libraryItem.id)
      }

      const listeningSessionListeningTime = ls.timeListening || 0

      const lsMonth = ls.createdAt.getMonth()
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

        const authors = (ls.mediaMetadata && 'authors' in ls.mediaMetadata ? ls.mediaMetadata.authors : null) || []
        authors.forEach((au) => {
          if (au.name) {
            if (!authorListeningMap[au.name]) authorListeningMap[au.name] = 0
            authorListeningMap[au.name] += listeningSessionListeningTime
          }
        })

        const narrators =
          (ls.mediaMetadata && 'narrators' in ls.mediaMetadata ? ls.mediaMetadata.narrators : null) || []
        narrators.forEach((narrator) => {
          if (narrator) {
            if (!narratorListeningMap[narrator]) narratorListeningMap[narrator] = 0
            narratorListeningMap[narrator] += listeningSessionListeningTime
          }
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

    const topAuthors: TopAuthor[] = Object.keys(authorListeningMap)
      .map((authorName) => ({
        name: authorName,
        time: Math.round(authorListeningMap[authorName])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let mostListenedNarrator: MostListenedNarrator | null = null
    for (const narrator in narratorListeningMap) {
      if (!mostListenedNarrator?.time || narratorListeningMap[narrator] > mostListenedNarrator.time) {
        mostListenedNarrator = {
          time: Math.round(narratorListeningMap[narrator]),
          name: narrator
        }
      }
    }

    const topGenres: TopGenre[] = Object.keys(genreListeningMap)
      .map((genre) => ({
        genre,
        time: Math.round(genreListeningMap[genre])
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 3)

    let mostListenedMonth: MostListenedMonth | null = null
    for (const month in monthListeningMap) {
      const monthNum = Number(month)
      if (!mostListenedMonth?.time || monthListeningMap[monthNum] > mostListenedMonth.time) {
        mostListenedMonth = {
          month: monthNum,
          time: Math.round(monthListeningMap[monthNum])
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
}

export = userStats
