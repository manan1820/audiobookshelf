import Notification from '../Notification'
import Logger from '../../Logger'
import type { NotificationPayload, NotificationSettingsData, NotificationSettingsJSON } from '../../types'

function isNullOrNaN(val: unknown): boolean {
  return val === null || val === undefined || isNaN(Number(val))
}

class NotificationSettings {
  id: string
  appriseType: string
  appriseApiUrl: string | null
  notifications: Notification[]
  maxFailedAttempts: number
  maxNotificationQueue: number
  notificationDelay: number

  constructor(settings: NotificationSettingsData | null = null) {
    this.id = 'notification-settings'
    this.appriseType = 'api'
    this.appriseApiUrl = null
    this.notifications = []
    this.maxFailedAttempts = 5
    this.maxNotificationQueue = 20 // once reached events will be ignored
    this.notificationDelay = 1000 // ms delay between firing notifications

    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: NotificationSettingsData): void {
    this.appriseType = settings.appriseType || 'api'
    this.appriseApiUrl = settings.appriseApiUrl || null
    this.notifications = (settings.notifications || []).map((n) => new Notification(n))
    this.maxFailedAttempts = settings.maxFailedAttempts || 5
    this.maxNotificationQueue = settings.maxNotificationQueue || 20
    this.notificationDelay = settings.notificationDelay || 1000
  }

  toJSON(): NotificationSettingsJSON {
    return {
      id: this.id,
      appriseType: this.appriseType,
      appriseApiUrl: this.appriseApiUrl,
      notifications: this.notifications.map((n) => n.toJSON()),
      maxFailedAttempts: this.maxFailedAttempts,
      maxNotificationQueue: this.maxNotificationQueue,
      notificationDelay: this.notificationDelay
    }
  }

  get isUseable(): boolean {
    return !!this.appriseApiUrl
  }

  getHasActiveNotificationsForEvent(eventName: string): boolean {
    return this.notifications.some((n) => n.eventName === eventName && n.enabled)
  }

  getActiveNotificationsForEvent(eventName: string): Notification[] {
    return this.notifications.filter((n) => n.eventName === eventName && n.enabled)
  }

  getNotification(id: string): Notification | undefined {
    return this.notifications.find((n) => n.id === id)
  }

  removeNotification(id: string): boolean {
    if (this.notifications.some((n) => n.id === id)) {
      this.notifications = this.notifications.filter((n) => n.id !== id)
      return true
    }
    return false
  }

  update(payload: Partial<NotificationSettingsData> | null | undefined): boolean {
    if (!payload) return false

    let hasUpdates = false
    if (payload.appriseApiUrl !== undefined && payload.appriseApiUrl !== this.appriseApiUrl) {
      this.appriseApiUrl = payload.appriseApiUrl || null
      hasUpdates = true
    }

    if (payload.maxFailedAttempts !== undefined) {
      const _maxFailedAttempts = isNullOrNaN(payload.maxFailedAttempts) ? 5 : Number(payload.maxFailedAttempts)
      if (_maxFailedAttempts !== this.maxFailedAttempts) {
        this.maxFailedAttempts = _maxFailedAttempts
        hasUpdates = true
      }
    }

    if (payload.maxNotificationQueue !== undefined) {
      const _maxNotificationQueue = isNullOrNaN(payload.maxNotificationQueue) ? 20 : Number(payload.maxNotificationQueue)
      if (_maxNotificationQueue !== this.maxNotificationQueue) {
        this.maxNotificationQueue = _maxNotificationQueue
        hasUpdates = true
      }
    }

    return hasUpdates
  }

  createNotification(payload: NotificationPayload | null | undefined): boolean {
    if (!payload) return false
    if (!payload.eventName || !payload.urls || !payload.urls.length) return false

    const notification = new Notification()
    notification.setData(payload)
    this.notifications.push(notification)
    return true
  }

  updateNotification(payload: NotificationPayload | null | undefined): boolean {
    if (!payload || !payload.id) return false
    const notification = this.notifications.find((n) => n.id === payload.id)
    if (!notification) {
      Logger.error(`[NotificationSettings] updateNotification: Notification not found ${payload.id}`)
      return false
    }

    return notification.update(payload)
  }
}

export = NotificationSettings
