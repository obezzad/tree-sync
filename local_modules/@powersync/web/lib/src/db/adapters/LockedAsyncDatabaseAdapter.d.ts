import { BaseObserver, DBAdapterListener, DBLockOptions, LockContext, QueryResult, Transaction } from '@powersync/common';
import { ILogger } from 'js-logger';
import { AsyncDatabaseConnection } from './AsyncDatabaseConnection';
import { SharedConnectionWorker, WebDBAdapter } from './WebDBAdapter';
import { ResolvedWebSQLOpenOptions } from './web-sql-flags';
/**
 * @internal
 */
export interface LockedAsyncDatabaseAdapterOptions {
    name: string;
    openConnection: () => Promise<AsyncDatabaseConnection>;
    debugMode?: boolean;
    logger?: ILogger;
}
export type LockedAsyncDatabaseAdapterListener = DBAdapterListener & {
    initialized?: () => void;
};
/**
 * @internal
 * Wraps a {@link AsyncDatabaseConnection} and provides exclusive locking functions in
 * order to implement {@link DBAdapter}.
 */
export declare class LockedAsyncDatabaseAdapter extends BaseObserver<LockedAsyncDatabaseAdapterListener> implements WebDBAdapter {
    protected options: LockedAsyncDatabaseAdapterOptions;
    private logger;
    private dbGetHelpers;
    private debugMode;
    private _dbIdentifier;
    protected initPromise: Promise<void>;
    private _db;
    protected _disposeTableChangeListener: (() => void) | null;
    private _config;
    constructor(options: LockedAsyncDatabaseAdapterOptions);
    protected get baseDB(): AsyncDatabaseConnection<ResolvedWebSQLOpenOptions>;
    get name(): string;
    /**
     * Init is automatic, this helps catch errors or explicitly await initialization
     */
    init(): Promise<void>;
    protected _init(): Promise<void>;
    getConfiguration(): ResolvedWebSQLOpenOptions;
    protected waitForInitialized(): Promise<void>;
    shareConnection(): Promise<SharedConnectionWorker>;
    /**
     * Registers a table change notification callback with the base database.
     * This can be extended by custom implementations in order to handle proxy events.
     */
    protected registerOnChangeListener(db: AsyncDatabaseConnection): Promise<void>;
    /**
     * This is currently a no-op on web
     */
    refreshSchema(): Promise<void>;
    execute(query: string, params?: any[] | undefined): Promise<QueryResult>;
    executeBatch(query: string, params?: any[][]): Promise<QueryResult>;
    /**
     * Attempts to close the connection.
     * Shared workers might not actually close the connection if other
     * tabs are still using it.
     */
    close(): Promise<void>;
    getAll<T>(sql: string, parameters?: any[] | undefined): Promise<T[]>;
    getOptional<T>(sql: string, parameters?: any[] | undefined): Promise<T | null>;
    get<T>(sql: string, parameters?: any[] | undefined): Promise<T>;
    readLock<T>(fn: (tx: LockContext) => Promise<T>, options?: DBLockOptions | undefined): Promise<T>;
    writeLock<T>(fn: (tx: LockContext) => Promise<T>, options?: DBLockOptions | undefined): Promise<T>;
    protected acquireLock(callback: () => Promise<any>): Promise<any>;
    readTransaction<T>(fn: (tx: Transaction) => Promise<T>, options?: DBLockOptions | undefined): Promise<T>;
    writeTransaction<T>(fn: (tx: Transaction) => Promise<T>, options?: DBLockOptions | undefined): Promise<T>;
    private generateDBHelpers;
    /**
     * Wraps a lock context into a transaction context
     */
    private wrapTransaction;
    /**
     * Wraps the worker execute function, awaiting for it to be available
     */
    private _execute;
    /**
     * Wraps the worker executeBatch function, awaiting for it to be available
     */
    private _executeBatch;
}
