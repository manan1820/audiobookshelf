import { performance, createHistogram, RecordableHistogram } from 'perf_hooks'
import util from 'util'
import Logger from '../Logger'

interface HistogramWithValues extends RecordableHistogram {
  values?: number[]
}

const histograms = new Map<string, HistogramWithValues>()

interface FindOptions {
  logging?: (query: string, time: number) => void
  benchmark?: boolean
  [key: string]: unknown
}

export function profile<TArgs extends unknown[], TReturn>(
  asyncFunc: (...args: TArgs) => Promise<TReturn>,
  isFindQuery = true,
  funcName = asyncFunc.name
): (...args: TArgs) => Promise<TReturn> {
  if (!histograms.has(funcName)) {
    const histogram: HistogramWithValues = createHistogram()
    histogram.values = []
    histograms.set(funcName, histogram)
  }
  const histogram = histograms.get(funcName)!

  return async (...args: TArgs): Promise<TReturn> => {
    if (isFindQuery && args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      const findOptions = args[0] as FindOptions
      Logger.info(`[${funcName}] findOptions:`, util.inspect(findOptions, { depth: null }))
      findOptions.logging = (query: string, time: number) => Logger.info(`[${funcName}] ${query} Elapsed time: ${time}ms`)
      findOptions.benchmark = true
    }
    const start = performance.now()
    try {
      const result = await asyncFunc(...args)
      return result
    } catch (error) {
      Logger.error(`[${funcName}] failed`)
      throw error
    } finally {
      const end = performance.now()
      const duration = Math.round(end - start)
      histogram.record(duration)
      histogram.values?.push(duration)
      Logger.info(`[${funcName}] duration: ${duration}ms`)
      Logger.info(`[${funcName}] histogram values:`, histogram.values)
      Logger.info(`[${funcName}] histogram:`, histogram)
    }
  }
}
