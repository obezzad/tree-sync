import { Mutex } from 'async-mutex';
import Logger, { ILogger } from 'js-logger';
import { DBAdapter, QueryResult, Transaction } from '../db/DBAdapter.js';
import { SyncStatus } from '../db/crud/SyncStatus.js';
import { UploadQueueStats } from '../db/crud/UploadQueueStatus.js';
import { Schema } from '../db/schema/Schema.js';
import { BaseObserver } from '../utils/BaseObserver.js';
import { SQLOpenFactory, SQLOpenOptions } from './SQLOpenFactory.js';
import { PowerSyncBackendConnector } from './connection/PowerSyncBackendConnector.js';
import { BucketStorageAdapter } from './sync/bucket/BucketStorageAdapter.js';
import { CrudBatch } from './sync/bucket/CrudBatch.js';
import { CrudTransaction } from './sync/bucket/CrudTransaction.js';
import { type AdditionalConnectionOptions, type PowerSyncConnectionOptions, StreamingSyncImplementation, StreamingSyncImplementationListener, type RequiredAdditionalConnectionOptions } from './sync/stream/AbstractStreamingSyncImplementation.js';
export interface DisconnectAndClearOptions {
    /** When set to false, data in local-only tables is preserved. */
    clearLocal?: boolean;
}
export interface BasePowerSyncDatabaseOptions extends AdditionalConnectionOptions {
    /** Schema used for the local database. */
    schema: Schema;
    /**
     * @deprecated Use {@link retryDelayMs} instead as this will be removed in future releases.
     */
    retryDelay?: number;
    logger?: ILogger;
}
export interface PowerSyncDatabaseOptions extends BasePowerSyncDatabaseOptions {
    /**
     * Source for a SQLite database connection.
     * This can be either:
     *  - A {@link DBAdapter} if providing an instantiated SQLite connection
     *  - A {@link SQLOpenFactory} which will be used to open a SQLite connection
     *  - {@link SQLOpenOptions} for opening a SQLite connection with a default {@link SQLOpenFactory}
     */
    database: DBAdapter | SQLOpenFactory | SQLOpenOptions;
}
export interface PowerSyncDatabaseOptionsWithDBAdapter extends BasePowerSyncDatabaseOptions {
    database: DBAdapter;
}
export interface PowerSyncDatabaseOptionsWithOpenFactory extends BasePowerSyncDatabaseOptions {
    database: SQLOpenFactory;
}
export interface PowerSyncDatabaseOptionsWithSettings extends BasePowerSyncDatabaseOptions {
    database: SQLOpenOptions;
}
export interface SQLWatchOptions {
    signal?: AbortSignal;
    tables?: string[];
    /** The minimum interval between queries. */
    throttleMs?: number;
    /**
     * @deprecated All tables specified in {@link tables} will be watched, including PowerSync tables with prefixes.
     *
     * Allows for watching any SQL table
     * by not removing PowerSync table name prefixes
     */
    rawTableNames?: boolean;
}
export interface WatchOnChangeEvent {
    changedTables: string[];
}
export interface WatchHandler {
    onResult: (results: QueryResult) => void;
    onError?: (error: Error) => void;
}
export interface WatchOnChangeHandler {
    onChange: (event: WatchOnChangeEvent) => Promise<void> | void;
    onError?: (error: Error) => void;
}
export interface PowerSyncDBListener extends StreamingSyncImplementationListener {
    initialized: () => void;
    schemaChanged: (schema: Schema) => void;
}
export interface PowerSyncCloseOptions {
    /**
     * Disconnect the sync stream client if connected.
     * This is usually true, but can be false for Web when using
     * multiple tabs and a shared sync provider.
     */
    disconnect?: boolean;
}
export declare const DEFAULT_POWERSYNC_CLOSE_OPTIONS: PowerSyncCloseOptions;
export declare const DEFAULT_WATCH_THROTTLE_MS = 30;
export declare const DEFAULT_POWERSYNC_DB_OPTIONS: {
    retryDelayMs: number;
    logger: Logger.ILogger;
    crudUploadThrottleMs: number;
};
export declare const DEFAULT_CRUD_BATCH_LIMIT = 100;
/**
 * Requesting nested or recursive locks can block the application in some circumstances.
 * This default lock timeout will act as a failsafe to throw an error if a lock cannot
 * be obtained.
 */
export declare const DEFAULT_LOCK_TIMEOUT_MS = 120000;
/**
 * Tests if the input is a {@link PowerSyncDatabaseOptionsWithSettings}
 * @internal
 */
export declare const isPowerSyncDatabaseOptionsWithSettings: (test: any) => test is PowerSyncDatabaseOptionsWithSettings;
export declare abstract class AbstractPowerSyncDatabase extends BaseObserver<PowerSyncDBListener> {
    protected options: PowerSyncDatabaseOptions;
    /**
     * Transactions should be queued in the DBAdapter, but we also want to prevent
     * calls to `.execute` while an async transaction is running.
     */
    protected static transactionMutex: Mutex;
    /**
     * Returns true if the connection is closed.
     */
    closed: boolean;
    ready: boolean;
    /**
     * Current connection status.
     */
    currentStatus: SyncStatus;
    syncStreamImplementation?: StreamingSyncImplementation;
    sdkVersion: string;
    protected bucketStorageAdapter: BucketStorageAdapter;
    private syncStatusListenerDisposer?;
    protected _isReadyPromise: Promise<void>;
    protected _schema: Schema;
    private _database;
    constructor(options: PowerSyncDatabaseOptionsWithDBAdapter);
    constructor(options: PowerSyncDatabaseOptionsWithOpenFactory);
    constructor(options: PowerSyncDatabaseOptionsWithSettings);
    constructor(options: PowerSyncDatabaseOptions);
    /**
     * Schema used for the local database.
     */
    get schema(): Schema<{
        [x: string]: import("../index.js").Table<any>;
    }>;
    /**
     * The underlying database.
     *
     * For the most part, behavior is the same whether querying on the underlying database, or on {@link AbstractPowerSyncDatabase}.
     */
    get database(): DBAdapter;
    /**
     * Whether a connection to the PowerSync service is currently open.
     */
    get connected(): boolean;
    get connecting(): boolean;
    /**
     * Opens the DBAdapter given open options using a default open factory
     */
    protected abstract openDBAdapter(options: PowerSyncDatabaseOptionsWithSettings): DBAdapter;
    protected abstract generateSyncStreamImplementation(connector: PowerSyncBackendConnector, options: RequiredAdditionalConnectionOptions): StreamingSyncImplementation;
    protected abstract generateBucketStorageAdapter(): BucketStorageAdapter;
    /**
     * @returns A promise which will resolve once initialization is completed.
     */
    waitForReady(): Promise<void>;
    /**
     * @returns A promise which will resolve once the first full sync has completed.
     */
    waitForFirstSync(signal?: AbortSignal): Promise<void>;
    /**
     * Allows for extended implementations to execute custom initialization
     * logic as part of the total init process
     */
    abstract _initialize(): Promise<void>;
    /**
     * Entry point for executing initialization logic.
     * This is to be automatically executed in the constructor.
     */
    protected initialize(): Promise<void>;
    private _loadVersion;
    protected updateHasSynced(): Promise<void>;
    /**
     * Replace the schema with a new version. This is for advanced use cases - typically the schema should just be specified once in the constructor.
     *
     * Cannot be used while connected - this should only be called before {@link AbstractPowerSyncDatabase.connect}.
     */
    updateSchema(schema: Schema): Promise<void>;
    /**
     * Wait for initialization to complete.
     * While initializing is automatic, this helps to catch and report initialization errors.
     */
    init(): Promise<void>;
    resolvedConnectionOptions(options?: PowerSyncConnectionOptions): RequiredAdditionalConnectionOptions;
    /**
     * Connects to stream of events from the PowerSync instance.
     */
    connect(connector: PowerSyncBackendConnector, options?: PowerSyncConnectionOptions): Promise<void>;
    /**
     * Close the sync connection.
     *
     * Use {@link connect} to connect again.
     */
    disconnect(): Promise<void>;
    /**
     *  Disconnect and clear the database.
     *  Use this when logging out.
     *  The database can still be queried after this is called, but the tables
     *  would be empty.
     *
     * To preserve data in local-only tables, set clearLocal to false.
     */
    disconnectAndClear(options?: DisconnectAndClearOptions): Promise<void>;
    /**
     * Close the database, releasing resources.
     *
     * Also disconnects any active connection.
     *
     * Once close is called, this connection cannot be used again - a new one
     * must be constructed.
     */
    close(options?: PowerSyncCloseOptions): Promise<void>;
    /**
     * Get upload queue size estimate and count.
     */
    getUploadQueueStats(includeSize?: boolean): Promise<UploadQueueStats>;
    /**
     * Get a batch of crud data to upload.
     *
     * Returns null if there is no data to upload.
     *
     * Use this from the {@link PowerSyncBackendConnector.uploadData} callback.
     *
     * Once the data have been successfully uploaded, call {@link CrudBatch.complete} before
     * requesting the next batch.
     *
     * Use {@link limit} to specify the maximum number of updates to return in a single
     * batch.
     *
     * This method does include transaction ids in the result, but does not group
     * data by transaction. One batch may contain data from multiple transactions,
     * and a single transaction may be split over multiple batches.
     */
    getCrudBatch(limit?: number): Promise<CrudBatch | null>;
    /**
     * Get the next recorded transaction to upload.
     *
     * Returns null if there is no data to upload.
     *
     * Use this from the {@link PowerSyncBackendConnector.uploadData} callback.
     *
     * Once the data have been successfully uploaded, call {@link CrudTransaction.complete} before
     * requesting the next transaction.
     *
     * Unlike {@link getCrudBatch}, this only returns data from a single transaction at a time.
     * All data for the transaction is loaded into memory.
     */
    getNextCrudTransaction(): Promise<CrudTransaction | null>;
    /**
     * Get an unique client id for this database.
     *
     * The id is not reset when the database is cleared, only when the database is deleted.
     */
    getClientId(): Promise<string>;
    private handleCrudCheckpoint;
    /**
     * Execute a write (INSERT/UPDATE/DELETE) query
     * and optionally return results.
     */
    execute(sql: string, parameters?: any[]): Promise<QueryResult>;
    /**
     * Execute a write query (INSERT/UPDATE/DELETE) multiple times with each parameter set
     * and optionally return results.
     * This is faster than executing separately with each parameter set.
     */
    executeBatch(sql: string, parameters?: any[][]): Promise<QueryResult>;
    /**
     *  Execute a read-only query and return results.
     */
    getAll<T>(sql: string, parameters?: any[]): Promise<T[]>;
    /**
     * Execute a read-only query and return the first result, or null if the ResultSet is empty.
     */
    getOptional<T>(sql: string, parameters?: any[]): Promise<T | null>;
    /**
     * Execute a read-only query and return the first result, error if the ResultSet is empty.
     */
    get<T>(sql: string, parameters?: any[]): Promise<T>;
    /**
     * Takes a read lock, without starting a transaction.
     * In most cases, {@link readTransaction} should be used instead.
     */
    readLock<T>(callback: (db: DBAdapter) => Promise<T>): Promise<T>;
    /**
     * Takes a global lock, without starting a transaction.
     * In most cases, {@link writeTransaction} should be used instead.
     */
    writeLock<T>(callback: (db: DBAdapter) => Promise<T>): Promise<T>;
    /**
     * Open a read-only transaction.
     * Read transactions can run concurrently to a write transaction.
     * Changes from any write transaction are not visible to read transactions started before it.
     */
    readTransaction<T>(callback: (tx: Transaction) => Promise<T>, lockTimeout?: number): Promise<T>;
    /**
     * Open a read-write transaction.
     * This takes a global lock - only one write transaction can execute against the database at a time.
     * Statements within the transaction must be done on the provided {@link Transaction} interface.
     */
    writeTransaction<T>(callback: (tx: Transaction) => Promise<T>, lockTimeout?: number): Promise<T>;
    /**
     * This version of `watch` uses {@link AsyncGenerator}, for documentation see {@link watchWithAsyncGenerator}.
     * Can be overloaded to use a callback handler instead, for documentation see {@link watchWithCallback}.
     *
     * @example
     * ```javascript
     * async *attachmentIds() {
     *   for await (const result of this.powersync.watch(
     *     `SELECT photo_id as id FROM todos WHERE photo_id IS NOT NULL`,
     *     []
     *   )) {
     *     yield result.rows?._array.map((r) => r.id) ?? [];
     *   }
     * }
     * ```
     */
    watch(sql: string, parameters?: any[], options?: SQLWatchOptions): AsyncIterable<QueryResult>;
    /**
     * See {@link watchWithCallback}.
     *
     * @example
     * ```javascript
     * onAttachmentIdsChange(onResult) {
     *   this.powersync.watch(
     *     `SELECT photo_id as id FROM todos WHERE photo_id IS NOT NULL`,
     *     [],
     *     {
     *       onResult: (result) => onResult(result.rows?._array.map((r) => r.id) ?? [])
     *     }
     *   );
     * }
     * ```
     */
    watch(sql: string, parameters?: any[], handler?: WatchHandler, options?: SQLWatchOptions): void;
    /**
     * Execute a read query every time the source tables are modified.
     * Use {@link SQLWatchOptions.throttleMs} to specify the minimum interval between queries.
     * Source tables are automatically detected using `EXPLAIN QUERY PLAN`.
     *
     * Note that the `onChange` callback member of the handler is required.
     */
    watchWithCallback(sql: string, parameters?: any[], handler?: WatchHandler, options?: SQLWatchOptions): void;
    /**
     * Execute a read query every time the source tables are modified.
     * Use {@link SQLWatchOptions.throttleMs} to specify the minimum interval between queries.
     * Source tables are automatically detected using `EXPLAIN QUERY PLAN`.
     */
    watchWithAsyncGenerator(sql: string, parameters?: any[], options?: SQLWatchOptions): AsyncIterable<QueryResult>;
    resolveTables(sql: string, parameters?: any[], options?: SQLWatchOptions): Promise<string[]>;
    /**
     * This version of `onChange` uses {@link AsyncGenerator}, for documentation see {@link onChangeWithAsyncGenerator}.
     * Can be overloaded to use a callback handler instead, for documentation see {@link onChangeWithCallback}.
     *
     * @example
     * ```javascript
     * async monitorChanges() {
     *   for await (const event of this.powersync.onChange({tables: ['todos']})) {
     *     console.log('Detected change event:', event);
     *   }
     * }
     * ```
     */
    onChange(options?: SQLWatchOptions): AsyncIterable<WatchOnChangeEvent>;
    /**
     * See {@link onChangeWithCallback}.
     *
     * @example
     * ```javascript
     * monitorChanges() {
     *   this.powersync.onChange({
     *     onChange: (event) => {
     *       console.log('Change detected:', event);
     *     }
     *   }, { tables: ['todos'] });
     * }
     * ```
     */
    onChange(handler?: WatchOnChangeHandler, options?: SQLWatchOptions): () => void;
    /**
     * Invoke the provided callback on any changes to any of the specified tables.
     *
     * This is preferred over {@link watchWithCallback} when multiple queries need to be performed
     * together when data is changed.
     *
     * Note that the `onChange` callback member of the handler is required.
     *
     * Returns dispose function to stop watching.
     */
    onChangeWithCallback(handler?: WatchOnChangeHandler, options?: SQLWatchOptions): () => void;
    /**
     * Create a Stream of changes to any of the specified tables.
     *
     * This is preferred over {@link watchWithAsyncGenerator} when multiple queries need to be performed
     * together when data is changed.
     *
     * Note, do not declare this as `async *onChange` as it will not work in React Native
     */
    onChangeWithAsyncGenerator(options?: SQLWatchOptions): AsyncIterable<WatchOnChangeEvent>;
    private handleTableChanges;
    private processTableUpdates;
    /**
     * @ignore
     */
    private executeReadOnly;
}
