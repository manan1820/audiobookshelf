import { DataTypes, Model, Op, Sequelize, Optional, NonAttribute } from 'sequelize'
import type User from './User'

export interface SessionAttributes {
  id: string
  ipAddress?: string | null
  userAgent?: string | null
  refreshToken: string
  expiresAt: Date
  lastRefreshToken?: string | null
  lastRefreshTokenExpiresAt?: Date | null
  userId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface SessionCreationAttributes
  extends Optional<
    SessionAttributes,
    'id' | 'ipAddress' | 'userAgent' | 'lastRefreshToken' | 'lastRefreshTokenExpiresAt' | 'createdAt' | 'updatedAt'
  > {}

export class Session
  extends Model<SessionAttributes, SessionCreationAttributes>
  implements SessionAttributes
{
  declare id: string
  declare ipAddress: string | null
  declare userAgent: string | null
  declare refreshToken: string
  declare expiresAt: Date
  declare lastRefreshToken: string | null
  declare lastRefreshTokenExpiresAt: Date | null
  declare userId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare user?: NonAttribute<User>

  static async createSession(
    userId: string,
    ipAddress: string,
    userAgent: string,
    refreshToken: string,
    expiresAt: Date
  ): Promise<Session> {
    const session = await Session.create({
      userId,
      ipAddress,
      userAgent,
      refreshToken,
      expiresAt
    })
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

  static initModel(sequelize: Sequelize): typeof Session {
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

    return Session
  }
}

export default Session
