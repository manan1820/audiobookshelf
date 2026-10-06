import { DataTypes, Model, Sequelize, where, fn, col } from 'sequelize'
import { nameToLastFirst } from '../utils/parsers/parseNameString'
import type LibraryItem from './LibraryItem'
import type Book from './Book'

interface AuthorOldJSON {
  id: string
  asin: string | null
  name: string
  description: string | null
  imagePath: string | null
  libraryId: string
  addedAt: number
  updatedAt: number
}

interface AuthorOldJSONExpanded extends AuthorOldJSON {
  numBooks: number
}

interface AuthorJSONMinimal {
  id: string
  name: string
}

class Author extends Model {
  declare id: string
  declare name: string
  declare lastFirst: string | null
  declare asin: string | null
  declare description: string | null
  declare imagePath: string | null
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date

  declare books?: Book[]

  static getLastFirst(name: string | null | undefined): string | null {
    if (!name) return null
    return nameToLastFirst(name)
  }

  /**
   * Check if author exists
   */
  static async checkExistsById(authorId: string): Promise<boolean> {
    return (await this.count({ where: { id: authorId } })) > 0
  }

  /**
   * Get author by name and libraryId. name case insensitive
   */
  static async getByNameAndLibrary(authorName: string, libraryId: string): Promise<Author | null> {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), authorName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  static async getAllLibraryItemsForAuthor(authorId: string): Promise<LibraryItem[]> {
    const models = this.sequelize!.models
    const author = (await this.findByPk(authorId, {
      include: [
        {
          model: models.book,
          include: [
            {
              model: models.libraryItem
            },
            {
              model: models.author,
              through: {
                attributes: []
              }
            },
            {
              model: models.series,
              through: {
                attributes: ['sequence']
              }
            }
          ]
        }
      ]
    })) as (Author & { books?: Array<Book & { libraryItem?: LibraryItem }> }) | null

    const libraryItems: LibraryItem[] = []
    if (author?.books) {
      for (const book of author.books) {
        const libraryItem = book.libraryItem
        if (libraryItem) {
          libraryItem.media = book as unknown as LibraryItem['media']
          delete (book as { libraryItem?: LibraryItem }).libraryItem
          libraryItems.push(libraryItem)
        }
      }
    }

    return libraryItems
  }

  static async findOrCreateByNameAndLibrary(name: string, libraryId: string): Promise<{ author: Author; created: boolean }> {
    const author = await this.getByNameAndLibrary(name, libraryId)
    if (author) return { author, created: false }
    const newAuthor = await this.create({
      name,
      lastFirst: this.getLastFirst(name),
      libraryId
    })
    return { author: newAuthor, created: true }
  }

  static override init(sequelize: Sequelize): typeof Author
  static override init(attributes: unknown, options: unknown): typeof Author
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Author {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Author
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
        lastFirst: DataTypes.STRING,
        asin: DataTypes.STRING,
        description: DataTypes.TEXT,
        imagePath: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'author',
        indexes: [
          {
            fields: [
              {
                name: 'name',
                collate: 'NOCASE'
              }
            ]
          },
          {
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    library.hasMany(Author, {
      onDelete: 'CASCADE'
    })
    Author.belongsTo(library)

    return Author
  }

  toOldJSON(): AuthorOldJSON {
    return {
      id: this.id,
      asin: this.asin,
      name: this.name,
      description: this.description,
      imagePath: this.imagePath,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf()
    }
  }

  toOldJSONExpanded(numBooks = 0): AuthorOldJSONExpanded {
    const oldJson = this.toOldJSON()
    return {
      ...oldJson,
      numBooks
    }
  }

  toJSONMinimal(): AuthorJSONMinimal {
    return {
      id: this.id,
      name: this.name
    }
  }
}

export = Author
