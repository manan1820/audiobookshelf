import Path from 'path'
import type { Response } from 'express'
import Logger from '../Logger'
import archiver from '../libs/archiver'

interface PathObject {
  path: string
  isFile: boolean
}

interface NodeErrorWithCode {
  code?: string
  message: string
}

function zipDirectoryPipe(path: string, filename: string, res: Response): Promise<void> {
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
    archive.on('warning', (err: NodeErrorWithCode) => {
      if (err.code === 'ENOENT') {
        // log warning
        Logger.warn(`[DownloadManager] Archiver warning: ${err.message}`)
      } else {
        // throw error
        Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
        reject(err)
      }
    })
    archive.on('error', (err: NodeErrorWithCode) => {
      Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
      reject(err)
    })

    // pipe archive data to the file
    archive.pipe(res)

    archive.directory(path, false)

    archive.finalize()
  })
}

/**
 * Creates a zip archive containing multiple directories and streams it to the response.
 */
function zipDirectoriesPipe(pathObjects: PathObject[], filename: string, res: Response): Promise<void> {
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
    archive.on('warning', (err: NodeErrorWithCode) => {
      if (err.code === 'ENOENT') {
        // log warning
        Logger.warn(`[DownloadManager] Archiver warning: ${err.message}`)
      } else {
        // throw error
        Logger.error(`[DownloadManager] Archiver error: ${err.message}`)
        reject(err)
      }
    })
    archive.on('error', (err: NodeErrorWithCode) => {
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

    archive.finalize()
  })
}

/**
 * Handles errors that occur during the download process.
 */
function handleDownloadError(error: unknown, res: Response): void {
  if (!res.headersSent) {
    const err = error as { code?: string }
    if (err && err.code === 'ENOENT') {
      res.status(404).send('File not found')
    } else {
      res.status(500).send('Download failed')
    }
  }
}

export = {
  zipDirectoryPipe,
  zipDirectoriesPipe,
  handleDownloadError
}
