import Logger from '../../Logger'
import { areEquivalent, isNullOrNaN } from '../../utils'
import type User from '../../models/User'
import type { EreaderDeviceObject, EmailSettingsJsonObject } from '../../types'

class EmailSettings {
  id = 'email-settings'
  host: string | null = null
  port = 465
  secure = true
  rejectUnauthorized = true
  user: string | null = null
  pass: string | null = null
  testAddress: string | null = null
  fromAddress: string | null = null
  ereaderDevices: EreaderDeviceObject[] = []

  constructor(settings?: Partial<EmailSettingsJsonObject> | null) {
    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: Partial<EmailSettingsJsonObject>): void {
    this.host = settings.host ?? null
    this.port = settings.port ?? 465
    this.secure = Boolean(settings.secure)
    this.rejectUnauthorized = Boolean(settings.rejectUnauthorized)
    this.user = settings.user ?? null
    this.pass = settings.pass ?? null
    this.testAddress = settings.testAddress ?? null
    this.fromAddress = settings.fromAddress ?? null
    this.ereaderDevices = settings.ereaderDevices?.map((d) => ({ ...d })) || []

    if (settings.rejectUnauthorized === undefined) {
      this.rejectUnauthorized = true
    }
  }

  toJSON(): EmailSettingsJsonObject {
    return {
      id: this.id,
      host: this.host,
      port: this.port,
      secure: this.secure,
      rejectUnauthorized: this.rejectUnauthorized,
      user: this.user,
      pass: this.pass,
      testAddress: this.testAddress,
      fromAddress: this.fromAddress,
      ereaderDevices: this.ereaderDevices.map((d) => ({ ...d }))
    }
  }

  update(payload?: Partial<EmailSettingsJsonObject> | null): boolean {
    if (!payload) return false

    if (payload.port !== undefined) {
      if (isNullOrNaN(payload.port)) payload.port = 465
      else payload.port = Number(payload.port)
    }
    if (payload.secure !== undefined) payload.secure = Boolean(payload.secure)
    if (payload.rejectUnauthorized !== undefined) payload.rejectUnauthorized = Boolean(payload.rejectUnauthorized)

    if (payload.ereaderDevices !== undefined && !Array.isArray(payload.ereaderDevices)) {
      payload.ereaderDevices = undefined
    }

    if (payload.ereaderDevices?.length) {
      payload.ereaderDevices = payload.ereaderDevices
        .map((device) => {
          if (!device.name || !device.email) {
            Logger.error(`[EmailSettings] Update ereader device is invalid`, device)
            return null
          }
          if (
            !device.availabilityOption ||
            !['adminOrUp', 'userOrUp', 'guestOrUp', 'specificUsers'].includes(device.availabilityOption)
          ) {
            device.availabilityOption = 'adminOrUp'
          }
          if (device.availabilityOption === 'specificUsers' && !device.users?.length) {
            device.availabilityOption = 'adminOrUp'
          }
          if (device.availabilityOption !== 'specificUsers' && device.users?.length) {
            device.users = []
          }
          return device
        })
        .filter((d): d is EreaderDeviceObject => Boolean(d))
    }

    let hasUpdates = false
    const json = this.toJSON()
    const keys: (keyof EmailSettingsJsonObject)[] = [
      'host',
      'port',
      'secure',
      'rejectUnauthorized',
      'user',
      'pass',
      'testAddress',
      'fromAddress',
      'ereaderDevices'
    ]

    for (const key of keys) {
      if (payload[key] !== undefined && !areEquivalent(payload[key], json[key])) {
        if (key === 'ereaderDevices') {
          this.ereaderDevices = (payload.ereaderDevices || []).map((d) => ({ ...d }))
        } else if (key === 'port') {
          this.port = payload.port ?? 465
        } else if (key === 'secure') {
          this.secure = Boolean(payload.secure)
        } else if (key === 'rejectUnauthorized') {
          this.rejectUnauthorized = Boolean(payload.rejectUnauthorized)
        } else if (key === 'host') {
          this.host = payload.host ?? null
        } else if (key === 'user') {
          this.user = payload.user ?? null
        } else if (key === 'pass') {
          this.pass = payload.pass ?? null
        } else if (key === 'testAddress') {
          this.testAddress = payload.testAddress ?? null
        } else if (key === 'fromAddress') {
          this.fromAddress = payload.fromAddress ?? null
        }
        hasUpdates = true
      }
    }

    return hasUpdates
  }

  getTransportObject(): {
    host: string | null
    secure: boolean
    port?: number
    auth?: { user: string; pass: string }
    tls?: { rejectUnauthorized: boolean }
  } {
    const payload: {
      host: string | null
      secure: boolean
      port?: number
      auth?: { user: string; pass: string }
      tls?: { rejectUnauthorized: boolean }
    } = {
      host: this.host,
      secure: this.secure
    }

    if (this.port !== 465) {
      payload.secure = false
    }
    if (this.port) payload.port = this.port
    if (this.user && this.pass !== undefined && this.pass !== null) {
      payload.auth = {
        user: this.user,
        pass: this.pass
      }
    }
    if (!this.rejectUnauthorized) {
      payload.tls = {
        rejectUnauthorized: false
      }
    }

    return payload
  }

  checkUserCanAccessDevice(device: EreaderDeviceObject, user: User): boolean {
    const deviceAvailability = device.availabilityOption || 'adminOrUp'
    if (deviceAvailability === 'adminOrUp' && user.isAdminOrUp) return true
    if (deviceAvailability === 'userOrUp' && (user.isAdminOrUp || user.isUser)) return true
    if (deviceAvailability === 'guestOrUp') return true
    if (deviceAvailability === 'specificUsers') {
      const deviceUsers = device.users || []
      return deviceUsers.includes(user.id)
    }
    return false
  }

  getEReaderDevices(user: User): EreaderDeviceObject[] {
    return this.ereaderDevices.filter((device) => this.checkUserCanAccessDevice(device, user))
  }

  getEReaderDevice(deviceName: string): EreaderDeviceObject | undefined {
    return this.ereaderDevices.find((d) => d.name === deviceName)
  }
}

export = EmailSettings
