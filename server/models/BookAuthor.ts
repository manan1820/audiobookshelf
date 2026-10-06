import { DataTypes, Model, Sequelize, WhereOptions, fn, col } from 'sequelize'

interface AuthorCountRow {
  authorId: string
  count: number | string
}

class BookAuthor extends Model {
  declare id: string
  declare bookId: string
  declare authorId: string
  declare createdAt: Date

  static removeByIds(authorId: string | null = null, bookId: string | null = null): Promise<number> {
    const where: WhereOptions = {}
    if (authorId) (where as Record<string, unknown>).authorId = authorId
    if (bookId) (where as Record<string, unknown>).bookId = bookId
    return this.destroy({
      where
    })
  }

  /**
   * Get number of books for author
   */
  static getCountForAuthor(authorId: string): Promise<number> {
    return this.count({
      where: {
        authorId
      }
    })
  }

  /**
   * Get number of books for each author
   */
  static async getCountsForAuthors(authorIds: string[]): Promise<Record<string, number>> {
    if (!authorIds.length) return {}

    const rows = (await this.findAll({
      attributes: ['authorId', [fn('COUNT', col('id')), 'count']],
      where: {
        authorId: authorIds
      },
      group: ['authorId'],
      raw: true
    })) as unknown as AuthorCountRow[]

    const counts: Record<string, number> = {}
    for (const row of rows) {
      counts[row.authorId] = Number(row.count)
    }
    return counts
  }

  static override init(sequelize: Sequelize): typeof BookAuthor
  static override init(attributes: unknown, options: unknown): typeof BookAuthor
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof BookAuthor {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof BookAuthor
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, author } = sequelize.models
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

    return BookAuthor
  }
}

export = BookAuthor
