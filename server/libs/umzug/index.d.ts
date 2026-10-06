import type { Sequelize } from 'sequelize'

export interface MigrationParams {
  name: string
  path?: string
  context: unknown
}

export interface MigrationRecord {
  name: string
  path?: string
}

export interface MigrationFile {
  name: string
  path?: string
  up?: (params: unknown) => Promise<unknown>
  down?: (params: unknown) => Promise<unknown>
}

export interface UmzugOptions {
  migrations?:
    | {
        files?: string[]
        resolve?: (params: { name: string; path: string }) => MigrationFile
      }
    | (() => Promise<MigrationFile[]>)
  context?: unknown
  storage?: unknown
  logger?: unknown
  [key: string]: unknown
}

export class SequelizeStorage {
  constructor(options: { sequelize: Sequelize; [key: string]: unknown })
}

export function memoryStorage(): unknown

export class Umzug {
  options: UmzugOptions
  constructor(options: UmzugOptions)
  migrations(): Promise<MigrationFile[]>
  executed(): Promise<MigrationRecord[]>
  up(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
  down(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
}
