import { DataTypes, Model, Op, Sequelize } from 'sequelize'
import type User from './User'

class Session extends Model {
  declare id: string
  declare ipAddress: string | null
  declare userAgent: string | null
  declare userId: string
  declare refreshToken: string
  declare expiresAt: Date
  declare lastRefreshToken: string | null
  declare lastRefreshTokenExpiresAt: Date | null
  declare createdAt: Date
  declare updatedAt: Date

  declare user?: User

  static async createSession(userId: string, ipAddress: string, userAgent: string, refreshToken: string, expiresAt: Date): Promise<Session> {
    const session = await Session.create({ userId, ipAddress, userAgent, refreshToken, expiresAt })
    return session
  }

  /**
   * Clean up expired sessions from the database
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const deletedCount = await Session.destroy({
      where: {
        expiresAt: {
          [Op.lt]: new Date()
        }
      }
    })
    return deletedCount
  }

  static override init(sequelize: Sequelize): typeof Session
  static override init(attributes: unknown, options: unknown): typeof Session
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Session {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Session
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        ipAddress: DataTypes.STRING,
        userAgent: DataTypes.STRING,
        refreshToken: {
          type: DataTypes.STRING,
          allowNull: false
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        lastRefreshToken: {
          type: DataTypes.STRING,
          allowNull: true
        },
        lastRefreshTokenExpiresAt: {
          type: DataTypes.DATE,
          allowNull: true
        }
      },
      {
        sequelize,
        modelName: 'session'
      }
    )

    const { user } = sequelize.models
    user.hasMany(Session, {
      onDelete: 'CASCADE',
      foreignKey: {
        allowNull: false
      }
    })
    Session.belongsTo(user)

    return Session
  }
}

export = Session
