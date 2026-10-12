import { Sequelize, Op } from 'sequelize'
import Database from '../../Database'
import libraryItemsBookFilters from './libraryItemsBookFilters'
import libraryItemsPodcastFilters from './libraryItemsPodcastFilters'
import type LibraryItem from '../../models/LibraryItem'
import type Book from '../../models/Book'
import type Podcast from '../../models/Podcast'
import type User from '../../models/User'
import type Library from '../../models/Library'

import type { LargestItem } from '../../types'

const libraryItemFilters = {
  /**
   * Get all library items that have tags
   * @param tags
   * @returns
   */
  async getAllLibraryItemsWithTags(tags: string[]): Promise<LibraryItem[]> {
    const libraryItems: LibraryItem[] = []
    const booksWithTag = await Database.bookModel.findAll({
      where: Sequelize.where(
        Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`),
        {
          [Op.gte]: 1
        }
      ),
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
      const bookWithItem = book as Book & { libraryItem?: LibraryItem }
      const libraryItem = bookWithItem.libraryItem
      if (libraryItem) {
        libraryItem.media = book
        libraryItems.push(libraryItem)
      }
    }
    const podcastsWithTag = await Database.podcastModel.findAll({
      where: Sequelize.where(
        Sequelize.literal(`(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:tags))`),
        {
          [Op.gte]: 1
        }
      ),
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
      const podcastWithItem = podcast as Podcast & { libraryItem?: LibraryItem }
      const libraryItem = podcastWithItem.libraryItem
      if (libraryItem) {
        libraryItem.media = podcast
        libraryItems.push(libraryItem)
      }
    }
    return libraryItems
  },

  /**
   * Get all library items that have genres
   * @param genres
   * @returns
   */
  async getAllLibraryItemsWithGenres(genres: string[]): Promise<LibraryItem[]> {
    const libraryItems: LibraryItem[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(
        Sequelize.literal(
          `(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`
        ),
        {
          [Op.gte]: 1
        }
      ),
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
      ]
    })
    for (const book of booksWithGenre) {
      const bookWithItem = book as Book & { libraryItem?: LibraryItem }
      const libraryItem = bookWithItem.libraryItem
      if (libraryItem) {
        libraryItem.media = book
        libraryItems.push(libraryItem)
      }
    }
    const podcastsWithGenre = await Database.podcastModel.findAll({
      where: Sequelize.where(
        Sequelize.literal(
          `(SELECT count(*) FROM json_each(genres) WHERE json_valid(genres) AND json_each.value IN (:genres))`
        ),
        {
          [Op.gte]: 1
        }
      ),
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
      const podcastWithItem = podcast as Podcast & { libraryItem?: LibraryItem }
      const libraryItem = podcastWithItem.libraryItem
      if (libraryItem) {
        libraryItem.media = podcast
        libraryItems.push(libraryItem)
      }
    }
    return libraryItems
  },

  /**
   * Get all library items that have narrators
   * @param narrators
   * @param libraryId
   * @returns
   */
  async getAllLibraryItemsWithNarrators(narrators: string[], libraryId: string): Promise<LibraryItem[]> {
    const libraryItems: LibraryItem[] = []
    const booksWithGenre = await Database.bookModel.findAll({
      where: Sequelize.where(
        Sequelize.literal(
          `(SELECT count(*) FROM json_each(narrators) WHERE json_valid(narrators) AND json_each.value IN (:narrators))`
        ),
        {
          [Op.gte]: 1
        }
      ),
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
    for (const book of booksWithGenre) {
      const bookWithItem = book as Book & { libraryItem?: LibraryItem }
      const libraryItem = bookWithItem.libraryItem
      if (libraryItem) {
        libraryItem.media = book
        libraryItems.push(libraryItem)
      }
    }
    return libraryItems
  },

  /**
   * Search library items
   * @param user
   * @param library
   * @param query
   * @param limit
   * @returns
   */
  search(user: User, library: Library, query: string, limit: number) {
    if (library.isBook) {
      return libraryItemsBookFilters.search(user, library, query, limit, 0)
    } else {
      return libraryItemsPodcastFilters.search(user, library, query, limit, 0)
    }
  },

  /**
   * Get largest items in library
   * @param libraryId
   * @param limit
   * @returns
   */
  async getLargestItems(libraryId: string, limit: number): Promise<LargestItem[]> {
    const libraryItems = await Database.libraryItemModel.findAll({
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
      const media = libraryItem.media as { title?: string } | undefined
      return {
        id: libraryItem.id,
        title: media?.title ?? '',
        size: Number(libraryItem.size ?? 0)
      }
    })
  }
}

export = libraryItemFilters
