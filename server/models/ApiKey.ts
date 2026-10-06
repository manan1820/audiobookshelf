import { DataTypes, Model, Op, Sequelize } from 'sequelize'
import jwt, { SignOptions } from 'jsonwebtoken'
import { LRUCache } from 'lru-cache'
import Logger from '../Logger'
import type User from './User'

interface ApiKeyPermissions {
  download: boolean
  update: boolean
  delete: boolean
  upload: boolean
  createEreader: boolean
  accessAllLibraries: boolean
  accessAllTags: boolean
  accessExplicitContent: boolean
  selectedTagsNotAccessible: boolean
  librariesAccessible: string[]
  itemTagsSelected: string[]
  [key: string]: unknown
}

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

class ApiKey extends Model {
  declare id: string
  declare name: string
  declare description: string | null
  declare expiresAt: Date | null
  declare lastUsedAt: Date | null
  declare isActive: boolean
  declare permissions: ApiKeyPermissions
  declare userId: string
  declare createdByUserId: string | null
  declare createdAt: Date
  declare updatedAt: Date

  declare user?: User
  declare createdByUser?: User

  fromCache?: boolean

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
      selectedTagsNotAccessible: false, // Inverts itemTagsSelected
      librariesAccessible: [],
      itemTagsSelected: []
    }
  }

  /**
   * Merge permissions from request with default permissions
   */
  static mergePermissionsWithDefault(reqPermissions: unknown): ApiKeyPermissions {
    const permissions = this.getDefaultPermissions()

    if (!reqPermissions || typeof reqPermissions !== 'object') {
      Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permissions: ${String(reqPermissions)}`)
      return permissions
    }

    const reqObj = reqPermissions as Record<string, unknown>
    for (const key in reqObj) {
      if (reqObj[key] === undefined) {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission key: ${key}`)
        continue
      }

      if (key === 'librariesAccessible' || key === 'itemTagsSelected') {
        const val = reqObj[key]
        if (!Array.isArray(val) || val.some((value) => typeof value !== 'string')) {
          Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid ${key} value: ${String(reqObj[key])}`)
          continue
        }

        permissions[key] = val as string[]
      } else if (typeof reqObj[key] !== 'boolean') {
        Logger.warn(`[ApiKey] mergePermissionsWithDefault: Invalid permission value for key ${key}. Should be boolean`)
        continue
      } else {
        permissions[key] = reqObj[key] as boolean
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
  static async generateApiKey(tokenSecret: string, keyId: string, name: string, expiresIn?: number): Promise<string | null> {
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
            Logger.error(`[ApiKey] Error generating API key: ${String(err)}`)
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
  static async getById(apiKeyId: string | null | undefined): Promise<ApiKey | null> {
    if (!apiKeyId) return null

    const cachedApiKey = apiKeyCache.getById(apiKeyId)
    if (cachedApiKey) return cachedApiKey

    const apiKey = await ApiKey.findByPk(apiKeyId)
    if (!apiKey) return null

    apiKeyCache.set(apiKey)
    return apiKey
  }

  static override init(sequelize: Sequelize): typeof ApiKey
  static override init(attributes: unknown, options: unknown): typeof ApiKey
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof ApiKey {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof ApiKey
    }

    const sequelize = sequelizeOrAttributes as Sequelize
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

    const { user } = sequelize.models
    user.hasMany(ApiKey, {
      onDelete: 'CASCADE'
    })
    ApiKey.belongsTo(user)

    user.hasMany(ApiKey, {
      foreignKey: 'createdByUserId',
      onDelete: 'SET NULL'
    })
    ApiKey.belongsTo(user, { as: 'createdByUser', foreignKey: 'createdByUserId' })

    return ApiKey
  }

  override async update(values: { [key: string]: unknown }, options?: unknown): Promise<this> {
    apiKeyCache.maybeInvalidate(this)
    return await super.update(values as never, options as never)
  }

  override async save(options?: unknown): Promise<this> {
    apiKeyCache.maybeInvalidate(this)
    return await super.save(options as never)
  }

  override async destroy(options?: unknown): Promise<void> {
    apiKeyCache.delete(this.id)
    await super.destroy(options as never)
  }
}

export = ApiKey
