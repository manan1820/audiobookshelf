import { DataTypes, Model, Sequelize, WhereOptions } from 'sequelize'

class BookSeries extends Model {
  declare id: string
  declare sequence: string | null
  declare bookId: string
  declare seriesId: string
  declare createdAt: Date

  static removeByIds(seriesId: string | null = null, bookId: string | null = null): Promise<number> {
    const where: WhereOptions = {}
    if (seriesId) (where as Record<string, unknown>).seriesId = seriesId
    if (bookId) (where as Record<string, unknown>).bookId = bookId
    return this.destroy({
      where
    })
  }

  static override init(sequelize: Sequelize): typeof BookSeries
  static override init(attributes: unknown, options: unknown): typeof BookSeries
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof BookSeries {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof BookSeries
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        sequence: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'bookSeries',
        timestamps: true,
        updatedAt: false,
        indexes: [
          {
            name: 'bookSeries_seriesId',
            fields: ['seriesId']
          },
          {
            name: 'book_series_series_book',
            fields: ['seriesId', 'bookId']
          }
        ]
      }
    )

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, series } = sequelize.models
    book.belongsToMany(series, { through: BookSeries })
    series.belongsToMany(book, { through: BookSeries })

    book.hasMany(BookSeries, {
      onDelete: 'CASCADE'
    })
    BookSeries.belongsTo(book)

    series.hasMany(BookSeries, {
      onDelete: 'CASCADE'
    })
    BookSeries.belongsTo(series)

    return BookSeries
  }
}

export = BookSeries
