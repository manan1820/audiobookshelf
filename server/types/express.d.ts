import type User from '../models/User'
import type Author from '../models/Author'
import type LibraryItem from '../models/LibraryItem'
import type Library from '../models/Library'
import type Series from '../models/Series'
import type Collection from '../models/Collection'
import type Playlist from '../models/Playlist'
import type PlaybackSession from '../models/PlaybackSession'
import type Podcast from '../models/Podcast'
import type PodcastEpisode from '../models/PodcastEpisode'
import type ApiKey from '../models/ApiKey'
import type Device from '../models/Device'

declare global {
  namespace Express {
    interface UserTokenPayload {
      id: string
      username: string
      type?: string
      token?: string
      extraToken?: string
    }

    interface Request {
      user?: User | null
      userToken?: string | null
      tokenPayload?: UserTokenPayload | null
      clientIp?: string | null
      libraryItem?: LibraryItem | null
      author?: Author | null
      library?: Library | null
      series?: Series | null
      collection?: Collection | null
      playlist?: Playlist | null
      playbackSession?: PlaybackSession | null
      podcast?: Podcast | null
      podcastEpisode?: PodcastEpisode | null
      apiKey?: ApiKey | null
      device?: Device | null
    }
  }
}

export {}
