import * as Comlink from 'comlink';
import { AbstractSharedSyncClientProvider } from '../../worker/sync/AbstractSharedSyncClientProvider';
import { SharedSyncClientEvent } from '../../worker/sync/SharedSyncImplementation';
import { resolveWebSQLFlags, TemporaryStorageOption } from '../adapters/web-sql-flags';
import { WebStreamingSyncImplementation } from './WebStreamingSyncImplementation';
/**
 * The shared worker will trigger methods on this side of the message port
 * via this client provider.
 */
class SharedSyncClientProvider extends AbstractSharedSyncClientProvider {
    options;
    statusChanged;
    webDB;
    constructor(options, statusChanged, webDB) {
        super();
        this.options = options;
        this.statusChanged = statusChanged;
        this.webDB = webDB;
    }
    async getDBWorkerPort() {
        const { port } = await this.webDB.shareConnection();
        return Comlink.transfer(port, [port]);
    }
    async fetchCredentials() {
        const credentials = await this.options.remote.getCredentials();
        if (credentials == null) {
            return null;
        }
        /**
         * The credentials need to be serializable.
         * Users might extend [PowerSyncCredentials] to contain
         * items which are not serializable.
         * This returns only the essential fields.
         */
        return {
            endpoint: credentials.endpoint,
            token: credentials.token
        };
    }
    async uploadCrud() {
        /**
         * Don't return anything here, just incase something which is not
         * serializable is returned from the `uploadCrud` function.
         */
        await this.options.uploadCrud();
    }
    get logger() {
        return this.options.logger;
    }
    trace(...x) {
        this.logger?.trace(...x);
    }
    debug(...x) {
        this.logger?.debug(...x);
    }
    info(...x) {
        this.logger?.info(...x);
    }
    log(...x) {
        this.logger?.log(...x);
    }
    warn(...x) {
        this.logger?.warn(...x);
    }
    error(...x) {
        this.logger?.error(...x);
    }
    time(label) {
        this.logger?.time(label);
    }
    timeEnd(label) {
        this.logger?.timeEnd(label);
    }
}
export class SharedWebStreamingSyncImplementation extends WebStreamingSyncImplementation {
    syncManager;
    clientProvider;
    messagePort;
    isInitialized;
    dbAdapter;
    constructor(options) {
        super(options);
        this.dbAdapter = options.db;
        /**
         * Configure or connect to the shared sync worker.
         * This worker will manage all syncing operations remotely.
         */
        const resolvedWorkerOptions = {
            ...options,
            dbFilename: this.options.identifier,
            // TODO
            temporaryStorage: TemporaryStorageOption.MEMORY,
            flags: resolveWebSQLFlags(options.flags)
        };
        const syncWorker = options.sync?.worker;
        if (syncWorker) {
            if (typeof syncWorker === 'function') {
                this.messagePort = syncWorker(resolvedWorkerOptions).port;
            }
            else {
                this.messagePort = new SharedWorker(`${syncWorker}`, {
                    /* @vite-ignore */
                    name: `shared-sync-${this.webOptions.identifier}`
                }).port;
            }
        }
        else {
            this.messagePort = new SharedWorker(new URL('../../worker/sync/SharedSyncImplementation.worker.js', import.meta.url), {
                /* @vite-ignore */
                name: `shared-sync-${this.webOptions.identifier}`,
                type: 'module'
            }).port;
        }
        this.syncManager = Comlink.wrap(this.messagePort);
        this.triggerCrudUpload = this.syncManager.triggerCrudUpload;
        /**
         * Opens MessagePort to the existing shared DB worker.
         * The sync worker cannot initiate connections directly to the
         * DB worker, but a port to the DB worker can be transferred to the
         * sync worker.
         */
        const { crudUploadThrottleMs, identifier, retryDelayMs } = this.options;
        const flags = { ...this.webOptions.flags, workers: undefined };
        this.isInitialized = this.syncManager.setParams({
            dbParams: this.dbAdapter.getConfiguration(),
            streamOptions: {
                crudUploadThrottleMs,
                identifier,
                retryDelayMs,
                flags: flags
            }
        });
        /**
         * Pass along any sync status updates to this listener
         */
        this.clientProvider = new SharedSyncClientProvider(this.webOptions, (status) => {
            this.iterateListeners((l) => this.updateSyncStatus(status));
        }, options.db);
        /**
         * The sync worker will call this client provider when it needs
         * to fetch credentials or upload data.
         * This performs bi-directional method calling.
         */
        Comlink.expose(this.clientProvider, this.messagePort);
    }
    /**
     * Starts the sync process, this effectively acts as a call to
     * `connect` if not yet connected.
     */
    async connect(options) {
        await this.waitForReady();
        // This is needed since a new tab won't have any reference to the
        // shared worker sync implementation since that is only created on the first call to `connect`.
        await this.disconnect();
        return this.syncManager.connect(options);
    }
    async disconnect() {
        await this.waitForReady();
        return this.syncManager.disconnect();
    }
    async getWriteCheckpoint() {
        await this.waitForReady();
        return this.syncManager.getWriteCheckpoint();
    }
    async hasCompletedSync() {
        return this.syncManager.hasCompletedSync();
    }
    async dispose() {
        await this.waitForReady();
        // Signal the shared worker that this client is closing its connection to the worker
        const closeMessagePayload = {
            event: SharedSyncClientEvent.CLOSE_CLIENT,
            data: {}
        };
        this.messagePort.postMessage(closeMessagePayload);
        // Release the proxy
        this.syncManager[Comlink.releaseProxy]();
        this.messagePort.close();
    }
    async waitForReady() {
        return this.isInitialized;
    }
    /**
     * Used in tests to force a connection states
     */
    async _testUpdateStatus(status) {
        await this.isInitialized;
        return this.syncManager['_testUpdateAllStatuses'](status.toJSON());
    }
}
