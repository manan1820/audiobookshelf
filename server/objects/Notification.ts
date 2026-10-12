import { v4 as uuidv4 } from 'uuid'
import type {
  NotificationPayload,
  NotificationJsonObject,
  AppriseNotificationPayload,
  NotificationTemplateData
} from '../types'

class Notification {
  id: string | null = null
  libraryId: string | null = null
  eventName = ''
  urls: string[] = []
  titleTemplate = ''
  bodyTemplate = ''
  type = 'info'
  enabled = false

  lastFiredAt: number | null = null
  lastAttemptFailed = false
  numConsecutiveFailedAttempts = 0
  numTimesFired = 0
  createdAt: number | null = null

  constructor(notification?: NotificationPayload | null) {
    if (notification) {
      this.construct(notification)
    }
  }

  construct(notification: NotificationPayload): void {
    this.id = notification.id ?? null
    this.libraryId = notification.libraryId || null
    this.eventName = notification.eventName ?? ''
    this.urls = notification.urls ? [...notification.urls] : []
    this.titleTemplate = notification.titleTemplate || ''
    this.bodyTemplate = notification.bodyTemplate || ''
    this.type = notification.type || 'info'
    this.enabled = Boolean(notification.enabled)
    this.lastFiredAt = notification.lastFiredAt || null
    this.lastAttemptFailed = Boolean(notification.lastAttemptFailed)
    this.numConsecutiveFailedAttempts = notification.numConsecutiveFailedAttempts || 0
    this.numTimesFired = notification.numTimesFired || 0
    this.createdAt = notification.createdAt ?? null
  }

  toJSON(): NotificationJsonObject {
    return {
      id: this.id,
      libraryId: this.libraryId,
      eventName: this.eventName,
      urls: this.urls,
      titleTemplate: this.titleTemplate,
      bodyTemplate: this.bodyTemplate,
      enabled: this.enabled,
      type: this.type,
      lastFiredAt: this.lastFiredAt,
      lastAttemptFailed: this.lastAttemptFailed,
      numConsecutiveFailedAttempts: this.numConsecutiveFailedAttempts,
      numTimesFired: this.numTimesFired,
      createdAt: this.createdAt
    }
  }

  setData(payload: NotificationPayload): void {
    this.id = uuidv4()
    this.libraryId = payload.libraryId || null
    this.eventName = payload.eventName ?? ''
    this.urls = payload.urls ? [...payload.urls] : []
    this.titleTemplate = payload.titleTemplate ?? ''
    this.bodyTemplate = payload.bodyTemplate ?? ''
    this.enabled = Boolean(payload.enabled)
    this.type = payload.type || 'info'
    this.createdAt = Date.now()
  }

  update(payload: NotificationPayload): boolean {
    if (!this.enabled && payload.enabled) {
      // Reset
      this.lastFiredAt = null
      this.lastAttemptFailed = false
      this.numConsecutiveFailedAttempts = 0
    }

    let hasUpdated = false
    if (payload.libraryId !== undefined && payload.libraryId !== this.libraryId) {
      this.libraryId = payload.libraryId
      hasUpdated = true
    }
    if (payload.eventName !== undefined && payload.eventName !== this.eventName) {
      this.eventName = payload.eventName
      hasUpdated = true
    }
    if (payload.urls !== undefined) {
      if (payload.urls.join(',') !== this.urls.join(',')) {
        this.urls = [...payload.urls]
        hasUpdated = true
      }
    }
    if (payload.titleTemplate !== undefined && payload.titleTemplate !== this.titleTemplate) {
      this.titleTemplate = payload.titleTemplate
      hasUpdated = true
    }
    if (payload.bodyTemplate !== undefined && payload.bodyTemplate !== this.bodyTemplate) {
      this.bodyTemplate = payload.bodyTemplate
      hasUpdated = true
    }
    if (payload.enabled !== undefined && payload.enabled !== this.enabled) {
      this.enabled = payload.enabled
      hasUpdated = true
    }
    if (payload.type !== undefined && payload.type !== this.type) {
      this.type = payload.type || 'info'
      hasUpdated = true
    }

    return hasUpdated
  }

  updateNotificationFired(success: boolean): void {
    this.lastFiredAt = Date.now()
    this.lastAttemptFailed = !success
    this.numConsecutiveFailedAttempts = success ? 0 : this.numConsecutiveFailedAttempts + 1
    this.numTimesFired++
  }

  replaceVariablesInTemplate(templateText: string, data: NotificationTemplateData): string {
    const ptrn = /{{ ?([a-zA-Z]+) ?}}/gm

    let match: RegExpExecArray | null
    let updatedTemplate = templateText
    while ((match = ptrn.exec(templateText)) !== null) {
      const value = data[match[1]]
      if (value !== undefined && value !== null) {
        updatedTemplate = updatedTemplate.replace(match[0], String(value))
      }
    }
    return updatedTemplate
  }

  parseTitleTemplate(data: NotificationTemplateData): string {
    return this.replaceVariablesInTemplate(this.titleTemplate, data)
  }

  parseBodyTemplate(data: NotificationTemplateData): string {
    return this.replaceVariablesInTemplate(this.bodyTemplate, data)
  }

  getApprisePayload(data: NotificationTemplateData): AppriseNotificationPayload {
    return {
      urls: this.urls,
      title: this.parseTitleTemplate(data),
      body: this.parseBodyTemplate(data)
    }
  }
}

export = Notification
