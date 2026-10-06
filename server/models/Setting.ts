import { DataTypes, Model, Sequelize } from 'sequelize'
import oldEmailSettings from '../objects/settings/EmailSettings'
import oldServerSettings from '../objects/settings/ServerSettings'
import oldNotificationSettings from '../objects/settings/NotificationSettings'

interface SettingItem {
  id?: string
  [key: string]: unknown
}

interface OldSettingsResult {
  settings: SettingItem[]
  emailSettings: oldEmailSettings
  serverSettings: InstanceType<typeof oldServerSettings>
  notificationSettings: oldNotificationSettings
}

class Setting extends Model {
  declare key: string
  declare value: SettingItem
  declare createdAt: Date
  declare updatedAt: Date

  static async getOldSettings(): Promise<OldSettingsResult> {
    const settings = (await this.findAll()).map((se) => (se as Setting).value)

    const emailSettingsJson = settings.find((se) => se.id === 'email-settings')
    const serverSettingsJson = settings.find((se) => se.id === 'server-settings')
    const notificationSettingsJson = settings.find((se) => se.id === 'notification-settings')

    return {
      settings,
      emailSettings: new oldEmailSettings(emailSettingsJson as never),
      serverSettings: new oldServerSettings(serverSettingsJson),
      notificationSettings: new oldNotificationSettings(notificationSettingsJson as never)
    }
  }

  static updateSettingObj(setting: { id: string; [key: string]: unknown }) {
    return this.upsert({
      key: setting.id,
      value: setting
    })
  }

  static override init(sequelize: Sequelize): typeof Setting
  static override init(attributes: unknown, options: unknown): typeof Setting
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Setting {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Setting
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        key: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        value: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'setting'
      }
    )

    return Setting
  }
}

export = Setting
