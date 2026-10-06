import { DataTypes, Model, Optional, Sequelize, NonAttribute } from 'sequelize'
import type Book from './Book'
import type Series from './Series'

export interface BookSeriesAttributes {
  id: string
  sequence?: string | null
  bookId: string
  seriesId: string
  createdAt?: Date
}

export interface BookSeriesCreationAttributes
  extends Optional<BookSeriesAttributes, 'id' | 'sequence' | 'createdAt'> {}

export class BookSeries
  extends Model<BookSeriesAttributes, BookSeriesCreationAttributes>
  implements BookSeriesAttributes
{
  declare id: string
  declare sequence: string | null
  declare bookId: string
  declare seriesId: string
  declare readonly createdAt: Date

  // Associations
  declare book?: NonAttribute<Book>
  declare series?: NonAttribute<Series>

  static removeByIds(seriesId: string | null = null, bookId: string | null = null) {
    const where: { seriesId?: string; bookId?: string } = {}
    if (seriesId) where.seriesId = seriesId
    if (bookId) where.bookId = bookId
    return this.destroy({
      where
    })
  }

  static initModel(sequelize: Sequelize): typeof BookSeries {
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

    const { book, series } = sequelize.models
    if (book && series) {
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
    }

    return BookSeries
  }
}

export default BookSeries
