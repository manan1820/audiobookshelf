import { DataTypes, Model, Sequelize } from 'sequelize'

class CollectionBook extends Model {
  declare id: string
  declare order: number
  declare bookId: string
  declare collectionId: string
  declare createdAt: Date

  static override init(sequelize: Sequelize): typeof CollectionBook
  static override init(attributes: unknown, options: unknown): typeof CollectionBook
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof CollectionBook {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof CollectionBook
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        order: DataTypes.INTEGER
      },
      {
        sequelize,
        timestamps: true,
        updatedAt: false,
        modelName: 'collectionBook'
      }
    )

    // Super Many-to-Many
    // ref: https://sequelize.org/docs/v6/advanced-association-concepts/advanced-many-to-many/#the-best-of-both-worlds-the-super-many-to-many-relationship
    const { book, collection } = sequelize.models
    book.belongsToMany(collection, { through: CollectionBook })
    collection.belongsToMany(book, { through: CollectionBook })

    book.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(book)

    collection.hasMany(CollectionBook, {
      onDelete: 'CASCADE'
    })
    CollectionBook.belongsTo(collection)

    return CollectionBook
  }
}

export = CollectionBook
