import { DataTypes, Model, Sequelize } from 'sequelize'
import oldDevice from '../objects/DeviceInfo'
import type { DeviceInfoJSON } from '../types'

interface DeviceExtraData {
  manufacturer?: string | null
  model?: string | null
  osName?: string | null
  osVersion?: string | null
  browserName?: string | null
  [key: string]: unknown
}

interface DeviceCreateAttributes {
  id?: string | null
  deviceId: string | null
  clientName: string | null
  clientVersion: string | null
  ipAddress: string | null
  deviceName: string | null
  deviceVersion: string | null
  userId: string | null
  extraData: DeviceExtraData
}

class Device extends Model {
  declare id: string
  declare deviceId: string
  declare clientName: string | null
  declare clientVersion: string | null
  declare ipAddress: string | null
  declare deviceName: string | null
  declare deviceVersion: string | null
  declare extraData: DeviceExtraData | null
  declare userId: string
  declare createdAt: Date
  declare updatedAt: Date

  static async getOldDeviceByDeviceId(deviceId: string): Promise<oldDevice | null> {
    const device = (await this.findOne({
      where: {
        deviceId
      }
    })) as Device | null
    if (!device) return null
    return device.getOldDevice()
  }

  static createFromOld(oldDeviceInfo: oldDevice): Promise<Device> {
    const device = this.getFromOld(oldDeviceInfo)
    return this.create(device as unknown as Record<string, unknown>)
  }

  static updateFromOld(oldDeviceInfo: oldDevice) {
    const device = this.getFromOld(oldDeviceInfo)
    return this.update(device, {
      where: {
        id: device.id
      }
    })
  }

  static getFromOld(oldDeviceInfo: oldDevice): DeviceCreateAttributes {
    const extraData: DeviceExtraData = {}

    if (oldDeviceInfo.manufacturer) {
      extraData.manufacturer = oldDeviceInfo.manufacturer
    }
    if (oldDeviceInfo.model) {
      extraData.model = oldDeviceInfo.model
    }
    if (oldDeviceInfo.osName) {
      extraData.osName = oldDeviceInfo.osName
    }
    if (oldDeviceInfo.osVersion) {
      extraData.osVersion = oldDeviceInfo.osVersion
    }
    if (oldDeviceInfo.browserName) {
      extraData.browserName = oldDeviceInfo.browserName
    }

    return {
      id: oldDeviceInfo.id,
      deviceId: oldDeviceInfo.deviceId,
      clientName: oldDeviceInfo.clientName || null,
      clientVersion: oldDeviceInfo.clientVersion || null,
      ipAddress: oldDeviceInfo.ipAddress,
      deviceName: oldDeviceInfo.deviceName || null,
      deviceVersion: oldDeviceInfo.sdkVersion || oldDeviceInfo.browserVersion || null,
      userId: oldDeviceInfo.userId,
      extraData
    }
  }

  static override init(sequelize: Sequelize): typeof Device
  static override init(attributes: unknown, options: unknown): typeof Device
  static override init(sequelizeOrAttributes: unknown, maybeOptions?: unknown): typeof Device {
    if (maybeOptions) {
      return super.init(sequelizeOrAttributes as never, maybeOptions as never) as unknown as typeof Device
    }

    const sequelize = sequelizeOrAttributes as Sequelize
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        deviceId: DataTypes.STRING,
        clientName: DataTypes.STRING, // e.g. Abs Web, Abs Android
        clientVersion: DataTypes.STRING, // e.g. Server version or mobile version
        ipAddress: DataTypes.STRING,
        deviceName: DataTypes.STRING, // e.g. Windows 10 Chrome, Google Pixel 6, Apple iPhone 10,3
        deviceVersion: DataTypes.STRING, // e.g. Browser version or Android SDK
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'device'
      }
    )

    const { user } = sequelize.models

    user.hasMany(Device, {
      onDelete: 'CASCADE'
    })
    Device.belongsTo(user)

    return Device
  }

  toOldJSON(): DeviceInfoJSON {
    let browserVersion: string | null = null
    let sdkVersion: string | null = null
    if (this.clientName === 'Abs Android') {
      sdkVersion = this.deviceVersion || null
    } else {
      browserVersion = this.deviceVersion || null
    }

    const extra = this.extraData || {}

    return {
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      ipAddress: this.ipAddress,
      browserName: extra.browserName || null,
      browserVersion,
      osName: extra.osName || null,
      osVersion: extra.osVersion || null,
      clientVersion: this.clientVersion || null,
      manufacturer: extra.manufacturer || null,
      model: extra.model || null,
      sdkVersion,
      deviceName: this.deviceName,
      clientName: this.clientName
    }
  }

  getOldDevice(): oldDevice {
    return new oldDevice(this.toOldJSON() as Record<string, unknown>)
  }
}

export = Device
