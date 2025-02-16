import { AbstractStreamingSyncImplementationOptions, BaseObserver, LockOptions, PowerSyncConnectionOptions, StreamingSyncImplementation, SyncStatus, SyncStatusOptions } from '@powersync/common';
import { Mutex } from 'async-mutex';
export declare class SSRStreamingSyncImplementation extends BaseObserver implements StreamingSyncImplementation {
    syncMutex: Mutex;
    crudMutex: Mutex;
    isConnected: boolean;
    lastSyncedAt?: Date | undefined;
    syncStatus: SyncStatus;
    constructor(options: AbstractStreamingSyncImplementationOptions);
    obtainLock<T>(lockOptions: LockOptions<T>): Promise<T>;
    /**
     * This is a no-op in SSR mode
     */
    connect(options?: PowerSyncConnectionOptions): Promise<void>;
    dispose(): Promise<void>;
    /**
     * This is a no-op in SSR mode
     */
    disconnect(): Promise<void>;
    /**
     * This SSR Mode implementation is immediately ready.
     */
    waitForReady(): Promise<void>;
    /**
     * This will never resolve in SSR Mode.
     */
    waitForStatus(status: SyncStatusOptions): Promise<void>;
    /**
     * Returns a placeholder checkpoint. This should not be used.
     */
    getWriteCheckpoint(): Promise<string>;
    /**
     * The SSR mode adapter will never complete syncing.
     */
    hasCompletedSync(): Promise<boolean>;
    /**
     * This is a no-op in SSR mode.
     */
    triggerCrudUpload(): void;
}
