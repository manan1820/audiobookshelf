import { v4 as uuidv4 } from 'uuid'
import type { TaskJSON, TaskString } from '../types'

class Task {
  id: string | null
  action: string | null
  data: Record<string, unknown> | null

  title: string | null
  titleKey: string | null
  titleSubs: string[] | null

  description: string | null
  descriptionKey: string | null
  descriptionSubs: string[] | null

  error: string | null
  errorKey: string | null
  errorSubs: string[] | null

  showSuccess: boolean
  isFailed: boolean
  isFinished: boolean

  startedAt: number | null
  finishedAt: number | null
  failedAt?: number | null

  constructor() {
    this.id = null
    this.action = null
    this.data = null

    this.title = null
    this.titleKey = null
    this.titleSubs = null

    this.description = null
    this.descriptionKey = null
    this.descriptionSubs = null

    this.error = null
    this.errorKey = null
    this.errorSubs = null

    this.showSuccess = false
    this.isFailed = false
    this.isFinished = false

    this.startedAt = null
    this.finishedAt = null
  }

  toJSON(): TaskJSON {
    return {
      id: this.id,
      action: this.action,
      data: this.data ? { ...this.data } : {},
      title: this.title,
      titleKey: this.titleKey,
      titleSubs: this.titleSubs,
      description: this.description,
      descriptionKey: this.descriptionKey,
      descriptionSubs: this.descriptionSubs,
      error: this.error,
      errorKey: this.errorKey,
      errorSubs: this.errorSubs,
      showSuccess: this.showSuccess,
      isFailed: this.isFailed,
      isFinished: this.isFinished,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt
    }
  }

  setData(
    action: string,
    titleString: TaskString,
    descriptionString: TaskString | null,
    showSuccess: boolean,
    data: Record<string, unknown> = {}
  ): void {
    this.id = uuidv4()
    this.action = action
    this.data = { ...data }
    this.title = titleString.text
    this.titleKey = titleString.key || null
    this.titleSubs = titleString.subs || null
    this.description = descriptionString?.text || null
    this.descriptionKey = descriptionString?.key || null
    this.descriptionSubs = descriptionString?.subs || null
    this.showSuccess = showSuccess
    this.startedAt = Date.now()
  }

  setFailed(messageString: TaskString): void {
    this.error = messageString.text
    this.errorKey = messageString.key || null
    this.errorSubs = messageString.subs || null
    this.isFailed = true
    this.failedAt = Date.now()
    this.setFinished()
  }

  setFinished(newDescriptionString: TaskString | null = null, clearDescription = false): void {
    if (newDescriptionString) {
      this.description = newDescriptionString.text
      this.descriptionKey = newDescriptionString.key || null
      this.descriptionSubs = newDescriptionString.subs || null
    } else if (clearDescription) {
      this.description = null
      this.descriptionKey = null
      this.descriptionSubs = null
    }
    this.isFinished = true
    this.finishedAt = Date.now()
  }
}

export = Task
