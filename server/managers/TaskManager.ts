import SocketAuthority from '../SocketAuthority'
import Task from '../objects/Task'
import type { TaskString, TaskData } from '../types'

class TaskManager {
  tasks: Task[]

  constructor() {
    this.tasks = []
  }

  addTask(task: Task): void {
    this.tasks.push(task)
    SocketAuthority.emitter('task_started', task.toJSON())
  }

  taskFinished(task: Task): void {
    if (this.tasks.some((t) => t.id === task.id)) {
      this.tasks = this.tasks.filter((t) => t.id !== task.id)
      SocketAuthority.emitter('task_finished', task.toJSON())
    }
  }

  createAndAddTask(
    action: string,
    titleString: TaskString,
    descriptionString: TaskString | null,
    showSuccess: boolean,
    data: TaskData = {}
  ): Task {
    const task = new Task()
    task.setData(action, titleString, descriptionString, showSuccess, data)
    this.addTask(task)
    return task
  }

  createAndEmitFailedTask(
    action: string,
    titleString: TaskString,
    descriptionString: TaskString | null,
    errorMessageString: TaskString
  ): Task {
    const task = new Task()
    task.setData(action, titleString, descriptionString, false)
    task.setFailed(errorMessageString)
    SocketAuthority.emitter('task_started', task.toJSON())
    return task
  }
}

const taskManager = new TaskManager()

namespace TaskManager {
  export type TaskManagerInstance = TaskManager
}

export = taskManager
