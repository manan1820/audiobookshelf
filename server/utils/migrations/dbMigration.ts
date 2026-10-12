import { DataTypes, QueryInterface, Transaction } from 'sequelize'
import Path from 'path'
import { v4 as uuidv4 } from 'uuid'
import Logger from '../../Logger'
import fs from '../../libs/fsExtra'
import * as oldDbFiles from './oldDbFiles'
import parseNameString from '../parsers/parseNameString'
import type DatabaseSingleton from '../../Database'
import Library from '../../models/Library'
import type {
  LibraryOldJsonObject,
  LibraryItemOldJsonObject,
  UserOldJsonObject,
  PlaybackSessionOldJsonObject,
  SettingValueObject,
  CollectionOldJsonObject,
  PlaylistOldJsonObject,
  AuthorOldJsonObject,
  SeriesOldJsonObject,
  FeedOldJsonObject,
  BookOldJsonObject,
  PodcastOldJsonObject,
  AudioBookmarkObject,
  AudioFileObject,
  LibraryFileObject,
  LibrarySettingsObject
} from '../../types'
import type { LibraryCreationAttributes } from '../../models/Library'
import type { LibraryFolderCreationAttributes } from '../../models/LibraryFolder'
import type { SettingCreationAttributes } from '../../models/Setting'
import type { AuthorCreationAttributes } from '../../models/Author'
import type { SeriesCreationAttributes } from '../../models/Series'
import type { LibraryItemCreationAttributes } from '../../models/LibraryItem'
import type { BookCreationAttributes } from '../../models/Book'
import type { BookAuthorCreationAttributes } from '../../models/BookAuthor'
import type { BookSeriesCreationAttributes } from '../../models/BookSeries'
import type { PodcastCreationAttributes } from '../../models/Podcast'
import type { PodcastEpisodeCreationAttributes } from '../../models/PodcastEpisode'
import type { UserCreationAttributes } from '../../models/User'
import type { MediaProgressCreationAttributes } from '../../models/MediaProgress'
import type { PlaybackSessionCreationAttributes } from '../../models/PlaybackSession'
import type { DeviceCreationAttributes } from '../../models/Device'
import type { CollectionCreationAttributes } from '../../models/Collection'
import type { CollectionBookCreationAttributes } from '../../models/CollectionBook'
import type { PlaylistCreationAttributes } from '../../models/Playlist'
import type { PlaylistMediaItemCreationAttributes } from '../../models/PlaylistMediaItem'
import type { FeedCreationAttributes } from '../../models/Feed'
import type { FeedEpisodeCreationAttributes } from '../../models/FeedEpisode'
import type LibraryFolder from '../../models/LibraryFolder'
import type Setting from '../../models/Setting'
import type Author from '../../models/Author'
import type Series from '../../models/Series'
import type LibraryItem from '../../models/LibraryItem'
import type Book from '../../models/Book'
import type Podcast from '../../models/Podcast'
import type PodcastEpisode from '../../models/PodcastEpisode'
import type BookAuthor from '../../models/BookAuthor'
import type BookSeries from '../../models/BookSeries'
import type User from '../../models/User'
import type MediaProgress from '../../models/MediaProgress'
import type PlaybackSession from '../../models/PlaybackSession'
import type Device from '../../models/Device'
import type Collection from '../../models/Collection'
import type CollectionBook from '../../models/CollectionBook'
import type Playlist from '../../models/Playlist'
import type PlaylistMediaItem from '../../models/PlaylistMediaItem'
import type Feed from '../../models/Feed'
import type FeedEpisode from '../../models/FeedEpisode'

type DatabaseType = typeof DatabaseSingleton

export interface MigrationDatabaseModels {
  library: typeof Library
  libraryFolder: typeof LibraryFolder
  setting: typeof Setting
  author: typeof Author
  series: typeof Series
  libraryItem: typeof LibraryItem
  book: typeof Book
  podcast: typeof Podcast
  podcastEpisode: typeof PodcastEpisode
  bookAuthor: typeof BookAuthor
  bookSeries: typeof BookSeries
  user: typeof User
  mediaProgress: typeof MediaProgress
  playbackSession: typeof PlaybackSession
  device: typeof Device
  collection: typeof Collection
  collectionBook: typeof CollectionBook
  playlist: typeof Playlist
  playlistMediaItem: typeof PlaylistMediaItem
  feed: typeof Feed
  feedEpisode: typeof FeedEpisode
}

interface OldDbIdMap {
  users: { [oldId: string]: string }
  libraries: { [oldId: string]: string }
  libraryFolders: { [oldId: string]: string }
  libraryItems: { [oldId: string]: string }
  authors: { [libraryId: string]: { [oldAuthorId: string]: string } }
  series: { [libraryId: string]: { [oldSeriesId: string]: string } }
  collections: { [oldId: string]: string }
  podcastEpisodes: { [oldId: string]: string }
  books: { [oldLibraryItemId: string]: string }
  podcasts: { [oldLibraryItemId: string]: string }
  devices: { [key: string]: string }
}

const oldDbIdMap: OldDbIdMap = {
  users: {},
  libraries: {},
  libraryFolders: {},
  libraryItems: {},
  authors: {},
  series: {},
  collections: {},
  podcastEpisodes: {},
  books: {},
  podcasts: {},
  devices: {}
}

let prefixesToIgnore: string[] = ['the']

function getTitleIgnorePrefix(title?: string | null): string | null | undefined {
  if (!title?.trim()) return title
  for (const prefix of prefixesToIgnore) {
    if (title.toLowerCase().startsWith(`${prefix} `)) {
      return title.substring(prefix.length).trim()
    }
  }
  return title
}

interface OldDeviceInfoRecord {
  deviceId?: string | null
  browserName?: string | null
  browserVersion?: string | null
  osName?: string | null
  osVersion?: string | null
  clientVersion?: string | null
  manufacturer?: string | null
  model?: string | null
  sdkVersion?: string | null
  ipAddress?: string | null
  serverVersion?: string | null
}

function getDeviceInfoString(deviceInfo: OldDeviceInfoRecord | null | undefined, userId: string): string | null {
  if (!deviceInfo) return null
  if (deviceInfo.deviceId) return deviceInfo.deviceId

  const keys = [
    userId,
    deviceInfo.browserName || null,
    deviceInfo.browserVersion || null,
    deviceInfo.osName || null,
    deviceInfo.osVersion || null,
    deviceInfo.clientVersion || null,
    deviceInfo.manufacturer || null,
    deviceInfo.model || null,
    deviceInfo.sdkVersion || null,
    deviceInfo.ipAddress || null
  ].map((k) => k || '')
  return 'temp-' + Buffer.from(keys.join('-'), 'utf-8').toString('base64')
}

interface MigratedBookRecords {
  book: BookCreationAttributes
  bookSeries: BookSeriesCreationAttributes[]
  bookAuthor: BookAuthorCreationAttributes[]
}

interface MigratedPodcastRecords {
  podcast: PodcastCreationAttributes
  podcastEpisode: PodcastEpisodeCreationAttributes[]
}

interface MigratedLibraryItemRecords {
  book: BookCreationAttributes[]
  podcast: PodcastCreationAttributes[]
  podcastEpisode: PodcastEpisodeCreationAttributes[]
  bookSeries: BookSeriesCreationAttributes[]
  bookAuthor: BookAuthorCreationAttributes[]
  libraryItem: LibraryItemCreationAttributes[]
}

interface MigratedLibraryRecords {
  library: LibraryCreationAttributes[]
  libraryFolder: LibraryFolderCreationAttributes[]
}

interface MigratedUserRecords {
  user: UserCreationAttributes[]
  mediaProgress: MediaProgressCreationAttributes[]
}

interface MigratedSessionRecords {
  device: DeviceCreationAttributes[]
  playbackSession: PlaybackSessionCreationAttributes[]
}

interface MigratedCollectionRecords {
  collection: CollectionCreationAttributes[]
  collectionBook: CollectionBookCreationAttributes[]
}

interface MigratedPlaylistRecords {
  playlist: PlaylistCreationAttributes[]
  playlistMediaItem: PlaylistMediaItemCreationAttributes[]
}

interface MigratedFeedRecords {
  feed: FeedCreationAttributes[]
  feedEpisode: FeedEpisodeCreationAttributes[]
}

function migrateBook(oldLibraryItem: LibraryItemOldJsonObject, libraryItem: LibraryItemCreationAttributes): MigratedBookRecords {
  const oldBook = oldLibraryItem.media as BookOldJsonObject

  const bookId = uuidv4()
  const newRecords: MigratedBookRecords = {
    book: {
      id: bookId,
      title: oldBook.metadata.title
    },
    bookSeries: [],
    bookAuthor: []
  }

  const tracks = (oldBook.audioFiles || []).filter(
    (af: { exclude?: boolean; invalid?: boolean; duration?: number | null }) => !af.exclude && !af.invalid
  )
  let duration = 0
  for (const track of tracks) {
    if (track.duration !== null && track.duration !== undefined && !isNaN(track.duration)) {
      duration += track.duration
    }
  }

  const bookRecord: BookCreationAttributes = {
    id: bookId,
    title: oldBook.metadata.title,
    titleIgnorePrefix: getTitleIgnorePrefix(oldBook.metadata.title) ?? null,
    subtitle: oldBook.metadata.subtitle ?? null,
    publishedYear: oldBook.metadata.publishedYear ?? null,
    publishedDate: oldBook.metadata.publishedDate ?? null,
    publisher: oldBook.metadata.publisher ?? null,
    description: oldBook.metadata.description ?? null,
    isbn: oldBook.metadata.isbn ?? null,
    asin: oldBook.metadata.asin ?? null,
    language: oldBook.metadata.language ?? null,
    explicit: !!oldBook.metadata.explicit,
    abridged: !!oldBook.metadata.abridged,
    createdAt: libraryItem.createdAt ? new Date(libraryItem.createdAt) : undefined,
    updatedAt: libraryItem.updatedAt ? new Date(libraryItem.updatedAt) : undefined,
    narrators: oldBook.metadata.narrators ?? [],
    ebookFile: oldBook.ebookFile ?? null,
    coverPath: oldBook.coverPath ?? null,
    duration,
    audioFiles: oldBook.audioFiles ?? [],
    chapters: oldBook.chapters ?? [],
    tags: oldBook.tags ?? [],
    genres: oldBook.metadata.genres ?? []
  }
  newRecords.book = bookRecord
  oldDbIdMap.books[oldLibraryItem.id] = bookId

  const bookAuthorsInserted: string[] = []
  const libraryId = libraryItem.libraryId ?? ''
  for (const oldBookAuthor of oldBook.metadata.authors || []) {
    const authorId = oldDbIdMap.authors[libraryId]?.[oldBookAuthor.id]
    if (authorId) {
      if (bookAuthorsInserted.includes(authorId)) continue
      bookAuthorsInserted.push(authorId)

      newRecords.bookAuthor.push({
        id: uuidv4(),
        authorId,
        bookId
      })
    } else {
      Logger.warn(`[dbMigration] migrateBook: Book author not found "${oldBookAuthor.name}"`)
    }
  }

  const bookSeriesInserted: string[] = []
  for (const oldBookSeries of oldBook.metadata.series || []) {
    const seriesId = oldDbIdMap.series[libraryId]?.[oldBookSeries.id]
    if (seriesId) {
      if (bookSeriesInserted.includes(seriesId)) continue
      bookSeriesInserted.push(seriesId)

      newRecords.bookSeries.push({
        id: uuidv4(),
        sequence: oldBookSeries.sequence ?? null,
        seriesId,
        bookId
      })
    } else {
      Logger.warn(`[dbMigration] migrateBook: Series not found "${oldBookSeries.name}"`)
    }
  }

  return newRecords
}

function migratePodcast(oldLibraryItem: LibraryItemOldJsonObject, libraryItem: LibraryItemCreationAttributes): MigratedPodcastRecords {
  const podcastId = uuidv4()
  const newRecords: MigratedPodcastRecords = {
    podcast: {
      id: podcastId,
      title: ''
    },
    podcastEpisode: []
  }

  const oldPodcast = oldLibraryItem.media as PodcastOldJsonObject
  const oldPodcastMetadata = oldPodcast.metadata

  const podcastRecord: PodcastCreationAttributes = {
    id: podcastId,
    title: oldPodcastMetadata.title,
    titleIgnorePrefix: getTitleIgnorePrefix(oldPodcastMetadata.title) ?? null,
    author: oldPodcastMetadata.author ?? null,
    releaseDate: oldPodcastMetadata.releaseDate ?? null,
    feedURL: oldPodcastMetadata.feedUrl ?? null,
    imageURL: oldPodcastMetadata.imageUrl ?? null,
    description: oldPodcastMetadata.description ?? null,
    itunesPageURL: oldPodcastMetadata.itunesPageUrl ?? null,
    itunesId: oldPodcastMetadata.itunesId ?? null,
    itunesArtistId: oldPodcastMetadata.itunesArtistId ?? null,
    language: oldPodcastMetadata.language ?? null,
    podcastType: oldPodcastMetadata.type ?? null,
    explicit: !!oldPodcastMetadata.explicit,
    autoDownloadEpisodes: !!oldPodcast.autoDownloadEpisodes,
    autoDownloadSchedule: oldPodcast.autoDownloadSchedule ?? null,
    lastEpisodeCheck: oldPodcast.lastEpisodeCheck ? new Date(oldPodcast.lastEpisodeCheck) : null,
    maxEpisodesToKeep: oldPodcast.maxEpisodesToKeep || 0,
    maxNewEpisodesToDownload: oldPodcast.maxNewEpisodesToDownload || 3,
    createdAt: libraryItem.createdAt ? new Date(libraryItem.createdAt) : undefined,
    updatedAt: libraryItem.updatedAt ? new Date(libraryItem.updatedAt) : undefined,
    coverPath: oldPodcast.coverPath ?? null,
    tags: oldPodcast.tags ?? [],
    genres: oldPodcastMetadata.genres ?? []
  }
  newRecords.podcast = podcastRecord
  oldDbIdMap.podcasts[oldLibraryItem.id] = podcastId

  const oldEpisodes = oldPodcast.episodes || []
  for (const oldEpisode of oldEpisodes) {
    if (oldEpisode.audioFile) {
      oldEpisode.audioFile.index = 1
    }

    const episodeId = uuidv4()
    const podcastEpisodeRecord: PodcastEpisodeCreationAttributes = {
      id: episodeId,
      extraData: {
        oldEpisodeId: oldEpisode.id
      },
      index: oldEpisode.index ?? 0,
      season: oldEpisode.season || null,
      episode: oldEpisode.episode || null,
      episodeType: oldEpisode.episodeType || null,
      title: oldEpisode.title,
      subtitle: oldEpisode.subtitle || null,
      description: oldEpisode.description || null,
      pubDate: oldEpisode.pubDate || null,
      enclosureURL: oldEpisode.enclosure?.url || null,
      enclosureSize: oldEpisode.enclosure?.length ? Number(oldEpisode.enclosure.length) : null,
      enclosureType: oldEpisode.enclosure?.type || null,
      publishedAt: oldEpisode.publishedAt ? new Date(oldEpisode.publishedAt) : null,
      createdAt: oldEpisode.addedAt ? new Date(oldEpisode.addedAt) : undefined,
      updatedAt: oldEpisode.updatedAt ? new Date(oldEpisode.updatedAt) : undefined,
      podcastId,
      audioFile: oldEpisode.audioFile,
      chapters: oldEpisode.chapters || []
    }
    newRecords.podcastEpisode.push(podcastEpisodeRecord)
    oldDbIdMap.podcastEpisodes[oldEpisode.id] = episodeId
  }
  return newRecords
}

function migrateLibraryItems(oldLibraryItems: LibraryItemOldJsonObject[]): MigratedLibraryItemRecords {
  const newRecords: MigratedLibraryItemRecords = {
    book: [],
    podcast: [],
    podcastEpisode: [],
    bookSeries: [],
    bookAuthor: [],
    libraryItem: []
  }

  for (const oldLibraryItem of oldLibraryItems) {
    const folderId = oldLibraryItem.folderId ?? ''
    const libraryFolderId = oldDbIdMap.libraryFolders[folderId]
    if (!libraryFolderId) {
      Logger.error(`[dbMigration] migrateLibraryItems: Old library folder id not found "${oldLibraryItem.folderId}"`)
      continue
    }
    const libraryId = oldDbIdMap.libraries[oldLibraryItem.libraryId]
    if (!libraryId) {
      Logger.error(`[dbMigration] migrateLibraryItems: Old library id not found "${oldLibraryItem.libraryId}"`)
      continue
    }
    if (!['book', 'podcast'].includes(oldLibraryItem.mediaType)) {
      Logger.error(`[dbMigration] migrateLibraryItems: Not migrating library item with mediaType=${oldLibraryItem.mediaType}`)
      continue
    }

    let size = 0
    for (const libraryFile of oldLibraryItem.libraryFiles || []) {
      const fileSize = libraryFile.metadata?.size
      if (fileSize !== null && fileSize !== undefined && !isNaN(Number(fileSize))) {
        size += Number(fileSize)
      }
    }

    const libraryItemId = uuidv4()
    const libraryItemRecord: LibraryItemCreationAttributes = {
      id: libraryItemId,
      ino: oldLibraryItem.ino ?? null,
      path: oldLibraryItem.path,
      relPath: oldLibraryItem.relPath,
      mediaId: '',
      mediaType: oldLibraryItem.mediaType,
      isFile: !!oldLibraryItem.isFile,
      isMissing: !!oldLibraryItem.isMissing,
      isInvalid: !!oldLibraryItem.isInvalid,
      mtime: oldLibraryItem.mtimeMs ? new Date(oldLibraryItem.mtimeMs) : null,
      ctime: oldLibraryItem.ctimeMs ? new Date(oldLibraryItem.ctimeMs) : null,
      birthtime: oldLibraryItem.birthtimeMs ? new Date(oldLibraryItem.birthtimeMs) : null,
      size,
      lastScan: oldLibraryItem.lastScan ? new Date(oldLibraryItem.lastScan) : null,
      lastScanVersion: oldLibraryItem.scanVersion ?? null,
      createdAt: oldLibraryItem.addedAt ? new Date(oldLibraryItem.addedAt) : undefined,
      updatedAt: oldLibraryItem.updatedAt ? new Date(oldLibraryItem.updatedAt) : undefined,
      libraryId,
      libraryFolderId,
      extraData: {
        oldLibraryItemId: oldLibraryItem.id
      },
      libraryFiles: (oldLibraryItem.libraryFiles || []).map((lf: LibraryFileObject) => {
        if (lf.isSupplementary === undefined) lf.isSupplementary = null
        return lf
      })
    }
    oldDbIdMap.libraryItems[oldLibraryItem.id] = libraryItemId
    newRecords.libraryItem.push(libraryItemRecord)

    if (oldLibraryItem.mediaType === 'book') {
      const bookRecords = migrateBook(oldLibraryItem, libraryItemRecord)
      newRecords.book.push(bookRecords.book)
      newRecords.bookAuthor.push(...bookRecords.bookAuthor)
      newRecords.bookSeries.push(...bookRecords.bookSeries)

      libraryItemRecord.mediaId = oldDbIdMap.books[oldLibraryItem.id]
    } else if (oldLibraryItem.mediaType === 'podcast') {
      const podcastRecords = migratePodcast(oldLibraryItem, libraryItemRecord)
      newRecords.podcast.push(podcastRecords.podcast)
      newRecords.podcastEpisode.push(...podcastRecords.podcastEpisode)

      libraryItemRecord.mediaId = oldDbIdMap.podcasts[oldLibraryItem.id]
    }
  }
  return newRecords
}

function migrateLibraries(oldLibraries: LibraryOldJsonObject[]): MigratedLibraryRecords {
  const newRecords: MigratedLibraryRecords = {
    library: [],
    libraryFolder: []
  }
  for (const oldLibrary of oldLibraries) {
    if (!['book', 'podcast'].includes(oldLibrary.mediaType)) {
      Logger.error(`[dbMigration] migrateLibraries: Not migrating library with mediaType=${oldLibrary.mediaType}`)
      continue
    }

    const libraryId = uuidv4()
    const defaultSettings: LibrarySettingsObject = Library.getDefaultLibrarySettingsForMediaType(oldLibrary.mediaType)
    const libraryRecord: LibraryCreationAttributes = {
      id: libraryId,
      extraData: {
        oldLibraryId: oldLibrary.id
      },
      name: oldLibrary.name,
      displayOrder: oldLibrary.displayOrder,
      icon: oldLibrary.icon || null,
      mediaType: oldLibrary.mediaType,
      provider: oldLibrary.provider || null,
      settings: {
        ...defaultSettings,
        ...(oldLibrary.settings || {})
      },
      createdAt: oldLibrary.createdAt ? new Date(oldLibrary.createdAt) : undefined,
      updatedAt: oldLibrary.lastUpdate ? new Date(oldLibrary.lastUpdate) : undefined
    }
    oldDbIdMap.libraries[oldLibrary.id] = libraryId
    newRecords.library.push(libraryRecord)

    for (const oldFolder of oldLibrary.folders || []) {
      const folderId = uuidv4()
      const libraryFolderRecord: LibraryFolderCreationAttributes = {
        id: folderId,
        path: oldFolder.fullPath,
        createdAt: oldFolder.addedAt ? new Date(oldFolder.addedAt) : undefined,
        updatedAt: oldLibrary.lastUpdate ? new Date(oldLibrary.lastUpdate) : undefined,
        libraryId
      }
      oldDbIdMap.libraryFolders[oldFolder.id] = folderId
      newRecords.libraryFolder.push(libraryFolderRecord)
    }
  }
  return newRecords
}

function migrateAuthors(oldAuthors: AuthorOldJsonObject[], oldLibraryItems: LibraryItemOldJsonObject[]): AuthorCreationAttributes[] {
  const newRecords: AuthorCreationAttributes[] = []
  for (const oldAuthor of oldAuthors) {
    const librariesWithThisAuthor = [
      ...new Set(
        oldLibraryItems
          .map((li) => {
            if (li.mediaType !== 'book') return null
            const bookMedia = li.media as BookOldJsonObject
            if (!bookMedia.metadata?.authors?.some((au) => au.id === oldAuthor.id)) return null
            if (!oldDbIdMap.libraries[li.libraryId]) {
              Logger.warn(`[dbMigration] Authors library id ${li.libraryId} was not migrated`)
            }
            return oldDbIdMap.libraries[li.libraryId]
          })
          .filter((lid): lid is string => Boolean(lid))
      )
    ]

    if (!librariesWithThisAuthor.length) {
      Logger.error(`[dbMigration] Author ${oldAuthor.name} was not found in any libraries`)
    }

    for (const libraryId of librariesWithThisAuthor) {
      const authorId = uuidv4()
      const lastFirst = oldAuthor.name ? parseNameString.nameToLastFirst(oldAuthor.name) : ''
      const authorRecord: AuthorCreationAttributes = {
        id: authorId,
        name: oldAuthor.name,
        lastFirst,
        asin: oldAuthor.asin || null,
        description: oldAuthor.description || null,
        imagePath: oldAuthor.imagePath || null,
        createdAt: oldAuthor.addedAt ? new Date(oldAuthor.addedAt) : new Date(),
        updatedAt: oldAuthor.updatedAt ? new Date(oldAuthor.updatedAt) : new Date(),
        libraryId
      }
      if (!oldDbIdMap.authors[libraryId]) oldDbIdMap.authors[libraryId] = {}
      oldDbIdMap.authors[libraryId][oldAuthor.id] = authorId
      newRecords.push(authorRecord)
    }
  }
  return newRecords
}

function migrateSeries(oldSerieses: SeriesOldJsonObject[], oldLibraryItems: LibraryItemOldJsonObject[]): SeriesCreationAttributes[] {
  const newRecords: SeriesCreationAttributes[] = []
  for (const oldSeries of oldSerieses) {
    const librariesWithThisSeries = [
      ...new Set(
        oldLibraryItems
          .map((li) => {
            if (li.mediaType !== 'book') return null
            const bookMedia = li.media as BookOldJsonObject
            if (!bookMedia.metadata?.series?.some((se) => se.id === oldSeries.id)) return null
            return oldDbIdMap.libraries[li.libraryId]
          })
          .filter((lid): lid is string => Boolean(lid))
      )
    ]

    if (!librariesWithThisSeries.length) {
      Logger.error(`[dbMigration] Series ${oldSeries.name} was not found in any libraries`)
    }

    for (const libraryId of librariesWithThisSeries) {
      const seriesId = uuidv4()
      const seriesRecord: SeriesCreationAttributes = {
        id: seriesId,
        name: oldSeries.name,
        nameIgnorePrefix: getTitleIgnorePrefix(oldSeries.name) ?? null,
        description: oldSeries.description || null,
        createdAt: oldSeries.addedAt ? new Date(oldSeries.addedAt) : new Date(),
        updatedAt: oldSeries.updatedAt ? new Date(oldSeries.updatedAt) : new Date(),
        libraryId
      }
      if (!oldDbIdMap.series[libraryId]) oldDbIdMap.series[libraryId] = {}
      oldDbIdMap.series[libraryId][oldSeries.id] = seriesId
      newRecords.push(seriesRecord)
    }
  }
  return newRecords
}

function migrateUsers(oldUsers: UserOldJsonObject[]): MigratedUserRecords {
  const newRecords: MigratedUserRecords = {
    user: [],
    mediaProgress: []
  }
  for (const oldUser of oldUsers) {
    const librariesAccessible = (oldUser.librariesAccessible || [])
      .map((lid) => oldDbIdMap.libraries[lid])
      .filter((li): li is string => Boolean(li))

    const bookmarks = (oldUser.bookmarks || [])
      .map((bm: AudioBookmarkObject) => {
        bm.libraryItemId = oldDbIdMap.libraryItems[bm.libraryItemId]
        return bm
      })
      .filter((bm) => bm.libraryItemId)

    const seriesHideFromContinueListening = (oldUser.seriesHideFromContinueListening || [])
      .map((oldSeriesId) => {
        for (const libraryId in oldDbIdMap.series) {
          if (oldDbIdMap.series[libraryId]?.[oldSeriesId]) {
            return oldDbIdMap.series[libraryId][oldSeriesId]
          }
        }
        return null
      })
      .filter((se): se is string => Boolean(se))

    const userId = uuidv4()
    const userRecord: UserCreationAttributes = {
      id: userId,
      username: oldUser.username,
      pash: oldUser.pash || null,
      type: oldUser.type || 'user',
      token: oldUser.token || null,
      isActive: !!oldUser.isActive,
      lastSeen: oldUser.lastSeen ? new Date(oldUser.lastSeen) : null,
      extraData: {
        seriesHideFromContinueListening,
        oldUserId: oldUser.id
      },
      createdAt: oldUser.createdAt ? new Date(oldUser.createdAt) : new Date(),
      permissions: {
        ...(oldUser.permissions || {}),
        librariesAccessible,
        itemTagsSelected: oldUser.itemTagsSelected || []
      },
      bookmarks
    }
    oldDbIdMap.users[oldUser.id] = userId
    newRecords.user.push(userRecord)

    for (const oldMediaProgress of oldUser.mediaProgress || []) {
      let mediaItemType = 'book'
      let mediaItemId: string | null = null
      if (oldMediaProgress.episodeId) {
        mediaItemType = 'podcastEpisode'
        mediaItemId = oldDbIdMap.podcastEpisodes[oldMediaProgress.episodeId] || null
      } else if (oldMediaProgress.libraryItemId) {
        mediaItemId = oldDbIdMap.books[oldMediaProgress.libraryItemId] || null
      }

      if (!mediaItemId) {
        Logger.warn(`[dbMigration] migrateUsers: Unable to find media item for media progress "${oldMediaProgress.id}"`)
        continue
      }

      const libraryItemId = oldMediaProgress.libraryItemId ? oldDbIdMap.libraryItems[oldMediaProgress.libraryItemId] || null : null

      const mediaProgressId = uuidv4()
      const mediaProgressRecord: MediaProgressCreationAttributes = {
        id: mediaProgressId,
        mediaItemId,
        mediaItemType,
        duration: oldMediaProgress.duration,
        currentTime: oldMediaProgress.currentTime,
        ebookLocation: oldMediaProgress.ebookLocation || null,
        ebookProgress: oldMediaProgress.ebookProgress || null,
        isFinished: !!oldMediaProgress.isFinished,
        hideFromContinueListening: !!oldMediaProgress.hideFromContinueListening,
        finishedAt: oldMediaProgress.finishedAt ? new Date(oldMediaProgress.finishedAt) : null,
        createdAt: oldMediaProgress.startedAt
          ? new Date(oldMediaProgress.startedAt)
          : oldMediaProgress.lastUpdate
            ? new Date(oldMediaProgress.lastUpdate)
            : new Date(),
        updatedAt: oldMediaProgress.lastUpdate ? new Date(oldMediaProgress.lastUpdate) : new Date(),
        userId,
        extraData: {
          libraryItemId,
          progress: oldMediaProgress.progress
        }
      }
      newRecords.mediaProgress.push(mediaProgressRecord)
    }
  }
  return newRecords
}

function migrateSessions(oldSessions: PlaybackSessionOldJsonObject[]): MigratedSessionRecords {
  const newRecords: MigratedSessionRecords = {
    device: [],
    playbackSession: []
  }

  for (const oldSession of oldSessions) {
    const userId = oldDbIdMap.users[oldSession.userId]
    if (!userId) {
      Logger.info(`[dbMigration] Not migrating playback session ${oldSession.id} because user was not found`)
      continue
    }

    let deviceId: string | null = null
    const oldDeviceInfo: OldDeviceInfoRecord | null = oldSession.deviceInfo
    if (oldDeviceInfo) {
      const deviceDeviceId = getDeviceInfoString(oldDeviceInfo, userId)
      if (deviceDeviceId) {
        deviceId = oldDbIdMap.devices[deviceDeviceId] || null
        if (!deviceId) {
          let clientName = 'Abs Other'
          let clientVersion: string | null = null
          let deviceName: string | null = null
          let deviceVersion = oldDeviceInfo.browserVersion || null
          const extraData: { [key: string]: string } = {}

          if (oldDeviceInfo.sdkVersion) {
            clientName = 'Abs Android'
            clientVersion = oldDeviceInfo.clientVersion || null
            deviceName = `${oldDeviceInfo.manufacturer || ''} ${oldDeviceInfo.model || ''}`.trim() || null
            deviceVersion = oldDeviceInfo.sdkVersion
          } else if (oldDeviceInfo.model) {
            clientName = 'Abs iOS'
            clientVersion = oldDeviceInfo.clientVersion || null
            deviceName = `${oldDeviceInfo.manufacturer || ''} ${oldDeviceInfo.model || ''}`.trim() || null
          } else if (oldDeviceInfo.osName && oldDeviceInfo.browserName) {
            clientName = 'Abs Web'
            clientVersion = oldDeviceInfo.serverVersion || null
            deviceName = `${oldDeviceInfo.osName} ${oldDeviceInfo.osVersion || 'N/A'} ${oldDeviceInfo.browserName}`
          }

          if (oldDeviceInfo.manufacturer) extraData.manufacturer = oldDeviceInfo.manufacturer
          if (oldDeviceInfo.model) extraData.model = oldDeviceInfo.model
          if (oldDeviceInfo.osName) extraData.osName = oldDeviceInfo.osName
          if (oldDeviceInfo.osVersion) extraData.osVersion = oldDeviceInfo.osVersion
          if (oldDeviceInfo.browserName) extraData.browserName = oldDeviceInfo.browserName

          const id = uuidv4()
          const deviceRecord: DeviceCreationAttributes = {
            id,
            deviceId: deviceDeviceId,
            clientName,
            clientVersion,
            ipAddress: oldDeviceInfo.ipAddress || null,
            deviceName,
            deviceVersion,
            userId,
            extraData
          }
          deviceId = id
          newRecords.device.push(deviceRecord)
          oldDbIdMap.devices[deviceDeviceId] = id
        }
      }
    }

    let mediaItemId: string | null = null
    let mediaItemType = 'book'
    if (oldSession.mediaType === 'podcast') {
      mediaItemId = (oldSession.episodeId ? oldDbIdMap.podcastEpisodes[oldSession.episodeId] : null) || null
      mediaItemType = 'podcastEpisode'
    } else {
      mediaItemId = (oldSession.libraryItemId ? oldDbIdMap.books[oldSession.libraryItemId] : null) || null
    }

    const libraryItemId = oldSession.libraryItemId ? oldDbIdMap.libraryItems[oldSession.libraryItemId] || null : null

    const sessionId = uuidv4()
    const sessionRecord: PlaybackSessionCreationAttributes = {
      id: sessionId,
      mediaItemId: mediaItemId ?? '',
      mediaItemType,
      libraryId: (oldSession.libraryId ? oldDbIdMap.libraries[oldSession.libraryId] : null) || null,
      displayTitle: oldSession.displayTitle || null,
      displayAuthor: oldSession.displayAuthor || null,
      duration: oldSession.duration ?? 0,
      playMethod: oldSession.playMethod ?? 0,
      mediaPlayer: oldSession.mediaPlayer || null,
      startTime: oldSession.startTime ?? 0,
      currentTime: oldSession.currentTime ?? 0,
      serverVersion: oldDeviceInfo?.serverVersion || null,
      createdAt: oldSession.startedAt ? new Date(oldSession.startedAt) : new Date(),
      updatedAt: oldSession.updatedAt ? new Date(oldSession.updatedAt) : new Date(),
      userId,
      deviceId,
      timeListening: oldSession.timeListening ?? 0,
      coverPath: oldSession.coverPath || null,
      mediaMetadata: oldSession.mediaMetadata || null,
      date: oldSession.date || null,
      dayOfWeek: oldSession.dayOfWeek || null,
      extraData: {
        libraryItemId
      }
    }
    newRecords.playbackSession.push(sessionRecord)
  }
  return newRecords
}

function migrateCollections(oldCollections: CollectionOldJsonObject[]): MigratedCollectionRecords {
  const newRecords: MigratedCollectionRecords = {
    collection: [],
    collectionBook: []
  }
  for (const oldCollection of oldCollections) {
    const libraryId = oldDbIdMap.libraries[oldCollection.libraryId]
    if (!libraryId) {
      Logger.warn(`[dbMigration] migrateCollections: Library not found for collection "${oldCollection.name}" (id:${oldCollection.libraryId})`)
      continue
    }

    const bookIds = (oldCollection.books || []).map((lid) => oldDbIdMap.books[lid]).filter((bid): bid is string => Boolean(bid))
    if (!bookIds.length) {
      Logger.warn(`[dbMigration] migrateCollections: Collection "${oldCollection.name}" has no books`)
      continue
    }

    const collectionId = uuidv4()
    const createdAt = oldCollection.createdAt ? new Date(oldCollection.createdAt) : new Date()
    const collectionRecord: CollectionCreationAttributes = {
      id: collectionId,
      name: oldCollection.name,
      description: oldCollection.description || null,
      createdAt,
      updatedAt: oldCollection.lastUpdate ? new Date(oldCollection.lastUpdate) : new Date(),
      libraryId
    }
    oldDbIdMap.collections[oldCollection.id] = collectionId
    newRecords.collection.push(collectionRecord)

    let order = 1
    for (const bookId of bookIds) {
      const collectionBookRecord: CollectionBookCreationAttributes = {
        id: uuidv4(),
        createdAt,
        bookId,
        collectionId,
        order: order++
      }
      newRecords.collectionBook.push(collectionBookRecord)
    }
  }
  return newRecords
}

function migratePlaylists(oldPlaylists: PlaylistOldJsonObject[]): MigratedPlaylistRecords {
  const newRecords: MigratedPlaylistRecords = {
    playlist: [],
    playlistMediaItem: []
  }
  for (const oldPlaylist of oldPlaylists) {
    const libraryId = oldDbIdMap.libraries[oldPlaylist.libraryId]
    if (!libraryId) {
      Logger.warn(`[dbMigration] migratePlaylists: Library not found for playlist "${oldPlaylist.name}" (id:${oldPlaylist.libraryId})`)
      continue
    }

    const userId = oldDbIdMap.users[oldPlaylist.userId]
    if (!userId) {
      Logger.warn(`[dbMigration] migratePlaylists: User not found for playlist "${oldPlaylist.name}" (id:${oldPlaylist.userId})`)
      continue
    }

    let mediaItemType = 'book'
    const mediaItemIds: string[] = []
    for (const itemObj of oldPlaylist.items || []) {
      if (itemObj.episodeId) {
        mediaItemType = 'podcastEpisode'
        const epId = oldDbIdMap.podcastEpisodes[itemObj.episodeId]
        if (epId) mediaItemIds.push(epId)
      } else if (itemObj.libraryItemId && oldDbIdMap.books[itemObj.libraryItemId]) {
        mediaItemIds.push(oldDbIdMap.books[itemObj.libraryItemId])
      }
    }

    if (!mediaItemIds.length) {
      Logger.warn(`[dbMigration] migratePlaylists: Playlist "${oldPlaylist.name}" has no items`)
      continue
    }

    const playlistId = uuidv4()
    const createdAt = oldPlaylist.createdAt ? new Date(oldPlaylist.createdAt) : new Date()
    const playlistRecord: PlaylistCreationAttributes = {
      id: playlistId,
      name: oldPlaylist.name,
      description: oldPlaylist.description || null,
      createdAt,
      updatedAt: oldPlaylist.lastUpdate ? new Date(oldPlaylist.lastUpdate) : new Date(),
      userId,
      libraryId
    }
    newRecords.playlist.push(playlistRecord)

    let order = 1
    for (const mediaItemId of mediaItemIds) {
      const playlistItemRecord: PlaylistMediaItemCreationAttributes = {
        id: uuidv4(),
        mediaItemId,
        mediaItemType,
        createdAt,
        playlistId,
        order: order++
      }
      newRecords.playlistMediaItem.push(playlistItemRecord)
    }
  }
  return newRecords
}

function migrateFeeds(oldFeeds: FeedOldJsonObject[]): MigratedFeedRecords {
  const newRecords: MigratedFeedRecords = {
    feed: [],
    feedEpisode: []
  }
  for (const oldFeed of oldFeeds) {
    if (!oldFeed.episodes?.length) continue

    let entityId: string | null = null
    if (oldFeed.entityType === 'collection') {
      entityId = (oldFeed.entityId ? oldDbIdMap.collections[oldFeed.entityId] : null) || null
    } else if (oldFeed.entityType === 'libraryItem') {
      entityId = (oldFeed.entityId ? oldDbIdMap.libraryItems[oldFeed.entityId] : null) || null
    } else if (oldFeed.entityType === 'series' && oldFeed.entityId) {
      for (const libraryId in oldDbIdMap.series) {
        if (oldDbIdMap.series[libraryId]?.[oldFeed.entityId]) {
          entityId = oldDbIdMap.series[libraryId][oldFeed.entityId]
          break
        }
      }
    }

    if (!entityId) {
      Logger.warn(`[dbMigration] migrateFeeds: Entity not found for feed "${oldFeed.entityType}" (id:${oldFeed.entityId})`)
      continue
    }

    const userId = oldFeed.userId ? oldDbIdMap.users[oldFeed.userId] : null
    if (!userId) {
      Logger.warn(`[dbMigration] migrateFeeds: User not found for feed (id:${oldFeed.userId})`)
      continue
    }

    const oldFeedMeta = oldFeed.meta
    const feedId = uuidv4()

    const feedRecord: FeedCreationAttributes = {
      id: feedId,
      slug: oldFeed.slug,
      entityType: oldFeed.entityType,
      entityId,
      entityUpdatedAt: oldFeed.entityUpdatedAt ? new Date(oldFeed.entityUpdatedAt) : null,
      serverAddress: oldFeed.serverAddress || '',
      feedURL: oldFeed.feedUrl || '',
      coverPath: oldFeed.coverPath || null,
      imageURL: oldFeedMeta.imageUrl || null,
      siteURL: oldFeedMeta.link || null,
      title: oldFeedMeta.title,
      description: oldFeedMeta.description || null,
      author: oldFeedMeta.author || null,
      podcastType: oldFeedMeta.type || null,
      language: oldFeedMeta.language || null,
      ownerName: oldFeedMeta.ownerName || null,
      ownerEmail: oldFeedMeta.ownerEmail || null,
      explicit: !!oldFeedMeta.explicit,
      preventIndexing: !!oldFeedMeta.preventIndexing,
      createdAt: oldFeed.createdAt ? new Date(oldFeed.createdAt) : new Date(),
      updatedAt: oldFeed.updatedAt ? new Date(oldFeed.updatedAt) : new Date(),
      userId
    }
    newRecords.feed.push(feedRecord)

    for (const oldFeedEpisode of oldFeed.episodes) {
      const feedEpisodeRecord: FeedEpisodeCreationAttributes = {
        id: uuidv4(),
        title: oldFeedEpisode.title,
        author: oldFeedEpisode.author || null,
        description: oldFeedEpisode.description || null,
        siteURL: oldFeedEpisode.link || null,
        enclosureURL: oldFeedEpisode.enclosure?.url || null,
        enclosureType: oldFeedEpisode.enclosure?.type || null,
        enclosureSize: oldFeedEpisode.enclosure?.size ? Number(oldFeedEpisode.enclosure.size) : null,
        pubDate: oldFeedEpisode.pubDate || null,
        season: oldFeedEpisode.season || null,
        episode: oldFeedEpisode.episode || null,
        episodeType: oldFeedEpisode.episodeType || null,
        duration: oldFeedEpisode.duration || null,
        filePath: oldFeedEpisode.fullPath || null,
        explicit: !!oldFeedEpisode.explicit,
        createdAt: oldFeed.createdAt ? new Date(oldFeed.createdAt) : new Date(),
        updatedAt: oldFeed.updatedAt ? new Date(oldFeed.updatedAt) : new Date(),
        feedId
      }
      newRecords.feedEpisode.push(feedEpisodeRecord)
    }
  }
  return newRecords
}

function migrateSettings(oldSettings: SettingValueObject[]): SettingCreationAttributes[] {
  const newRecords: SettingCreationAttributes[] = []
  const serverSettings = oldSettings.find((s) => s.id === 'server-settings')
  const notificationSettings = oldSettings.find((s) => s.id === 'notification-settings')
  const emailSettings = oldSettings.find((s) => s.id === 'email-settings')

  if (serverSettings) {
    newRecords.push({
      key: 'server-settings',
      value: serverSettings
    })

    const sortingPrefixes = (serverSettings as { sortingPrefixes?: string[] }).sortingPrefixes
    if (sortingPrefixes?.length) {
      prefixesToIgnore = sortingPrefixes
    }
  }

  if (notificationSettings) {
    newRecords.push({
      key: 'notification-settings',
      value: notificationSettings
    })
  }

  if (emailSettings) {
    newRecords.push({
      key: 'email-settings',
      value: emailSettings
    })
  }
  return newRecords
}

async function handleMigrateLibraries(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldLibraries = await oldDbFiles.loadOldData<LibraryOldJsonObject>('libraries')
  const newLibraryRecords = migrateLibraries(oldLibraries)
  if (newLibraryRecords.library.length) {
    Logger.info(`[dbMigration] Inserting ${newLibraryRecords.library.length} library rows`)
    await databaseModels.library.bulkCreate(newLibraryRecords.library)
  }
  if (newLibraryRecords.libraryFolder.length) {
    Logger.info(`[dbMigration] Inserting ${newLibraryRecords.libraryFolder.length} libraryFolder rows`)
    await databaseModels.libraryFolder.bulkCreate(newLibraryRecords.libraryFolder)
  }
}

async function handleMigrateSettings(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldSettings = await oldDbFiles.loadOldData<SettingValueObject>('settings')
  const newSettings = migrateSettings(oldSettings)
  Logger.info(`[dbMigration] Inserting ${newSettings.length} setting rows`)
  await databaseModels.setting.bulkCreate(newSettings)
}

async function handleMigrateAuthors(databaseModels: MigrationDatabaseModels, oldLibraryItems: LibraryItemOldJsonObject[]): Promise<void> {
  const oldAuthors = await oldDbFiles.loadOldData<AuthorOldJsonObject>('authors')
  const newAuthors = migrateAuthors(oldAuthors, oldLibraryItems)
  Logger.info(`[dbMigration] Inserting ${newAuthors.length} author rows`)
  await databaseModels.author.bulkCreate(newAuthors)
}

async function handleMigrateSeries(databaseModels: MigrationDatabaseModels, oldLibraryItems: LibraryItemOldJsonObject[]): Promise<void> {
  const oldSeries = await oldDbFiles.loadOldData<SeriesOldJsonObject>('series')
  const newSeries = migrateSeries(oldSeries, oldLibraryItems)
  Logger.info(`[dbMigration] Inserting ${newSeries.length} series rows`)
  await databaseModels.series.bulkCreate(newSeries)
}

async function handleMigrateLibraryItems(databaseModels: MigrationDatabaseModels, oldLibraryItems: LibraryItemOldJsonObject[]): Promise<void> {
  const newItemsBooksPodcasts = migrateLibraryItems(oldLibraryItems)
  if (newItemsBooksPodcasts.libraryItem.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.libraryItem.length} libraryItem rows`)
    await databaseModels.libraryItem.bulkCreate(newItemsBooksPodcasts.libraryItem)
  }
  if (newItemsBooksPodcasts.book.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.book.length} book rows`)
    await databaseModels.book.bulkCreate(newItemsBooksPodcasts.book)
  }
  if (newItemsBooksPodcasts.podcast.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.podcast.length} podcast rows`)
    await databaseModels.podcast.bulkCreate(newItemsBooksPodcasts.podcast)
  }
  if (newItemsBooksPodcasts.podcastEpisode.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.podcastEpisode.length} podcastEpisode rows`)
    await databaseModels.podcastEpisode.bulkCreate(newItemsBooksPodcasts.podcastEpisode)
  }
  if (newItemsBooksPodcasts.bookSeries.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.bookSeries.length} bookSeries rows`)
    await databaseModels.bookSeries.bulkCreate(newItemsBooksPodcasts.bookSeries)
  }
  if (newItemsBooksPodcasts.bookAuthor.length) {
    Logger.info(`[dbMigration] Inserting ${newItemsBooksPodcasts.bookAuthor.length} bookAuthor rows`)
    await databaseModels.bookAuthor.bulkCreate(newItemsBooksPodcasts.bookAuthor)
  }
}

async function handleMigrateAuthorsSeriesAndLibraryItems(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldLibraryItems = await oldDbFiles.loadOldData<LibraryItemOldJsonObject>('libraryItems')
  await handleMigrateAuthors(databaseModels, oldLibraryItems)
  await handleMigrateSeries(databaseModels, oldLibraryItems)

  const numChunks = Math.ceil(oldLibraryItems.length / 1000)
  for (let i = 0; i < numChunks; i++) {
    const start = i * 1000
    await handleMigrateLibraryItems(databaseModels, oldLibraryItems.slice(start, start + 1000))
  }
}

async function handleMigrateUsers(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldUsers = await oldDbFiles.loadOldData<UserOldJsonObject>('users')
  const newUserRecords = migrateUsers(oldUsers)
  if (newUserRecords.user.length) {
    Logger.info(`[dbMigration] Inserting ${newUserRecords.user.length} user rows`)
    await databaseModels.user.bulkCreate(newUserRecords.user)
  }
  if (newUserRecords.mediaProgress.length) {
    Logger.info(`[dbMigration] Inserting ${newUserRecords.mediaProgress.length} mediaProgress rows`)
    await databaseModels.mediaProgress.bulkCreate(newUserRecords.mediaProgress)
  }
}

async function handleMigrateSessions(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldSessions = await oldDbFiles.loadOldData<PlaybackSessionOldJsonObject>('sessions')
  const chunkSize = 1000
  const numChunks = Math.ceil(oldSessions.length / chunkSize)

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize
    const newSessionRecords = migrateSessions(oldSessions.slice(start, start + chunkSize))
    if (newSessionRecords.device.length) {
      Logger.info(`[dbMigration] Inserting ${newSessionRecords.device.length} device rows`)
      await databaseModels.device.bulkCreate(newSessionRecords.device)
    }
    if (newSessionRecords.playbackSession.length) {
      Logger.info(`[dbMigration] Inserting ${newSessionRecords.playbackSession.length} playbackSession rows`)
      await databaseModels.playbackSession.bulkCreate(newSessionRecords.playbackSession)
    }
  }
}

async function handleMigrateCollections(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldCollections = await oldDbFiles.loadOldData<CollectionOldJsonObject>('collections')
  const newCollectionRecords = migrateCollections(oldCollections)
  if (newCollectionRecords.collection.length) {
    Logger.info(`[dbMigration] Inserting ${newCollectionRecords.collection.length} collection rows`)
    await databaseModels.collection.bulkCreate(newCollectionRecords.collection)
  }
  if (newCollectionRecords.collectionBook.length) {
    Logger.info(`[dbMigration] Inserting ${newCollectionRecords.collectionBook.length} collectionBook rows`)
    await databaseModels.collectionBook.bulkCreate(newCollectionRecords.collectionBook)
  }
}

async function handleMigratePlaylists(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldPlaylists = await oldDbFiles.loadOldData<PlaylistOldJsonObject>('playlists')
  const newPlaylistRecords = migratePlaylists(oldPlaylists)
  if (newPlaylistRecords.playlist.length) {
    Logger.info(`[dbMigration] Inserting ${newPlaylistRecords.playlist.length} playlist rows`)
    await databaseModels.playlist.bulkCreate(newPlaylistRecords.playlist)
  }
  if (newPlaylistRecords.playlistMediaItem.length) {
    Logger.info(`[dbMigration] Inserting ${newPlaylistRecords.playlistMediaItem.length} playlistMediaItem rows`)
    await databaseModels.playlistMediaItem.bulkCreate(newPlaylistRecords.playlistMediaItem)
  }
}

async function handleMigrateFeeds(databaseModels: MigrationDatabaseModels): Promise<void> {
  const oldFeeds = await oldDbFiles.loadOldData<FeedOldJsonObject>('feeds')
  const newFeedRecords = migrateFeeds(oldFeeds)
  if (newFeedRecords.feed.length) {
    Logger.info(`[dbMigration] Inserting ${newFeedRecords.feed.length} feed rows`)
    await databaseModels.feed.bulkCreate(newFeedRecords.feed)
  }
  if (newFeedRecords.feedEpisode.length) {
    Logger.info(`[dbMigration] Inserting ${newFeedRecords.feedEpisode.length} feedEpisode rows`)
    await databaseModels.feedEpisode.bulkCreate(newFeedRecords.feedEpisode)
  }
}

export async function migrate(databaseModels: MigrationDatabaseModels): Promise<void> {
  Logger.info(`[dbMigration] Starting migration`)

  const start = Date.now()

  await handleMigrateLibraries(databaseModels)
  await handleMigrateSettings(databaseModels)
  await handleMigrateAuthorsSeriesAndLibraryItems(databaseModels)
  await handleMigrateUsers(databaseModels)
  await handleMigrateSessions(databaseModels)
  await handleMigrateCollections(databaseModels)
  await handleMigratePlaylists(databaseModels)
  await handleMigrateFeeds(databaseModels)

  try {
    const cachePath = Path.join(global.MetadataPath, 'cache')
    await fs.emptyDir(Path.join(cachePath, 'covers'))
    await fs.emptyDir(Path.join(cachePath, 'images'))
  } catch (error) {
    Logger.error(`[dbMigration] Failed to purge author/cover image cache`, error)
  }

  await oldDbFiles.zipWrapOldDb()

  const elapsed = Date.now() - start
  Logger.info(`[dbMigration] Migration complete. Elapsed ${(elapsed / 1000).toFixed(2)}s`)
}

export async function checkShouldMigrate(): Promise<boolean> {
  if (await oldDbFiles.checkHasOldDb()) return true
  return oldDbFiles.checkHasOldDbZip()
}

async function migrationPatchNewColumns(queryInterface: QueryInterface): Promise<boolean> {
  try {
    await queryInterface.sequelize.transaction((t: Transaction) => {
      return Promise.all([
        queryInterface.addColumn(
          'libraryItems',
          'extraData',
          {
            type: DataTypes.JSON
          },
          { transaction: t }
        ),
        queryInterface.addColumn(
          'podcastEpisodes',
          'extraData',
          {
            type: DataTypes.JSON
          },
          { transaction: t }
        ),
        queryInterface.addColumn(
          'libraries',
          'extraData',
          {
            type: DataTypes.JSON
          },
          { transaction: t }
        )
      ])
    })
    return true
  } catch (error) {
    Logger.error(`[dbMigration] Migration from 2.3.0+ column creation failed`, error)
    return false
  }
}

async function handleOldLibraryItems(ctx: DatabaseType): Promise<void> {
  const oldLibraryItems = await oldDbFiles.loadOldData<LibraryItemOldJsonObject>('libraryItems')
  const libraryItems = await ctx.libraryItemModel.findAllExpandedWhere()

  const bulkUpdateItems: LibraryItemCreationAttributes[] = []
  const bulkUpdateEpisodes: PodcastEpisodeCreationAttributes[] = []

  for (const libraryItem of libraryItems) {
    const matchingOldLibraryItem = oldLibraryItems.find((oli) => oli.ino === libraryItem.ino)
    if (matchingOldLibraryItem) {
      oldDbIdMap.libraryItems[matchingOldLibraryItem.id] = libraryItem.id

      bulkUpdateItems.push({
        id: libraryItem.id,
        path: libraryItem.path,
        relPath: libraryItem.relPath,
        mediaId: libraryItem.mediaId,
        mediaType: libraryItem.mediaType,
        libraryId: libraryItem.libraryId,
        extraData: {
          oldLibraryItemId: matchingOldLibraryItem.id
        }
      })

      const oldEpisodes = (matchingOldLibraryItem.media as PodcastOldJsonObject)?.episodes
      const podcastEpisodes = (libraryItem.media as { podcastEpisodes?: PodcastEpisode[] })?.podcastEpisodes
      if (podcastEpisodes?.length && oldEpisodes?.length) {
        for (const podcastEpisode of podcastEpisodes) {
          const matchingOldPodcastEpisode = oldEpisodes.find(
            (oep) => oep.audioFile?.ino && oep.audioFile.ino === podcastEpisode.audioFile?.ino
          )
          if (matchingOldPodcastEpisode) {
            oldDbIdMap.podcastEpisodes[matchingOldPodcastEpisode.id] = podcastEpisode.id

            bulkUpdateEpisodes.push({
              id: podcastEpisode.id,
              podcastId: podcastEpisode.podcastId,
              title: podcastEpisode.title,
              extraData: {
                oldEpisodeId: matchingOldPodcastEpisode.id
              }
            })
          }
        }
      }
    }
  }

  if (bulkUpdateEpisodes.length) {
    await ctx.podcastEpisodeModel.bulkCreate(bulkUpdateEpisodes, {
      updateOnDuplicate: ['extraData']
    })
  }

  if (bulkUpdateItems.length) {
    await ctx.libraryItemModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['extraData']
    })
  }

  Logger.info(`[dbMigration] Migration 2.3.0+: Updated ${bulkUpdateItems.length} library items & ${bulkUpdateEpisodes.length} episodes`)
}

async function handleOldLibraries(ctx: DatabaseType): Promise<void> {
  const oldLibraries = await oldDbFiles.loadOldData<LibraryOldJsonObject>('libraries')
  const libraries = await ctx.libraryModel.getAllWithFolders()

  let librariesUpdated = 0
  for (const library of libraries) {
    const matchingOldLibrary = oldLibraries.find((ol) => {
      if (ol.name !== library.name) return false
      const folderPaths = ol.folders?.map((f) => f.fullPath) || []
      const libraryFolderPaths = (library.libraryFolders || []).map((f: LibraryFolder) => f.path)
      return folderPaths.join(',') === libraryFolderPaths.join(',')
    })

    if (matchingOldLibrary) {
      const newExtraData = { ...(library.extraData || {}) }
      newExtraData.oldLibraryId = matchingOldLibrary.id
      library.extraData = newExtraData
      library.changed('extraData', true)

      oldDbIdMap.libraries[matchingOldLibrary.id] = library.id
      await library.save()
      librariesUpdated++
    }
  }
  Logger.info(`[dbMigration] Migration 2.3.0+: Updated ${librariesUpdated} libraries`)
}

async function handleOldUsers(ctx: DatabaseType): Promise<void> {
  const usersNew = await ctx.userModel.findAll({
    include: ctx.mediaProgressModel
  })

  let usersUpdated = 0
  for (const user of usersNew) {
    let hasUpdates = false
    if (user.bookmarks?.length) {
      user.bookmarks = user.bookmarks
        .map((bm: AudioBookmarkObject) => {
          if (!bm.libraryItemId.startsWith('li_')) return bm
          const mappedId = oldDbIdMap.libraryItems[bm.libraryItemId]
          if (mappedId) {
            bm.libraryItemId = mappedId
            hasUpdates = true
            return bm
          }
          return null
        })
        .filter((bm): bm is AudioBookmarkObject => Boolean(bm))
      if (hasUpdates) {
        user.changed('bookmarks', true)
      }
    }

    const librariesAccessible = user.permissions?.librariesAccessible || []
    if (librariesAccessible.length) {
      const userPermissions = { ...(user.permissions || {}) }
      userPermissions.librariesAccessible = librariesAccessible
        .map((lid: string) => {
          if (!lid.startsWith('lib_') && lid !== 'main') return lid
          hasUpdates = true
          return oldDbIdMap.libraries[lid]
        })
        .filter((lid): lid is string => Boolean(lid))
      user.permissions = userPermissions
      if (hasUpdates) {
        user.changed('permissions', true)
      }
    }

    const seriesHideFromContinueListening = user.extraData?.seriesHideFromContinueListening || []
    if (seriesHideFromContinueListening.length) {
      const userExtraData = { ...(user.extraData || {}) }
      userExtraData.seriesHideFromContinueListening = seriesHideFromContinueListening
        .map((seriesId: string) => {
          if (seriesId.startsWith('se_')) {
            hasUpdates = true
            return null
          }
          return seriesId
        })
        .filter((se): se is string => Boolean(se))
      user.extraData = userExtraData
      if (hasUpdates) {
        user.changed('extraData', true)
      }
    }

    if (hasUpdates) {
      await user.save()
      usersUpdated++
    }
  }
  Logger.info(`[dbMigration] Migration 2.3.0+: Updated ${usersUpdated} users`)
}

export async function migrationPatch(ctx: DatabaseType): Promise<void> {
  if (!ctx.sequelize) return
  const queryInterface = ctx.sequelize.getQueryInterface()
  const librariesTableDescription = await queryInterface.describeTable('libraries')

  if (librariesTableDescription?.extraData) {
    Logger.info(`[dbMigration] Migration patch 2.3.0+ - extraData columns already on model`)
  } else {
    const migrationResult = await migrationPatchNewColumns(queryInterface)
    if (migrationResult === false) {
      return
    }
  }

  const oldDbPath = Path.join(global.ConfigPath, 'oldDb.zip')
  if (!(await fs.pathExists(oldDbPath))) {
    Logger.info(`[dbMigration] Migration patch 2.3.0+ unnecessary - no oldDb.zip found`)
    return
  }

  const migrationStart = Date.now()
  Logger.info(`[dbMigration] Applying migration patch from 2.3.0+`)

  if (!(await oldDbFiles.checkExtractItemsUsersAndLibraries())) {
    return
  }

  await handleOldLibraryItems(ctx)
  await handleOldLibraries(ctx)
  await handleOldUsers(ctx)

  await oldDbFiles.removeOldItemsUsersAndLibrariesFolders()

  const elapsed = Date.now() - migrationStart
  Logger.info(`[dbMigration] Migration patch 2.3.0+ finished. Elapsed ${(elapsed / 1000).toFixed(2)}s`)
}

async function migrationPatch2LibraryItems(ctx: DatabaseType, offset = 0): Promise<void> {
  const libraryItems = await ctx.libraryItemModel.findAll({
    limit: 500,
    offset
  })
  if (!libraryItems.length) return

  const bulkUpdateItems: LibraryItemCreationAttributes[] = []
  for (const libraryItem of libraryItems) {
    if (libraryItem.libraryFiles?.length) {
      let size = 0
      for (const lf of libraryItem.libraryFiles) {
        const lfSize = lf.metadata?.size
        if (lfSize !== null && lfSize !== undefined && !isNaN(Number(lfSize))) {
          size += Number(lfSize)
        }
      }
      bulkUpdateItems.push({
        id: libraryItem.id,
        path: libraryItem.path,
        relPath: libraryItem.relPath,
        mediaId: libraryItem.mediaId,
        mediaType: libraryItem.mediaType,
        libraryId: libraryItem.libraryId,
        size
      })
    }
  }

  if (bulkUpdateItems.length) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} library items`)
    await ctx.libraryItemModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['size']
    })
  }

  if (libraryItems.length < 500) return
  return migrationPatch2LibraryItems(ctx, offset + libraryItems.length)
}

async function migrationPatch2Books(ctx: DatabaseType, offset = 0): Promise<void> {
  const books = await ctx.bookModel.findAll({
    limit: 500,
    offset
  })
  if (!books.length) return

  const bulkUpdateItems: BookCreationAttributes[] = []
  for (const book of books) {
    let duration = 0
    if (book.audioFiles?.length) {
      const tracks = book.audioFiles.filter((af: AudioFileObject) => !af.exclude && !af.invalid)
      for (const track of tracks) {
        if (track.duration !== null && track.duration !== undefined && !isNaN(track.duration)) {
          duration += track.duration
        }
      }
    }

    bulkUpdateItems.push({
      id: book.id,
      title: book.title,
      titleIgnorePrefix: getTitleIgnorePrefix(book.title) ?? null,
      duration
    })
  }

  if (bulkUpdateItems.length) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} books`)
    await ctx.bookModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['duration', 'titleIgnorePrefix']
    })
  }

  if (books.length < 500) return
  return migrationPatch2Books(ctx, offset + books.length)
}

async function migrationPatch2Podcasts(ctx: DatabaseType, offset = 0): Promise<void> {
  const podcasts = await ctx.podcastModel.findAll({
    limit: 500,
    offset
  })
  if (!podcasts.length) return

  const bulkUpdateItems: PodcastCreationAttributes[] = []
  for (const podcast of podcasts) {
    bulkUpdateItems.push({
      id: podcast.id,
      title: podcast.title,
      titleIgnorePrefix: getTitleIgnorePrefix(podcast.title) ?? null
    })
  }

  if (bulkUpdateItems.length) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} podcasts`)
    await ctx.podcastModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['titleIgnorePrefix']
    })
  }

  if (podcasts.length < 500) return
  return migrationPatch2Podcasts(ctx, offset + podcasts.length)
}

async function migrationPatch2Series(ctx: DatabaseType, offset = 0): Promise<void> {
  const allSeries = await ctx.seriesModel.findAll({
    limit: 500,
    offset
  })
  if (!allSeries.length) return

  const bulkUpdateItems: SeriesCreationAttributes[] = []
  for (const series of allSeries) {
    bulkUpdateItems.push({
      id: series.id,
      name: series.name,
      libraryId: series.libraryId,
      nameIgnorePrefix: getTitleIgnorePrefix(series.name) ?? null
    })
  }

  if (bulkUpdateItems.length) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} series`)
    await ctx.seriesModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['nameIgnorePrefix']
    })
  }

  if (allSeries.length < 500) return
  return migrationPatch2Series(ctx, offset + allSeries.length)
}

async function migrationPatch2Authors(ctx: DatabaseType, offset = 0): Promise<void> {
  const authors = await ctx.authorModel.findAll({
    limit: 500,
    offset
  })
  if (!authors.length) return

  const bulkUpdateItems: AuthorCreationAttributes[] = []
  for (const author of authors) {
    if (author.name?.trim()) {
      bulkUpdateItems.push({
        id: author.id,
        name: author.name,
        libraryId: author.libraryId,
        lastFirst: parseNameString.nameToLastFirst(author.name)
      })
    }
  }

  if (bulkUpdateItems.length) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} authors`)
    await ctx.authorModel.bulkCreate(bulkUpdateItems, {
      updateOnDuplicate: ['lastFirst']
    })
  }

  if (authors.length < 500) return
  return migrationPatch2Authors(ctx, offset + authors.length)
}

async function migrationPatch2BookAuthors(ctx: DatabaseType, offset = 0): Promise<void> {
  const bookAuthors = await ctx.bookAuthorModel.findAll({
    include: {
      model: ctx.authorModel
    },
    limit: 500,
    offset
  })
  if (!bookAuthors.length) return

  const bulkUpdateItems: string[] = []
  for (const bookAuthor of bookAuthors) {
    if (bookAuthor.author?.createdAt) {
      const dateString = bookAuthor.author.createdAt.toISOString().replace('T', ' ').replace('Z', '')
      bulkUpdateItems.push(`("${bookAuthor.id}","${dateString}")`)
    }
  }

  if (bulkUpdateItems.length && ctx.sequelize) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} bookAuthors`)
    await ctx.sequelize.query(
      `INSERT INTO bookAuthors ('id','createdAt') VALUES ${bulkUpdateItems.join(',')} ON CONFLICT(id) DO UPDATE SET 'createdAt' = EXCLUDED.createdAt;`
    )
  }

  if (bookAuthors.length < 500) return
  return migrationPatch2BookAuthors(ctx, offset + bookAuthors.length)
}

async function migrationPatch2BookSeries(ctx: DatabaseType, offset = 0): Promise<void> {
  const allBookSeries = await ctx.bookSeriesModel.findAll({
    include: {
      model: ctx.seriesModel
    },
    limit: 500,
    offset
  })
  if (!allBookSeries.length) return

  const bulkUpdateItems: string[] = []
  for (const bookSeries of allBookSeries) {
    if (bookSeries.series?.createdAt) {
      const dateString = bookSeries.series.createdAt.toISOString().replace('T', ' ').replace('Z', '')
      bulkUpdateItems.push(`("${bookSeries.id}","${dateString}")`)
    }
  }

  if (bulkUpdateItems.length && ctx.sequelize) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - patching ${bulkUpdateItems.length} bookSeries`)
    await ctx.sequelize.query(
      `INSERT INTO bookSeries ('id','createdAt') VALUES ${bulkUpdateItems.join(',')} ON CONFLICT(id) DO UPDATE SET 'createdAt' = EXCLUDED.createdAt;`
    )
  }

  if (allBookSeries.length < 500) return
  return migrationPatch2BookSeries(ctx, offset + allBookSeries.length)
}

export async function migrationPatch2(ctx: DatabaseType): Promise<boolean> {
  if (!ctx.sequelize) return false
  const queryInterface = ctx.sequelize.getQueryInterface()
  const feedTableDescription = await queryInterface.describeTable('feeds')
  const authorsTableDescription = await queryInterface.describeTable('authors')
  const bookAuthorsTableDescription = await queryInterface.describeTable('bookAuthors')

  if (feedTableDescription?.coverPath && authorsTableDescription?.lastFirst && bookAuthorsTableDescription?.createdAt) {
    Logger.info(`[dbMigration] Migration patch 2.3.3+ - columns already on model`)
    return false
  }
  Logger.info(`[dbMigration] Applying migration patch from 2.3.3+`)

  try {
    await queryInterface.sequelize.transaction((t: Transaction) => {
      const queries: Promise<unknown>[] = []
      if (!bookAuthorsTableDescription?.createdAt) {
        queries.push(
          queryInterface.addColumn(
            'bookAuthors',
            'createdAt',
            {
              type: DataTypes.DATE
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'bookSeries',
            'createdAt',
            {
              type: DataTypes.DATE
            },
            { transaction: t }
          )
        )
      }
      if (!authorsTableDescription?.lastFirst) {
        queries.push(
          queryInterface.addColumn(
            'authors',
            'lastFirst',
            {
              type: DataTypes.STRING
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'libraryItems',
            'size',
            {
              type: DataTypes.BIGINT
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'books',
            'duration',
            {
              type: DataTypes.FLOAT
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'books',
            'titleIgnorePrefix',
            {
              type: DataTypes.STRING
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'podcasts',
            'titleIgnorePrefix',
            {
              type: DataTypes.STRING
            },
            { transaction: t }
          ),
          queryInterface.addColumn(
            'series',
            'nameIgnorePrefix',
            {
              type: DataTypes.STRING
            },
            { transaction: t }
          )
        )
      }
      if (!feedTableDescription?.coverPath) {
        queries.push(
          queryInterface.addColumn(
            'feeds',
            'coverPath',
            {
              type: DataTypes.STRING
            },
            { transaction: t }
          )
        )
      }
      return Promise.all(queries)
    })

    if (!authorsTableDescription?.lastFirst) {
      if (global.ServerSettings?.sortingPrefixes?.length) {
        prefixesToIgnore = global.ServerSettings.sortingPrefixes
      }

      await migrationPatch2LibraryItems(ctx, 0)
      await migrationPatch2Books(ctx, 0)
      await migrationPatch2Podcasts(ctx, 0)
      await migrationPatch2Authors(ctx, 0)
      await migrationPatch2Series(ctx, 0)
    }

    if (!bookAuthorsTableDescription?.createdAt) {
      await migrationPatch2BookAuthors(ctx, 0)
      await migrationPatch2BookSeries(ctx, 0)
    }

    Logger.info(`[dbMigration] Migration patch 2.3.3+ finished`)
    return true
  } catch (error) {
    Logger.error(`[dbMigration] Migration from 2.3.3+ column creation failed`, error)
    throw new Error('Migration 2.3.3+ failed ' + String(error))
  }
}

export default {
  migrate,
  checkShouldMigrate,
  migrationPatch,
  migrationPatch2
}
