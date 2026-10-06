import { DataTypes, Model, Sequelize, where, fn, col, literal } from 'sequelize'
import { getTitlePrefixAtEnd, getTitleIgnorePrefix } from '../utils/index'
import type Book from './Book'

interface SeriesOldJSON {
  id: string
  name: string
  nameIgnorePrefix: string
  description: string | null
  addedAt: number
  updatedAt: number
  libraryId: string
  [key: string]: unknown
}

interface SeriesJSONMinimal {
  id: string
  name: string
  sequence?: string | null
}

class Series extends Model {
  declare id: string
  declare name: string
  declare nameIgnorePrefix: string | null
  declare description: string | null
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date

  // Expanded properties
  declare books?: Book[]

  declare getBooks: (options?: unknown) => Promise<Book[]>

  static async checkExistsById(seriesId: string): Promise<boolean> {
    return (await this.count({ where: { id: seriesId } })) > 0
  }

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

  static async getExpandedById(seriesId: string): Promise<Series | null> {
    const series = await this.findByPk(seriesId)
    if (!series) return null
    series.books = await series.getBooksExpandedWithLibraryItem()
    return series
  }

  static async findOrCreateByNameAndLibrary(seriesName: string, libraryId: string): Promise<Series> {
    const series = await this.getByNameAndLibrary(seriesName, libraryId)
    if (series) return series
    return this.create({
      name: seriesName,
      nameIgnorePrefix: getTitleIgnorePrefix(seriesName),
      libraryId
    })
  }

  static override init(sequelize: Sequelize): typeof Series
  static override init(attributes: unknown, options: unknown): typeof Series
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Series {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Series
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
            // unique constraint on name and libraryId
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
    library.hasMany(Series, {
      onDelete: 'CASCADE'
    })
    Series.belongsTo(library)

    return Series
  }

  getBooksExpandedWithLibraryItem(): Promise<Book[]> {
    const models = this.sequelize!.models
    return this.getBooks({
      joinTableAttributes: ['sequence'],
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
      ],
      order: [[literal('CAST(`bookSeries.sequence` AS FLOAT) ASC NULLS LAST')]]
    })
  }

  toOldJSON(): SeriesOldJSON {
    return {
      id: this.id,
      name: this.name,
      nameIgnorePrefix: getTitlePrefixAtEnd(this.name) || '',
      description: this.description,
      addedAt: this.createdAt.valueOf(),
      updatedAt: this.updatedAt.valueOf(),
      libraryId: this.libraryId
    }
  }

  toJSONMinimal(sequence?: string | null): SeriesJSONMinimal {
    return {
      id: this.id,
      name: this.name,
      sequence
    }
  }
}

export = Series
