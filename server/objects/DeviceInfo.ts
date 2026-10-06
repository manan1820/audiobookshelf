import { v4 as uuidv4 } from 'uuid'
import { stripAllTags } from '../utils/htmlSanitizer'
import type { ClientDeviceInfo, DeviceInfoJSON, UserAgentParsed } from '../types'

class DeviceInfo {
  static readonly stringFields = ['deviceId', 'clientVersion', 'manufacturer', 'model', 'sdkVersion', 'clientName', 'deviceName'] as const

  id: string | null
  userId: string | null
  deviceId: string | null
  ipAddress: string | null

  browserName: string | null
  browserVersion: string | null
  osName: string | null
  osVersion: string | null
  deviceType: string | null

  clientVersion: string | null
  manufacturer: string | null
  model: string | null
  sdkVersion: string | null

  clientName: string | null
  deviceName: string | null

  constructor(deviceInfo: Record<string, unknown> | null = null) {
    this.id = null
    this.userId = null
    this.deviceId = null
    this.ipAddress = null

    this.browserName = null
    this.browserVersion = null
    this.osName = null
    this.osVersion = null
    this.deviceType = null

    this.clientVersion = null
    this.manufacturer = null
    this.model = null
    this.sdkVersion = null

    this.clientName = null
    this.deviceName = null

    if (deviceInfo) {
      this.construct(deviceInfo)
    }
  }

  construct(deviceInfo: Record<string, unknown>): void {
    const stringFieldList: readonly string[] = DeviceInfo.stringFields
    const instanceRecord = this as unknown as Record<string, unknown>
    for (const key in deviceInfo) {
      if (deviceInfo[key] !== undefined && instanceRecord[key] !== undefined) {
        instanceRecord[key] = stringFieldList.includes(key) ? stripAllTags(deviceInfo[key]) : deviceInfo[key]
      }
    }
  }

  toJSON(): DeviceInfoJSON {
    const obj: Record<string, unknown> = {
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
    for (const key in obj) {
      if (obj[key] === null || obj[key] === undefined) {
        delete obj[key]
      }
    }
    return obj as DeviceInfoJSON
  }

  get deviceDescription(): string {
    if (this.model) {
      if (this.sdkVersion) return `${this.model} SDK ${this.sdkVersion} / v${this.clientVersion}`
      return `${this.model} / v${this.clientVersion}`
    }
    return `${this.osName} ${this.osVersion} / ${this.browserName}`
  }

  getTempDeviceId(): string {
    const keys = [this.userId, this.browserName, this.browserVersion, this.osName, this.osVersion, this.clientVersion, this.manufacturer, this.model, this.sdkVersion, this.ipAddress].map((k) => k || '')
    return 'temp-' + Buffer.from(keys.join('-'), 'utf-8').toString('base64')
  }

  setData(
    ip: string | null | undefined,
    ua: UserAgentParsed | null | undefined,
    clientDeviceInfo: ClientDeviceInfo | null | undefined,
    serverVersion: string,
    userId: string
  ): void {
    this.id = uuidv4()
    this.userId = userId
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

  update(deviceInfo: DeviceInfo | Record<string, unknown>): boolean {
    const deviceInfoJson = (
      typeof (deviceInfo as DeviceInfo).toJSON === 'function' ? (deviceInfo as DeviceInfo).toJSON() : deviceInfo
    ) as Record<string, unknown>
    const existingDeviceInfoJson = this.toJSON() as Record<string, unknown>
    const instanceRecord = this as unknown as Record<string, unknown>

    let hasUpdates = false
    for (const key in deviceInfoJson) {
      if (['id', 'deviceId'].includes(key)) continue

      if (deviceInfoJson[key] !== existingDeviceInfoJson[key]) {
        instanceRecord[key] = deviceInfoJson[key]
        hasUpdates = true
      }
    }

    for (const key in existingDeviceInfoJson) {
      if (['id', 'deviceId'].includes(key)) continue

      if (existingDeviceInfoJson[key] && !deviceInfoJson[key]) {
        instanceRecord[key] = null
        hasUpdates = true
      }
    }

    return hasUpdates
  }
}

export = DeviceInfo
