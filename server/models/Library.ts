import { DataTypes, Model, Sequelize } from 'sequelize'
import Logger from '../Logger'
import type LibraryFolder from './LibraryFolder'

interface LibrarySettingsObject {
  coverAspectRatio: number
  disableWatcher: boolean
  skipMatchingMediaWithAsin?: boolean
  skipMatchingMediaWithIsbn?: boolean
  autoScanCronExpression: string | null
  audiobooksOnly?: boolean
  epubsAllowScriptedContent?: boolean
  hideSingleBookSeries?: boolean
  onlyShowLaterBooksInContinueSeries?: boolean
  metadataPrecedence?: string[]
  markAsFinishedTimeRemaining: number
  markAsFinishedPercentComplete: number | null
  podcastSearchRegion?: string
  [key: string]: unknown
}

interface LibraryOldJSON {
  id: string
  name: string
  folders: unknown[]
  displayOrder: number
  icon: string | null
  mediaType: string
  provider: string | null
  settings: Record<string, unknown>
  lastScan: number | null
  lastScanVersion: string | null
  createdAt: number
  lastUpdate: number
}

class Library extends Model {
  declare id: string
  declare name: string
  declare displayOrder: number
  declare icon: string | null
  declare mediaType: string
  declare provider: string | null
  declare lastScan: Date | null
  declare lastScanVersion: string | null
  declare settings: LibrarySettingsObject
  declare extraData: { lastScanMetadataPrecedence?: string[]; [key: string]: unknown } | null
  declare createdAt: Date
  declare updatedAt: Date
  declare libraryFolders?: LibraryFolder[]

  static getDefaultLibrarySettingsForMediaType(mediaType: string): LibrarySettingsObject {
    if (mediaType === 'podcast') {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        podcastSearchRegion: 'us',
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    } else {
      return {
        coverAspectRatio: 1, // Square
        disableWatcher: false,
        autoScanCronExpression: null,
        skipMatchingMediaWithAsin: false,
        skipMatchingMediaWithIsbn: false,
        audiobooksOnly: false,
        epubsAllowScriptedContent: false,
        hideSingleBookSeries: false,
        onlyShowLaterBooksInContinueSeries: false,
        metadataPrecedence: this.defaultMetadataPrecedence,
        markAsFinishedPercentComplete: null,
        markAsFinishedTimeRemaining: 10
      }
    }
  }

  static get defaultMetadataPrecedence(): string[] {
    return ['folderStructure', 'audioMetatags', 'nfoFile', 'txtFiles', 'opfFile', 'absMetadata']
  }

  static getAllWithFolders(): Promise<Library[]> {
    return this.findAll({
      include: this.sequelize!.models.libraryFolder,
      order: [['displayOrder', 'ASC']]
    })
  }

  static findByIdWithFolders(libraryId: string): Promise<Library | null> {
    return this.findByPk(libraryId, {
      include: this.sequelize!.models.libraryFolder
    })
  }

  static async getAllLibraryIds(): Promise<string[]> {
    const libraries = await this.findAll({
      attributes: ['id', 'displayOrder'],
      order: [['displayOrder', 'ASC']]
    })
    return libraries.map((l) => (l as Library).id)
  }

  static async getMaxDisplayOrder(): Promise<number> {
    const maxVal = await this.max('displayOrder')
    return (maxVal as number) || 0
  }

  static async resetDisplayOrder(): Promise<void> {
    const libraries = await this.findAll({
      order: [['displayOrder', 'ASC']]
    })
    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i] as Library
      if (library.displayOrder !== i + 1) {
        Logger.debug(`[Library] Updating display order of library from ${library.displayOrder} to ${i + 1}`)
        await library.update({ displayOrder: i + 1 }).catch((error: unknown) => {
          Logger.error(`[Library] Failed to update library display order to ${i + 1}`, error)
        })
      }
    }
  }

  static override init(sequelize: Sequelize): typeof Library
  static override init(attributes: unknown, options: unknown): typeof Library
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Library {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Library
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
        displayOrder: DataTypes.INTEGER,
        icon: DataTypes.STRING,
        mediaType: DataTypes.STRING,
        provider: DataTypes.STRING,
        lastScan: DataTypes.DATE,
        lastScanVersion: DataTypes.STRING,
        settings: DataTypes.JSON,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'library'
      }
    )

    return Library
  }

  get isPodcast(): boolean {
    return this.mediaType === 'podcast'
  }

  get isBook(): boolean {
    return this.mediaType === 'book'
  }

  get lastScanMetadataPrecedence(): string[] {
    return this.extraData?.lastScanMetadataPrecedence || []
  }

  get librarySettings(): LibrarySettingsObject {
    return this.settings || Library.getDefaultLibrarySettingsForMediaType(this.mediaType)
  }

  toOldJSON(): LibraryOldJSON {
    return {
      id: this.id,
      name: this.name,
      folders: (this.libraryFolders || []).map((f) => f.toOldJSON()),
      displayOrder: this.displayOrder,
      icon: this.icon,
      mediaType: this.mediaType,
      provider: this.provider,
      settings: {
        ...this.settings
      },
      lastScan: this.lastScan?.valueOf() || null,
      lastScanVersion: this.lastScanVersion,
      createdAt: this.createdAt.valueOf(),
      lastUpdate: this.updatedAt.valueOf()
    }
  }
}

export = Library
