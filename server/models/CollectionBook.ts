import { DataTypes, Model, Sequelize, Optional, NonAttribute } from 'sequelize'
import type Book from './Book'
import type Collection from './Collection'

export interface CollectionBookAttributes {
  id: string
  order?: number | null
  bookId: string
  collectionId: string
  createdAt?: Date
}

export interface CollectionBookCreationAttributes
  extends Optional<CollectionBookAttributes, 'id' | 'order' | 'createdAt'> {}

export class CollectionBook
  extends Model<CollectionBookAttributes, CollectionBookCreationAttributes>
  implements CollectionBookAttributes
{
  declare id: string
  declare order: number | null
  declare bookId: string
  declare collectionId: string
  declare readonly createdAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare book?: NonAttribute<Book>
  declare collection?: NonAttribute<Collection>

  static initModel(sequelize: Sequelize): typeof CollectionBook {
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

    return CollectionBook
  }
}

export default CollectionBook
