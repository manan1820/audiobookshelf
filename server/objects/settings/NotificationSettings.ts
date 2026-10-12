import Logger from '../../Logger'
import Notification from '../Notification'
import { isNullOrNaN } from '../../utils'
import type {
  NotificationPayload,
  NotificationSettingsJsonObject
} from '../../types'

class NotificationSettings {
  id = 'notification-settings'
  appriseType = 'api'
  appriseApiUrl: string | null = null
  notifications: Notification[] = []
  maxFailedAttempts = 5
  maxNotificationQueue = 20
  notificationDelay = 1000

  constructor(settings?: Partial<NotificationSettingsJsonObject> | null) {
    if (settings) {
      this.construct(settings)
    }
  }

  construct(settings: Partial<NotificationSettingsJsonObject>): void {
    this.appriseType = settings.appriseType || 'api'
    this.appriseApiUrl = settings.appriseApiUrl || null
    this.notifications = (settings.notifications || []).map((n) => new Notification(n))
    this.maxFailedAttempts = settings.maxFailedAttempts || 5
    this.maxNotificationQueue = settings.maxNotificationQueue || 20
    this.notificationDelay = settings.notificationDelay || 1000
  }

  toJSON(): NotificationSettingsJsonObject {
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
    return Boolean(this.appriseApiUrl)
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

  update(payload?: Partial<NotificationSettingsJsonObject> | null): boolean {
    if (!payload) return false

    let hasUpdates = false
    if (payload.appriseApiUrl !== undefined && payload.appriseApiUrl !== this.appriseApiUrl) {
      this.appriseApiUrl = payload.appriseApiUrl || null
      hasUpdates = true
    }

    if (payload.maxFailedAttempts !== undefined) {
      const maxFailedAttempts = isNullOrNaN(payload.maxFailedAttempts) ? 5 : Number(payload.maxFailedAttempts)
      if (maxFailedAttempts !== this.maxFailedAttempts) {
        this.maxFailedAttempts = maxFailedAttempts
        hasUpdates = true
      }
    }

    if (payload.maxNotificationQueue !== undefined) {
      const maxNotificationQueue = isNullOrNaN(payload.maxNotificationQueue) ? 20 : Number(payload.maxNotificationQueue)
      if (maxNotificationQueue !== this.maxNotificationQueue) {
        this.maxNotificationQueue = maxNotificationQueue
        hasUpdates = true
      }
    }

    return hasUpdates
  }

  createNotification(payload: NotificationPayload): boolean {
    if (!payload) return false
    if (!payload.eventName || !payload.urls?.length) return false

    const notification = new Notification()
    notification.setData(payload)
    this.notifications.push(notification)
    return true
  }

  updateNotification(payload: NotificationPayload): boolean {
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
