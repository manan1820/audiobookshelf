import { DataTypes, Model, fn, col, Optional, Sequelize, NonAttribute } from 'sequelize'
import type Book from './Book'
import type Author from './Author'

export interface BookAuthorAttributes {
  id: string
  bookId: string
  authorId: string
  createdAt?: Date
}

export interface BookAuthorCreationAttributes
  extends Optional<BookAuthorAttributes, 'id' | 'createdAt'> {}

export class BookAuthor
  extends Model<BookAuthorAttributes, BookAuthorCreationAttributes>
  implements BookAuthorAttributes
{
  declare id: string
  declare bookId: string
  declare authorId: string
  declare readonly createdAt: Date

  // Associations
  declare book?: NonAttribute<Book>
  declare author?: NonAttribute<Author>

  static removeByIds(authorId: string | null = null, bookId: string | null = null) {
    const where: { authorId?: string; bookId?: string } = {}
    if (authorId) where.authorId = authorId
    if (bookId) where.bookId = bookId
    return this.destroy({
      where
    })
  }

  static getCountForAuthor(authorId: string): Promise<number> {
    return this.count({
      where: {
        authorId
      }
    })
  }

  static async getCountsForAuthors(authorIds: string[]): Promise<Record<string, number>> {
    if (!authorIds.length) return {}

    const rows = await this.findAll({
      attributes: ['authorId', [fn('COUNT', col('id')), 'count']],
      where: {
        authorId: authorIds
      },
      group: ['authorId'],
      raw: true
    })

    const counts: Record<string, number> = {}
    for (const row of rows) {
      const r = row as { authorId?: string; count?: string | number }
      if (r.authorId) {
        counts[r.authorId] = Number(r.count ?? 0)
      }
    }
    return counts
  }

  static initModel(sequelize: Sequelize): typeof BookAuthor {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        }
      },
      {
        sequelize,
        modelName: 'bookAuthor',
        timestamps: true,
        updatedAt: false,
        indexes: [
          {
            name: 'bookAuthor_authorId',
            fields: ['authorId']
          }
        ]
      }
    )

    const { book, author } = sequelize.models
    if (book && author) {
      book.belongsToMany(author, { through: BookAuthor })
      author.belongsToMany(book, { through: BookAuthor })

      book.hasMany(BookAuthor, {
        onDelete: 'CASCADE'
      })
      BookAuthor.belongsTo(book)

      author.hasMany(BookAuthor, {
        onDelete: 'CASCADE'
      })
      BookAuthor.belongsTo(author)
    }

    return BookAuthor
  }
}

export default BookAuthor
