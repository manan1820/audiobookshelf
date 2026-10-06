export interface ComicSeriesItem {
  name: string
  sequence: string | null
}

export interface ComicInfoMetadata {
  title: string | null
  series: ComicSeriesItem[]
  description: string | null
}

export interface RawComicInfoJson {
  ComicInfo?: {
    Series?: string[]
    Number?: string[]
    Summary?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function parse(comicInfoJson?: RawComicInfoJson | null): ComicInfoMetadata | null {
  if (!comicInfoJson?.ComicInfo) return null

  const ComicSeries = comicInfoJson.ComicInfo.Series?.[0]?.trim() || null
  const ComicNumber = comicInfoJson.ComicInfo.Number?.[0]?.trim() || null
  const ComicSummary = comicInfoJson.ComicInfo.Summary?.[0]?.trim() || null

  let title: string | null = null
  const series: ComicSeriesItem[] = []
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

export default {
  parse
}
