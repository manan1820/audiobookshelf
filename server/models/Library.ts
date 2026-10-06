import { DataTypes, Model, Sequelize, NonAttribute, Optional } from 'sequelize'
import Logger from '../Logger'
import type LibraryFolder from './LibraryFolder'

export interface LibrarySettingsObject {
  coverAspectRatio: number
  disableWatcher: boolean
  skipMatchingMediaWithAsin?: boolean
  skipMatchingMediaWithIsbn?: boolean
  autoScanCronExpression?: string | null
  audiobooksOnly?: boolean
  epubsAllowScriptedContent?: boolean
  hideSingleBookSeries?: boolean
  onlyShowLaterBooksInContinueSeries?: boolean
  metadataPrecedence?: string[]
  podcastSearchRegion?: string
  markAsFinishedTimeRemaining?: number
  markAsFinishedPercentComplete?: number | null
}

export interface LibraryAttributes {
  id: string
  name: string
  displayOrder?: number
  icon?: string | null
  mediaType: string
  provider?: string | null
  lastScan?: Date | null
  lastScanVersion?: string | null
  settings?: LibrarySettingsObject | null
  extraData?: Record<string, unknown> | null
  createdAt?: Date
  updatedAt?: Date
}

export interface LibraryCreationAttributes
  extends Optional<LibraryAttributes, 'id' | 'displayOrder' | 'icon' | 'provider' | 'lastScan' | 'lastScanVersion' | 'settings' | 'extraData' | 'createdAt' | 'updatedAt'> {}

export class Library
  extends Model<LibraryAttributes, LibraryCreationAttributes>
  implements LibraryAttributes
{
  declare id: string
  declare name: string
  declare displayOrder: number
  declare icon: string | null
  declare mediaType: string
  declare provider: string | null
  declare lastScan: Date | null
  declare lastScanVersion: string | null
  declare settings: LibrarySettingsObject | null
  declare extraData: Record<string, unknown> | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations
  declare libraryFolders?: NonAttribute<LibraryFolder[]>

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
    const folderModel = this.sequelize?.models.libraryFolder
    return this.findAll({
      include: folderModel ? [folderModel] : [],
      order: [['displayOrder', 'ASC']]
    })
  }

  static findByIdWithFolders(libraryId: string): Promise<Library | null> {
    const folderModel = this.sequelize?.models.libraryFolder
    return this.findByPk(libraryId, {
      include: folderModel ? [folderModel] : []
    })
  }

  static async getAllLibraryIds(): Promise<string[]> {
    const libraries = await this.findAll({
      attributes: ['id', 'displayOrder'],
      order: [['displayOrder', 'ASC']]
    })
    return libraries.map((l) => l.id)
  }

  static async getMaxDisplayOrder(): Promise<number> {
    const maxVal = await this.max('displayOrder')
    return typeof maxVal === 'number' ? maxVal : 0
  }

  static async resetDisplayOrder(): Promise<void> {
    const libraries = await this.findAll({
      order: [['displayOrder', 'ASC']]
    })
    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i]
      if (library && library.displayOrder !== i + 1) {
        Logger.debug(`[Library] Updating display order of library from ${library.displayOrder} to ${i + 1}`)
        await library.update({ displayOrder: i + 1 }).catch((error: unknown) => {
          Logger.error(`[Library] Failed to update library display order to ${i + 1}`, error)
        })
      }
    }
  }

  static initModel(sequelize: Sequelize): typeof Library {
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
    const precedence = this.extraData?.lastScanMetadataPrecedence
    if (Array.isArray(precedence)) {
      return precedence.filter((item): item is string => typeof item === 'string')
    }
    return []
  }

  get librarySettings(): LibrarySettingsObject {
    return this.settings ?? Library.getDefaultLibrarySettingsForMediaType(this.mediaType)
  }

  toOldJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      folders: (this.libraryFolders ?? []).map((f) => f.toOldJSON()),
      displayOrder: this.displayOrder,
      icon: this.icon,
      mediaType: this.mediaType,
      provider: this.provider,
      settings: {
        ...this.settings
      },
      lastScan: this.lastScan?.valueOf() ?? null,
      lastScanVersion: this.lastScanVersion,
      createdAt: this.createdAt?.valueOf() ?? Date.now(),
      lastUpdate: this.updatedAt?.valueOf() ?? Date.now()
    }
  }
}

export default Library
