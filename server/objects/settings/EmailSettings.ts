import Logger from '../../Logger'
import areEquivalent from '../../utils/areEquivalent'
import type {
  AvailabilityOption,
  EmailSettingsData,
  EmailSettingsJSON,
  EreaderDeviceObject,
  IUserAccess,
  SmtpTransportObject
} from '../../types'

function isNullOrNaN(val: unknown): boolean {
  return val === null || val === undefined || isNaN(Number(val))
}

function copyValue<T>(val: T): T {
  if (val === null || val === undefined) return val
  if (typeof val === 'object') {
    return JSON.parse(JSON.stringify(val)) as T
  }
  return val
}

class EmailSettings {
  id: string
  host: string | null
  port: number
  secure: boolean
  rejectUnauthorized: boolean
  user: string | null
  pass: string | null
  testAddress: string | null
  fromAddress: string | null
  ereaderDevices: EreaderDeviceObject[]

  constructor(settings: EmailSettingsData | null = null) {
    this.id = 'email-settings'
    this.host = null
    this.port = 465
    this.secure = true
    this.rejectUnauthorized = true
    this.user = null
    this.pass = null
    this.testAddress = null
    this.fromAddress = null
    this.ereaderDevices = []

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: EmailSettingsData): void {
    this.host = settings.host ?? null
    this.port = settings.port ?? 465
    this.secure = !!settings.secure
    this.rejectUnauthorized = settings.rejectUnauthorized === undefined ? true : !!settings.rejectUnauthorized
    this.user = settings.user ?? null
    this.pass = settings.pass ?? null
    this.testAddress = settings.testAddress ?? null
    this.fromAddress = settings.fromAddress ?? null
    this.ereaderDevices = settings.ereaderDevices?.map((d) => ({ ...d })) || []
  }

  toJSON(): EmailSettingsJSON {
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

  update(payload: Partial<EmailSettingsData> | null | undefined): boolean {
    if (!payload) return false

    if (payload.port !== undefined) {
      if (isNullOrNaN(payload.port)) this.port = 465
      else this.port = Number(payload.port)
    }
    if (payload.secure !== undefined) this.secure = !!payload.secure
    if (payload.rejectUnauthorized !== undefined) this.rejectUnauthorized = !!payload.rejectUnauthorized

    if (payload.ereaderDevices !== undefined && !Array.isArray(payload.ereaderDevices)) {
      payload.ereaderDevices = undefined
    }

    if (payload.ereaderDevices?.length) {
      const validOptions: AvailabilityOption[] = ['adminOrUp', 'userOrUp', 'guestOrUp', 'specificUsers']
      payload.ereaderDevices = payload.ereaderDevices
        .map((device): EreaderDeviceObject | null => {
          if (!device.name || !device.email) {
            Logger.error('[EmailSettings] Update ereader device is invalid', device)
            return null
          }
          let availabilityOption: AvailabilityOption = device.availabilityOption || 'adminOrUp'
          if (!validOptions.includes(availabilityOption)) {
            availabilityOption = 'adminOrUp'
          }
          if (availabilityOption === 'specificUsers' && !device.users?.length) {
            availabilityOption = 'adminOrUp'
          }
          const users = availabilityOption !== 'specificUsers' ? [] : device.users || []
          return {
            name: device.name,
            email: device.email,
            availabilityOption,
            users
          }
        })
        .filter((d): d is EreaderDeviceObject => d !== null)
    }

    let hasUpdates = false

    const json = this.toJSON()
    const jsonRecord = json as unknown as Record<string, unknown>
    const payloadRecord = payload as unknown as Record<string, unknown>
    const instanceRecord = this as unknown as Record<string, unknown>

    for (const key in jsonRecord) {
      if (key === 'id') continue

      if (payloadRecord[key] !== undefined && !areEquivalent(payloadRecord[key], jsonRecord[key])) {
        instanceRecord[key] = copyValue(payloadRecord[key])
        hasUpdates = true
      }
    }

    return hasUpdates
  }

  getTransportObject(): SmtpTransportObject {
    const payload: SmtpTransportObject = {
      host: this.host,
      secure: this.secure
    }
    // Only set to true for port 465 (https://nodemailer.com/smtp/#tls-options)
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
    // Allow self-signed certs (https://nodemailer.com/smtp/#3-allow-self-signed-certificates)
    if (!this.rejectUnauthorized) {
      payload.tls = {
        rejectUnauthorized: false
      }
    }

    return payload
  }

  checkUserCanAccessDevice(device: EreaderDeviceObject, user: IUserAccess): boolean {
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

  getEReaderDevices(user: IUserAccess): EreaderDeviceObject[] {
    return this.ereaderDevices.filter((device) => this.checkUserCanAccessDevice(device, user))
  }

  getEReaderDevice(deviceName: string): EreaderDeviceObject | undefined {
    return this.ereaderDevices.find((d) => d.name === deviceName)
  }
}

export = EmailSettings
