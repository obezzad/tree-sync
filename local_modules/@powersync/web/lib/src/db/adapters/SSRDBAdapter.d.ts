import { BaseObserver, DBAdapterListener, DBAdapter, DBLockOptions, LockContext, QueryResult, Transaction } from '@powersync/common';
import { Mutex } from 'async-mutex';
/**
 * Implements a Mock DB adapter for use in Server Side Rendering (SSR).
 * This adapter will return empty results for queries, which will allow
 * server rendered views to initially generate scaffolding components
 */
export declare class SSRDBAdapter extends BaseObserver<DBAdapterListener> implements DBAdapter {
    name: string;
    readMutex: Mutex;
    writeMutex: Mutex;
    constructor();
    close(): void;
    readLock<T>(fn: (tx: LockContext) => Promise<T>, options?: DBLockOptions): Promise<T>;
    readTransaction<T>(fn: (tx: Transaction) => Promise<T>, options?: DBLockOptions): Promise<T>;
    writeLock<T>(fn: (tx: LockContext) => Promise<T>, options?: DBLockOptions): Promise<T>;
    writeTransaction<T>(fn: (tx: Transaction) => Promise<T>, options?: DBLockOptions): Promise<T>;
    execute(query: string, params?: any[]): Promise<QueryResult>;
    executeBatch(query: string, params?: any[][]): Promise<QueryResult>;
    getAll<T>(sql: string, parameters?: any[]): Promise<T[]>;
    getOptional<T>(sql: string, parameters?: any[] | undefined): Promise<T | null>;
    get<T>(sql: string, parameters?: any[] | undefined): Promise<T>;
    /**
     * Generates a mock context for use in read/write transactions.
     * `this` already mocks most of the API, commit and rollback mocks
     *  are added here
     */
    private generateMockTransactionContext;
    refreshSchema(): Promise<void>;
}
