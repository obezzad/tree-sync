import { AbortOperation, BaseObserver, SqliteBucketStorage, SyncStatus } from '@powersync/common';
import { Mutex } from 'async-mutex';
import * as Comlink from 'comlink';
import Logger from 'js-logger';
import { WebRemote } from '../../db/sync/WebRemote';
import { WebStreamingSyncImplementation } from '../../db/sync/WebStreamingSyncImplementation';
import { LockedAsyncDatabaseAdapter } from '../../db/adapters/LockedAsyncDatabaseAdapter';
import { WorkerWrappedAsyncDatabaseConnection } from '../../db/adapters/WorkerWrappedAsyncDatabaseConnection';
import { getNavigatorLocks } from '../../shared/navigator';
import { BroadcastLogger } from './BroadcastLogger';
/**
 * Manual message events for shared sync clients
 */
export var SharedSyncClientEvent;
(function (SharedSyncClientEvent) {
    /**
     * This client requests the shared sync manager should
     * close it's connection to the client.
     */
    SharedSyncClientEvent["CLOSE_CLIENT"] = "close-client";
})(SharedSyncClientEvent || (SharedSyncClientEvent = {}));
/**
 * @internal
 * Shared sync implementation which runs inside a shared webworker
 */
export class SharedSyncImplementation extends BaseObserver {
    ports;
    syncStreamClient;
    isInitialized;
    statusListener;
    fetchCredentialsController;
    uploadDataController;
    dbAdapter;
    syncParams;
    logger;
    lastConnectOptions;
    syncStatus;
    broadCastLogger;
    currentConnectionAbortController;
    pendingConnectionOptions;
    cleanupInProgress;
    constructor() {
        super();
        this.ports = [];
        this.dbAdapter = null;
        this.syncParams = null;
        this.syncStreamClient = null;
        this.logger = Logger.get('shared-sync');
        this.lastConnectOptions = undefined;
        this.currentConnectionAbortController = null;
        this.pendingConnectionOptions = null;
        this.cleanupInProgress = false;
        this.isInitialized = new Promise((resolve) => {
            const callback = this.registerListener({
                initialized: () => {
                    resolve();
                    callback?.();
                }
            });
        });
        this.syncStatus = new SyncStatus({});
        this.broadCastLogger = new BroadcastLogger(this.ports);
    }
    async waitForStatus(status) {
        await this.waitForReady();
        return this.syncStreamClient.waitForStatus(status);
    }
    get lastSyncedAt() {
        return this.syncStreamClient?.lastSyncedAt;
    }
    get isConnected() {
        return this.syncStreamClient?.isConnected ?? false;
    }
    async waitForReady() {
        return this.isInitialized;
    }
    /**
     * Configures the DBAdapter connection and a streaming sync client.
     */
    async setParams(params) {
        if (this.syncParams) {
            // Cannot modify already existing sync implementation
            return;
        }
        this.syncParams = params;
        if (params.streamOptions?.flags?.broadcastLogs) {
            this.logger = this.broadCastLogger;
        }
        self.onerror = (event) => {
            // Share any uncaught events on the broadcast logger
            this.logger.error('Uncaught exception in PowerSync shared sync worker', event);
        };
        await this.openInternalDB();
        this.iterateListeners((l) => l.initialized?.());
    }
    async dispose() {
        await this.waitForReady();
        this.statusListener?.();
        return this.syncStreamClient?.dispose();
    }
    /**
     * Connects to the PowerSync backend instance.
     * Multiple tabs can safely call this in their initialization.
     * This implementation prioritizes new connection requests by aborting
     * any existing connection and starting a new one immediately.
     * Cleanup of old connections happens in the background.
     */
    async connect(options) {
        const now = performance.now();
        console.warn(`[connect] Connect initiated at ${now}`);

        await this.waitForReady();
        console.warn(`[connect] Ready after ${performance.now() - now} ms`);

        // Store the options for this connection request
        this.pendingConnectionOptions = options;

        // Abort any existing connection immediately
        if (this.currentConnectionAbortController) {
            this.currentConnectionAbortController.abort(new AbortOperation('Aborting previous connection for new connection request'));
            this.currentConnectionAbortController = null;
        }

        // Create a new abort controller for this connection
        const abortController = new AbortController();
        this.currentConnectionAbortController = abortController;

        // Start cleanup of old connection in the background if needed
        this.cleanupOldConnection();

        // Try to acquire the lock with ifAvailable option first
        try {
            return await getNavigatorLocks().request('shared-sync-connect', { ifAvailable: true }, async () => {
                // If we got the lock immediately, proceed with connection
                return this.performConnect(options, now, abortController.signal);
            });
        } catch (error) {
            // If we couldn't get the lock immediately, it means another operation is in progress
            // We'll create a new connection without waiting for the lock
            console.warn(`[connect] Lock not immediately available, proceeding without lock`);
            return this.performConnect(options, now, abortController.signal);
        }
    }

    /**
     * Performs the actual connection process
     * @private
     */
    async performConnect(options, startTime, signal) {
        // Check if this is still the most recent connection request
        if (this.pendingConnectionOptions !== options) {
            console.warn(`[connect] Skipping connection as newer request exists`);
            return;
        }

        console.warn(`[connect] Performing connection after ${performance.now() - startTime} ms`);

        // Create a new streaming implementation
        const newSyncClient = this.generateStreamingImplementation();

        // Register status listener
        newSyncClient.registerListener({
            statusChanged: (status) => {
                // Only update statuses if this is still the current client
                if (this.syncStreamClient === newSyncClient) {
                    this.updateAllStatuses(status.toJSON());
                    console.warn(`[connect] Status changed after ${performance.now() - startTime} ms`);
                }
            }
        });

        try {
            // Connect with the provided options
            await newSyncClient.connect(options);

            // If this is still the most recent connection request, update the client
            if (this.pendingConnectionOptions === options && !signal.aborted) {
                const oldClient = this.syncStreamClient;
                this.syncStreamClient = newSyncClient;
                this.lastConnectOptions = options;

                // If there was a previous client, schedule it for cleanup
                if (oldClient) {
                    this.cleanupOldConnection(oldClient);
                }

                console.warn(`[connect] Connected after ${performance.now() - startTime} ms`);
            } else {
                // This connection is no longer needed, clean it up
                console.warn(`[connect] Connection completed but is no longer needed`);
                this.cleanupClient(newSyncClient);
            }
        } catch (error) {
            console.error(`[connect] Connection failed:`, error);
            // Don't throw the error, as a new connection attempt might already be in progress
        }
    }

    /**
     * Cleans up old connections in the background
     * @private
     */
    async cleanupOldConnection(specificClient = null) {
        // If cleanup is already in progress, don't start another one
        if (this.cleanupInProgress && !specificClient) {
            return;
        }

        this.cleanupInProgress = true;

        // Use a separate lock for cleanup to allow it to happen in the background
        getNavigatorLocks().request('shared-sync-cleanup', async () => {
            try {
                const clientToCleanup = specificClient || this.syncStreamClient;
                if (clientToCleanup && clientToCleanup !== this.syncStreamClient) {
                    await this.cleanupClient(clientToCleanup);
                }
            } finally {
                if (!specificClient) {
                    this.cleanupInProgress = false;
                }
            }
        });
    }

    /**
     * Cleans up a specific client
     * @private
     */
    async cleanupClient(client) {
        if (!client) return;

        try {
            await client.disconnect();
            await client.dispose();
        } catch (error) {
            console.warn(`[cleanup] Error during client cleanup:`, error);
        }
    }
    async disconnect() {
        const now = performance.now();
        console.warn(`[disconnect] Disconnect initiated at ${now}`);

        await this.waitForReady();
        console.warn(`[disconnect] Ready after ${performance.now() - now} ms`);

        // Abort any pending connection
        if (this.currentConnectionAbortController) {
            this.currentConnectionAbortController.abort(new AbortOperation('Aborting connection due to disconnect request'));
            this.currentConnectionAbortController = null;
        }

        // Clear pending connection options
        this.pendingConnectionOptions = null;

        // Store the current client and clear the reference
        const clientToDisconnect = this.syncStreamClient;
        this.syncStreamClient = null;

        // If there's no client to disconnect, we're done
        if (!clientToDisconnect) {
            return;
        }

        // Try to acquire the lock with ifAvailable option first
        try {
            return await getNavigatorLocks().request('shared-sync-connect', { ifAvailable: true }, async () => {
                return this.performDisconnect(clientToDisconnect, now);
            });
        } catch (error) {
            // If we couldn't get the lock immediately, schedule the disconnect in the background
            console.warn(`[disconnect] Lock not immediately available, scheduling disconnect in background`);
            this.cleanupClient(clientToDisconnect);
        }
    }

    /**
     * Performs the actual disconnection process
     * @private
     */
    async performDisconnect(client, startTime) {
        if (!client) return;

        console.warn(`[disconnect] Lock acquired after ${performance.now() - startTime} ms`);

        try {
            await client.disconnect();
            console.warn(`[disconnect] Disconnected after ${performance.now() - startTime} ms`);

            await client.dispose();
            console.warn(`[disconnect] Disposed after ${performance.now() - startTime} ms`);
        } catch (error) {
            console.warn(`[disconnect] Error during disconnect:`, error);
        }
    }
    /**
     * Adds a new client tab's message port to the list of connected ports
     */
    addPort(port) {
        const portProvider = {
            port,
            clientProvider: Comlink.wrap(port)
        };
        this.ports.push(portProvider);
        // Give the newly connected client the latest status
        const status = this.syncStreamClient?.syncStatus;
        if (status) {
            portProvider.clientProvider.statusChanged(status.toJSON());
        }
    }
    /**
     * Removes a message port client from this manager's managed
     * clients.
     */
    async removePort(port) {
        const index = this.ports.findIndex((p) => p.port == port);
        if (index < 0) {
            console.warn(`Could not remove port ${port} since it is not present in active ports.`);
            return;
        }
        const trackedPort = this.ports[index];
        if (trackedPort.db) {
            trackedPort.db.close();
        }
        // Release proxy
        trackedPort.clientProvider[Comlink.releaseProxy]();
        this.ports.splice(index, 1);
        /**
         * The port might currently be in use. Any active functions might
         * not resolve. Abort them here.
         */
        [this.fetchCredentialsController, this.uploadDataController].forEach((abortController) => {
            if (abortController?.activePort.port == port) {
                abortController.controller.abort(new AbortOperation('Closing pending requests after client port is removed'));
            }
        });
        if (this.dbAdapter == trackedPort.db && this.syncStreamClient) {
            await this.disconnect();
            // Ask for a new DB worker port handler
            await this.openInternalDB();
            await this.connect(this.lastConnectOptions);
        }
    }
    triggerCrudUpload() {
        this.waitForReady().then(() => this.syncStreamClient?.triggerCrudUpload());
    }
    async obtainLock(lockOptions) {
        await this.waitForReady();
        return this.syncStreamClient.obtainLock(lockOptions);
    }
    async hasCompletedSync() {
        await this.waitForReady();
        return this.syncStreamClient.hasCompletedSync();
    }
    async getWriteCheckpoint() {
        await this.waitForReady();
        return this.syncStreamClient.getWriteCheckpoint();
    }
    generateStreamingImplementation() {
        // This should only be called after initialization has completed
        const syncParams = this.syncParams;
        // Create a new StreamingSyncImplementation for each connect call. This is usually done is all SDKs.
        return new WebStreamingSyncImplementation({
            adapter: new SqliteBucketStorage(this.dbAdapter, new Mutex(), this.logger),
            remote: new WebRemote({
                fetchCredentials: async () => {
                    const lastPort = this.ports[this.ports.length - 1];
                    return new Promise(async (resolve, reject) => {
                        const abortController = new AbortController();
                        this.fetchCredentialsController = {
                            controller: abortController,
                            activePort: lastPort
                        };
                        abortController.signal.onabort = reject;
                        try {
                            console.log('calling the last port client provider for credentials');
                            resolve(await lastPort.clientProvider.fetchCredentials());
                        }
                        catch (ex) {
                            reject(ex);
                        }
                        finally {
                            this.fetchCredentialsController = undefined;
                        }
                    });
                }
            }),
            uploadCrud: async () => {
                const lastPort = this.ports[this.ports.length - 1];
                return new Promise(async (resolve, reject) => {
                    const abortController = new AbortController();
                    this.uploadDataController = {
                        controller: abortController,
                        activePort: lastPort
                    };
                    // Resolving will make it retry
                    abortController.signal.onabort = () => resolve();
                    try {
                        resolve(await lastPort.clientProvider.uploadCrud());
                    }
                    catch (ex) {
                        reject(ex);
                    }
                    finally {
                        this.uploadDataController = undefined;
                    }
                });
            },
            ...syncParams.streamOptions,
            // Logger cannot be transferred just yet
            logger: this.logger
        });
    }
    async openInternalDB() {
        const lastClient = this.ports[this.ports.length - 1];
        const workerPort = await lastClient.clientProvider.getDBWorkerPort();
        const remote = Comlink.wrap(workerPort);
        const identifier = this.syncParams.dbParams.dbFilename;
        const db = await remote(this.syncParams.dbParams);
        const locked = new LockedAsyncDatabaseAdapter({
            name: identifier,
            openConnection: async () => {
                return new WorkerWrappedAsyncDatabaseConnection({
                    remote,
                    baseConnection: db,
                    identifier
                });
            },
            logger: this.logger
        });
        await locked.init();
        this.dbAdapter = lastClient.db = locked;
    }
    /**
     * A method to update the all shared statuses for each
     * client.
     */
    updateAllStatuses(status) {
        this.syncStatus = new SyncStatus(status);
        this.ports.forEach((p) => p.clientProvider.statusChanged(status));
    }
    /**
     * A function only used for unit tests which updates the internal
     * sync stream client and all tab client's sync status
     */
    _testUpdateAllStatuses(status) {
        if (!this.syncStreamClient) {
            // This is just for testing purposes
            this.syncStreamClient = this.generateStreamingImplementation();
        }
        // Only assigning, don't call listeners for this test
        this.syncStreamClient.syncStatus = new SyncStatus(status);
        this.updateAllStatuses(status);
    }
}
