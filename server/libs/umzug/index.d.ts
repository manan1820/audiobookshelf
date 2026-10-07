import type { Sequelize } from 'sequelize'

export interface MigrationParams {
  name: string
  path?: string
  context: unknown
}

export interface RunnableMigration {
  name: string
  path?: string
  up: (params: MigrationParams) => Promise<unknown>
  down?: (params: MigrationParams) => Promise<unknown>
}

export interface UmzugOptions {
  migrations?:
    | {
        files?: string[]
        resolve?: (params: { name: string; path: string }) => RunnableMigration
      }
    | (() => Promise<RunnableMigration[]>)
  context?: unknown
  storage?: unknown
  logger?: unknown
}

export class Umzug {
  constructor(options: UmzugOptions)
  options: UmzugOptions
  migrations(): Promise<RunnableMigration[]>
  executed(): Promise<RunnableMigration[]>
  up(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
  down(options?: { migrations?: string[]; rerun?: string }): Promise<unknown>
}

export class SequelizeStorage {
  constructor(options: { sequelize: Sequelize; tableName?: string; columnType?: unknown })
}

export function memoryStorage(): unknown
