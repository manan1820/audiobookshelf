import {
  DataTypes,
  Model,
  Op,
  Sequelize,
  Optional,
  NonAttribute,
  SaveOptions,
  InstanceDestroyOptions,
  InstanceUpdateOptions
} from 'sequelize'
import type { Col, Fn, Literal } from 'sequelize/types/utils'
import jwt, { SignOptions } from 'jsonwebtoken'
import { LRUCache } from 'lru-cache'
import Logger from '../Logger'
import type User from './User'
import type { ApiKeyPermissions } from '../types'

export interface ApiKeyAttributes {
  id: string
  name: string
  description?: string | null
  expiresAt?: Date | null
  lastUsedAt?: Date | null
  isActive: boolean
  permissions: ApiKeyPermissions
  userId: string
  createdByUserId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export interface ApiKeyCreationAttributes
  extends Optional<
    ApiKeyAttributes,
    'id' | 'description' | 'expiresAt' | 'lastUsedAt' | 'isActive' | 'createdByUserId' | 'createdAt' | 'updatedAt'
  > {}

class ApiKeyCache {
  private cache: LRUCache<string, ApiKey>

  constructor() {
    this.cache = new LRUCache<string, ApiKey>({ max: 100 })
  }

  getById(id: string): ApiKey | undefined {
    return this.cache.get(id)
  }

  set(apiKey: ApiKey): void {
    apiKey.fromCache = true
    this.cache.set(apiKey.id, apiKey)
  }

  delete(apiKeyId: string): void {
    this.cache.delete(apiKeyId)
  }

  maybeInvalidate(apiKey: ApiKey): void {
    if (!apiKey.fromCache) this.delete(apiKey.id)
  }
}

const apiKeyCache = new ApiKeyCache()

export class ApiKey
  extends Model<ApiKeyAttributes, ApiKeyCreationAttributes>
  implements ApiKeyAttributes
{
  declare id: string
  declare name: string
  declare description: string | null
  declare expiresAt: Date | null
  declare lastUsedAt: Date | null
  declare isActive: boolean
  declare permissions: ApiKeyPermissions
  declare userId: string
  declare createdByUserId: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Cache flag
  declare fromCache?: boolean

  // Associations (declared cleanly without initializing runtime values)
  declare user?: NonAttribute<User>
  declare createdByUser?: NonAttribute<User | null>

  /**
   * Same properties as User.getDefaultPermissions
   */
  static getDefaultPermissions(): ApiKeyPermissions {
    return {
      download: true,
      update: true,
      delete: true,
      upload: true,
      createEreader: true,
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: true,
      selectedTagsNotAccessible: false,
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  /**
   * Merge permissions from request with default permissions
   */
  static mergePermissionsWithDefault(reqPermissions?: Partial<ApiKeyPermissions> | null): ApiKeyPermissions {
    const permissions = this.getDefaultPermissions()

    if (!reqPermissions || typeof reqPermissions !== 'object') {
      Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permissions: ${reqPermissions}`)
      return permissions
    }

    for (const key of Object.keys(reqPermissions) as Array<keyof ApiKeyPermissions>) {
      const val = reqPermissions[key]
      if (val === undefined) {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission key: ${key}`)
        continue
      }

      if (key === 'librariesAccessible' || key === 'itemTagsSelected') {
        if (!Array.isArray(val) || val.some((value) => typeof value !== 'string')) {
          Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid ${key} value: ${val}`)
          continue
        }
        permissions[key] = val
      } else if (typeof val !== 'boolean') {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission value for key ${key}. Should be boolean`)
        continue
      } else {
        permissions[key] = val
      }
    }

    return permissions
  }

  /**
   * Deactivate expired api keys
   */
  static async deactivateExpiredApiKeys(): Promise<number> {
    const [affectedCount] = await ApiKey.update(
      {
        isActive: false
      },
      {
        where: {
          isActive: true,
          expiresAt: {
            [Op.lt]: new Date()
          }
        }
      }
    )
    return affectedCount
  }

  /**
   * Generate a new api key
   */
  static async generateApiKey(
    tokenSecret: string,
    keyId: string,
    name: string,
    expiresIn?: number
  ): Promise<string | null> {
    const options: SignOptions = {}
    if (expiresIn && !isNaN(expiresIn) && expiresIn > 0) {
      options.expiresIn = expiresIn
    }

    return new Promise((resolve) => {
      jwt.sign(
        {
          keyId,
          name,
          type: 'api'
        },
        tokenSecret,
        options,
        (err: Error | null, token: string | undefined) => {
          if (err || !token) {
            Logger.error(`[ApiKey] Error generating API key: ${err}`)
            resolve(null)
          } else {
            resolve(token)
          }
        }
      )
    })
  }

  /**
   * Get an api key by id, from cache or database
   */
  static async getById(apiKeyId: string): Promise<ApiKey | null> {
    if (!apiKeyId) return null

    const cachedApiKey = apiKeyCache.getById(apiKeyId)
    if (cachedApiKey) return cachedApiKey

    const apiKey = await ApiKey.findByPk(apiKeyId)
    if (!apiKey) return null

    apiKeyCache.set(apiKey)
    return apiKey
  }

  static initModel(sequelize: Sequelize): typeof ApiKey {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false
        },
        description: DataTypes.TEXT,
        expiresAt: DataTypes.DATE,
        lastUsedAt: DataTypes.DATE,
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        permissions: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'apiKey'
      }
    )

    return ApiKey
  }

  override update<K extends keyof ApiKeyAttributes>(
    key: K,
    value: ApiKeyAttributes[K] | Col | Fn | Literal,
    options?: InstanceUpdateOptions<ApiKeyAttributes>
  ): Promise<this>
  override update(
    keys: { [key in keyof ApiKeyAttributes]?: ApiKeyAttributes[key] | Fn | Col | Literal },
    options?: InstanceUpdateOptions<ApiKeyAttributes>
  ): Promise<this>
  override update<K extends keyof ApiKeyAttributes>(
    keyOrKeys: K | { [key in keyof ApiKeyAttributes]?: ApiKeyAttributes[key] | Fn | Col | Literal },
    valueOrOptions?: ApiKeyAttributes[K] | Col | Fn | Literal | InstanceUpdateOptions<ApiKeyAttributes>,
    options?: InstanceUpdateOptions<ApiKeyAttributes>
  ): Promise<this> {
    apiKeyCache.maybeInvalidate(this)
    if (typeof keyOrKeys === 'string') {
      return super.update(keyOrKeys, valueOrOptions as ApiKeyAttributes[K] | Col | Fn | Literal, options)
    }
    return super.update(keyOrKeys, valueOrOptions as InstanceUpdateOptions<ApiKeyAttributes> | undefined)
  }

  override async save(options?: SaveOptions<ApiKeyAttributes>): Promise<this> {
    apiKeyCache.maybeInvalidate(this)
    return super.save(options)
  }

  override async destroy(options?: InstanceDestroyOptions): Promise<void> {
    apiKeyCache.delete(this.id)
    return super.destroy(options)
  }
}

export default ApiKey
