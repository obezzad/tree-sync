import { BaseObserver, LockType, SyncStatus } from '@powersync/common';
import { Mutex } from 'async-mutex';
export class SSRStreamingSyncImplementation extends BaseObserver {
    syncMutex;
    crudMutex;
    isConnected;
    lastSyncedAt;
    syncStatus;
    constructor(options) {
        super();
        this.syncMutex = new Mutex();
        this.crudMutex = new Mutex();
        this.syncStatus = new SyncStatus({});
        this.isConnected = false;
    }
    obtainLock(lockOptions) {
        const mutex = lockOptions.type == LockType.CRUD ? this.crudMutex : this.syncMutex;
        return mutex.runExclusive(lockOptions.callback);
    }
    /**
     * This is a no-op in SSR mode
     */
    async connect(options) { }
    async dispose() { }
    /**
     * This is a no-op in SSR mode
     */
    async disconnect() { }
    /**
     * This SSR Mode implementation is immediately ready.
     */
    async waitForReady() { }
    /**
     * This will never resolve in SSR Mode.
     */
    async waitForStatus(status) {
        return new Promise((r) => { });
    }
    /**
     * Returns a placeholder checkpoint. This should not be used.
     */
    async getWriteCheckpoint() {
        return '1';
    }
    /**
     * The SSR mode adapter will never complete syncing.
     */
    async hasCompletedSync() {
        return false;
    }
    /**
     * This is a no-op in SSR mode.
     */
    triggerCrudUpload() { }
}
