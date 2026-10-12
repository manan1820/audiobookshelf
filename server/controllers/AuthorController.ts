import type { Request, Response, NextFunction } from 'express'
import { Op } from 'sequelize'
import fs from '../libs/fsExtra'
import { createNewSortInstance } from '../libs/fastSort'

import Logger from '../Logger'
import SocketAuthority from '../SocketAuthority'
import Database from '../Database'
import CacheManager from '../managers/CacheManager'
import CoverManager from '../managers/CoverManager'
import AuthorFinder from '../finders/AuthorFinder'

import { reqSupportsWebp, isValidASIN, clampPositiveInt } from '../utils/index'
import type Author from '../models/Author'
import type {
  AuthorOldJsonObject,
  LibraryItemOldJsonMinifiedObject,
  UpdateAuthorPayload
} from '../types'
import type User from '../models/User'
import type LibraryItem from '../models/LibraryItem'

const naturalSort = createNewSortInstance({
  comparer: new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare
})

interface AuthorControllerRequest extends Request {
  user?: User
  author?: Author | null
}

interface SeriesMapItem {
  id: string
  name: string
  items: Array<LibraryItemOldJsonMinifiedObject>
}

class AuthorController {
  /**
   * GET: /api/authors/:id
   */
  async findOne(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author || !req.user) {
      return res.sendStatus(404)
    }

    const includeQuery = typeof req.query.include === 'string' ? req.query.include : ''
    const include = includeQuery.split(',')

    const authorJson: AuthorOldJsonObject & {
      series?: SeriesMapItem[]
      libraryItems?: unknown[]
    } = {
      ...req.author.toOldJSON()
    }

    if (include.includes('items')) {
      const libraryItems = await Database.libraryItemModel.getForAuthor(req.author, req.user)

      if (include.includes('series')) {
        const seriesMap: Record<string, SeriesMapItem> = {}

        libraryItems.forEach((li) => {
          const media = li.media as {
            series?: Array<{
              id: string
              name: string
              nameIgnorePrefix?: string | null
              bookSeries?: { sequence?: string | null }
            }>
          }
          if (media?.series?.length) {
            media.series.forEach((series) => {
              const itemWithSeries = li.toOldJSONMinified() as LibraryItemOldJsonMinifiedObject & {
                media: { metadata: { series?: unknown } }
              }
              itemWithSeries.media.metadata.series = {
                id: series.id,
                name: series.name,
                nameIgnorePrefix: series.nameIgnorePrefix,
                sequence: series.bookSeries?.sequence
              }

              const existingEntry = seriesMap[series.id]
              if (existingEntry) {
                existingEntry.items.push(itemWithSeries)
              } else {
                seriesMap[series.id] = {
                  id: series.id,
                  name: series.name,
                  items: [itemWithSeries]
                }
              }
            })
          }
        })

        for (const key in seriesMap) {
          const entry = seriesMap[key]
          if (entry) {
            entry.items = naturalSort(entry.items).asc((li: unknown) => {
              const item = li as {
                media?: { metadata?: { series?: { sequence?: string | null } } }
              }
              return item?.media?.metadata?.series?.sequence ?? ''
            })
          }
        }

        authorJson.series = Object.values(seriesMap)
      }

      authorJson.libraryItems = libraryItems.map((li) => li.toOldJSONMinified())
    }

    return res.json(authorJson)
  }

  /**
   * PATCH: /api/authors/:id
   */
  async update(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author) {
      return res.sendStatus(404)
    }

    const keysToUpdate = ['name', 'description', 'asin']
    const body = (req.body as UpdateAuthorPayload) ?? {}
    const payload: Record<string, string | null> = {}
    for (const key in body) {
      const val = body[key]
      if (keysToUpdate.includes(key) && (typeof val === 'string' || val === null)) {
        payload[key] = val
      }
    }
    if (!Object.keys(payload).length) {
      Logger.error(`[AuthorController] Invalid request payload. No valid keys found`, req.body)
      return res.status(400).send('Invalid request payload. No valid keys found')
    }

    let hasUpdated = false

    const authorNameUpdate = payload.name !== undefined && payload.name !== req.author.name
    if (authorNameUpdate && typeof payload.name === 'string') {
      payload.lastFirst = Database.authorModel.getLastFirst(payload.name)
    }

    let existingAuthor: Author | null = null
    if (authorNameUpdate && payload.name) {
      existingAuthor = await Database.authorModel.findOne({
        where: {
          id: {
            [Op.not]: req.author.id
          },
          name: payload.name,
          libraryId: req.author.libraryId
        }
      })
    }

    if (existingAuthor) {
      Logger.info(
        `[AuthorController] Merging author "${req.author.name}" with "${existingAuthor.name}"`
      )
      const bookAuthorsToCreate: Array<{ bookId: string; authorId: string }> = []
      const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(
        req.author.id
      )

      const libraryItems: LibraryItem[] = []
      allItemsWithAuthor.forEach((libraryItem) => {
        const media = libraryItem.media as {
          id: string
          authors?: Array<{ id: string; name: string }>
        }
        if (media?.authors) {
          media.authors = media.authors.filter((au) => au.id !== req.author?.id)
          if (existingAuthor) {
            media.authors.push({
              id: existingAuthor.id,
              name: existingAuthor.name
            })
          }
        }

        libraryItems.push(libraryItem)

        if (existingAuthor) {
          bookAuthorsToCreate.push({
            bookId: media.id,
            authorId: existingAuthor.id
          })
        }
      })

      if (libraryItems.length) {
        await Database.bookAuthorModel.removeByIds(req.author.id)
        await Database.bookAuthorModel.bulkCreate(bookAuthorsToCreate, {
          ignoreDuplicates: true
        })
        for (const libraryItem of libraryItems) {
          await libraryItem.saveMetadataFile()
        }
        SocketAuthority.libraryItemsEmitter('items_updated', libraryItems)
      }

      const oldAuthorJSON = req.author.toOldJSON()
      await req.author.destroy()
      SocketAuthority.emitter('author_removed', oldAuthorJSON)
      Database.removeAuthorFromFilterData(oldAuthorJSON.libraryId, oldAuthorJSON.id)

      const numBooks = await Database.bookAuthorModel.getCountForAuthor(existingAuthor.id)
      SocketAuthority.emitter(
        'author_updated',
        existingAuthor.toOldJSONExpanded(numBooks)
      )

      res.json({
        author: existingAuthor.toOldJSON(),
        merged: true
      })
      return
    }

    if (!authorNameUpdate && !req.author.lastFirst) {
      payload.lastFirst = Database.authorModel.getLastFirst(req.author.name)
    }

    req.author.set(payload)
    if (req.author.changed()) {
      await req.author.save()
      hasUpdated = true
    }

    if (hasUpdated) {
      let numBooksForAuthor = 0
      if (authorNameUpdate) {
        const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(
          req.author.id
        )

        numBooksForAuthor = allItemsWithAuthor.length
        const libraryItems: LibraryItem[] = []
        for (const libraryItem of allItemsWithAuthor) {
          const media = libraryItem.media as {
            authors?: Array<{ id: string; name: string }>
          }
          if (media?.authors) {
            media.authors = media.authors.map((au) => {
              if (au.id === req.author?.id && req.author) {
                au.name = req.author.name
              }
              return au
            })
          }

          libraryItems.push(libraryItem)
          await libraryItem.saveMetadataFile()
        }

        if (libraryItems.length) {
          SocketAuthority.libraryItemsEmitter('items_updated', libraryItems)
        }
      } else {
        numBooksForAuthor = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
      }

      SocketAuthority.emitter(
        'author_updated',
        req.author.toOldJSONExpanded(numBooksForAuthor)
      )
    }

    res.json({
      author: req.author.toOldJSON(),
      updated: hasUpdated
    })
  }

  /**
   * DELETE: /api/authors/:id
   */
  async delete(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author) {
      return res.sendStatus(404)
    }

    Logger.info(`[AuthorController] Removing author "${req.author.name}"`)

    if (req.author.imagePath) {
      await CacheManager.purgeImageCache(req.author.id)
    }

    const allItemsWithAuthor = await Database.authorModel.getAllLibraryItemsForAuthor(
      req.author.id
    )
    allItemsWithAuthor.forEach((libraryItem) => {
      const media = libraryItem.media as {
        authors?: Array<{ id: string }>
      }
      if (media?.authors) {
        media.authors = media.authors.filter((au) => au.id !== req.author?.id)
      }
    })

    await req.author.destroy()

    for (const libraryItem of allItemsWithAuthor) {
      await libraryItem.saveMetadataFile()
    }

    SocketAuthority.emitter('author_removed', req.author.toOldJSON())
    Database.removeAuthorFromFilterData(req.author.libraryId, req.author.id)

    res.sendStatus(200)
  }

  /**
   * POST: /api/authors/:id/image
   */
  async uploadImage(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author || !req.user) {
      return res.sendStatus(404)
    }

    if (!req.user.canUpload) {
      Logger.warn(
        `User "${req.user.username}" attempted to upload an image without permission`
      )
      return res.sendStatus(403)
    }

    const body = req.body as { url?: string }
    if (!body?.url) {
      Logger.error(`[AuthorController] Invalid request payload. 'url' not in request body`)
      return res.status(400).send(`Invalid request payload. 'url' not in request body`)
    }
    if (!body.url.startsWith('http:') && !body.url.startsWith('https:')) {
      Logger.error(`[AuthorController] Invalid request payload. Invalid url "${body.url}"`)
      return res.status(400).send(`Invalid request payload. Invalid url "${body.url}"`)
    }

    Logger.debug(
      `[AuthorController] Requesting download author image from url "${body.url}"`
    )
    const result = await AuthorFinder.saveAuthorImage(req.author.id, body.url)

    if (result?.error) {
      return res.status(400).send(result.error)
    } else if (!result?.path) {
      return res.status(500).send('Unknown error occurred')
    }

    if (req.author.imagePath) {
      await CacheManager.purgeImageCache(req.author.id)
    }

    req.author.imagePath = result.path
    req.author.changed('imagePath', true)
    await req.author.save()

    const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
    SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooks))
    res.json({
      author: req.author.toOldJSON()
    })
  }

  /**
   * DELETE: /api/authors/:id/image
   */
  async deleteImage(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author) {
      return res.sendStatus(404)
    }

    if (!req.author.imagePath) {
      Logger.error(
        `[AuthorController] Author "${req.author.name}" has no imagePath set`
      )
      return res.status(400).send('Author has no image path set')
    }
    Logger.info(
      `[AuthorController] Removing image for author "${req.author.name}" at "${req.author.imagePath}"`
    )
    await CacheManager.purgeImageCache(req.author.id)
    await CoverManager.removeFile(req.author.imagePath)
    req.author.imagePath = null
    await req.author.save()

    const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
    SocketAuthority.emitter('author_updated', req.author.toOldJSONExpanded(numBooks))
    res.json({
      author: req.author.toOldJSON()
    })
  }

  /**
   * POST: /api/authors/:id/match
   */
  async match(req: AuthorControllerRequest, res: Response): Promise<Response | void> {
    if (!req.author) {
      return res.sendStatus(404)
    }

    let authorData: { asin?: string; image?: string; description?: string } | null = null
    const body = (req.body as { region?: string; asin?: string; q?: string }) ?? {}
    const region = body.region || 'us'
    if (body.asin && isValidASIN(body.asin.toUpperCase())) {
      authorData = await AuthorFinder.findAuthorByASIN(body.asin, region)
    } else if (body.q) {
      authorData = await AuthorFinder.findAuthorByName(body.q, region)
    }
    if (!authorData) {
      return res.status(404).send('Author not found')
    }
    Logger.debug(`[AuthorController] match author with "${body.q || body.asin}"`, authorData)

    let hasUpdates = false
    if (authorData.asin && req.author.asin !== authorData.asin) {
      req.author.asin = authorData.asin
      hasUpdates = true
    }

    if (authorData.image && (!req.author.imagePath || hasUpdates)) {
      await CacheManager.purgeImageCache(req.author.id)

      const imageData = await AuthorFinder.saveAuthorImage(req.author.id, authorData.image)
      if (imageData?.path) {
        req.author.imagePath = imageData.path
        hasUpdates = true
      }
    }

    if (authorData.description && req.author.description !== authorData.description) {
      req.author.description = authorData.description
      hasUpdates = true
    }

    if (hasUpdates) {
      await req.author.save()

      const numBooks = await Database.bookAuthorModel.getCountForAuthor(req.author.id)
      SocketAuthority.emitter(
        'author_updated',
        req.author.toOldJSONExpanded(numBooks)
      )
    }

    res.json({
      updated: hasUpdates,
      author: req.author.toOldJSON()
    })
  }

  /**
   * GET: /api/authors/:id/image
   */
  async getImage(req: AuthorControllerRequest, res: Response): Promise<unknown> {
    const query = req.query as {
      width?: string
      height?: string
      format?: string
      raw?: string
    }
    const { width, height, format, raw } = query
    const authorId = req.params.id

    if (raw) {
      const author = await Database.authorModel.findByPk(authorId)
      if (!author) {
        Logger.warn(`[AuthorController] Author "${authorId}" not found`)
        return res.sendStatus(404)
      }

      if (!author.imagePath || !(await fs.pathExists(author.imagePath))) {
        Logger.warn(
          `[AuthorController] Author "${author.name}" has invalid imagePath: ${author.imagePath}`
        )
        return res.sendStatus(404)
      }

      return res.sendFile(author.imagePath)
    }

    const options = {
      format: format || (reqSupportsWebp(req) ? 'webp' : 'jpeg'),
      height: clampPositiveInt(height ? parseInt(height) : null, 4096) ?? undefined,
      width: clampPositiveInt(width ? parseInt(width) : null, 4096) ?? undefined
    }
    return CacheManager.handleAuthorCache(res, authorId, options)
  }

  /**
   * Middleware to load author and verify permissions
   */
  async middleware(
    req: AuthorControllerRequest,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> {
    const author = await Database.authorModel.findByPk(req.params.id)
    if (!author) return res.sendStatus(404)
    if (!req.user?.checkCanAccessLibrary(author.libraryId)) return res.sendStatus(404)

    if (req.method === 'DELETE' && !req.user.canDelete) {
      Logger.warn(
        `[AuthorController] User "${req.user.username}" attempted to delete without permission`
      )
      return res.sendStatus(403)
    } else if (
      (req.method === 'PATCH' || req.method === 'POST') &&
      !req.user.canUpdate
    ) {
      Logger.warn(
        `[AuthorController] User "${req.user.username}" attempted to update without permission`
      )
      return res.sendStatus(403)
    }

    req.author = author
    next()
  }
}

const authorController = new AuthorController()

namespace authorController {
  export type AuthorControllerRequestType = AuthorControllerRequest
}

export = authorController
