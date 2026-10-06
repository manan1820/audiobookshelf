import { DataTypes, Model, Sequelize } from 'sequelize'

interface ClientCustomMetadataProvider {
  id: string
  name: string
  mediaType: string
  slug: string
}

class CustomMetadataProvider extends Model {
  declare id: string
  declare mediaType: string
  declare name: string
  declare url: string
  declare authHeaderValue: string
  declare extraData: Record<string, unknown> | null
  declare createdAt: Date
  declare updatedAt: Date

  /**
   * Get providers for client by media type
   * Currently only available for "book" media type
   */
  static async getForClientByMediaType(mediaType: string): Promise<ClientCustomMetadataProvider[]> {
    if (mediaType !== 'book') return []
    const customMetadataProviders = await this.findAll({
      where: {
        mediaType
      }
    })
    return customMetadataProviders.map((cmp) => (cmp as CustomMetadataProvider).toClientJson())
  }

  /**
   * Check if provider exists by slug
   */
  static async checkExistsBySlug(providerSlug: string): Promise<boolean> {
    const providerId = providerSlug?.split?.('custom-')[1]
    if (!providerId) return false

    return (await this.count({ where: { id: providerId } })) > 0
  }

  static override init(sequelize: Sequelize): typeof CustomMetadataProvider
  static override init(attributes: unknown, options: unknown): typeof CustomMetadataProvider
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof CustomMetadataProvider {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof CustomMetadataProvider
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
        mediaType: DataTypes.STRING,
        url: DataTypes.STRING,
        authHeaderValue: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'customMetadataProvider'
      }
    )

    return CustomMetadataProvider
  }

  getSlug(): string {
    return `custom-${this.id}`
  }

  /**
   * Safe for clients
   */
  toClientJson(): ClientCustomMetadataProvider {
    return {
      id: this.id,
      name: this.name,
      mediaType: this.mediaType,
      slug: this.getSlug()
    }
  }
}

export = CustomMetadataProvider
