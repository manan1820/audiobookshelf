import { v4 as uuidv4 } from 'uuid'
import { stripAllTags } from '../utils/htmlSanitizer'
import type { UaResult } from '../libs/uaParser'
import type { DeviceInfoObject, ClientDeviceInfoPayload } from '../types'

class DeviceInfo {
  static readonly stringFields = [
    'deviceId',
    'clientVersion',
    'manufacturer',
    'model',
    'sdkVersion',
    'clientName',
    'deviceName'
  ] as const

  id: string | null = null
  userId: string | null = null
  deviceId: string | null = null
  ipAddress: string | null = null

  // From User Agent (see: https://www.npmjs.com/package/ua-parser-js)
  browserName: string | null = null
  browserVersion: string | null = null
  osName: string | null = null
  osVersion: string | null = null
  deviceType: string | null = null

  // From client
  clientVersion: string | null = null
  manufacturer: string | null = null
  model: string | null = null
  sdkVersion: string | null = null // Android Only

  clientName: string | null = null
  deviceName: string | null = null

  constructor(deviceInfo?: Partial<DeviceInfoObject> | null) {
    if (deviceInfo) {
      this.construct(deviceInfo)
    }
  }

  construct(deviceInfo: Partial<DeviceInfoObject>): void {
    const keys: (keyof DeviceInfoObject)[] = [
      'id',
      'userId',
      'deviceId',
      'ipAddress',
      'browserName',
      'browserVersion',
      'osName',
      'osVersion',
      'deviceType',
      'clientVersion',
      'manufacturer',
      'model',
      'sdkVersion',
      'clientName',
      'deviceName'
    ]

    for (const key of keys) {
      const val = deviceInfo[key]
      if (val !== undefined && val !== null) {
        if (DeviceInfo.stringFields.includes(key as (typeof DeviceInfo.stringFields)[number])) {
          this[key] = stripAllTags(val)
        } else {
          this[key] = val
        }
      } else if (val === null) {
        this[key] = null
      }
    }
  }

  toJSON(): DeviceInfoObject {
    const obj: DeviceInfoObject = {
      id: this.id,
      userId: this.userId,
      deviceId: this.deviceId,
      ipAddress: this.ipAddress,
      browserName: this.browserName,
      browserVersion: this.browserVersion,
      osName: this.osName,
      osVersion: this.osVersion,
      deviceType: this.deviceType,
      clientVersion: this.clientVersion,
      manufacturer: this.manufacturer,
      model: this.model,
      sdkVersion: this.sdkVersion,
      clientName: this.clientName,
      deviceName: this.deviceName
    }
    for (const k in obj) {
      const key = k as keyof DeviceInfoObject
      if (obj[key] === null || obj[key] === undefined) {
        delete obj[key]
      }
    }
    return obj
  }

  get deviceDescription(): string {
    if (this.model) {
      // Set from mobile apps
      if (this.sdkVersion) return `${this.model} SDK ${this.sdkVersion} / v${this.clientVersion}`
      return `${this.model} / v${this.clientVersion}`
    }
    return `${this.osName} ${this.osVersion} / ${this.browserName}`
  }

  // When client doesn't send a device id
  getTempDeviceId(): string {
    const keys = [
      this.userId,
      this.browserName,
      this.browserVersion,
      this.osName,
      this.osVersion,
      this.clientVersion,
      this.manufacturer,
      this.model,
      this.sdkVersion,
      this.ipAddress
    ].map((k) => k || '')
    return 'temp-' + Buffer.from(keys.join('-'), 'utf-8').toString('base64')
  }

  setData(
    ip: string | null | undefined,
    ua: UaResult | null | undefined,
    clientDeviceInfo: ClientDeviceInfoPayload | null | undefined,
    serverVersion: string,
    userId?: string | null
  ): void {
    this.id = uuidv4()
    this.userId = userId ?? null
    this.deviceId = clientDeviceInfo?.deviceId || this.id
    this.ipAddress = ip || null

    this.browserName = ua?.browser?.name || null
    this.browserVersion = ua?.browser?.version || null
    this.osName = ua?.os?.name || null
    this.osVersion = ua?.os?.version || null
    this.deviceType = ua?.device?.type || null

    this.clientVersion = stripAllTags(clientDeviceInfo?.clientVersion) || serverVersion
    this.manufacturer = stripAllTags(clientDeviceInfo?.manufacturer) || null
    this.model = stripAllTags(clientDeviceInfo?.model) || null

    if (typeof clientDeviceInfo?.sdkVersion === 'number') {
      this.sdkVersion = clientDeviceInfo.sdkVersion.toString()
    } else {
      this.sdkVersion = stripAllTags(clientDeviceInfo?.sdkVersion) || null
    }

    this.clientName = stripAllTags(clientDeviceInfo?.clientName) || null
    if (this.sdkVersion) {
      if (!this.clientName) this.clientName = 'Abs Android'
      this.deviceName = `${this.manufacturer || 'Unknown'} ${this.model || ''}`
    } else if (this.model) {
      if (!this.clientName) this.clientName = 'Abs iOS'
      this.deviceName = `${this.manufacturer || 'Unknown'} ${this.model || ''}`
    } else if (this.osName && this.browserName) {
      if (!this.clientName) this.clientName = 'Abs Web'
      this.deviceName = `${this.osName} ${this.osVersion || 'N/A'} ${this.browserName}`
    } else if (!this.clientName) {
      this.clientName = 'Unknown'
    }

    if (!this.deviceId) {
      this.deviceId = this.getTempDeviceId()
    }
  }

  update(deviceInfo: DeviceInfo | DeviceInfoObject): boolean {
    const deviceInfoJson =
      'toJSON' in deviceInfo && typeof deviceInfo.toJSON === 'function'
        ? deviceInfo.toJSON()
        : (deviceInfo as DeviceInfoObject)
    const existingDeviceInfoJson = this.toJSON()

    let hasUpdates = false
    const keys: (keyof DeviceInfoObject)[] = [
      'ipAddress',
      'browserName',
      'browserVersion',
      'osName',
      'osVersion',
      'deviceType',
      'clientVersion',
      'manufacturer',
      'model',
      'sdkVersion',
      'clientName',
      'deviceName'
    ]

    for (const key of keys) {
      if (deviceInfoJson[key] !== existingDeviceInfoJson[key]) {
        this[key] = deviceInfoJson[key] ?? null
        hasUpdates = true
      }
    }

    for (const key of keys) {
      if (existingDeviceInfoJson[key] && !deviceInfoJson[key]) {
        this[key] = null
        hasUpdates = true
      }
    }

    return hasUpdates
  }
}

export = DeviceInfo
