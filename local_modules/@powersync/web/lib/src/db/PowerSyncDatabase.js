import { AbstractPowerSyncDatabase, DEFAULT_POWERSYNC_CLOSE_OPTIONS, isDBAdapter, isSQLOpenFactory, SqliteBucketStorage } from '@powersync/common';
import { Mutex } from 'async-mutex';
import { getNavigatorLocks } from '../shared/navigator';
import { WASQLiteOpenFactory } from './adapters/wa-sqlite/WASQLiteOpenFactory';
import { DEFAULT_WEB_SQL_FLAGS, resolveWebSQLFlags } from './adapters/web-sql-flags';
import { SharedWebStreamingSyncImplementation } from './sync/SharedWebStreamingSyncImplementation';
import { SSRStreamingSyncImplementation } from './sync/SSRWebStreamingSyncImplementation';
import { WebRemote } from './sync/WebRemote';
import { WebStreamingSyncImplementation } from './sync/WebStreamingSyncImplementation';
export const DEFAULT_POWERSYNC_FLAGS = {
    ...DEFAULT_WEB_SQL_FLAGS,
    externallyUnload: false
};
export const resolveWebPowerSyncFlags = (flags) => {
    return {
        ...DEFAULT_POWERSYNC_FLAGS,
        ...flags,
        ...resolveWebSQLFlags(flags)
    };
};
/**
 * Asserts that the database options are valid for custom database constructors.
 */
function assertValidDatabaseOptions(options) {
    if ('database' in options && 'encryptionKey' in options) {
        const { database } = options;
        if (isSQLOpenFactory(database) || isDBAdapter(database)) {
            throw new Error(`Invalid configuration: 'encryptionKey' should only be included inside the database object when using a custom ${isSQLOpenFactory(database) ? 'WASQLiteOpenFactory' : 'WASQLiteDBAdapter'} constructor.`);
        }
    }
}
/**
 * A PowerSync database which provides SQLite functionality
 * which is automatically synced.
 *
 * @example
 * ```typescript
 * export const db = new PowerSyncDatabase({
 *  schema: AppSchema,
 *  database: {
 *    dbFilename: 'example.db'
 *  }
 * });
 * ```
 */
export class PowerSyncDatabase extends AbstractPowerSyncDatabase {
    options;
    static SHARED_MUTEX = new Mutex();
    unloadListener;
    resolvedFlags;
    constructor(options) {
        super(options);
        this.options = options;
        assertValidDatabaseOptions(options);
        this.resolvedFlags = resolveWebPowerSyncFlags(options.flags);
        if (this.resolvedFlags.enableMultiTabs && !this.resolvedFlags.externallyUnload) {
            this.unloadListener = () => this.close({ disconnect: false });
            window.addEventListener('unload', this.unloadListener);
        }
    }
    async _initialize() { }
    openDBAdapter(options) {
        const defaultFactory = new WASQLiteOpenFactory({
            ...options.database,
            flags: resolveWebPowerSyncFlags(options.flags),
            encryptionKey: options.encryptionKey
        });
        return defaultFactory.openDB();
    }
    /**
     * Closes the database connection.
     * By default the sync stream client is only disconnected if
     * multiple tabs are not enabled.
     */
    close(options = DEFAULT_POWERSYNC_CLOSE_OPTIONS) {
        if (this.unloadListener) {
            window.removeEventListener('unload', this.unloadListener);
        }
        return super.close({
            // Don't disconnect by default if multiple tabs are enabled
            disconnect: options.disconnect ?? !this.resolvedFlags.enableMultiTabs
        });
    }
    connect(connector, options) {
        /**
         * Using React strict mode might cause calls to connect to fire multiple times
         * Connect is wrapped inside a lock in order to prevent race conditions internally between multiple
         * connection attempts.
         */
        return this.runExclusive(() => {
            this.options.logger?.debug('Attempting to connect to PowerSync instance');
            return super.connect(connector, options);
        });
    }
    generateBucketStorageAdapter() {
        return new SqliteBucketStorage(this.database, AbstractPowerSyncDatabase.transactionMutex);
    }
    runExclusive(cb) {
        if (this.resolvedFlags.ssrMode) {
            return PowerSyncDatabase.SHARED_MUTEX.runExclusive(cb);
        }
        return getNavigatorLocks().request(`lock-${this.database.name}`, cb);
    }
    generateSyncStreamImplementation(connector) {
        const remote = new WebRemote(connector);
        const syncOptions = {
            ...this.options,
            flags: this.resolvedFlags,
            adapter: this.bucketStorageAdapter,
            remote,
            uploadCrud: async () => {
                await this.waitForReady();
                await connector.uploadData(this);
            },
            identifier: this.database.name
        };
        switch (true) {
            case this.resolvedFlags.ssrMode:
                return new SSRStreamingSyncImplementation(syncOptions);
            case this.resolvedFlags.enableMultiTabs:
                if (!this.resolvedFlags.broadcastLogs) {
                    const warning = `
            Multiple tabs are enabled, but broadcasting of logs is disabled.
            Logs for shared sync worker will only be available in the shared worker context
          `;
                    const logger = this.options.logger;
                    logger ? logger.warn(warning) : console.warn(warning);
                }
                return new SharedWebStreamingSyncImplementation({
                    ...syncOptions,
                    db: this.database // This should always be the case
                });
            default:
                return new WebStreamingSyncImplementation(syncOptions);
        }
    }
}
