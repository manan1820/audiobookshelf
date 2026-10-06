import { DataTypes, Model, Sequelize } from 'sequelize'

interface LibraryFolderOldJSON {
  id: string
  fullPath: string
  libraryId: string
  addedAt: number
}

class LibraryFolder extends Model {
  declare id: string
  declare path: string
  declare libraryId: string
  declare createdAt: Date
  declare updatedAt: Date

  /**
   * Initialize model
   */
  // Database.js init signature:
  static override init(sequelize: Sequelize): typeof LibraryFolder
  // Base Model.init signature:
  static override init(attributes: unknown, options: unknown): typeof LibraryFolder
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof LibraryFolder {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof LibraryFolder
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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
    library.hasMany(LibraryFolder, {
      onDelete: 'CASCADE'
    })
    LibraryFolder.belongsTo(library)

    return LibraryFolder
  }

  /**
   * TODO: Update to use new model
   */
  toOldJSON(): LibraryFolderOldJSON {
    return {
      id: this.id,
      fullPath: this.path,
      libraryId: this.libraryId,
      addedAt: this.createdAt.valueOf()
    }
  }
}

export = LibraryFolder
