import { Mutex } from 'async-mutex';
import { ILogger } from 'js-logger';
import { DBAdapter, Transaction } from '../../../db/DBAdapter.js';
import { BaseObserver } from '../../../utils/BaseObserver.js';
import { BucketState, BucketStorageAdapter, BucketStorageListener, Checkpoint, SyncLocalDatabaseResult } from './BucketStorageAdapter.js';
import { CrudBatch } from './CrudBatch.js';
import { CrudEntry } from './CrudEntry.js';
import { SyncDataBatch } from './SyncDataBatch.js';
export declare class SqliteBucketStorage extends BaseObserver<BucketStorageListener> implements BucketStorageAdapter {
    private db;
    private mutex;
    private logger;
    tableNames: Set<string>;
    private pendingBucketDeletes;
    private _hasCompletedSync;
    private updateListener;
    private _clientId?;
    /**
     * Count up, and do a compact on startup.
     */
    private compactCounter;
    constructor(db: DBAdapter, mutex: Mutex, logger?: ILogger);
    init(): Promise<void>;
    dispose(): Promise<void>;
    _getClientId(): Promise<string>;
    getClientId(): Promise<string>;
    getMaxOpId(): string;
    /**
     * Reset any caches.
     */
    startSession(): void;
    getBucketStates(): Promise<BucketState[]>;
    saveSyncData(batch: SyncDataBatch): Promise<void>;
    removeBuckets(buckets: string[]): Promise<void>;
    /**
     * Mark a bucket for deletion.
     */
    private deleteBucket;
    hasCompletedSync(): Promise<boolean>;
    syncLocalDatabase(checkpoint: Checkpoint): Promise<SyncLocalDatabaseResult>;
    /**
     * Atomically update the local state to the current checkpoint.
     *
     * This includes creating new tables, dropping old tables, and copying data over from the oplog.
     */
    private updateObjectsFromBuckets;
    validateChecksums(checkpoint: Checkpoint): Promise<SyncLocalDatabaseResult>;
    /**
     * Force a compact, for tests.
     */
    forceCompact(): Promise<void>;
    autoCompact(): Promise<void>;
    private deletePendingBuckets;
    private clearRemoveOps;
    updateLocalTarget(cb: () => Promise<string>): Promise<boolean>;
    nextCrudItem(): Promise<CrudEntry | undefined>;
    hasCrud(): Promise<boolean>;
    /**
     * Get a batch of objects to send to the server.
     * When the objects are successfully sent to the server, call .complete()
     */
    getCrudBatch(limit?: number): Promise<CrudBatch | null>;
    writeTransaction<T>(callback: (tx: Transaction) => Promise<T>, options?: {
        timeoutMs: number;
    }): Promise<T>;
    /**
     * Set a target checkpoint.
     */
    setTargetCheckpoint(checkpoint: Checkpoint): Promise<void>;
}
