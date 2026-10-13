import Path from 'path'
import fs from '../libs/fsExtra'
import Logger from '../Logger'
import TaskManager from './TaskManager'
import Task from '../objects/Task'
import ffmpegHelpers, { AbMergeEncodeOptions } from '../utils/ffmpegHelpers'
import Ffmpeg, { FfmpegCommand } from '../libs/fluentFfmpeg'
import SocketAuthority from '../SocketAuthority'
import { isWritable, copyToExisting } from '../utils/fileUtils'
import TrackProgressMonitor from '../objects/TrackProgressMonitor'
import type LibraryItem from '../models/LibraryItem'
import type Book from '../models/Book'
import type { ChapterObject, TaskData } from '../types'

function isBookMedia(media: LibraryItem['media']): media is Book {
  return !!media && 'includedAudioFiles' in media
}

interface PendingTaskItem {
  id: string | null
  task: Task
}

interface AbMergeTaskData extends TaskData {
  libraryItemId: string
  libraryItemDir: string
  userId: string
  originalTrackPaths: string[]
  inos: string[]
  tempFilepath: string
  targetFilename: string
  targetFilepath: string
  itemCachePath: string
  ffmetadataObject: { [key: string]: string }
  chapters?: ChapterObject[]
  coverPath: string | null
  ffmetadataPath: string
  duration: number
  encodeOptions: AbMergeEncodeOptions
  ffmpeg?: FfmpegCommand
}

class AbMergeManager {
  itemsCacheDir: string
  pendingTasks: PendingTaskItem[]

  constructor() {
    this.itemsCacheDir = Path.join(global.MetadataPath, 'cache/items')
    this.pendingTasks = []
  }

  getPendingTaskByLibraryItemId(libraryItemId: string): PendingTaskItem | undefined {
    return this.pendingTasks.find((t) => (t.task.data as AbMergeTaskData).libraryItemId === libraryItemId)
  }

  cancelEncode(task: Task): Promise<void> {
    const taskFailedString = {
      text: 'Task canceled by user',
      key: 'MessageTaskCanceledByUser'
    }
    task.setFailed(taskFailedString)
    return this.removeTask(task, true)
  }

  async startAudiobookMerge(
    userId: string,
    libraryItem: LibraryItem,
    options: AbMergeEncodeOptions = {}
  ): Promise<void> {
    if (!isBookMedia(libraryItem.media)) {
      Logger.error(`[AbMergeManager] Library item ${libraryItem.id} is not a book`)
      return
    }
    const book = libraryItem.media

    const task = new Task()

    const audiobookBaseName = libraryItem.isFile
      ? Path.basename(libraryItem.path, Path.extname(libraryItem.path))
      : Path.basename(libraryItem.path)
    const targetFilename = audiobookBaseName + '.m4b'
    const itemCachePath = Path.join(this.itemsCacheDir, libraryItem.id)
    const tempFilepath = Path.join(itemCachePath, targetFilename)
    const ffmetadataPath = Path.join(itemCachePath, 'ffmetadata.txt')
    const libraryItemDir = libraryItem.isFile ? Path.dirname(libraryItem.path) : libraryItem.path
    const taskData: AbMergeTaskData = {
      libraryItemId: libraryItem.id,
      libraryItemDir,
      userId,
      originalTrackPaths: book.includedAudioFiles.map((t) => t.metadata.path || ''),
      inos: book.includedAudioFiles.map((f) => f.ino || ''),
      tempFilepath,
      targetFilename,
      targetFilepath: Path.join(libraryItemDir, targetFilename),
      itemCachePath,
      ffmetadataObject: ffmpegHelpers.getFFMetadataObject(libraryItem, 1),
      chapters: book.chapters?.map((c) => ({ ...c })),
      coverPath: book.coverPath,
      ffmetadataPath,
      duration: book.duration,
      encodeOptions: options
    }

    const taskTitleString = {
      text: 'Encoding M4b',
      key: 'MessageTaskEncodingM4b'
    }
    const taskDescriptionString = {
      text: `Encoding audiobook "${book.title}".`,
      key: 'MessageTaskEncodingM4bDescription',
      subs: [book.title]
    }
    task.setData('encode-m4b', taskTitleString, taskDescriptionString, false, taskData)
    TaskManager.addTask(task)
    Logger.info(`Start m4b encode for ${libraryItem.id} - TaskId: ${task.id || ''}`)

    if (!(await fs.pathExists(taskData.itemCachePath))) {
      await fs.mkdir(taskData.itemCachePath)
    }

    void this.runAudiobookMerge(libraryItem, task, options)
  }

  async runAudiobookMerge(
    libraryItem: LibraryItem,
    task: Task,
    encodingOptions: AbMergeEncodeOptions
  ): Promise<void> {
    if (!isBookMedia(libraryItem.media)) {
      Logger.error(`[AbMergeManager] Library item ${libraryItem.id} is not a book`)
      return
    }
    const book = libraryItem.media

    const taskData = task.data as AbMergeTaskData

    // Make sure the target directory is writable
    if (!(await isWritable(taskData.libraryItemDir))) {
      Logger.error(`[AbMergeManager] Target directory is not writable: ${taskData.libraryItemDir}`)
      const taskFailedString = {
        text: 'Target directory is not writable',
        key: 'MessageTaskTargetDirectoryNotWritable'
      }
      task.setFailed(taskFailedString)
      void this.removeTask(task, true)
      return
    }

    // Create ffmetadata file
    if (!(await ffmpegHelpers.writeFFMetadataFile(taskData.ffmetadataObject, taskData.chapters || [], taskData.ffmetadataPath))) {
      Logger.error(`[AudioMetadataManager] Failed to write ffmetadata file for audiobook "${taskData.libraryItemId}"`)
      const taskFailedString = {
        text: 'Failed to write metadata file',
        key: 'MessageTaskFailedToWriteMetadataFile'
      }
      task.setFailed(taskFailedString)
      void this.removeTask(task, true)
      return
    }

    this.pendingTasks.push({
      id: task.id,
      task
    })

    const encodeFraction = 0.95
    const embedFraction = 1 - encodeFraction
    try {
      const trackProgressMonitor = new TrackProgressMonitor(
        book.includedAudioFiles.map((t) => t.duration),
        (trackIndex) => SocketAuthority.adminEmitter('track_started', { libraryItemId: libraryItem.id, ino: taskData.inos[trackIndex] }),
        (trackIndex, progressInTrack, taskProgress) => {
          SocketAuthority.adminEmitter('track_progress', { libraryItemId: libraryItem.id, ino: taskData.inos[trackIndex], progress: progressInTrack })
          SocketAuthority.adminEmitter('task_progress', { libraryItemId: libraryItem.id, progress: taskProgress * encodeFraction })
        },
        (trackIndex) => SocketAuthority.adminEmitter('track_finished', { libraryItemId: libraryItem.id, ino: taskData.inos[trackIndex] })
      )
      taskData.ffmpeg = Ffmpeg()
      await ffmpegHelpers.mergeAudioFiles(
        book.includedAudioFiles,
        taskData.duration,
        taskData.itemCachePath,
        taskData.tempFilepath,
        encodingOptions,
        (progress) => trackProgressMonitor.update(progress),
        taskData.ffmpeg
      )
      delete taskData.ffmpeg
      trackProgressMonitor.finish()
    } catch (error: unknown) {
      const err = error as Error
      if (err.message === 'FFMPEG_CANCELED') {
        Logger.info(`[AbMergeManager] Task cancelled ${task.id || ''}`)
      } else {
        Logger.error('[AbMergeManager] mergeAudioFiles failed', error)
        const taskFailedString = {
          text: 'Failed to merge audio files',
          key: 'MessageTaskFailedToMergeAudioFiles'
        }
        task.setFailed(taskFailedString)
        void this.removeTask(task, true)
      }
      return
    }

    // Write metadata to merged file
    try {
      taskData.ffmpeg = Ffmpeg()
      await ffmpegHelpers.addCoverAndMetadataToFile(
        taskData.tempFilepath,
        taskData.coverPath,
        taskData.ffmetadataPath,
        1,
        'audio/mp4',
        (progress) => {
          Logger.debug(`[AbMergeManager] Embedding metadata progress: ${100 * encodeFraction + progress * embedFraction}`)
          SocketAuthority.adminEmitter('task_progress', { libraryItemId: libraryItem.id, progress: 100 * encodeFraction + progress * embedFraction })
        },
        taskData.ffmpeg
      )
      delete taskData.ffmpeg
    } catch (error: unknown) {
      const err = error as Error
      if (err.message === 'FFMPEG_CANCELED') {
        Logger.info(`[AbMergeManager] Task cancelled ${task.id || ''}`)
      } else {
        Logger.error(`[AbMergeManager] Failed to embed metadata in file "${taskData.tempFilepath}"`)
        const taskFailedString = {
          text: `Failed to embed metadata in file ${Path.basename(taskData.tempFilepath)}`,
          key: 'MessageTaskFailedToEmbedMetadataInFile',
          subs: [Path.basename(taskData.tempFilepath)]
        }
        task.setFailed(taskFailedString)
        void this.removeTask(task, true)
      }
      return
    }

    // Move library item tracks to cache
    for (const [index, trackPath] of taskData.originalTrackPaths.entries()) {
      const trackFilename = Path.basename(trackPath)
      let moveToPath = Path.join(taskData.itemCachePath, trackFilename)

      // If the track is the same as the temp file, we need to rename it to avoid overwriting it
      if (taskData.tempFilepath === moveToPath) {
        const trackExtname = Path.extname(taskData.tempFilepath)
        const newTrackFilename = Path.basename(taskData.tempFilepath, trackExtname) + '.backup' + trackExtname
        moveToPath = Path.join(taskData.itemCachePath, newTrackFilename)
      }

      Logger.debug(`[AbMergeManager] Backing up original track "${trackPath}" to ${moveToPath}`)
      if (index === 0) {
        // copy the first track to the cache directory
        await fs.copy(trackPath, moveToPath).catch((err: unknown) => {
          Logger.error(`[AbMergeManager] Failed to copy track "${trackPath}" to "${moveToPath}"`, err)
        })
      } else {
        // move the rest of the tracks to the cache directory
        await fs.move(trackPath, moveToPath, { overwrite: true }).catch((err: unknown) => {
          Logger.error(`[AbMergeManager] Failed to move track "${trackPath}" to "${moveToPath}"`, err)
        })
      }
    }

    // Move m4b to target, preserving the original track's permissions
    Logger.debug(`[AbMergeManager] Moving m4b from ${taskData.tempFilepath} to ${taskData.targetFilepath}`)
    try {
      await copyToExisting(taskData.tempFilepath, taskData.originalTrackPaths[0])
      await fs.rename(taskData.originalTrackPaths[0], taskData.targetFilepath)
      await fs.remove(taskData.tempFilepath)
    } catch (err: unknown) {
      Logger.error(`[AbMergeManager] Failed to move m4b from ${taskData.tempFilepath} to ${taskData.targetFilepath}`, err)
      const taskFailedString = {
        text: 'Failed to move m4b file',
        key: 'MessageTaskFailedToMoveM4bFile'
      }
      task.setFailed(taskFailedString)
      void this.removeTask(task, true)
      return
    }

    // Remove ffmetadata file
    await fs.remove(taskData.ffmetadataPath)

    task.setFinished()
    await this.removeTask(task, false)
    Logger.info(`[AbMergeManager] Ab task finished ${task.id || ''}`)
  }

  async removeTask(task: Task, removeTempFilepath = false): Promise<void> {
    const taskData = task.data as AbMergeTaskData
    Logger.info('[AbMergeManager] Removing task ' + (task.id || ''))

    const pendingTask = this.pendingTasks.find((d) => d.id === task.id)
    if (pendingTask) {
      this.pendingTasks = this.pendingTasks.filter((d) => d.id !== task.id)
      if (taskData.ffmpeg) {
        Logger.warn(`[AbMergeManager] Killing ffmpeg process for task ${task.id || ''}`)
        taskData.ffmpeg.kill()
        // wait for ffmpeg to exit, so that the output file is unlocked
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    if (removeTempFilepath) {
      // On failed tasks remove the bad file if it exists
      if (await fs.pathExists(taskData.tempFilepath)) {
        await fs
          .remove(taskData.tempFilepath)
          .then(() => {
            Logger.info('[AbMergeManager] Deleted target file', taskData.tempFilepath)
          })
          .catch((err: unknown) => {
            Logger.error('[AbMergeManager] Failed to delete target file', err)
          })
      }
      if (await fs.pathExists(taskData.ffmetadataPath)) {
        await fs
          .remove(taskData.ffmetadataPath)
          .then(() => {
            Logger.info('[AbMergeManager] Deleted ffmetadata file', taskData.ffmetadataPath)
          })
          .catch((err: unknown) => {
            Logger.error('[AbMergeManager] Failed to delete ffmetadata file', err)
          })
      }
    }

    TaskManager.taskFinished(task)
  }
}

namespace AbMergeManager {
  export type AbMergeManagerInstance = AbMergeManager
  export type AbMergeEncodeOptionsType = AbMergeEncodeOptions
  export type PendingTaskItemType = PendingTaskItem
  export type AbMergeTaskDataType = AbMergeTaskData
}

export = AbMergeManager
