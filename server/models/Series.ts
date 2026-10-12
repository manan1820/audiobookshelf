import { DataTypes, Model, where, fn, col, literal, Sequelize, NonAttribute, Optional, BelongsToManyGetAssociationsMixin } from 'sequelize'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils'
import type Book from './Book'
import type Library from './Library'
import type BookSeries from './BookSeries'
import type Feed from './Feed'
import type { SeriesOldJsonObject, SeriesMinimalJsonObject } from '../types'

export interface SeriesAttributes {
  id: string
  name: string
  nameIgnorePrefix?: string | null
  description?: string | null
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface SeriesCreationAttributes
  extends Optional<SeriesAttributes, 'id' | 'nameIgnorePrefix' | 'description' | 'createdAt' | 'updatedAt'> {}

export class Series
  extends Model<SeriesAttributes, SeriesCreationAttributes>
  implements SeriesAttributes
{
  declare id: string
  declare name: string
  declare nameIgnorePrefix: string | null
  declare description: string | null
  declare libraryId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Expanded properties
  declare books?: NonAttribute<Book[]>
  declare bookSeries?: NonAttribute<BookSeries[] | BookSeries>
  declare feeds?: NonAttribute<Feed[]>
  declare library?: NonAttribute<Library>

  // Sequelize association mixins
  declare getBooks: BelongsToManyGetAssociationsMixin<Book>

  /**
   * Check if series exists
   */
  static async checkExistsById(seriesId: string): Promise<boolean> {
    return (await this.count({ where: { id: seriesId } })) > 0
  }

  /**
   * Get series by name and libraryId. name case insensitive
   */
  static async getByNameAndLibrary(seriesName: string, libraryId: string): Promise<Series | null> {
    return this.findOne({
      where: [
        where(fn('lower', col('name')), seriesName.toLowerCase()),
        {
          libraryId
        }
      ]
    })
  }

  /**
   * Get expanded series by ID
   */
  static async getExpandedById(seriesId: string): Promise<Series | null> {
    const series = await this.findByPk(seriesId)
    if (!series) return null
    series.books = await series.getBooksExpandedWithLibraryItem()
    return series
  }

  /**
   * Find or create series by name and library
   */
  static async findOrCreateByNameAndLibrary(seriesName: string, libraryId: string): Promise<Series> {
    const series = await this.getByNameAndLibrary(seriesName, libraryId)
    if (series) return series
    return this.create({
      name: seriesName,
      nameIgnorePrefix: getTitleIgnorePrefix(seriesName),
      libraryId
    })
  }

  /**
   * Initialize model
   */
  static initModel(sequelize: Sequelize): typeof Series {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        nameIgnorePrefix: DataTypes.STRING,
        description: DataTypes.TEXT
      },
      {
        sequelize,
        modelName: 'series',
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
            fields: ['name', 'libraryId'],
            unique: true,
            name: 'unique_series_name_per_library'
          },
          {
            fields: ['libraryId']
          }
        ]
      }
    )

    const { library } = sequelize.models
    if (library) {
      library.hasMany(Series, {
        onDelete: 'CASCADE'
      })
      Series.belongsTo(library)
    }

    return Series
  }

  /**
   * Get all books in collection expanded with library item
   */
  getBooksExpandedWithLibraryItem(): Promise<Book[]> {
    return this.getBooks({
      joinTableAttributes: ['sequence'],
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
      order: [literal('CAST(`bookSeries.sequence` AS FLOAT) ASC NULLS LAST')]
    })
  }

  toOldJSON(): SeriesOldJsonObject {
    return {
      id: this.id,
      name: this.name,
      nameIgnorePrefix: getTitlePrefixAtEnd(this.name),
      description: this.description,
      addedAt: this.createdAt?.valueOf() ?? Date.now(),
      updatedAt: this.updatedAt?.valueOf() ?? Date.now(),
      libraryId: this.libraryId
    }
  }

  toJSONMinimal(sequence?: string | null): SeriesMinimalJsonObject {
    return {
      id: this.id,
      name: this.name,
      sequence
    }
  }
}

export default Series
