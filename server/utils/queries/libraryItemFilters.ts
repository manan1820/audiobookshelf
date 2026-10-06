import Sequelize, { Op } from 'sequelize'
import Database from '../../Database'
import libraryItemsBookFilters from './libraryItemsBookFilters'
import libraryItemsPodcastFilters from './libraryItemsPodcastFilters'
import type LibraryItem from '../../models/LibraryItem'
import type User from '../../models/User'
import type Library from '../../models/Library'
import type Book from '../../models/Book'
import type Podcast from '../../models/Podcast'

interface BookWithLibraryItem extends Book {
  libraryItem: LibraryItem
}

interface PodcastWithLibraryItem extends Podcast {
  libraryItem: LibraryItem
}

interface BookModelQueryable {
  findAll(options?: unknown): Promise<BookWithLibraryItem[]>
}

interface PodcastModelQueryable {
  findAll(options?: unknown): Promise<PodcastWithLibraryItem[]>
}

interface LibraryItemModelQueryable {
  findAll(options?: unknown): Promise<LibraryItem[]>
}

interface LargestItemResult {
  id: string
  title: string
  size: number
}

interface LibraryItemSearchResults {
  book?: unknown[]
  podcast?: unknown[]
  tags?: unknown[]
  authors?: unknown[]
  series?: unknown[]
  narrators?: unknown[]
  genres?: unknown[]
  episodes?: unknown[]
}

/**
 * Get all library items that have tags
 */
async function getAllLibraryItemsWithTags(tags: string[]): Promise<LibraryItem[]> {
  const libraryItems: LibraryItem[] = []
  const bookModel = Database.bookModel as unknown as BookModelQueryable
  const booksWithTag = await bookModel.findAll({
    where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
      [Op.gte]: 1
    }),
    replacements: {
      tags
    },
    include: [
      {
        model: Database.libraryItemModel
      },
      {
        model: Database.authorModel,
        through: {
          attributes: []
        }
      },
      {
        model: Database.seriesModel,
        through: {
          attributes: ['sequence']
        }
      }
    ],
    order: [
      [Database.authorModel, Database.bookAuthorModel, 'createdAt', 'ASC'],
      [Database.seriesModel, 'bookSeries', 'createdAt', 'ASC']
    ]
  })
  for (const book of booksWithTag) {
    const libraryItem = book.libraryItem
    libraryItem.media = book as unknown as LibraryItem['media']
    libraryItems.push(libraryItem)
  }
  const podcastModel = Database.podcastModel as unknown as PodcastModelQueryable
  const podcastsWithTag = await podcastModel.findAll({
    where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`), {
      [Op.gte]: 1
    }),
    replacements: {
      tags
    },
    include: [
      {
        model: Database.libraryItemModel
      },
      {
        model: Database.podcastEpisodeModel
      }
    ]
  })
  for (const podcast of podcastsWithTag) {
    const libraryItem = podcast.libraryItem
    libraryItem.media = podcast as unknown as LibraryItem['media']
    libraryItems.push(libraryItem)
  }
  return libraryItems
}

/**
 * Get all library items that have genres
 */
async function getAllLibraryItemsWithGenres(genres: string[]): Promise<LibraryItem[]> {
  const libraryItems: LibraryItem[] = []
  const bookModel = Database.bookModel as unknown as BookModelQueryable
  const booksWithGenre = await bookModel.findAll({
    where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
      [Op.gte]: 1
    }),
    replacements: {
      genres
    },
    include: [
      {
        model: Database.libraryItemModel
      },
      {
        model: Database.authorModel,
        through: {
          attributes: []
        }
      },
      {
        model: Database.seriesModel,
        through: {
          attributes: ['sequence']
        }
      }
    ],
    order: [
      [Database.authorModel, Database.bookAuthorModel, 'createdAt', 'ASC'],
      [Database.seriesModel, 'bookSeries', 'createdAt', 'ASC']
    ]
  })
  for (const book of booksWithGenre) {
    const libraryItem = book.libraryItem
    libraryItem.media = book as unknown as LibraryItem['media']
    libraryItems.push(libraryItem)
  }
  const podcastModel = Database.podcastModel as unknown as PodcastModelQueryable
  const podcastsWithGenre = await podcastModel.findAll({
    where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`), {
      [Op.gte]: 1
    }),
    replacements: {
      genres
    },
    include: [
      {
        model: Database.libraryItemModel
      },
      {
        model: Database.podcastEpisodeModel
      }
    ]
  })
  for (const podcast of podcastsWithGenre) {
    const libraryItem = podcast.libraryItem
    libraryItem.media = podcast as unknown as LibraryItem['media']
    libraryItems.push(libraryItem)
  }
  return libraryItems
}

/**
 * Get all library items that have narrators
 */
async function getAllLibraryItemsWithNarrators(narrators: string[], libraryId: string): Promise<LibraryItem[]> {
  const libraryItems: LibraryItem[] = []
  const bookModel = Database.bookModel as unknown as BookModelQueryable
  const booksWithNarrators = await bookModel.findAll({
    where: Sequelize.where(Sequelize.literal(`(SELECT count(*) FROM json_each(narrators) WHERE json_valid(narrators) AND json_each.value IN (:narrators))`), {
      [Op.gte]: 1
    }),
    replacements: {
      narrators
    },
    include: [
      {
        model: Database.libraryItemModel,
        where: { libraryId }
      },
      {
        model: Database.authorModel,
        through: {
          attributes: []
        }
      },
      {
        model: Database.seriesModel,
        through: {
          attributes: ['sequence']
        }
      }
    ]
  })
  for (const book of booksWithNarrators) {
    const libraryItem = book.libraryItem
    libraryItem.media = book as unknown as LibraryItem['media']
    libraryItems.push(libraryItem)
  }
  return libraryItems
}

/**
 * Search library items
 */
function search(user: User, library: Library, query: string, limit: number = 10): Promise<LibraryItemSearchResults> {
  if (library.isBook) {
    return (libraryItemsBookFilters.search(user, library, query, limit, 0) as unknown) as Promise<LibraryItemSearchResults>
  } else {
    return (libraryItemsPodcastFilters.search(user, library, query, limit, 0) as unknown) as Promise<LibraryItemSearchResults>
  }
}

/**
 * Get largest items in library
 */
async function getLargestItems(libraryId: string, limit?: number): Promise<LargestItemResult[]> {
  const libraryItemModel = Database.libraryItemModel as unknown as LibraryItemModelQueryable
  const libraryItems = await libraryItemModel.findAll({
    attributes: ['id', 'mediaId', 'mediaType', 'size'],
    where: {
      libraryId
    },
    include: [
      {
        model: Database.bookModel,
        attributes: ['id', 'title']
      },
      {
        model: Database.podcastModel,
        attributes: ['id', 'title']
      }
    ],
    order: [['size', 'DESC']],
    limit
  })
  return libraryItems.map((libraryItem) => {
    return {
      id: libraryItem.id,
      title: libraryItem.media?.title || '',
      size: Number(libraryItem.size)
    }
  })
}

const libraryItemFilters = {
  getAllLibraryItemsWithTags,
  getAllLibraryItemsWithGenres,
  getAllLibraryItemsWithNarrators,
  search,
  getLargestItems
}

export = libraryItemFilters
