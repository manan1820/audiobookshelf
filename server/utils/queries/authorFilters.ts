import { Sequelize, Op } from 'sequelize'
import Database from '../../Database'
import type { AuthorOldJsonExpandedObject, TextSearchQuery, AuthorWithCount } from '../../types'

const authorFilters = {
  /**
   * Get authors total count
   *
   * @param libraryId
   * @returns count
   */
  async getAuthorsTotalCount(libraryId: string): Promise<number> {
    const authorsCount = await Database.authorModel.count({
      where: {
        libraryId
      }
    })
    return authorsCount
  },

  /**
   * Get authors with count of num books
   *
   * @param libraryId
   * @param limit
   * @returns
   */
  async getAuthorsWithCount(libraryId: string, limit: number): Promise<AuthorWithCount[]> {
    const authors = await Database.bookAuthorModel.findAll({
      include: [
        {
          model: Database.authorModel,
          as: 'author', // Use the correct alias as defined in your associations
          attributes: ['name'],
          where: {
            libraryId
          }
        }
      ],
      attributes: ['authorId', [Sequelize.fn('COUNT', Sequelize.col('authorId')), 'count']],
      group: ['authorId', 'author.id'], // Include 'author.id' to satisfy GROUP BY with JOIN
      order: [[Sequelize.literal('count'), 'DESC']],
      limit
    })
    return authors.map((au) => {
      const countVal = au.get('count')
      return {
        id: au.authorId,
        name: au.author?.name ?? '',
        count: typeof countVal === 'number' ? countVal : Number(countVal) || 0
      }
    })
  },

  /**
   * Search authors
   *
   * @param libraryId
   * @param query
   * @param limit
   * @param offset
   * @returns oldAuthor with numBooks
   */
  async search(
    libraryId: string,
    query: TextSearchQuery,
    limit: number,
    offset: number
  ): Promise<AuthorOldJsonExpandedObject[]> {
    const matchAuthor = query.matchExpression('name')
    const authors = await Database.authorModel.findAll({
      where: {
        [Op.and]: [Sequelize.literal(matchAuthor), { libraryId }]
      },
      attributes: {
        include: [[Sequelize.literal('(SELECT count(*) FROM bookAuthors ba WHERE ba.authorId = author.id)'), 'numBooks']]
      },
      limit,
      offset
    })
    const authorMatches: AuthorOldJsonExpandedObject[] = []
    for (const author of authors) {
      const numBooksVal = author.get('numBooks')
      const numBooks = typeof numBooksVal === 'number' ? numBooksVal : Number(numBooksVal) || 0
      const oldAuthor = author.toOldJSONExpanded(numBooks)
      authorMatches.push(oldAuthor)
    }
    return authorMatches
  }
}

export = authorFilters
