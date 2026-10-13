import axios from 'axios'
import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'
import { notificationData } from '../utils/notifications'
import type LibraryItem from '../models/LibraryItem'
import type Podcast from '../models/Podcast'
import type PodcastEpisode from '../models/PodcastEpisode'
import type Backup from '../objects/Backup'
import type Notification from '../objects/Notification'
import type { NotificationTemplateData } from '../types'

function isPodcastMedia(media: LibraryItem['media']): media is Podcast {
  return !!media && 'autoDownloadEpisodes' in media
}

interface NotificationQueueItem {
  eventName: string
  eventData?: NotificationTemplateData
}

class NotificationManager {
  sendingNotification: boolean
  notificationQueue: NotificationQueueItem[]

  constructor() {
    this.sendingNotification = false
    this.notificationQueue = []
  }

  getData(): typeof notificationData {
    return notificationData
  }

  async onPodcastEpisodeDownloaded(libraryItem: LibraryItem, episode: PodcastEpisode): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    if (!notifSettings.getHasActiveNotificationsForEvent('onPodcastEpisodeDownloaded')) {
      Logger.debug('[NotificationManager] onPodcastEpisodeDownloaded: No active notifications')
      return
    }

    if (!isPodcastMedia(libraryItem.media)) return

    const podcast = libraryItem.media
    Logger.debug(`[NotificationManager] onPodcastEpisodeDownloaded: Episode "${episode.title}" for podcast ${podcast.title}`)
    const library = await Database.libraryModel.findByPk(libraryItem.libraryId)
    const eventData: NotificationTemplateData = {
      libraryItemId: libraryItem.id,
      libraryId: libraryItem.libraryId,
      libraryName: library?.name || 'Unknown',
      mediaTags: (podcast.tags || []).join(', '),
      podcastTitle: podcast.title,
      podcastAuthor: podcast.author || '',
      podcastDescription: podcast.description || '',
      podcastGenres: (podcast.genres || []).join(', '),
      episodeId: episode.id,
      episodeTitle: episode.title,
      episodeSubtitle: episode.subtitle || '',
      episodeDescription: episode.description || ''
    }
    this.triggerNotification('onPodcastEpisodeDownloaded', eventData)
  }

  async onBackupCompleted(backup: Backup, totalBackupCount: number, removedOldest: boolean): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    if (!notifSettings.getHasActiveNotificationsForEvent('onBackupCompleted')) {
      Logger.debug('[NotificationManager] onBackupCompleted: No active notifications')
      return
    }

    Logger.debug('[NotificationManager] onBackupCompleted: Backup completed')
    const eventData: NotificationTemplateData = {
      completionTime: backup.createdAt,
      backupPath: backup.fullPath,
      backupSize: backup.fileSize,
      backupCount: totalBackupCount || 'Invalid',
      removedOldest: removedOldest || 'false'
    }
    this.triggerNotification('onBackupCompleted', eventData)
  }

  async onRSSFeedFailed(feedUrl: string, numFailed: number, title: string): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    if (!notifSettings.getHasActiveNotificationsForEvent('onRSSFeedFailed')) {
      Logger.debug('[NotificationManager] onRSSFeedFailed: No active notifications')
      return
    }

    Logger.debug(`[NotificationManager] onRSSFeedFailed: RSS feed request failed for ${feedUrl}`)
    const eventData: NotificationTemplateData = {
      feedUrl: feedUrl,
      numFailed: numFailed || 0,
      title: title || 'Unknown Title'
    }
    this.triggerNotification('onRSSFeedFailed', eventData)
  }

  async onRSSFeedDisabled(feedUrl: string, numFailed: number, title: string): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    if (!notifSettings.getHasActiveNotificationsForEvent('onRSSFeedDisabled')) {
      Logger.debug(`[NotificationManager] onRSSFeedDisabled: Podcast scheduled episode download disabled due to ${numFailed} failed requests for ${feedUrl}`)
      return
    }

    Logger.debug(`[NotificationManager] onRSSFeedDisabled: Podcast scheduled episode download disabled due to ${numFailed} failed requests for ${feedUrl}`)
    const eventData: NotificationTemplateData = {
      feedUrl: feedUrl,
      numFailed: numFailed || 0,
      title: title || 'Unknown Title'
    }
    this.triggerNotification('onRSSFeedDisabled', eventData)
  }

  async onBackupFailed(errorMsg?: string | null): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    if (!notifSettings.getHasActiveNotificationsForEvent('onBackupFailed')) {
      Logger.debug('[NotificationManager] onBackupFailed: No active notifications')
      return
    }

    Logger.debug(`[NotificationManager] onBackupFailed: Backup failed (${errorMsg})`)
    const eventData: NotificationTemplateData = {
      errorMsg: errorMsg || 'Backup failed'
    }
    this.triggerNotification('onBackupFailed', eventData)
  }

  onTest(): void {
    this.triggerNotification('onTest')
  }

  async triggerNotification(
    eventName: string,
    eventData?: NotificationTemplateData,
    intentionallyFail = false
  ): Promise<void> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.isUseable) return

    // Will queue the notification if sendingNotification and queue is not full
    if (!this.checkTriggerNotification(eventName, eventData)) return

    const notifications = notifSettings.getActiveNotificationsForEvent(eventName)
    for (const notification of notifications) {
      Logger.debug(`[NotificationManager] triggerNotification: Sending ${eventName} notification ${notification.id}`)
      const success = intentionallyFail ? false : await this.sendNotification(notification, eventData)

      notification.updateNotificationFired(success)
      if (!success) {
        // Failed notification
        if (notification.numConsecutiveFailedAttempts >= notifSettings.maxFailedAttempts) {
          Logger.error(`[NotificationManager] triggerNotification: ${notification.eventName}/${notification.id} reached max failed attempts`)
          notification.enabled = false
        } else {
          Logger.error(`[NotificationManager] triggerNotification: ${notification.eventName}/${notification.id} ${notification.numConsecutiveFailedAttempts} failed attempts`)
        }
      }
    }

    await Database.updateSetting(notifSettings)
    SocketAuthority.emitter('notifications_updated', notifSettings.toJSON())

    this.notificationFinished()
  }

  checkTriggerNotification(eventName: string, eventData?: NotificationTemplateData): boolean {
    const notifSettings = Database.notificationSettings
    if (this.sendingNotification) {
      if (notifSettings && this.notificationQueue.length >= notifSettings.maxNotificationQueue) {
        Logger.warn(`[NotificationManager] Notification queue is full - ignoring event ${eventName}`)
      } else {
        Logger.debug(`[NotificationManager] Queueing notification ${eventName} (Queue size: ${this.notificationQueue.length})`)
        this.notificationQueue.push({ eventName, eventData })
      }
      return false
    }
    this.sendingNotification = true
    return true
  }

  notificationFinished(): void {
    const delay = Database.notificationSettings?.notificationDelay ?? 1000
    // Delay between events then run next notification in queue
    setTimeout(() => {
      this.sendingNotification = false
      if (this.notificationQueue.length) {
        // Send next notification in queue
        const nextNotificationEvent = this.notificationQueue.shift()
        if (nextNotificationEvent) {
          this.triggerNotification(nextNotificationEvent.eventName, nextNotificationEvent.eventData)
        }
      }
    }, delay)
  }

  sendTestNotification(notification: Notification): Promise<boolean> | boolean {
    const eventData = notificationData.events.find((e) => e.name === notification.eventName)
    if (!eventData) {
      Logger.error(`[NotificationManager] sendTestNotification: Event not found ${notification.eventName}`)
      return false
    }

    return this.sendNotification(notification, eventData.testData)
  }

  sendNotification(notification: Notification, eventData?: NotificationTemplateData): Promise<boolean> {
    const notifSettings = Database.notificationSettings
    if (!notifSettings?.appriseApiUrl) {
      Logger.error(`[NotificationManager] sendNotification: No appriseApiUrl configured`)
      return Promise.resolve(false)
    }
    const payload = notification.getApprisePayload(eventData || {})
    return axios
      .post(notifSettings.appriseApiUrl, payload, { timeout: 6000 })
      .then((response) => {
        Logger.debug(`[NotificationManager] sendNotification: ${notification.eventName}/${notification.id} response=`, response.data)
        return true
      })
      .catch((error: unknown) => {
        Logger.error(`[NotificationManager] sendNotification: ${notification.eventName}/${notification.id} error=`, error)
        return false
      })
  }
}

const notificationManager = new NotificationManager()

namespace NotificationManager {
  export type NotificationManagerInstance = NotificationManager
}

export = notificationManager
