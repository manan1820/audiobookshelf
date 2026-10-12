import { v4 as uuidv4 } from 'uuid'
import type { TaskString, TaskData, TaskJsonObject } from '../types'

class Task {
  id: string | null = null
  action: string | null = null
  data: TaskData = {}

  title: string | null = null
  titleKey: string | null = null
  titleSubs: string[] | null = null

  description: string | null = null
  descriptionKey: string | null = null
  descriptionSubs: string[] | null = null

  error: string | null = null
  errorKey: string | null = null
  errorSubs: string[] | null = null

  showSuccess = false
  isFailed = false
  isFinished = false

  startedAt: number | null = null
  finishedAt: number | null = null
  failedAt: number | null = null

  toJSON(): TaskJsonObject {
    return {
      id: this.id,
      action: this.action,
      data: { ...this.data },
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
    data: TaskData = {}
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
