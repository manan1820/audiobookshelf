import type { Model, ModelStatic, Optional } from 'sequelize'
import type { LibrarySettingsObject } from './dto'
import type User from '../models/User'
import type Session from '../models/Session'
import type ApiKey from '../models/ApiKey'
import type Library from '../models/Library'
import type LibraryFolder from '../models/LibraryFolder'
import type Book from '../models/Book'
import type Podcast from '../models/Podcast'
import type PodcastEpisode from '../models/PodcastEpisode'
import type LibraryItem from '../models/LibraryItem'
import type MediaProgress from '../models/MediaProgress'
import type Series from '../models/Series'
import type BookSeries from '../models/BookSeries'
import type Author from '../models/Author'
import type BookAuthor from '../models/BookAuthor'
import type Collection from '../models/Collection'
import type CollectionBook from '../models/CollectionBook'
import type Playlist from '../models/Playlist'
import type PlaylistMediaItem from '../models/PlaylistMediaItem'
import type Device from '../models/Device'
import type PlaybackSession from '../models/PlaybackSession'
import type Feed from '../models/Feed'
import type FeedEpisode from '../models/FeedEpisode'
import type Setting from '../models/Setting'
import type CustomMetadataProvider from '../models/CustomMetadataProvider'
import type MediaItemShare from '../models/MediaItemShare'

/**
 * Type helper for unmigrated CommonJS models whose static init(sequelize) method
 * overrides Sequelize's init(attributes, options) with an incompatible signature.
 */
export type LegacyModel<M extends Model, S = {}> = ModelStatic<M> & Omit<S, 'init'>

/**
 * Strict Centralized Database Model Registry Interface
 * Exposes all 25 Sequelize models as accessed across Managers and Controllers.
 */
export interface DatabaseModels {
  userModel: typeof User
  sessionModel: LegacyModel<Session, typeof Session>
  apiKeyModel: LegacyModel<ApiKey, typeof ApiKey>
  libraryModel: typeof Library
  libraryFolderModel: typeof LibraryFolder
  bookModel: typeof Book
  podcastModel: typeof Podcast
  podcastEpisodeModel: typeof PodcastEpisode
  libraryItemModel: typeof LibraryItem
  mediaProgressModel: typeof MediaProgress
  seriesModel: typeof Series
  bookSeriesModel: typeof BookSeries
  authorModel: typeof Author
  bookAuthorModel: typeof BookAuthor
  collectionModel: LegacyModel<Collection, typeof Collection>
  collectionBookModel: LegacyModel<CollectionBook, typeof CollectionBook>
  playlistModel: LegacyModel<Playlist, typeof Playlist>
  playlistMediaItemModel: LegacyModel<PlaylistMediaItem, typeof PlaylistMediaItem>
  deviceModel: LegacyModel<Device, typeof Device>
  playbackSessionModel: typeof PlaybackSession
  feedModel: typeof Feed
  feedEpisodeModel: typeof FeedEpisode
  settingModel: LegacyModel<Setting, typeof Setting>
  customMetadataProviderModel: LegacyModel<CustomMetadataProvider, typeof CustomMetadataProvider>
  mediaItemShareModel: LegacyModel<MediaItemShare, typeof MediaItemShare>
}

// -------------------------------------------------------------
// Core Model Attribute Contracts
// -------------------------------------------------------------

export interface UserAttributes {
  id: string
  username: string
  password?: string | null
  email?: string | null
  type: string
  token?: string | null
  isActive?: boolean
  isLocked?: boolean
  lastSeen?: Date | null
  permissions?: Record<string, boolean> | null
  extraPermissions?: Record<string, boolean> | null
  pash?: string | null
  authMethod?: string | null
  mediaProgress?: unknown[]
  seriesHideFromContinueListening?: string[] | null
  createdAt?: Date
  updatedAt?: Date
}
export interface UserCreationAttributes
  extends Optional<UserAttributes, 'id' | 'password' | 'email' | 'token' | 'isActive' | 'isLocked' | 'lastSeen' | 'permissions' | 'extraPermissions' | 'pash' | 'authMethod' | 'mediaProgress' | 'seriesHideFromContinueListening' | 'createdAt' | 'updatedAt'> {}

export interface AuthorAttributes {
  id: string
  name: string
  lastFirst?: string | null
  asin?: string | null
  description?: string | null
  imagePath?: string | null
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}
export interface AuthorCreationAttributes
  extends Optional<AuthorAttributes, 'id' | 'lastFirst' | 'asin' | 'description' | 'imagePath' | 'createdAt' | 'updatedAt'> {}

export interface SeriesAttributes {
  id: string
  name: string
  nameIgnorePrefix?: string | null
  description?: string | null
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}
export interface SeriesCreationAttributes
  extends Optional<SeriesAttributes, 'id' | 'nameIgnorePrefix' | 'description' | 'createdAt' | 'updatedAt'> {}

export interface BookAttributes {
  id: string
  title: string
  titleIgnorePrefix?: string | null
  subtitle?: string | null
  publishedYear?: string | null
  publishedDate?: string | null
  publisher?: string | null
  description?: string | null
  isbn?: string | null
  asin?: string | null
  language?: string | null
  explicit?: boolean
  abridged?: boolean
  narrator?: string | null
  createdAt?: Date
  updatedAt?: Date
}
export interface BookCreationAttributes
  extends Optional<BookAttributes, 'id' | 'titleIgnorePrefix' | 'subtitle' | 'publishedYear' | 'publishedDate' | 'publisher' | 'description' | 'isbn' | 'asin' | 'language' | 'explicit' | 'abridged' | 'narrator' | 'createdAt' | 'updatedAt'> {}

export interface BookAuthorAttributes {
  id: string
  bookId: string
  authorId: string
  createdAt?: Date
  updatedAt?: Date
}
export interface BookAuthorCreationAttributes
  extends Optional<BookAuthorAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export interface BookSeriesAttributes {
  id: string
  sequence?: string | null
  bookId: string
  seriesId: string
  createdAt?: Date
  updatedAt?: Date
}
export interface BookSeriesCreationAttributes
  extends Optional<BookSeriesAttributes, 'id' | 'sequence' | 'createdAt' | 'updatedAt'> {}

export interface LibraryAttributes {
  id: string
  name: string
  description?: string | null
  displayOrder?: number
  icon?: string | null
  mediaType: string
  provider?: string | null
  settings?: Partial<LibrarySettingsObject> | null
  createdAt?: Date
  updatedAt?: Date
}
export interface LibraryCreationAttributes
  extends Optional<LibraryAttributes, 'id' | 'description' | 'displayOrder' | 'icon' | 'provider' | 'settings' | 'createdAt' | 'updatedAt'> {}

export interface LibraryFolderAttributes {
  id: string
  path: string
  libraryId: string
  createdAt?: Date
  updatedAt?: Date
}
export interface LibraryFolderCreationAttributes
  extends Optional<LibraryFolderAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export interface LibraryItemAttributes {
  id: string
  ino?: string | null
  path: string
  relPath: string
  folderId: string
  libraryId: string
  mediaId: string
  mediaType: string
  media?: unknown
  isFile?: boolean
  mtimeMs?: number
  ctimeMs?: number
  birthtimeMs?: number
  size?: number
  isMissing?: boolean
  isInvalid?: boolean
  mediaItemShareId?: string | null
  libraryFolderId?: string | null
  createdAt?: Date
  updatedAt?: Date
}
export interface LibraryItemCreationAttributes
  extends Optional<LibraryItemAttributes, 'id' | 'ino' | 'media' | 'isFile' | 'mtimeMs' | 'ctimeMs' | 'birthtimeMs' | 'size' | 'isMissing' | 'isInvalid' | 'mediaItemShareId' | 'libraryFolderId' | 'createdAt' | 'updatedAt'> {}
