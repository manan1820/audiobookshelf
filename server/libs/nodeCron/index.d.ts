export interface CronScheduleOptions {
  scheduled?: boolean
  timezone?: string
}

export function schedule(
  expression: string,
  func: (() => void) | string,
  options?: CronScheduleOptions
): unknown

export function validate(expression: string): boolean

export function getTasks(): unknown[]

declare const nodeCron: {
  schedule: typeof schedule
  validate: typeof validate
  getTasks: typeof getTasks
}

export default nodeCron
