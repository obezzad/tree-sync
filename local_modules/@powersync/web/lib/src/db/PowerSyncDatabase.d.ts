import { type BucketStorageAdapter, type PowerSyncBackendConnector, type PowerSyncCloseOptions, type PowerSyncConnectionOptions, AbstractPowerSyncDatabase, DBAdapter, PowerSyncDatabaseOptions, PowerSyncDatabaseOptionsWithDBAdapter, PowerSyncDatabaseOptionsWithOpenFactory, PowerSyncDatabaseOptionsWithSettings, StreamingSyncImplementation } from '@powersync/common';
import { Mutex } from 'async-mutex';
import { ResolvedWebSQLOpenOptions, WebSQLFlags } from './adapters/web-sql-flags';
export interface WebPowerSyncFlags extends WebSQLFlags {
    /**
     * Externally unload open PowerSync database instances when the window closes.
     * Setting this to `true` requires calling `close` on all open PowerSyncDatabase
     * instances before the window unloads
     */
    externallyUnload?: boolean;
}
type WithWebFlags<Base> = Base & {
    flags?: WebPowerSyncFlags;
};
export interface WebSyncOptions {
    /**
     * Allows you to override the default sync worker.
     *
     * You can either provide a path to the worker script
     * or a factory method that returns a worker.
     */
    worker?: string | URL | ((options: ResolvedWebSQLOpenOptions) => SharedWorker);
}
type WithWebSyncOptions<Base> = Base & {
    sync?: WebSyncOptions;
};
export interface WebEncryptionOptions {
    /**
     * Encryption key for the database.
     * If set, the database will be encrypted using Multiple Ciphers.
     */
    encryptionKey?: string;
}
type WithWebEncryptionOptions<Base> = Base & WebEncryptionOptions;
export type WebPowerSyncDatabaseOptionsWithAdapter = WithWebSyncOptions<WithWebFlags<PowerSyncDatabaseOptionsWithDBAdapter>>;
export type WebPowerSyncDatabaseOptionsWithOpenFactory = WithWebSyncOptions<WithWebFlags<PowerSyncDatabaseOptionsWithOpenFactory>>;
export type WebPowerSyncDatabaseOptionsWithSettings = WithWebSyncOptions<WithWebFlags<WithWebEncryptionOptions<PowerSyncDatabaseOptionsWithSettings>>>;
export type WebPowerSyncDatabaseOptions = WithWebSyncOptions<WithWebFlags<PowerSyncDatabaseOptions>>;
export declare const DEFAULT_POWERSYNC_FLAGS: Required<WebPowerSyncFlags>;
export declare const resolveWebPowerSyncFlags: (flags?: WebPowerSyncFlags) => Required<WebPowerSyncFlags>;
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
export declare class PowerSyncDatabase extends AbstractPowerSyncDatabase {
    protected options: WebPowerSyncDatabaseOptions;
    static SHARED_MUTEX: Mutex;
    protected unloadListener?: () => Promise<void>;
    protected resolvedFlags: WebPowerSyncFlags;
    constructor(options: WebPowerSyncDatabaseOptionsWithAdapter);
    constructor(options: WebPowerSyncDatabaseOptionsWithOpenFactory);
    constructor(options: WebPowerSyncDatabaseOptionsWithSettings);
    constructor(options: WebPowerSyncDatabaseOptions);
    _initialize(): Promise<void>;
    protected openDBAdapter(options: WebPowerSyncDatabaseOptionsWithSettings): DBAdapter;
    /**
     * Closes the database connection.
     * By default the sync stream client is only disconnected if
     * multiple tabs are not enabled.
     */
    close(options?: PowerSyncCloseOptions): Promise<void>;
    connect(connector: PowerSyncBackendConnector, options?: PowerSyncConnectionOptions): Promise<void>;
    protected generateBucketStorageAdapter(): BucketStorageAdapter;
    protected runExclusive<T>(cb: () => Promise<T>): Promise<any>;
    protected generateSyncStreamImplementation(connector: PowerSyncBackendConnector): StreamingSyncImplementation;
}
export {};
