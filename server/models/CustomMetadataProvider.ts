import { DataTypes, Model, Sequelize, Optional } from 'sequelize'
import type {
  ClientCustomMetadataProviderObject,
  CustomMetadataProviderExtraData
} from '../types'

export interface CustomMetadataProviderAttributes {
  id: string
  name: string
  mediaType: string
  url: string
  authHeaderValue?: string | null
  extraData?: CustomMetadataProviderExtraData | null
  createdAt?: Date
  updatedAt?: Date
}

export interface CustomMetadataProviderCreationAttributes
  extends Optional<
    CustomMetadataProviderAttributes,
    'id' | 'authHeaderValue' | 'extraData' | 'createdAt' | 'updatedAt'
  > {}

export class CustomMetadataProvider
  extends Model<CustomMetadataProviderAttributes, CustomMetadataProviderCreationAttributes>
  implements CustomMetadataProviderAttributes
{
  declare id: string
  declare name: string
  declare mediaType: string
  declare url: string
  declare authHeaderValue: string | null
  declare extraData: CustomMetadataProviderExtraData | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  /**
   * Get providers for client by media type
   * Currently only available for "book" media type
   */
  static async getForClientByMediaType(
    mediaType: string
  ): Promise<ClientCustomMetadataProviderObject[]> {
    if (mediaType !== 'book') return []
    const customMetadataProviders = await this.findAll({
      where: {
        mediaType
      }
    })
    return customMetadataProviders.map((cmp) => cmp.toClientJson())
  }

  /**
   * Check if provider exists by slug
   */
  static async checkExistsBySlug(providerSlug?: string | null): Promise<boolean> {
    const providerId = providerSlug?.split?.('custom-')?.[1]
    if (!providerId) return false

    return (await this.count({ where: { id: providerId } })) > 0
  }

  static initModel(sequelize: Sequelize): typeof CustomMetadataProvider {
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
  toClientJson(): ClientCustomMetadataProviderObject {
    return {
      id: this.id,
      name: this.name,
      mediaType: this.mediaType,
      slug: this.getSlug()
    }
  }
}

export default CustomMetadataProvider
