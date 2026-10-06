import type { BookMetadataObject, SeriesSequence } from '../../types'

export interface ComicInfoXML {
  ComicInfo?: {
    Series?: string[]
    Number?: string[]
    Summary?: string[]
  }
}

/**
 * @see https://anansi-project.github.io/docs/comicinfo/intro
 */
export function parse(comicInfoJson: ComicInfoXML | null | undefined): BookMetadataObject | null {
  if (!comicInfoJson?.ComicInfo) return null

  const ComicSeries = comicInfoJson.ComicInfo.Series?.[0]?.trim() || null
  const ComicNumber = comicInfoJson.ComicInfo.Number?.[0]?.trim() || null
  const ComicSummary = comicInfoJson.ComicInfo.Summary?.[0]?.trim() || null

  let title: string | null = null
  const series: SeriesSequence[] = []
  if (ComicSeries) {
    series.push({
      name: ComicSeries,
      sequence: ComicNumber
    })

    title = ComicSeries
    if (ComicNumber) {
      title += ` ${ComicNumber}`
    }
  }

  return {
    title,
    series,
    description: ComicSummary
  }
}
