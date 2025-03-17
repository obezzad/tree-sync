import * as SQLite from '@journeyapps/wa-sqlite';
import { BaseObserver, BatchedUpdateNotification } from '@powersync/common';
import { Mutex } from 'async-mutex';
import { AsyncDatabaseConnection, OnTableChangeCallback, ProxiedQueryResult } from '../AsyncDatabaseConnection';
import { ResolvedWASQLiteOpenFactoryOptions } from './WASQLiteOpenFactory';
/**
 * List of currently tested virtual filesystems
 */
export declare enum WASQLiteVFS {
    IDBBatchAtomicVFS = "IDBBatchAtomicVFS",
    OPFSCoopSyncVFS = "OPFSCoopSyncVFS",
    AccessHandlePoolVFS = "AccessHandlePoolVFS"
}
/**
 * @internal
 */
export type WASQLiteBroadCastTableUpdateEvent = {
    changedTables: Set<string>;
    connectionId: number;
};
/**
 * @internal
 */
export type WASQLiteConnectionListener = {
    tablesUpdated: (event: BatchedUpdateNotification) => void;
};
/**
 * @internal
 */
export type SQLiteModule = Parameters<typeof SQLite.Factory>[0];
/**
 * @internal
 */
export type WASQLiteModuleFactoryOptions = {
    dbFileName: string;
    encryptionKey?: string;
};
/**
 * @internal
 */
export type WASQLiteModuleFactory = (options: WASQLiteModuleFactoryOptions) => Promise<{
    module: SQLiteModule;
    vfs: SQLiteVFS;
}>;
/**
 * @internal
 */
export declare const AsyncWASQLiteModuleFactory: () => Promise<any>;
/**
 * @internal
 */
export declare const MultiCipherAsyncWASQLiteModuleFactory: () => Promise<any>;
/**
 * @internal
 */
export declare const SyncWASQLiteModuleFactory: () => Promise<any>;
/**
 * @internal
 */
export declare const MultiCipherSyncWASQLiteModuleFactory: () => Promise<any>;
/**
 * @internal
 */
export declare const DEFAULT_MODULE_FACTORIES: {
    IDBBatchAtomicVFS: (options: WASQLiteModuleFactoryOptions) => Promise<{
        module: any;
        vfs: any;
    }>;
    AccessHandlePoolVFS: (options: WASQLiteModuleFactoryOptions) => Promise<{
        module: any;
        vfs: any;
    }>;
    OPFSCoopSyncVFS: (options: WASQLiteModuleFactoryOptions) => Promise<{
        module: any;
        vfs: any;
    }>;
};
/**
 * @internal
 * WA-SQLite connection which directly interfaces with WA-SQLite.
 * This is usually instantiated inside a worker.
 */
export declare class WASqliteConnection extends BaseObserver<WASQLiteConnectionListener> implements AsyncDatabaseConnection<ResolvedWASQLiteOpenFactoryOptions> {
    protected options: ResolvedWASQLiteOpenFactoryOptions;
    private _sqliteAPI;
    private _dbP;
    private _moduleFactory;
    protected updatedTables: Set<string>;
    protected updateTimer: ReturnType<typeof setTimeout> | null;
    protected statementMutex: Mutex;
    protected broadcastChannel: BroadcastChannel | null;
    /**
     * Unique id for this specific connection. This is used to prevent broadcast table change
     * notification loops.
     */
    protected connectionId: number;
    constructor(options: ResolvedWASQLiteOpenFactoryOptions);
    protected get sqliteAPI(): any;
    protected get dbP(): number;
    protected openDB(): Promise<number | null>;
    protected executeEncryptionPragma(): Promise<void>;
    protected openSQLiteAPI(): Promise<SQLiteAPI>;
    protected registerBroadcastListeners(): void;
    protected queueTableUpdate(tableNames: Set<string>, shouldBroadcast?: boolean): void;
    init(): Promise<void>;
    getConfig(): Promise<ResolvedWASQLiteOpenFactoryOptions>;
    fireUpdates(shouldBroadcast?: boolean): void;
    /**
     * This executes SQL statements in a batch.
     */
    executeBatch(sql: string, bindings?: any[][]): Promise<ProxiedQueryResult>;
    /**
     * This executes single SQL statements inside a requested lock.
     */
    execute(sql: string | TemplateStringsArray, bindings?: any[]): Promise<ProxiedQueryResult>;
    close(): Promise<void>;
    registerOnTableChange(callback: OnTableChangeCallback): Promise<any>;
    /**
     * This requests a lock for executing statements.
     * Should only be used internally.
     */
    protected acquireExecuteLock: <T>(callback: () => Promise<T>) => Promise<T>;
    /**
     * This executes a single statement using SQLite3.
     */
    protected executeSingleStatement(sql: string | TemplateStringsArray, bindings?: any[]): Promise<ProxiedQueryResult>;
}
