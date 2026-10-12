import { DataTypes, Model, Sequelize, Optional, NonAttribute } from 'sequelize'
import oldDevice from '../objects/DeviceInfo'
import type User from './User'
import type {
  DeviceExtraData,
  DeviceOldJsonObject,
  DeviceInfoObject
} from '../types'

export interface DeviceAttributes {
  id: string
  deviceId: string
  clientName?: string | null
  clientVersion?: string | null
  ipAddress: string
  deviceName?: string | null
  deviceVersion?: string | null
  extraData?: DeviceExtraData | null
  userId: string
  createdAt?: Date
  updatedAt?: Date
}

export interface DeviceCreationAttributes
  extends Optional<
    DeviceAttributes,
    'id' | 'clientName' | 'clientVersion' | 'deviceName' | 'deviceVersion' | 'extraData' | 'createdAt' | 'updatedAt'
  > {}

export class Device
  extends Model<DeviceAttributes, DeviceCreationAttributes>
  implements DeviceAttributes
{
  declare id: string
  declare deviceId: string
  declare clientName: string | null
  declare clientVersion: string | null
  declare ipAddress: string
  declare deviceName: string | null
  declare deviceVersion: string | null
  declare extraData: DeviceExtraData | null
  declare userId: string
  declare readonly createdAt: Date
  declare readonly updatedAt: Date

  // Associations (declared cleanly without initializing runtime values)
  declare user?: NonAttribute<User>

  static async getOldDeviceByDeviceId(deviceId: string): Promise<InstanceType<typeof oldDevice> | null> {
    const device = await this.findOne({
      where: {
        deviceId
      }
    })
    if (!device) return null
    return device.getOldDevice()
  }

  static createFromOld(oldDeviceInfo: DeviceInfoObject): Promise<Device> {
    const device = this.getFromOld(oldDeviceInfo)
    return this.create(device)
  }

  static updateFromOld(oldDeviceInfo: DeviceInfoObject): Promise<[affectedCount: number]> {
    const device = this.getFromOld(oldDeviceInfo)
    if (!device.id) {
      return Promise.resolve([0])
    }
    return this.update(device, {
      where: {
        id: device.id
      }
    })
  }

  static getFromOld(oldDeviceInfo: DeviceInfoObject): DeviceCreationAttributes {
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
      id: oldDeviceInfo.id ?? undefined,
      deviceId: oldDeviceInfo.deviceId ?? '',
      clientName: oldDeviceInfo.clientName ?? null,
      clientVersion: oldDeviceInfo.clientVersion ?? null,
      ipAddress: oldDeviceInfo.ipAddress ?? '',
      deviceName: oldDeviceInfo.deviceName ?? null,
      deviceVersion: oldDeviceInfo.sdkVersion ?? oldDeviceInfo.browserVersion ?? null,
      userId: oldDeviceInfo.userId ?? '',
      extraData
    }
  }

  static initModel(sequelize: Sequelize): typeof Device {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        deviceId: DataTypes.STRING,
        clientName: DataTypes.STRING,
        clientVersion: DataTypes.STRING,
        ipAddress: DataTypes.STRING,
        deviceName: DataTypes.STRING,
        deviceVersion: DataTypes.STRING,
        extraData: DataTypes.JSON
      },
      {
        sequelize,
        modelName: 'device'
      }
    )

    return Device
  }

  toOldJSON(): DeviceOldJsonObject {
    let browserVersion: string | null = null
    let sdkVersion: string | null = null
    if (this.clientName === 'Abs Android') {
      sdkVersion = this.deviceVersion ?? null
    } else {
      browserVersion = this.deviceVersion ?? null
    }

    return {
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      ipAddress: this.ipAddress,
      browserName: this.extraData?.browserName ?? null,
      browserVersion,
      osName: this.extraData?.osName ?? null,
      osVersion: this.extraData?.osVersion ?? null,
      clientVersion: this.clientVersion ?? null,
      manufacturer: this.extraData?.manufacturer ?? null,
      model: this.extraData?.model ?? null,
      sdkVersion,
      deviceName: this.deviceName,
      clientName: this.clientName
    }
  }

  getOldDevice(): InstanceType<typeof oldDevice> {
    let browserVersion: string | null = null
    let sdkVersion: string | null = null
    if (this.clientName === 'Abs Android') {
      sdkVersion = this.deviceVersion ?? null
    } else {
      browserVersion = this.deviceVersion ?? null
    }

    return new oldDevice({
      id: this.id,
      deviceId: this.deviceId,
      userId: this.userId,
      ipAddress: this.ipAddress,
      browserName: this.extraData?.browserName ?? null,
      browserVersion,
      osName: this.extraData?.osName ?? null,
      osVersion: this.extraData?.osVersion ?? null,
      clientVersion: this.clientVersion ?? null,
      manufacturer: this.extraData?.manufacturer ?? null,
      model: this.extraData?.model ?? null,
      sdkVersion,
      deviceName: this.deviceName,
      clientName: this.clientName
    })
  }
}

export default Device
