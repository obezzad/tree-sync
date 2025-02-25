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
    activeConnectionAttempts = new Map(); // Map of connectionId -> {timestamp, controller, options, client}

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
        const timestamp = performance.now();
        console.warn(`[connect] Connect initiated at ${timestamp}`);

        // Only wait for ready on first connect, not on reconnects
        if (!this.syncStreamClient) {
            await this.waitForReady();
        } else {
            // For reconnects, ensure initialization in background but don't block
            this.waitForReady().catch(err => console.error("Background init error:", err));
        }

        console.warn(`[connect] Ready after ${performance.now() - timestamp} ms`);

        // Create a unique connection ID
        const connectionId = `conn-${timestamp}`;

        // Create abort controller for this specific connection attempt
        const abortController = new AbortController();

        // Store the options for this connection request
        this.pendingConnectionOptions = options;

        // Track this connection attempt
        const connectionAttempt = {
            timestamp,
            controller: abortController,
            options,
            client: null
        };
        this.activeConnectionAttempts.set(connectionId, connectionAttempt);

        // Abort any previous connection attempts
        for (const [id, attempt] of this.activeConnectionAttempts.entries()) {
            if (id !== connectionId && !attempt.controller.signal.aborted) {
                console.warn(`[connect] Aborting older connection attempt ${id}`);
                attempt.controller.abort(new AbortOperation('Superseded by newer connection request'));
            }
        }

        // Also abort the current connection controller for backward compatibility
        if (this.currentConnectionAbortController) {
            this.currentConnectionAbortController.abort(new AbortOperation('Aborting previous connection for new connection request'));
            this.currentConnectionAbortController = null;
        }

        // Update the current connection controller
        this.currentConnectionAbortController = abortController;

        // Start connection process immediately without waiting for locks
        this.performConnect(connectionId, options, timestamp, abortController.signal)
            .catch(error => console.error(`[connect] Error in connection process:`, error));

        // Return immediately to allow parallel processing
        return;
    }

    /**
     * Performs the actual connection process
     * @private
     */
    async performConnect(connectionId, options, startTime, signal) {
        try {
            // Check if this connection attempt has been aborted
            if (signal.aborted) {
                console.warn(`[connect] Connection ${connectionId} already aborted, skipping`);
                this.activeConnectionAttempts.delete(connectionId);
                return;
            }

            console.warn(`[connect] Performing connection ${connectionId} after ${performance.now() - startTime} ms`);

            // Create a new streaming implementation
            const newSyncClient = this.generateStreamingImplementation();

            // Store client reference in the connection attempt
            const connectionAttempt = this.activeConnectionAttempts.get(connectionId);
            if (connectionAttempt) {
                connectionAttempt.client = newSyncClient;
            }

            // Register status listener
            newSyncClient.registerListener({
                statusChanged: (status) => {
                    // Only update statuses if this is the current client
                    if (this.syncStreamClient === newSyncClient) {
                        this.updateAllStatuses(status.toJSON());
                        console.warn(`[connect] Status changed for ${connectionId} after ${performance.now() - startTime} ms`);
                    }
                }
            });

            // Check if this is still the most recent connection attempt
            const isLatestAttempt = Array.from(this.activeConnectionAttempts.values())
                .every(attempt => attempt.timestamp <= startTime || attempt.controller.signal.aborted);

            if (isLatestAttempt && !signal.aborted) {
                console.warn(`[connect] Setting ${connectionId} as active client before connection completes`);

                // Update client reference immediately
                const oldClient = this.syncStreamClient;
                this.syncStreamClient = newSyncClient;
                this.lastConnectOptions = options;

                // Schedule old client for background cleanup
                if (oldClient) {
                    this.cleanupClient(oldClient);
                }
            }

            // Listen for abort signal
            signal.addEventListener('abort', () => {
                console.warn(`[connect] Connection ${connectionId} aborted during connect`);
                // If this client became the active one but was aborted, we need to handle that
                if (this.syncStreamClient === newSyncClient) {
                    // Find the next most recent non-aborted connection attempt
                    const nextBest = Array.from(this.activeConnectionAttempts.entries())
                        .filter(([id, attempt]) => id !== connectionId && !attempt.controller.signal.aborted)
                        .sort((a, b) => b[1].timestamp - a[1].timestamp)[0];

                    if (nextBest) {
                        console.warn(`[connect] Reverting to next best connection ${nextBest[0]}`);
                        this.syncStreamClient = nextBest[1].client;
                    } else {
                        this.syncStreamClient = null;
                    }
                }

                // Clean up this client
                this.cleanupClient(newSyncClient);
            });

            // Start connection in background
            console.warn(`[connect] Starting connection ${connectionId}`);

            try {
                // Connect with the provided options
                await newSyncClient.connect(options);
                console.warn(`[connect] Connection ${connectionId} established after ${performance.now() - startTime}ms`);

                // Check again if this is still the most recent connection
                if (signal.aborted) {
                    console.warn(`[connect] Connection ${connectionId} completed but was aborted`);
                    // Clean up if aborted during connection
                    if (this.syncStreamClient === newSyncClient) {
                        this.syncStreamClient = null;
                    }
                    this.cleanupClient(newSyncClient);
                } else if (this.syncStreamClient !== newSyncClient) {
                    // This connection is no longer the active client
                    console.warn(`[connect] Connection ${connectionId} completed but is no longer the active client`);
                    this.cleanupClient(newSyncClient);
                }
            } catch (error) {
                console.error(`[connect] Connection ${connectionId} failed:`, error);
                // If this is the current client, we need to handle the error
                if (this.syncStreamClient === newSyncClient) {
                    // Find the next most recent non-aborted connection attempt
                    const nextBest = Array.from(this.activeConnectionAttempts.entries())
                        .filter(([id, attempt]) => id !== connectionId && !attempt.controller.signal.aborted)
                        .sort((a, b) => b[1].timestamp - a[1].timestamp)[0];

                    if (nextBest) {
                        console.warn(`[connect] Reverting to next best connection ${nextBest[0]} after error`);
                        this.syncStreamClient = nextBest[1].client;
                    } else {
                        this.syncStreamClient = null;
                    }
                }

                // Clean up this client
                this.cleanupClient(newSyncClient);
            }
        } finally {
            // Clean up tracking
            this.activeConnectionAttempts.delete(connectionId);
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
        // Use ifAvailable to ensure we don't block if the lock is not available
        getNavigatorLocks().request('shared-sync-cleanup', { ifAvailable: true }, async () => {
            try {
                const clientToCleanup = specificClient || this.syncStreamClient;
                if (clientToCleanup && clientToCleanup !== this.syncStreamClient) {
                    this.cleanupClient(clientToCleanup);
                }
            } finally {
                if (!specificClient) {
                    this.cleanupInProgress = false;
                }
            }
        }).catch(() => {
            // If we couldn't get the lock, schedule cleanup for later
            setTimeout(() => {
                this.cleanupInProgress = false;
                this.cleanupOldConnection(specificClient);
            }, 100);
        });
    }

    /**
     * Cleans up a specific client
     * @private
     */
    cleanupClient(client) {
        if (!client) return;

        // Use setTimeout to ensure this runs completely asynchronously
        setTimeout(() => {
            try {
                // Don't await these - fire and forget
                client.disconnect().catch(e => console.warn("Disconnect error:", e));

                // Use another setTimeout to ensure dispose happens after disconnect has a chance to start
                setTimeout(() => {
                    client.dispose().catch(e => console.warn("Dispose error:", e));
                }, 0);
            } catch (error) {
                console.warn(`[cleanup] Error during client cleanup:`, error);
            }
        }, 0);
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
        // Don't wait for ready
        this.waitForReady().catch(err => console.error("Background init error:", err));

        // Forward to sync client immediately if available
        return this.syncStreamClient?.obtainLock(lockOptions) || Promise.resolve();
    }
    async hasCompletedSync() {
        // Don't block on waitForReady
        this.waitForReady().catch(err => console.error("Background init error:", err));
        return this.syncStreamClient?.hasCompletedSync() || Promise.resolve(false);
    }
    async getWriteCheckpoint() {
        // Don't block on waitForReady
        this.waitForReady().catch(err => console.error("Background init error:", err));
        return this.syncStreamClient?.getWriteCheckpoint() || Promise.resolve(null);
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
