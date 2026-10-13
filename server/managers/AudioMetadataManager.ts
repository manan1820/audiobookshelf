import Path from 'path'
import SocketAuthority from '../SocketAuthority'
import Logger from '../Logger'
import fs from '../libs/fsExtra'
import ffmpegHelpers from '../utils/ffmpegHelpers'
import TaskManager from './TaskManager'
import Task from '../objects/Task'
import fileUtils from '../utils/fileUtils'
import type LibraryItem from '../models/LibraryItem'
import type Book from '../models/Book'
import type { ChapterObject, TaskData } from '../types'

function isBookMedia(media: LibraryItem['media']): media is Book {
  return !!media && 'includedAudioFiles' in media
}

interface UpdateMetadataOptions {
  forceEmbedChapters?: boolean
  backup?: boolean
}

interface AudioMetadataTaskAudioFile {
  index: number
  ino: string
  filename: string
  path: string
  cachePath: string
  duration: number
}

interface AudioMetadataTaskData extends TaskData {
  libraryItemId: string
  libraryItemDir: string
  userId: string
  audioFiles: AudioMetadataTaskAudioFile[]
  coverPath: string | null
  metadataObject: { [key: string]: string }
  itemCachePath: string
  chapters: ChapterObject[] | null
  mimeType: string | null
  options: {
    forceEmbedChapters: boolean
    backupFiles: boolean
  }
  duration: number
}

class AudioMetadataManager {
  itemsCacheDir: string
  MAX_CONCURRENT_TASKS: number
  tasksRunning: Task[]
  tasksQueued: Task[]

  constructor() {
    this.itemsCacheDir = Path.join(global.MetadataPath, 'cache/items')
    this.MAX_CONCURRENT_TASKS = 1
    this.tasksRunning = []
    this.tasksQueued = []
  }

  getQueuedTaskData(): TaskData[] {
    return this.tasksQueued.map((t) => t.data)
  }

  getIsLibraryItemQueuedOrProcessing(libraryItemId: string): boolean {
    return (
      this.tasksQueued.some((t) => t.data.libraryItemId === libraryItemId) ||
      this.tasksRunning.some((t) => t.data.libraryItemId === libraryItemId)
    )
  }

  getMetadataObjectForApi(libraryItem: LibraryItem): { [key: string]: string } {
    const count = isBookMedia(libraryItem.media) ? libraryItem.media.includedAudioFiles.length : 1
    return ffmpegHelpers.getFFMetadataObject(libraryItem, count)
  }

  handleBatchEmbed(userId: string, libraryItems: LibraryItem[], options: UpdateMetadataOptions = {}): void {
    libraryItems.forEach((li) => {
      void this.updateMetadataForItem(userId, li, options)
    })
  }

  async updateMetadataForItem(
    userId: string,
    libraryItem: LibraryItem,
    options: UpdateMetadataOptions = {}
  ): Promise<void> {
    if (!isBookMedia(libraryItem.media)) {
      Logger.error(`[AudioMetadataManager] Library item ${libraryItem.id} is not an audiobook`)
      return
    }
    const book = libraryItem.media

    const forceEmbedChapters = Boolean(options.forceEmbedChapters)
    const backupFiles = Boolean(options.backup)

    const audioFiles = book.includedAudioFiles
    const task = new Task()

    const itemCachePath = Path.join(this.itemsCacheDir, libraryItem.id)

    // Only writing chapters for single file audiobooks
    const chapters =
      audioFiles.length === 1 || forceEmbedChapters
        ? book.chapters?.map((c) => ({ ...c })) ?? null
        : null

    let mimeType: string | null = audioFiles[0]?.mimeType || null
    if (audioFiles.some((a) => a.mimeType !== mimeType)) mimeType = null

    // Create task
    const libraryItemDir = libraryItem.isFile ? Path.dirname(libraryItem.path) : libraryItem.path
    const taskData: AudioMetadataTaskData = {
      libraryItemId: libraryItem.id,
      libraryItemDir,
      userId,
      audioFiles: audioFiles.map((af) => ({
        index: af.index,
        ino: af.ino,
        filename: af.metadata.filename || '',
        path: af.metadata.path || '',
        cachePath: Path.join(itemCachePath, af.metadata.filename || ''),
        duration: af.duration
      })),
      coverPath: book.coverPath,
      metadataObject: ffmpegHelpers.getFFMetadataObject(libraryItem, audioFiles.length),
      itemCachePath,
      chapters,
      mimeType,
      options: {
        forceEmbedChapters,
        backupFiles
      },
      duration: book.duration
    }

    const taskTitleString = {
      text: 'Embedding Metadata',
      key: 'MessageTaskEmbeddingMetadata'
    }
    const taskDescriptionString = {
      text: `Embedding metadata in audiobook "${book.title}".`,
      key: 'MessageTaskEmbeddingMetadataDescription',
      subs: [book.title]
    }
    task.setData('embed-metadata', taskTitleString, taskDescriptionString, false, taskData)

    if (this.tasksRunning.length >= this.MAX_CONCURRENT_TASKS) {
      Logger.info(`[AudioMetadataManager] Queueing embed metadata for audiobook "${book.title}"`)
      SocketAuthority.adminEmitter('metadata_embed_queue_update', {
        libraryItemId: libraryItem.id,
        queued: true
      })
      this.tasksQueued.push(task)
    } else {
      void this.runMetadataEmbed(task)
    }
  }

  async runMetadataEmbed(task: Task): Promise<void> {
    const taskData = task.data as AudioMetadataTaskData
    this.tasksRunning.push(task)
    TaskManager.addTask(task)

    Logger.info('[AudioMetadataManager] Starting metadata embed task', task.description)

    // Ensure target directory is writable
    const targetDirWritable = await fileUtils.isWritable(taskData.libraryItemDir)
    Logger.debug(`[AudioMetadataManager] Target directory ${taskData.libraryItemDir} writable: ${targetDirWritable}`)
    if (!targetDirWritable) {
      Logger.error(`[AudioMetadataManager] Target directory is not writable: ${taskData.libraryItemDir}`)
      const taskFailedString = {
        text: 'Target directory is not writable',
        key: 'MessageTaskTargetDirectoryNotWritable'
      }
      task.setFailed(taskFailedString)
      this.handleTaskFinished(task)
      return
    }

    // Ensure target audio files are writable
    for (const af of taskData.audioFiles) {
      try {
        await fs.access(af.path, fs.constants.W_OK)
      } catch (err: unknown) {
        Logger.error(`[AudioMetadataManager] Audio file is not writable: ${af.path}`)
        const taskFailedString = {
          text: `Audio file "${Path.basename(af.path)}" is not writable`,
          key: 'MessageTaskAudioFileNotWritable',
          subs: [Path.basename(af.path)]
        }
        task.setFailed(taskFailedString)
        this.handleTaskFinished(task)
        return
      }
    }

    // Ensure item cache dir exists
    let cacheDirCreated = false
    if (!(await fs.pathExists(taskData.itemCachePath))) {
      try {
        await fs.mkdir(taskData.itemCachePath)
        cacheDirCreated = true
      } catch (err: unknown) {
        Logger.error(`[AudioMetadataManager] Failed to create cache directory ${taskData.itemCachePath}`, err)
        const taskFailedString = {
          text: 'Failed to create cache directory',
          key: 'MessageTaskFailedToCreateCacheDirectory'
        }
        task.setFailed(taskFailedString)
        this.handleTaskFinished(task)
        return
      }
    }

    // Create ffmetadata file
    const ffmetadataPath = Path.join(taskData.itemCachePath, 'ffmetadata.txt')
    const success = await ffmpegHelpers.writeFFMetadataFile(taskData.metadataObject, taskData.chapters || [], ffmetadataPath)
    if (!success) {
      Logger.error(`[AudioMetadataManager] Failed to write ffmetadata file for audiobook "${taskData.libraryItemId}"`)
      const taskFailedString = {
        text: 'Failed to write metadata file',
        key: 'MessageTaskFailedToWriteMetadataFile'
      }
      task.setFailed(taskFailedString)
      this.handleTaskFinished(task)
      return
    }

    // Tag audio files
    let cummulativeProgress = 0
    for (const af of taskData.audioFiles) {
      const audioFileRelativeDuration = af.duration / taskData.duration
      SocketAuthority.adminEmitter('track_started', {
        libraryItemId: taskData.libraryItemId,
        ino: af.ino
      })

      // Backup audio file
      if (taskData.options.backupFiles) {
        try {
          const backupFilePath = Path.join(taskData.itemCachePath, af.filename)
          await fs.copy(af.path, backupFilePath)
          Logger.debug(`[AudioMetadataManager] Backed up audio file at "${backupFilePath}"`)
        } catch (err: unknown) {
          Logger.error(`[AudioMetadataManager] Failed to backup audio file "${af.path}"`, err)
          const taskFailedString = {
            text: `Failed to backup audio file "${Path.basename(af.path)}"`,
            key: 'MessageTaskFailedToBackupAudioFile',
            subs: [Path.basename(af.path)]
          }
          task.setFailed(taskFailedString)
          this.handleTaskFinished(task)
          return
        }
      }

      try {
        await ffmpegHelpers.addCoverAndMetadataToFile(
          af.path,
          taskData.coverPath,
          ffmetadataPath,
          af.index,
          taskData.mimeType || undefined,
          (progress: number) => {
            SocketAuthority.adminEmitter('task_progress', {
              libraryItemId: taskData.libraryItemId,
              progress: cummulativeProgress + progress * audioFileRelativeDuration
            })
            SocketAuthority.adminEmitter('track_progress', {
              libraryItemId: taskData.libraryItemId,
              ino: af.ino,
              progress
            })
          }
        )
        Logger.info(`[AudioMetadataManager] Successfully tagged audio file "${af.path}"`)
      } catch (err: unknown) {
        Logger.error(`[AudioMetadataManager] Failed to tag audio file "${af.path}"`, err)
        const taskFailedString = {
          text: `Failed to embed metadata in file "${Path.basename(af.path)}"`,
          key: 'MessageTaskFailedToEmbedMetadataInFile',
          subs: [Path.basename(af.path)]
        }
        task.setFailed(taskFailedString)
        this.handleTaskFinished(task)
        return
      }

      SocketAuthority.adminEmitter('track_finished', {
        libraryItemId: taskData.libraryItemId,
        ino: af.ino
      })

      cummulativeProgress += audioFileRelativeDuration * 100
    }

    // Remove temp cache file/folder if not backing up
    if (!taskData.options.backupFiles) {
      if (cacheDirCreated) {
        await fs.remove(taskData.itemCachePath)
      } else {
        await fs.remove(ffmetadataPath)
      }
    }

    task.setFinished()
    this.handleTaskFinished(task)
  }

  handleTaskFinished(task: Task): void {
    TaskManager.taskFinished(task)
    this.tasksRunning = this.tasksRunning.filter((t) => t.id !== task.id)

    if (this.tasksRunning.length < this.MAX_CONCURRENT_TASKS && this.tasksQueued.length) {
      Logger.info(`[AudioMetadataManager] Task finished and dequeueing next task. ${this.tasksQueued.length} tasks queued.`)
      const nextTask = this.tasksQueued.shift()
      if (nextTask) {
        SocketAuthority.emitter('metadata_embed_queue_update', {
          libraryItemId: nextTask.data.libraryItemId,
          queued: false
        })
        void this.runMetadataEmbed(nextTask)
      }
    } else if (this.tasksRunning.length > 0) {
      Logger.debug(`[AudioMetadataManager] Task finished but not dequeueing. Currently running ${this.tasksRunning.length} tasks. ${this.tasksQueued.length} tasks queued.`)
    } else {
      Logger.debug('[AudioMetadataManager] Task finished and no tasks remain in queue')
    }
  }
}

namespace AudioMetadataManager {
  export type AudioMetadataManagerInstance = AudioMetadataManager
  export type UpdateMetadataOptionsType = UpdateMetadataOptions
  export type AudioMetadataTaskDataType = AudioMetadataTaskData
}

export = AudioMetadataManager
