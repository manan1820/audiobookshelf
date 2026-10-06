import Sequelize, { Op } from 'sequelize'
import Database from '../../Database'

interface TextQueryLike {
  query?: string
  hasAccents?: boolean
  matchExpression(column: string): string
}

interface AuthorWithCountResult {
  id: string
  name: string
  count: number
}

interface BookAuthorInstanceLike {
  authorId: string
  author: {
    name: string
  }
  get(key: string): unknown
}

interface AuthorInstanceLike {
  dataValues: {
    numBooks?: number
    [key: string]: unknown
  }
  toOldJSONExpanded(numBooks?: number): Record<string, unknown>
}

interface AuthorModelQueryable {
  count(options?: unknown): Promise<number>
  findAll(options?: unknown): Promise<AuthorInstanceLike[]>
}

interface BookAuthorModelQueryable {
  findAll(options?: unknown): Promise<BookAuthorInstanceLike[]>
}

/**
 * Get authors total count
 */
async function getAuthorsTotalCount(libraryId: string): Promise<number> {
  const authorModel = Database.authorModel as unknown as AuthorModelQueryable
  const authorsCount = await authorModel.count({
    where: {
      libraryId: libraryId
    }
  })
  return authorsCount
}

/**
 * Get authors with count of num books
 */
async function getAuthorsWithCount(libraryId: string, limit: number): Promise<AuthorWithCountResult[]> {
  const bookAuthorModel = Database.bookAuthorModel as unknown as BookAuthorModelQueryable
  const authors = await bookAuthorModel.findAll({
    include: [
      {
        model: Database.authorModel,
        as: 'author', // Use the correct alias as defined in your associations
        attributes: ['name'],
        where: {
          libraryId: libraryId
        }
      }
    ],
    attributes: ['authorId', [Sequelize.fn('COUNT', Sequelize.col('authorId')), 'count']],
    group: ['authorId', 'author.id'], // Include 'author.id' to satisfy GROUP BY with JOIN
    order: [[Sequelize.literal('count'), 'DESC']],
    limit: limit
  })
  return authors.map((au) => {
    return {
      id: au.authorId,
      name: au.author.name,
      count: Number(au.get('count'))
    }
  })
}

/**
 * Search authors
 */
async function search(
  libraryId: string,
  query: TextQueryLike,
  limit: number,
  offset: number
): Promise<Record<string, unknown>[]> {
  const matchAuthor = query.matchExpression('name')
  const authorModel = Database.authorModel as unknown as AuthorModelQueryable
  const authors = await authorModel.findAll({
    where: {
      [Op.and]: [Sequelize.literal(matchAuthor), { libraryId }]
    },
    attributes: {
      include: [[Sequelize.literal('(SELECT count(*) FROM bookAuthors ba WHERE ba.authorId = author.id)'), 'numBooks']]
    },
    limit,
    offset
  })
  const authorMatches: Record<string, unknown>[] = []
  for (const author of authors) {
    const oldAuthor = author.toOldJSONExpanded(author.dataValues.numBooks)
    authorMatches.push(oldAuthor)
  }
  return authorMatches
}

const authorFilters = {
  getAuthorsTotalCount,
  getAuthorsWithCount,
  search
}

export = authorFilters
