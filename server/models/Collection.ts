import {
  DataTypes,
  Model,
  Sequelize,
  Optional,
  NonAttribute,
  FindOptions,
  Includeable,
  WhereOptions
} from 'sequelize'
import type Library from './Library'
import type Book from './Book'
import type Feed from './Feed'
import type User from './User'
import type CollectionBook from './CollectionBook'
import type {
  CollectionOldJsonObject,
  CollectionOldJsonExpandedObject
} from '../types'

export interface CollectionAttributes {
  id: string
  name: string
  description?: string | null
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface CollectionCreationAttributes
  extends Optional<CollectionAttributes, 'id' | 'description' | 'createdAt' | 'updatedAt'> {}

export class Collection
  extends Model<CollectionAttributes, CollectionCreationAttributes>
  implements CollectionAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare library?: NonAttribute<Library>
  declare books?: NonAttribute<Book[]>
  declare feeds?: NonAttribute<Feed[]>
  declare collectionBooks?: NonAttribute<CollectionBook[]>

  // Mixins
  declare getBooks: (options?: FindOptions) => Promise<Book[]>
  declare getFeeds: (options?: FindOptions) => Promise<Feed[]>

  /**
   * Get all toOldJSONExpanded, items filtered for user permissions
   */
  static async getOldCollectionsJsonExpanded(
    user?: User | null,
    libraryId?: string,
    include?: string[]
  ): Promise<CollectionOldJsonExpandedObject[]> {
    if (!this.sequelize) return []

    let collectionWhere: WhereOptions | undefined = undefined
    if (libraryId) {
      collectionWhere = {
        libraryId
      }
    }

    const collectionIncludes: Includeable[] = []
    if (include?.includes('rssfeed')) {
      collectionIncludes.push({
        model: this.sequelize.models.feed
      })
    }

    const collections = await this.findAll({
      where: collectionWhere,
      include: [
        {
          model: this.sequelize.models.book,
          include: [
            {
              model: this.sequelize.models.libraryItem
            },
            {
              model: this.sequelize.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize.models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        ...collectionIncludes
      ],
      order: [[this.sequelize.models.book, this.sequelize.models.collectionBook, 'order', 'ASC']]
    })

    const result: CollectionOldJsonExpandedObject[] = []

    for (const c of collections) {
      const books =
        c.books?.filter((b) => {
          if (user) {
            if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
              return false
            }
            if (b.explicit === true && !user.canAccessExplicitContent) {
              return false
            }
          }
          return true
        }) ?? []

      if (!books.length && (c.books?.length ?? 0) > 0) {
        continue
      }

      c.books = books

      const collectionExpanded = c.toOldJSONExpanded()

      if (c.feeds?.length) {
        collectionExpanded.rssFeed = c.feeds[0]?.toOldJSON() ?? null
      }

      result.push(collectionExpanded)
    }

    return result
  }

  /**
   * Get collection expanded by ID
   */
  static async getExpandedById(collectionId: string): Promise<Collection | null> {
    if (!this.sequelize) return null
    return this.findByPk(collectionId, {
      include: [
        {
          model: this.sequelize.models.book,
          include: [
            {
              model: this.sequelize.models.libraryItem
            },
            {
              model: this.sequelize.models.author,
              through: {
                attributes: []
              }
            },
            {
              model: this.sequelize.models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        }
      ],
      order: [[this.sequelize.models.book, this.sequelize.models.collectionBook, 'order', 'ASC']]
    })
  }

  /**
   * Remove all collections belonging to library
   */
  static async removeAllForLibrary(libraryId: string): Promise<number> {
    if (!libraryId) return 0
    return this.destroy({
      where: {
        libraryId
      }
    })
  }

  static initModel(sequelize: Sequelize): typeof Collection {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'collection'
      }
    )

    return Collection
  }

  /**
   * Get all books in collection expanded with library item
   */
  getBooksExpandedWithLibraryItem(): Promise<Book[]> {
    if (!this.sequelize || typeof this.getBooks !== 'function') return Promise.resolve([])
    return this.getBooks({
      include: [
        {
          model: this.sequelize.models.libraryItem
        },
        {
          model: this.sequelize.models.author,
          through: {
            attributes: []
          }
        },
        {
          model: this.sequelize.models.series,
          through: {
            attributes: ['sequence']
          }
        }
      ],
      order: [Sequelize.literal('`collectionBook.order` ASC')]
    })
  }

  /**
   * Get toOldJSONExpanded, items filtered for user permissions
   */
  async getOldJsonExpanded(
    user?: User | null,
    include?: string[]
  ): Promise<CollectionOldJsonExpandedObject | null> {
    this.books = await this.getBooksExpandedWithLibraryItem()

    if (user) {
      const books = this.books.filter((b) => {
        if (b.tags?.length && !user.checkCanAccessLibraryItemWithTags(b.tags)) {
          return false
        }
        if (b.explicit === true && !user.canAccessExplicitContent) {
          return false
        }
        return true
      })

      if (!books.length && this.books.length > 0) {
        return null
      }

      this.books = books
    }

    const collectionExpanded = this.toOldJSONExpanded()

    if (include?.includes('rssfeed') && typeof this.getFeeds === 'function') {
      const feeds = await this.getFeeds()
      if (feeds?.length) {
        collectionExpanded.rssFeed = feeds[0]?.toOldJSON() ?? null
      }
    }

    return collectionExpanded
  }

  toOldJSON(libraryItemIds: string[] = []): CollectionOldJsonObject {
    return {
      id: this.id,
      libraryId: this.libraryId,
      name: this.name,
      description: this.description ?? null,
      books: [...libraryItemIds],
      lastUpdate: this.updatedAt?.valueOf() ?? Date.now(),
      createdAt: this.createdAt?.valueOf() ?? Date.now()
    }
  }

  toOldJSONExpanded(): CollectionOldJsonExpandedObject {
    if (!this.books) {
      throw new Error('[Collection] Books are required to expand Collection')
    }

    const json = this.toOldJSON()
    const expandedBooks = this.books.map((book) => {
      const libraryItem = book.libraryItem
      if (!libraryItem) {
        throw new Error(`[Collection] Book "${book.id}" does not have libraryItem loaded`)
      }
      libraryItem.media = book
      return libraryItem.toOldJSONExpanded()
    })

    return {
      ...json,
      books: expandedBooks
    }
  }
}

export default Collection
