export const LIST: number

export interface RraItem {
  name: string
  path: string
  fullname: string
  extension: string
  deep: number
  error?: unknown
}

export function list(path: string, options?: unknown): Promise<RraItem[] | { error?: unknown }>

declare const rra: {
  LIST: number
  list: (path: string, options?: unknown) => Promise<RraItem[] | { error?: unknown }>
}

export default rra
export = rra
