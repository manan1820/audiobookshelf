import { Umzug, SequelizeStorage } from '../libs/umzug'
import { Sequelize, DataTypes, QueryTypes } from 'sequelize'
import semver from 'semver'
import path from 'path'
import Module from 'module'
import fs from '../libs/fsExtra'
import Logger from '../Logger'

interface NodeModuleInternal {
  filename: string
  paths: string[]
  _compile(code: string, filename: string): void
  exports: {
    up?: (params: unknown) => Promise<unknown>
    down?: (params: unknown) => Promise<unknown>
  }
}

interface ModuleConstructor {
  new (id: string, parent?: unknown): NodeModuleInternal
  _nodeModulePaths(from: string): string[]
}

class MigrationManager {
  static MIGRATIONS_META_TABLE = 'migrationsMeta'

  sequelize: Sequelize
  isDatabaseNew: boolean
  configPath: string
  migrationsSourceDir: string
  initialized: boolean
  migrationsDir: string | null
  maxVersion: string | null
  databaseVersion: string | null
  serverVersion: string | null
  umzug: Umzug | null

  /**
   * @param {Sequelize} sequelize
   * @param {boolean} isDatabaseNew
   * @param {string} [configPath]
   */
  constructor(sequelize: Sequelize, isDatabaseNew: boolean, configPath: string = global.configPath as string) {
    if (!sequelize || !(sequelize instanceof Sequelize)) throw new Error('Sequelize instance is required for MigrationManager.')
    this.sequelize = sequelize
    this.isDatabaseNew = isDatabaseNew
    if (!configPath) throw new Error('Config path is required for MigrationManager.')
    this.configPath = configPath
    this.migrationsSourceDir = path.join(__dirname, '..', 'migrations')
    this.initialized = false
    this.migrationsDir = null
    this.maxVersion = null
    this.databaseVersion = null
    this.serverVersion = null
    this.umzug = null
  }

  /**
   * Init version vars and copy migration files to config dir if necessary
   *
   * @param {string} [serverVersion]
   */
  async init(serverVersion?: string): Promise<void> {
    if (!(await fs.pathExists(this.configPath))) throw new Error(`Config path does not exist: ${this.configPath}`)

    this.migrationsDir = path.join(this.configPath, 'migrations')
    try {
      await fs.ensureDir(this.migrationsDir)
    } catch (error) {
      const err = error as Error
      Logger.error(`[MigrationManager] Failed to create migrations directory at "${this.migrationsDir}": ${err.message}`)
      throw new Error(`[MigrationManager] Failed to create migrations directory at "${this.migrationsDir}"`, { cause: error })
    }

    this.serverVersion = this.extractVersionFromTag(serverVersion)
    if (!this.serverVersion) throw new Error(`Invalid server version: ${serverVersion}. Expected a version tag like v1.2.3.`)

    await this.fetchVersionsFromDatabase()
    if (!this.maxVersion || !this.databaseVersion) throw new Error('Failed to fetch versions from the database.')
    Logger.debug(`[MigrationManager] Database version: ${this.databaseVersion}, Max version: ${this.maxVersion}, Server version: ${this.serverVersion}`)

    if (semver.gt(this.serverVersion, this.maxVersion)) {
      try {
        await this.copyMigrationsToConfigDir()
      } catch (error) {
        throw new Error('Failed to copy migrations to the config directory.', { cause: error })
      }

      try {
        await this.updateMaxVersion()
      } catch (error) {
        throw new Error('Failed to update max version in the database.', { cause: error })
      }
    }

    this.initialized = true
  }

  async runMigrations(): Promise<void> {
    if (!this.initialized) throw new Error('MigrationManager is not initialized. Call init() first.')

    if (this.isDatabaseNew) {
      Logger.info('[MigrationManager] Database is new. Skipping migrations.')
      return
    }

    if (!this.serverVersion || !this.databaseVersion) {
      throw new Error('Version information is missing for MigrationManager.')
    }

    const versionCompare = semver.compare(this.serverVersion, this.databaseVersion)
    if (versionCompare === 0) {
      Logger.info('[MigrationManager] Database is already up to date.')
      return
    }

    await this.initUmzug()
    if (!this.umzug) throw new Error('Umzug instance is not initialized.')
    const migrations = await this.umzug.migrations()
    const executedMigrations = (await this.umzug.executed()).map((m) => m.name)

    const migrationDirection = versionCompare === 1 ? 'up' : 'down'

    let migrationsToRun: string[] = []
    migrationsToRun = this.findMigrationsToRun(migrations, executedMigrations, migrationDirection)

    // Only proceed with migration if there are migrations to run
    if (migrationsToRun.length > 0) {
      const originalDbPath = path.join(this.configPath, 'absdatabase.sqlite')
      const backupDbPath = path.join(this.configPath, 'absdatabase.backup.sqlite')
      try {
        Logger.info(`[MigrationManager] Migrating database ${migrationDirection} to version ${this.serverVersion}`)
        Logger.info(`[MigrationManager] Migrations to run: ${migrationsToRun.join(', ')}`)
        // Create a backup copy of the SQLite database before starting migrations
        await fs.copy(originalDbPath, backupDbPath)
        Logger.info('Created a backup of the original database.')

        // Run migrations
        if (migrationDirection === 'up') {
          await this.umzug.up({ migrations: migrationsToRun, rerun: 'ALLOW' })
        } else {
          await this.umzug.down({ migrations: migrationsToRun, rerun: 'ALLOW' })
        }

        // Clean up the backup
        await fs.remove(backupDbPath)

        Logger.info('[MigrationManager] Migrations successfully applied to the original database.')
      } catch (error) {
        Logger.error('[MigrationManager] Migration failed:', error)

        await this.sequelize.close()

        // Step 3: If migration fails, save the failed original and restore the backup
        const failedDbPath = path.join(this.configPath, 'absdatabase.failed.sqlite')
        await fs.move(originalDbPath, failedDbPath, { overwrite: true })
        Logger.info('[MigrationManager] Saved the failed database as absdatabase.failed.sqlite.')

        await fs.move(backupDbPath, originalDbPath, { overwrite: true })
        Logger.info('[MigrationManager] Restored the original database from the backup.')

        Logger.info('[MigrationManager] Migration failed. Exiting Audiobookshelf with code 1.')
        process.exit(1)
      }
    } else {
      Logger.info('[MigrationManager] No migrations to run.')
    }

    await this.updateDatabaseVersion()
  }

  async initUmzug(umzugStorage: unknown = new SequelizeStorage({ sequelize: this.sequelize })): Promise<void> {
    if (!this.migrationsDir) {
      throw new Error('Migrations directory is not set.')
    }

    // This check is for dependency injection in tests
    const files = (await fs.readdir(this.migrationsDir))
      .filter((file) => {
        // Only include .js files and exclude dot files
        return !file.startsWith('.') && path.extname(file).toLowerCase() === '.js'
      })
      .map((file) => path.join(this.migrationsDir as string, file))

    // Validate migration names
    for (const file of files) {
      const migrationName = path.basename(file, path.extname(file))
      const migrationVersion = this.extractVersionFromTag(migrationName)
      if (!migrationVersion) {
        throw new Error(`Invalid migration file: "${migrationName}". Unable to extract version from filename.`)
      }
    }

    const parent = new Umzug({
      migrations: {
        files,
        resolve: (params: { name: string; path: string }) => {
          // make script think it's in migrationsSourceDir
          const migrationPath = params.path
          const migrationName = params.name
          const contents = fs.readFileSync(migrationPath, 'utf8')
          const fakePath = path.join(this.migrationsSourceDir, path.basename(migrationPath))
          const ModuleCtor = Module as unknown as ModuleConstructor
          const mod = new ModuleCtor(fakePath)
          mod.filename = fakePath
          mod.paths = ModuleCtor._nodeModulePaths(this.migrationsSourceDir)
          mod._compile(contents, fakePath)
          const script = mod.exports
          return {
            name: migrationName,
            path: migrationPath,
            up: script.up,
            down: script.down
          }
        }
      },
      context: { queryInterface: this.sequelize.getQueryInterface(), logger: Logger },
      storage: umzugStorage,
      logger: Logger
    })

    // Sort migrations by version
    this.umzug = new Umzug({
      ...parent.options,
      migrations: async () =>
        (await parent.migrations()).sort((a, b) => {
          const versionA = this.extractVersionFromTag(a.name) || '0.0.0'
          const versionB = this.extractVersionFromTag(b.name) || '0.0.0'
          return semver.compare(versionA, versionB)
        })
    })
  }

  async fetchVersionsFromDatabase(): Promise<void> {
    await this.checkOrCreateMigrationsMetaTable()

    const versionRows = (await this.sequelize.query("SELECT value as version FROM :migrationsMeta WHERE key = 'version'", {
      replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
      type: QueryTypes.SELECT
    })) as { version: string }[]
    this.databaseVersion = versionRows[0]?.version || null

    const maxVersionRows = (await this.sequelize.query("SELECT value as maxVersion FROM :migrationsMeta WHERE key = 'maxVersion'", {
      replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
      type: QueryTypes.SELECT
    })) as { maxVersion: string }[]
    this.maxVersion = maxVersionRows[0]?.maxVersion || null
  }

  async checkOrCreateMigrationsMetaTable(): Promise<void> {
    const queryInterface = this.sequelize.getQueryInterface()
    let migrationsMetaTableExists = await queryInterface.tableExists(MigrationManager.MIGRATIONS_META_TABLE)

    // If the table exists, check that the `version` and `maxVersion` rows exist
    if (migrationsMetaTableExists) {
      const countRows = (await this.sequelize.query("SELECT COUNT(*) as count FROM :migrationsMeta WHERE key IN ('version', 'maxVersion')", {
        replacements: { migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: QueryTypes.SELECT
      })) as { count: number }[]
      const count = countRows[0]?.count ?? 0
      if (count < 2) {
        Logger.warn(`[MigrationManager] migrationsMeta table exists but is missing 'version' or 'maxVersion' row. Dropping it...`)
        await queryInterface.dropTable(MigrationManager.MIGRATIONS_META_TABLE)
        migrationsMetaTableExists = false
      }
    }

    if (this.isDatabaseNew && migrationsMetaTableExists) {
      Logger.warn(`[MigrationManager] migrationsMeta table already exists. Dropping it...`)
      // This can happen if database was initialized with force: true
      await queryInterface.dropTable(MigrationManager.MIGRATIONS_META_TABLE)
      migrationsMetaTableExists = false
    }

    if (!migrationsMetaTableExists) {
      await queryInterface.createTable(MigrationManager.MIGRATIONS_META_TABLE, {
        key: {
          type: DataTypes.STRING,
          allowNull: false
        },
        value: {
          type: DataTypes.STRING,
          allowNull: false
        }
      })
      await this.sequelize.query("INSERT INTO :migrationsMeta (key, value) VALUES ('version', :version), ('maxVersion', '0.0.0')", {
        replacements: { version: this.isDatabaseNew ? this.serverVersion : '0.0.0', migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: QueryTypes.INSERT
      })
      Logger.debug(`[MigrationManager] Created migrationsMeta table: "${MigrationManager.MIGRATIONS_META_TABLE}"`)
    }
  }

  extractVersionFromTag(tag?: string | null): string | null {
    if (!tag) return null
    const versionMatch = tag.match(/^v?(\d+\.\d+\.\d+)/)
    return versionMatch ? versionMatch[1] : null
  }

  async copyMigrationsToConfigDir(): Promise<void> {
    if (!(await fs.pathExists(this.migrationsSourceDir))) return
    if (!this.migrationsDir) return

    const files = await fs.readdir(this.migrationsSourceDir)
    await Promise.all(
      files
        .filter((file) => path.extname(file) === '.js')
        .map(async (file) => {
          const sourceFile = path.join(this.migrationsSourceDir, file)
          const targetFile = path.join(this.migrationsDir as string, file)
          await fs.copy(sourceFile, targetFile) // Asynchronously copy the files
        })
    )
    Logger.debug(`[MigrationManager] Copied migrations to the config directory: "${this.migrationsDir}"`)
  }

  /**
   * @param {{ name: string }[]} migrations
   * @param {string[]} executedMigrations - names of executed migrations
   * @param {string} direction - 'up' or 'down'
   * @returns {string[]} - names of migrations to run
   */
  findMigrationsToRun(migrations: { name: string }[], executedMigrations: string[], direction: string): string[] {
    const migrationsToRun = migrations
      .filter((migration) => {
        const migrationVersion = this.extractVersionFromTag(migration.name)
        if (!migrationVersion || !this.databaseVersion || !this.serverVersion) return false
        if (direction === 'up') {
          return semver.gt(migrationVersion, this.databaseVersion) && semver.lte(migrationVersion, this.serverVersion) && !executedMigrations.includes(migration.name)
        } else {
          // A down migration should be run even if the associated up migration wasn't executed before
          return semver.lte(migrationVersion, this.databaseVersion) && semver.gt(migrationVersion, this.serverVersion)
        }
      })
      .map((migration) => migration.name)
    if (direction === 'down') {
      return migrationsToRun.reverse()
    } else {
      return migrationsToRun
    }
  }

  async updateMaxVersion(): Promise<void> {
    try {
      await this.sequelize.query("UPDATE :migrationsMeta SET value = :maxVersion WHERE key = 'maxVersion'", {
        replacements: { maxVersion: this.serverVersion, migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: QueryTypes.UPDATE
      })
    } catch (error) {
      throw new Error('Failed to update maxVersion in the migrationsMeta table.', { cause: error })
    }
    this.maxVersion = this.serverVersion
  }

  async updateDatabaseVersion(): Promise<void> {
    try {
      await this.sequelize.query("UPDATE :migrationsMeta SET value = :version WHERE key = 'version'", {
        replacements: { version: this.serverVersion, migrationsMeta: MigrationManager.MIGRATIONS_META_TABLE },
        type: QueryTypes.UPDATE
      })
    } catch (error) {
      throw new Error('Failed to update version in the migrationsMeta table.', { cause: error })
    }
    this.databaseVersion = this.serverVersion
  }
}

export = MigrationManager
