import Path from 'path'
import { Response } from 'express'
import Logger from '../Logger'
import archiver from '../libs/archiver'

export interface PathObject {
  path: string
  isFile: boolean
}

export function zipDirectoryPipe(path: string, filename: string, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    // create a file to stream archive data to
    res.attachment(filename)

    const archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    })

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    res.on('close', () => {
      Logger.info(`${archive.pointer()} total bytes`)
      Logger.debug('archiver has been finalized and the output file descriptor has closed.')
      resolve()
    })

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    res.on('end', () => {
      Logger.debug('Data has been drained')
    })

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        Logger.warn(`[DownloadManager] Archiver warning: ${err.message}`)
      } else {
        Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
        reject(err)
      }
    })
    archive.on('error', (err) => {
      Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
      reject(err)
    })

    // pipe archive data to the file
    archive.pipe(res)

    archive.directory(path, false)

    archive.finalize().catch((err: unknown) => {
      Logger.error(`[DownloadManager] Archiver finalize error:`, err)
    })
  })
}

/**
 * Creates a zip archive containing multiple directories and streams it to the response.
 */
export function zipDirectoriesPipe(pathObjects: PathObject[], filename: string, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    // create a file to stream archive data to
    res.attachment(filename)

    const archive = archiver('zip', {
      zlib: { level: 0 } // Sets the compression level.
    })

    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    res.on('close', () => {
      Logger.info(`${archive.pointer()} total bytes`)
      Logger.debug('archiver has been finalized and the output file descriptor has closed.')
      resolve()
    })

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    res.on('end', () => {
      Logger.debug('Data has been drained')
    })

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        Logger.warn(`[DownloadManager] Archiver warning: ${err.message}`)
      } else {
        Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
        reject(err)
      }
    })
    archive.on('error', (err) => {
      Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
      reject(err)
    })

    // pipe archive data to the file
    archive.pipe(res)

    // Add each path as a directory in the zip
    pathObjects.forEach((pathObject) => {
      if (!pathObject.isFile) {
        // Add the directory to the archive with its name as the root folder
        archive.directory(pathObject.path, Path.basename(pathObject.path))
      } else {
        archive.file(pathObject.path, { name: Path.basename(pathObject.path) })
      }
    })

    archive.finalize().catch((err: unknown) => {
      Logger.error(`[DownloadManager] Archiver finalize error:`, err)
    })
  })
}

/**
 * Handles errors that occur during the download process.
 */
export function handleDownloadError(error: unknown, res: Response): Response | void {
  if (!res.headersSent) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ENOENT') {
      return res.status(404).send('File not found')
    } else {
      return res.status(500).send('Download failed')
    }
  }
}
