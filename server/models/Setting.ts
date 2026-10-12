import { DataTypes, Model, Sequelize, Optional } from 'sequelize'
import oldEmailSettings from '../objects/settings/EmailSettings'
import oldServerSettings from '../objects/settings/ServerSettings'
import oldNotificationSettings from '../objects/settings/NotificationSettings'
import type { SettingValueObject } from '../types'

export interface SettingAttributes {
  key: string
  value: SettingValueObject
  createdAt?: Date
  updatedAt?: Date
}

export interface SettingCreationAttributes
  extends Optional<SettingAttributes, 'createdAt' | 'updatedAt'> {}

export interface OldSettingsResult {
  settings: SettingValueObject[]
  emailSettings: InstanceType<typeof oldEmailSettings>
  serverSettings: InstanceType<typeof oldServerSettings>
  notificationSettings: InstanceType<typeof oldNotificationSettings>
}

export class Setting
  extends Model<SettingAttributes, SettingCreationAttributes>
  implements SettingAttributes
{
  declare key: string
  declare value: SettingValueObject
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  static async getOldSettings(): Promise<OldSettingsResult> {
    const settings = (await this.findAll()).map((se) => se.value)

    const emailSettingsJson = settings.find((se) => se.id === 'email-settings')
    const serverSettingsJson = settings.find((se) => se.id === 'server-settings')
    const notificationSettingsJson = settings.find((se) => se.id === 'notification-settings')

    return {
      settings,
      emailSettings: new oldEmailSettings(emailSettingsJson),
      serverSettings: new oldServerSettings(serverSettingsJson),
      notificationSettings: new oldNotificationSettings(notificationSettingsJson)
    }
  }

  static updateSettingObj(setting: SettingValueObject): Promise<[Setting, boolean | null]> {
    return this.upsert({
      key: setting.id,
      value: setting
    })
  }

  static initModel(sequelize: Sequelize): typeof Setting {
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

export default Setting
