import {
  Sequelize,
  Op,
  Order,
  WhereOptions,
  Includeable,
  FindOptions,
  ModelStatic,
  Model
} from 'sequelize'
import Database from '../../Database'
import Logger from '../../Logger'
import { profile } from '../profiler'
import stringifySequelizeQuery from '../stringifySequelizeQuery'
import type User from '../../models/User'
import type Library from '../../models/Library'
import type LibraryItem from '../../models/LibraryItem'
import type Podcast from '../../models/Podcast'
import type PodcastEpisode from '../../models/PodcastEpisode'
import type {
  GenreWithCount,
  TagWithCount,
  UserPermissionPodcastWhereResult,
  PodcastLibrarySearchResult,
  PodcastSearchEpisodeMatch,
  PodcastLibraryStats,
  LongestBookItem,
  PodcastEpisodeOldJsonExpandedObject,
  QueryWhereAttributeHash
} from '../../types'

const countCache = new Map<string, number>()

interface PodcastFilterReplacements {
  filterValue?: string | null
  userId?: string | null
  userTagsSelected?: string[]
  limit?: number
  offset?: number
  libraryId?: string
  [key: string]: string | number | boolean | string[] | null | undefined
}

interface StatRow {
  totalDuration?: number | null
  numAudioFiles?: number | null
  totalItems?: number | null
  totalSize?: number | null
}

interface GroupCountRow {
  value: string
  numItems: number
}

const libraryItemsPodcastFilters = {
  /**
   * User permissions to restrict podcasts for explicit content & tags
   */
  getUserPermissionPodcastWhereQuery(user: User): UserPermissionPodcastWhereResult {
    const podcastWhere: WhereOptions[] = []
    const replacements: PodcastFilterReplacements = {}
    if (!user.canAccessExplicitContent) {
      podcastWhere.push({
        explicit: false
      })
    }

    if (!user.permissions?.accessAllTags && user.permissions?.itemTagsSelected?.length) {
      replacements.userTagsSelected = user.permissions.itemTagsSelected
      if (user.permissions.selectedTagsNotAccessible) {
        podcastWhere.push(
          Sequelize.where(
            Sequelize.literal(
              `(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))`
            ),
            0
          )
        )
      } else {
        podcastWhere.push(
          Sequelize.where(
            Sequelize.literal(
              `(SELECT count(*) FROM json_each(tags) WHERE json_valid(tags) AND json_each.value IN (:userTagsSelected))`
            ),
            {
              [Op.gte]: 1
            }
          )
        )
      }
    }

    return {
      podcastWhere,
      replacements
    }
  },

  /**
   * Get where options for Podcast model
   */
  getMediaGroupQuery(
    group?: string | null,
    value?: string | null
  ): { mediaWhere: WhereOptions; replacements: PodcastFilterReplacements } {
    if (!group) return { mediaWhere: {}, replacements: {} }

    const mediaWhere: QueryWhereAttributeHash = {}
    const replacements: PodcastFilterReplacements = {}

    if (['genres', 'tags'].includes(group)) {
      mediaWhere[group] = Sequelize.where(
        Sequelize.literal(
          `(SELECT count(*) FROM json_each(${group}) WHERE json_valid(${group}) AND json_each.value = :filterValue)`
        ),
        {
          [Op.gte]: 1
        }
      )
      replacements.filterValue = value
    } else if (group === 'languages') {
      mediaWhere.language = value
    } else if (group === 'explicit') {
      mediaWhere.explicit = true
    }

    return {
      mediaWhere: mediaWhere as WhereOptions,
      replacements
    }
  },

  /**
   * Get sequelize order
   */
  getOrder(sortBy?: string | null, sortDesc?: boolean | null): Order {
    const dir = sortDesc ? 'DESC' : 'ASC'
    if (sortBy === 'addedAt') {
      return [[Sequelize.literal('libraryItem.createdAt'), dir]]
    } else if (sortBy === 'size') {
      return [[Sequelize.literal('libraryItem.size'), dir]]
    } else if (sortBy === 'birthtimeMs') {
      return [[Sequelize.literal('libraryItem.birthtime'), dir]]
    } else if (sortBy === 'mtimeMs') {
      return [[Sequelize.literal('libraryItem.mtime'), dir]]
    } else if (sortBy === 'media.metadata.author') {
      const nullDir = sortDesc ? 'DESC NULLS FIRST' : 'ASC NULLS LAST'
      return [Sequelize.literal(`\`podcast\`.\`author\` COLLATE NOCASE ${nullDir}`)]
    } else if (sortBy === 'media.metadata.title') {
      if (global.ServerSettings?.sortingIgnorePrefix) {
        return [[Sequelize.literal('`libraryItem`.`titleIgnorePrefix` COLLATE NOCASE'), dir]]
      } else {
        return [[Sequelize.literal('`libraryItem`.`title` COLLATE NOCASE'), dir]]
      }
    } else if (sortBy === 'media.numTracks') {
      return [['numEpisodes', dir]]
    } else if (sortBy === 'random') {
      return [Database.sequelize ? Database.sequelize.random() : Sequelize.literal('RANDOM()')]
    }
    return []
  },

  clearCountCache(model: string, hook: string): void {
    Logger.debug(`[LibraryItemsPodcastFilters] ${model}.${hook}: Clearing count cache`)
    countCache.clear()
  },

  async findAndCountAll<T extends Model>(
    findOptions: FindOptions,
    model: ModelStatic<T>,
    limit?: number | null,
    offset?: number | null,
    useCountCache = false
  ): Promise<{ rows: T[]; count: number }> {
    if (useCountCache) {
      const countCacheKey = stringifySequelizeQuery(findOptions)
      Logger.debug(`[LibraryItemsPodcastFilters] countCacheKey: ${countCacheKey}`)
      if (!countCache.has(countCacheKey)) {
        const count = await model.count(findOptions)
        countCache.set(countCacheKey, count)
      }

      findOptions.limit = limit || undefined
      findOptions.offset = offset || undefined

      const rows = await model.findAll(findOptions)

      return { rows, count: countCache.get(countCacheKey) ?? 0 }
    }

    findOptions.limit = limit || undefined
    findOptions.offset = offset || undefined

    return await model.findAndCountAll(findOptions)
  },

  /**
   * Get library items for podcast media type using filter and sort
   */
  async getFilteredLibraryItems(
    libraryId: string,
    user: User,
    filterGroup?: string | null,
    filterValue?: string | null,
    sortBy?: string | null,
    sortDesc?: boolean | null,
    include: string[] = [],
    limit?: number | null,
    offset?: number | null
  ): Promise<{ libraryItems: LibraryItem[]; count: number }> {
    const includeRSSFeed = include.includes('rssfeed')
    const includeNumEpisodesIncomplete = include.includes('numepisodesincomplete')

    const libraryItemWhere: QueryWhereAttributeHash = {
      libraryId
    }
    const libraryItemIncludes: Includeable[] = []
    if (filterGroup === 'feed-open' || includeRSSFeed) {
      const rssFeedRequired = filterGroup === 'feed-open'
      libraryItemIncludes.push({
        model: Database.feedModel,
        required: rssFeedRequired,
        separate: !rssFeedRequired
      })
    }
    if (filterGroup === 'issues') {
      libraryItemWhere[Op.or] = [
        {
          isMissing: true
        },
        {
          isInvalid: true
        }
      ]
    } else if (filterGroup === 'recent') {
      libraryItemWhere.createdAt = {
        [Op.gte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
      }
    }

    const podcastIncludes: unknown[] = []

    const { mediaWhere, replacements: mediaReplacements } = this.getMediaGroupQuery(filterGroup, filterValue)
    let replacements: PodcastFilterReplacements = {
      ...mediaReplacements,
      userId: user.id
    }

    const podcastWhere: WhereOptions[] = []
    if (Object.keys(mediaWhere).length) podcastWhere.push(mediaWhere)

    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)
    replacements = { ...replacements, ...userPermissionPodcastWhere.replacements }
    podcastWhere.push(...userPermissionPodcastWhere.podcastWhere)

    const findOptions: FindOptions & { distinct?: boolean } = {
      where: podcastWhere.length ? { [Op.and]: podcastWhere } : undefined,
      replacements,
      distinct: true,
      include: [
        {
          model: Database.libraryItemModel,
          required: true,
          where: libraryItemWhere as WhereOptions,
          include: libraryItemIncludes
        }
      ],
      order: this.getOrder(sortBy, sortDesc),
      subQuery: false
    }

    const findAndCountAllFn = process.env.QUERY_PROFILING
      ? profile(this.findAndCountAll.bind(this))
      : this.findAndCountAll.bind(this)

    const { rows: podcasts, count } = await findAndCountAllFn(
      findOptions,
      Database.podcastModel,
      limit,
      offset,
      !filterGroup && !userPermissionPodcastWhere.podcastWhere.length
    )

    const libraryItems = podcasts.map((podcastExpanded: Podcast) => {
      const podcastWithLi = podcastExpanded as Podcast & { libraryItem?: LibraryItem }
      const libraryItem = podcastWithLi.libraryItem as LibraryItem
      const podcast = podcastExpanded

      delete podcastWithLi.libraryItem

      const feeds = (libraryItem as LibraryItem & { feeds?: unknown[] }).feeds
      if (feeds?.length) {
        ;(libraryItem as LibraryItem & { rssFeed?: unknown }).rssFeed = feeds[0]
      }

      if (includeNumEpisodesIncomplete) {
        const numEpisodesComplete = (user.mediaProgresses ?? []).reduce((acc, mp) => {
          if (mp.podcastId === podcast.id && mp.isFinished) {
            acc += 1
          }
          return acc
        }, 0)
        const numEpisodesVal = podcast.numEpisodes ?? 0
        ;(libraryItem as LibraryItem & { numEpisodesIncomplete?: number }).numEpisodesIncomplete =
          numEpisodesVal - numEpisodesComplete
      }

      libraryItem.media = podcast

      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Get podcast episodes filtered and sorted
   */
  async getFilteredPodcastEpisodes(
    libraryId: string,
    user: User,
    filterGroup?: string | null,
    filterValue?: string | null,
    sortBy?: string | null,
    sortDesc?: boolean | null,
    limit?: number | null,
    offset?: number | null,
    isHomePage = false
  ): Promise<{ libraryItems: LibraryItem[]; count: number }> {
    let activeSortBy = sortBy
    if (activeSortBy === 'progress' && filterGroup !== 'progress') {
      Logger.warn('Cannot sort podcast episodes by progress without filtering by progress')
      activeSortBy = 'createdAt'
    }

    const podcastEpisodeIncludes: Includeable[] = []
    let podcastEpisodeWhere: WhereOptions = {}
    const libraryItemWhere: WhereOptions = {
      libraryId
    }
    if (filterGroup === 'progress') {
      const mediaProgressWhere: QueryWhereAttributeHash = {
        userId: user.id
      }
      // Respect hide from continue listening for home page shelf
      if (isHomePage) {
        mediaProgressWhere.hideFromContinueListening = false
      }
      podcastEpisodeIncludes.push({
        model: Database.mediaProgressModel,
        where: mediaProgressWhere as WhereOptions,
        attributes: ['id', 'isFinished', 'currentTime', 'updatedAt']
      })

      if (filterValue === 'in-progress') {
        podcastEpisodeWhere = [
          {
            '$mediaProgresses.isFinished$': false
          },
          {
            '$mediaProgresses.currentTime$': {
              [Op.gt]: 0
            }
          }
        ]
      } else if (filterValue === 'finished') {
        podcastEpisodeWhere = {
          '$mediaProgresses.isFinished$': true
        }
      }
    } else if (filterGroup === 'recent') {
      podcastEpisodeWhere = {
        createdAt: {
          [Op.gte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days ago
        }
      }
    }

    const podcastEpisodeOrder: Order = []
    if (activeSortBy === 'createdAt') {
      podcastEpisodeOrder.push(['createdAt', sortDesc ? 'DESC' : 'ASC'])
    } else if (activeSortBy === 'progress') {
      podcastEpisodeOrder.push([Sequelize.literal('mediaProgresses.updatedAt'), sortDesc ? 'DESC' : 'ASC'])
    }

    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)

    const findOptions: FindOptions = {
      where: podcastEpisodeWhere,
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          required: true,
          where: userPermissionPodcastWhere.podcastWhere.length
            ? { [Op.and]: userPermissionPodcastWhere.podcastWhere }
            : undefined,
          include: [
            {
              model: Database.libraryItemModel,
              required: true,
              where: libraryItemWhere
            }
          ]
        },
        ...podcastEpisodeIncludes
      ],
      subQuery: false,
      order: podcastEpisodeOrder
    }

    const findAndCountAllFn = process.env.QUERY_PROFILING
      ? profile(this.findAndCountAll.bind(this))
      : this.findAndCountAll.bind(this)

    const { rows: podcastEpisodes, count } = await findAndCountAllFn(
      findOptions,
      Database.podcastEpisodeModel,
      limit,
      offset,
      !filterGroup
    )

    const libraryItems = podcastEpisodes.map((ep: PodcastEpisode) => {
      const epWithPodcast = ep as PodcastEpisode & { podcast: Podcast & { libraryItem: LibraryItem } }
      const libraryItem = epWithPodcast.podcast.libraryItem
      const podcast = epWithPodcast.podcast
      delete (podcast as { libraryItem?: unknown }).libraryItem
      libraryItem.media = podcast
      libraryItem.recentEpisode = ep.toOldJSON(libraryItem.id)
      return libraryItem
    })

    return {
      libraryItems,
      count
    }
  },

  /**
   * Search podcasts
   */
  async search(
    user: User,
    library: Library,
    query: string,
    limit: number,
    offset: number
  ): Promise<PodcastLibrarySearchResult> {
    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)
    const textSearchQuery = await Database.createTextSearchQuery(query)

    const matchTitle = textSearchQuery.matchExpression('podcast.title')
    const matchAuthor = textSearchQuery.matchExpression('podcast.author')

    // Search podcast titles and author
    const podcasts = await Database.podcastModel.findAll({
      where: {
        [Op.and]: [
          Sequelize.literal(`(${matchTitle} OR ${matchAuthor})`),
          ...userPermissionPodcastWhere.podcastWhere,
          {
            '$libraryItem.libraryId$': library.id
          }
        ]
      },
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.libraryItemModel
        }
      ],
      offset,
      limit
    })
    const itemMatches = podcasts.map((podcast) => {
      const podcastWithLi = podcast as Podcast & { libraryItem?: LibraryItem }
      const libraryItem = podcastWithLi.libraryItem as LibraryItem
      delete podcastWithLi.libraryItem
      podcast.podcastEpisodes = []
      libraryItem.media = podcast
      return libraryItem.toOldJSONExpanded()
    })

    // Search episodes
    const podcastEpisodes = await Database.podcastEpisodeModel.findAll({
      where: {
        [Op.and]: [
          Sequelize.literal(textSearchQuery.matchExpression('podcastEpisode.title')),
          {
            '$podcast.libraryItem.libraryId$': library.id
          }
        ]
      },
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          where: userPermissionPodcastWhere.podcastWhere.length
            ? { [Op.and]: userPermissionPodcastWhere.podcastWhere }
            : undefined,
          include: [
            {
              model: Database.libraryItemModel
            }
          ]
        }
      ],
      offset,
      limit
    })
    const episodeMatches: PodcastSearchEpisodeMatch[] = []
    for (const episode of podcastEpisodes) {
      const epWithPodcast = episode as PodcastEpisode & { podcast: Podcast & { libraryItem: LibraryItem } }
      const libraryItem = epWithPodcast.podcast.libraryItem
      libraryItem.media = epWithPodcast.podcast
      ;(libraryItem.media as Podcast).podcastEpisodes = []
      const oldPodcastEpisodeJson = episode.toOldJSONExpanded(libraryItem.id)
      const libraryItemJson = libraryItem.toOldJSONExpanded()
      const matchObj: PodcastSearchEpisodeMatch = {
        libraryItem: {
          ...libraryItemJson,
          recentEpisode: oldPodcastEpisodeJson
        }
      }
      episodeMatches.push(matchObj)
    }

    const matchJsonValue = textSearchQuery.matchExpression('json_each.value')

    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }

    // Search tags
    const tagMatches: TagWithCount[] = []
    const [tagResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.tags) WHERE json_valid(p.tags) AND ${matchJsonValue} AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`,
      {
        replacements: {
          libraryId: library.id,
          limit,
          offset
        },
        raw: true
      }
    )) as [GroupCountRow[], unknown]
    for (const row of tagResults) {
      tagMatches.push({
        name: row.value,
        numItems: row.numItems
      })
    }

    // Search genres
    const genreMatches: TagWithCount[] = []
    const [genreResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.genres) WHERE json_valid(p.genres) AND ${matchJsonValue} AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC LIMIT :limit OFFSET :offset;`,
      {
        replacements: {
          libraryId: library.id,
          limit,
          offset
        },
        raw: true
      }
    )) as [GroupCountRow[], unknown]
    for (const row of genreResults) {
      genreMatches.push({
        name: row.value,
        numItems: row.numItems
      })
    }

    return {
      podcast: itemMatches,
      tags: tagMatches,
      genres: genreMatches,
      episodes: episodeMatches
    }
  },

  /**
   * Most recent podcast episodes not finished
   */
  async getRecentEpisodes(
    user: User,
    library: Library,
    limit: number,
    offset: number
  ): Promise<PodcastEpisodeOldJsonExpandedObject[]> {
    const userPermissionPodcastWhere = this.getUserPermissionPodcastWhereQuery(user)

    const findOptions: FindOptions = {
      where: {
        '$mediaProgresses.isFinished$': {
          [Op.or]: [null, false]
        }
      },
      replacements: userPermissionPodcastWhere.replacements,
      include: [
        {
          model: Database.podcastModel,
          where: userPermissionPodcastWhere.podcastWhere.length
            ? { [Op.and]: userPermissionPodcastWhere.podcastWhere }
            : undefined,
          required: true,
          include: [
            {
              model: Database.libraryItemModel,
              where: {
                libraryId: library.id
              }
            }
          ]
        },
        {
          model: Database.mediaProgressModel,
          where: {
            userId: user.id
          },
          required: false
        }
      ],
      order: [['publishedAt', 'DESC']],
      subQuery: false,
      limit,
      offset
    }

    const findAllFn = process.env.QUERY_PROFILING
      ? profile(Database.podcastEpisodeModel.findAll.bind(Database.podcastEpisodeModel))
      : Database.podcastEpisodeModel.findAll.bind(Database.podcastEpisodeModel)

    const episodes = await findAllFn(findOptions)

    const episodeResults = episodes.map((ep: PodcastEpisode) => {
      const epWithPodcast = ep as PodcastEpisode & { podcast: Podcast & { libraryItem: LibraryItem } }
      epWithPodcast.podcast.podcastEpisodes = []
      const oldPodcastJson = epWithPodcast.podcast.toOldJSON(epWithPodcast.podcast.libraryItem.id)
      const oldPodcastEpisodeJson = ep.toOldJSONExpanded(epWithPodcast.podcast.libraryItem.id)

      oldPodcastEpisodeJson.podcast = oldPodcastJson
      oldPodcastEpisodeJson.libraryId = epWithPodcast.podcast.libraryItem.libraryId
      return oldPodcastEpisodeJson
    })

    return episodeResults
  },

  /**
   * Get stats for podcast library
   */
  async getPodcastLibraryStats(libraryId: string): Promise<PodcastLibraryStats> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const [sizeResults] = (await Database.sequelize.query(
      `SELECT SUM(li.size) AS totalSize FROM libraryItems li WHERE li.mediaType = "podcast" AND li.libraryId = :libraryId;`,
      {
        replacements: {
          libraryId
        }
      }
    )) as [StatRow[], unknown]

    const [statResults] = (await Database.sequelize.query(
      `SELECT SUM(json_extract(pe.audioFile, '$.duration')) AS totalDuration, COUNT(DISTINCT(li.id)) AS totalItems, COUNT(pe.id) AS numAudioFiles FROM libraryItems li, podcasts p LEFT OUTER JOIN podcastEpisodes pe ON pe.podcastId = p.id WHERE p.id = li.mediaId AND li.libraryId = :libraryId;`,
      {
        replacements: {
          libraryId
        }
      }
    )) as [StatRow[], unknown]

    return {
      totalDuration: statResults?.[0]?.totalDuration || 0,
      numAudioFiles: statResults?.[0]?.numAudioFiles || 0,
      totalItems: statResults?.[0]?.totalItems || 0,
      totalSize: sizeResults?.[0]?.totalSize || 0
    }
  },

  /**
   * Genres with num podcasts
   */
  async getGenresWithCount(libraryId: string): Promise<GenreWithCount[]> {
    if (!Database.sequelize) {
      throw new Error('Database not initialized')
    }
    const genres: GenreWithCount[] = []
    const [genreResults] = (await Database.sequelize.query(
      `SELECT value, count(*) AS numItems FROM podcasts p, libraryItems li, json_each(p.genres) WHERE json_valid(p.genres) AND p.id = li.mediaId AND li.libraryId = :libraryId GROUP BY value ORDER BY numItems DESC;`,
      {
        replacements: {
          libraryId
        },
        raw: true
      }
    )) as [GroupCountRow[], unknown]
    for (const row of genreResults) {
      genres.push({
        genre: row.value,
        count: row.numItems
      })
    }
    return genres
  },

  /**
   * Get longest podcasts in library
   */
  async getLongestPodcasts(libraryId: string, limit: number): Promise<LongestBookItem[]> {
    const podcasts = await Database.podcastModel.findAll({
      attributes: [
        'id',
        'title',
        [
          Sequelize.literal(
            `(SELECT SUM(json_extract(pe.audioFile, '$.duration')) FROM podcastEpisodes pe WHERE pe.podcastId = podcast.id)`
          ),
          'duration'
        ]
      ],
      include: [
        {
          model: Database.libraryItemModel,
          attributes: ['id', 'libraryId'],
          where: {
            libraryId
          }
        }
      ],
      order: [['duration', 'DESC']],
      limit
    })
    return podcasts.map((podcast) => {
      const podcastWithLi = podcast as Podcast & { libraryItem?: LibraryItem }
      const durationVal = podcast.get('duration')
      return {
        id: podcastWithLi.libraryItem?.id ?? '',
        title: podcast.title,
        duration: typeof durationVal === 'number' ? durationVal : Number(durationVal) || 0
      }
    })
  }
}

export = libraryItemsPodcastFilters
