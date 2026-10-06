import { v4 as uuidv4 } from 'uuid'
import type { ApprisePayload, NotificationData, NotificationJSON, NotificationPayload } from '../types'

class Notification {
  id: string | null
  libraryId: string | null
  eventName: string
  urls: string[]
  titleTemplate: string
  bodyTemplate: string
  type: string
  enabled: boolean

  lastFiredAt: number | null
  lastAttemptFailed: boolean
  numConsecutiveFailedAttempts: number
  numTimesFired: number
  createdAt: number | null

  constructor(notification: NotificationData | null = null) {
    this.id = null
    this.libraryId = null
    this.eventName = ''
    this.urls = []
    this.titleTemplate = ''
    this.bodyTemplate = ''
    this.type = 'info'
    this.enabled = false

    this.lastFiredAt = null
    this.lastAttemptFailed = false
    this.numConsecutiveFailedAttempts = 0
    this.numTimesFired = 0
    this.createdAt = null

    if (notification) {
      this.construct(notification)
    }
  }

  construct(notification: NotificationData): void {
    this.id = notification.id || null
    this.libraryId = notification.libraryId || null
    this.eventName = notification.eventName
    this.urls = notification.urls || []
    this.titleTemplate = notification.titleTemplate || ''
    this.bodyTemplate = notification.bodyTemplate || ''
    this.type = notification.type || 'info'
    this.enabled = !!notification.enabled
    this.lastFiredAt = notification.lastFiredAt || null
    this.lastAttemptFailed = !!notification.lastAttemptFailed
    this.numConsecutiveFailedAttempts = notification.numConsecutiveFailedAttempts || 0
    this.numTimesFired = notification.numTimesFired || 0
    this.createdAt = notification.createdAt || null
  }

  toJSON(): NotificationJSON {
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
    this.eventName = payload.eventName || ''
    this.urls = payload.urls || []
    this.titleTemplate = payload.titleTemplate || ''
    this.bodyTemplate = payload.bodyTemplate || ''
    this.enabled = !!payload.enabled
    this.type = payload.type || 'info'
    this.createdAt = Date.now()
  }

  update(payload: Partial<NotificationPayload>): boolean {
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

  replaceVariablesInTemplate(templateText: string, data: Record<string, string | number | boolean | null | undefined>): string {
    const ptrn = /{{ ?([a-zA-Z]+) ?}}/mg

    let match: RegExpExecArray | null
    let updatedTemplate = templateText
    while ((match = ptrn.exec(templateText)) !== null) {
      const val = data[match[1]]
      if (val !== undefined && val !== null) {
        updatedTemplate = updatedTemplate.replace(match[0], String(val))
      }
    }
    return updatedTemplate
  }

  parseTitleTemplate(data: Record<string, string | number | boolean | null | undefined>): string {
    return this.replaceVariablesInTemplate(this.titleTemplate, data)
  }

  parseBodyTemplate(data: Record<string, string | number | boolean | null | undefined>): string {
    return this.replaceVariablesInTemplate(this.bodyTemplate, data)
  }

  getApprisePayload(data: Record<string, string | number | boolean | null | undefined>): ApprisePayload {
    return {
      urls: this.urls,
      title: this.parseTitleTemplate(data),
      body: this.parseBodyTemplate(data)
    }
  }
}

export = Notification
