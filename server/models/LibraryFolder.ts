import { DataTypes, Model, Sequelize, NonAttribute, Optional } from 'sequelize'
import type Library from './Library'
import type { LibraryFolderOldJsonObject } from '../types'

export interface LibraryFolderAttributes {
  id: string
  path: string
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface LibraryFolderCreationAttributes
  extends Optional<LibraryFolderAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class LibraryFolder
  extends Model<LibraryFolderAttributes, LibraryFolderCreationAttributes>
  implements LibraryFolderAttributes
{
  declare id: string
  declare path: string
  declare libraryId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare library?: NonAttribute<Library>

  static initModel(sequelize: Sequelize): typeof LibraryFolder {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        path: DataTypes.STRING
      },
      {
        sequelize,
        modelName: 'libraryFolder'
      }
    )

    const { library } = sequelize.models
    if (library) {
      library.hasMany(LibraryFolder, {
        onDelete: 'CASCADE'
      })
      LibraryFolder.belongsTo(library)
    }

    return LibraryFolder
  }

  toOldJSON(): LibraryFolderOldJsonObject {
    return {
      id: this.id,
      fullPath: this.path,
      libraryId: this.libraryId,
      addedAt: this.createdAt?.valueOf() ?? Date.now()
    }
  }
}

export default LibraryFolder
