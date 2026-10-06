import { DataTypes, Model, Sequelize, type WhereOptions, type Includeable } from 'sequelize'
import type User from './User'
import type Book from './Book'
import type Feed from './Feed'
import type LibraryItem from './LibraryItem'

interface CollectionOldJSON {
  id: string
  libraryId: string
  name: string
  description: string | null
  books: unknown[]
  lastUpdate: number
  createdAt: number
  rssFeed?: unknown
}

class Collection extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare libraryId: string
  declare updatedAt: Date
  declare createdAt: Date

  // Expanded properties
  declare books?: Book[]
  declare feeds?: Feed[]

  declare getBooks: (options?: unknown) => Promise<Book[]>
  declare getFeeds: (options?: unknown) => Promise<Feed[]>

  /**
   * Get all toOldJSONExpanded, items filtered for user permissions
   */
  static async getOldCollectionsJsonExpanded(
    user?: User | null,
    libraryId?: string,
    include?: string[]
  ): Promise<CollectionOldJSON[]> {
    let collectionWhere: WhereOptions | null = null
    if (libraryId) {
      collectionWhere = {
        libraryId
      }
    }

    const { book, libraryItem, author, series, collectionBook, feed } = this.sequelize!.models

    // Optionally include rssfeed for collection
    const collectionIncludes: Includeable[] = []
    if (include?.includes('rssfeed')) {
      collectionIncludes.push({
        model: feed
      })
    }

    const collections = (await this.findAll({
      where: collectionWhere || undefined,
      include: [
        {
          model: book,
          include: [
            {
              model: libraryItem
            },
            {
              model: author,
              through: {
                attributes: []
              }
            },
            {
              model: series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        },
        ...collectionIncludes
      ],
      order: [[book, collectionBook, 'order', 'ASC']]
    })) as Collection[]

    // TODO: Handle user permission restrictions on initial query
    const results: CollectionOldJSON[] = []
    for (const c of collections) {
      // Filter books using user permissions
      const books =
        c.books?.filter((b) => {
          if (user) {
            const bWithTags = b as unknown as { tags?: string[]; explicit?: boolean }
            if (bWithTags.tags?.length && !user.checkCanAccessLibraryItemWithTags(bWithTags.tags)) {
              return false
            }
            if (bWithTags.explicit === true && !user.canAccessExplicitContent) {
              return false
            }
          }
          return true
        }) || []

      // Users with restricted permissions will not see this collection
      if (!books.length && c.books?.length) {
        continue
      }

      c.books = books

      const collectionExpanded = c.toOldJSONExpanded()

      // Map feed if found
      if (c.feeds?.length) {
        collectionExpanded.rssFeed = (c.feeds[0] as unknown as { toOldJSON: () => unknown }).toOldJSON()
      }

      results.push(collectionExpanded)
    }

    return results
  }

  static async getExpandedById(collectionId: string): Promise<Collection | null> {
    const { book, libraryItem, author, series, collectionBook } = this.sequelize!.models
    return (await this.findByPk(collectionId, {
      include: [
        {
          model: book,
          include: [
            {
              model: libraryItem
            },
            {
              model: author,
              through: {
                attributes: []
              }
            },
            {
              model: series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        }
      ],
      order: [[book, collectionBook, 'order', 'ASC']]
    })) as Collection | null
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

  /**
   * Initialize model
   */
  static override init(sequelize: Sequelize): typeof Collection
  static override init(attributes: unknown, options: unknown): typeof Collection
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Collection {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Collection
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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

    const { library } = sequelize.models

    library.hasMany(Collection)
    Collection.belongsTo(library)

    return Collection
  }

  /**
   * Get all books in collection expanded with library item
   */
  getBooksExpandedWithLibraryItem(): Promise<Book[]> {
    const { libraryItem, author, series } = this.sequelize!.models
    return this.getBooks({
      include: [
        {
          model: libraryItem
        },
        {
          model: author,
          through: {
            attributes: []
          }
        },
        {
          model: series,
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
  async getOldJsonExpanded(user?: User | null, include?: string[]): Promise<CollectionOldJSON | null> {
    this.books = await this.getBooksExpandedWithLibraryItem()

    // Filter books using user permissions
    // TODO: Handle user permission restrictions on initial query
    if (user) {
      const books = this.books.filter((b) => {
        const bWithTags = b as unknown as { tags?: string[]; explicit?: boolean }
        if (bWithTags.tags?.length && !user.checkCanAccessLibraryItemWithTags(bWithTags.tags)) {
          return false
        }
        if (bWithTags.explicit === true && !user.canAccessExplicitContent) {
          return false
        }
        return true
      })

      // Users with restricted permissions will not see this collection
      if (!books.length && this.books.length) {
        return null
      }

      this.books = books
    }

    const collectionExpanded = this.toOldJSONExpanded()

    if (include?.includes('rssfeed')) {
      const feeds = await this.getFeeds()
      if (feeds?.length) {
        collectionExpanded.rssFeed = (feeds[0] as unknown as { toOldJSON: () => unknown }).toOldJSON()
      }
    }

    return collectionExpanded
  }

  toOldJSON(libraryItemIds: string[] = []): CollectionOldJSON {
    return {
      id: this.id,
      libraryId: this.libraryId,
      name: this.name,
      description: this.description,
      books: [...libraryItemIds],
      lastUpdate: this.updatedAt.valueOf(),
      createdAt: this.createdAt.valueOf()
    }
  }

  toOldJSONExpanded(): CollectionOldJSON {
    if (!this.books) {
      throw new Error('Books are required to expand Collection')
    }

    const json = this.toOldJSON()
    json.books = this.books.map((book) => {
      const bookWithLibItem = book as unknown as { libraryItem: LibraryItem }
      const libraryItem = bookWithLibItem.libraryItem
      delete (book as unknown as { libraryItem?: LibraryItem }).libraryItem
      libraryItem.media = book as never
      return libraryItem.toOldJSONExpanded()
    })

    return json
  }
}

export = Collection
