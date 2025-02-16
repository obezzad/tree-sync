import { type AbstractStreamingSyncImplementation, type LockOptions, type PowerSyncConnectionOptions, type StreamingSyncImplementation, type StreamingSyncImplementationListener, type SyncStatusOptions, BaseObserver, DBAdapter, SyncStatus } from '@powersync/common';
import * as Comlink from 'comlink';
import { type ILogger } from 'js-logger';
import { WebStreamingSyncImplementation, WebStreamingSyncImplementationOptions } from '../../db/sync/WebStreamingSyncImplementation';
import { ResolvedWebSQLOpenOptions } from '../../db/adapters/web-sql-flags';
import { AbstractSharedSyncClientProvider } from './AbstractSharedSyncClientProvider';
/**
 * Manual message events for shared sync clients
 */
export declare enum SharedSyncClientEvent {
    /**
     * This client requests the shared sync manager should
     * close it's connection to the client.
     */
    CLOSE_CLIENT = "close-client"
}
export type ManualSharedSyncPayload = {
    event: SharedSyncClientEvent;
    data: any;
};
/**
 * @internal
 */
export type SharedSyncInitOptions = {
    streamOptions: Omit<WebStreamingSyncImplementationOptions, 'adapter' | 'uploadCrud' | 'remote'>;
    dbParams: ResolvedWebSQLOpenOptions;
};
/**
 * @internal
 */
export interface SharedSyncImplementationListener extends StreamingSyncImplementationListener {
    initialized: () => void;
}
/**
 * @internal
 */
export type WrappedSyncPort = {
    port: MessagePort;
    clientProvider: Comlink.Remote<AbstractSharedSyncClientProvider>;
    db?: DBAdapter;
};
/**
 * @internal
 */
export type RemoteOperationAbortController = {
    controller: AbortController;
    activePort: WrappedSyncPort;
};
/**
 * @internal
 * Shared sync implementation which runs inside a shared webworker
 */
export declare class SharedSyncImplementation extends BaseObserver<SharedSyncImplementationListener> implements StreamingSyncImplementation {
    protected ports: WrappedSyncPort[];
    protected syncStreamClient: AbstractStreamingSyncImplementation | null;
    protected isInitialized: Promise<void>;
    protected statusListener?: () => void;
    protected fetchCredentialsController?: RemoteOperationAbortController;
    protected uploadDataController?: RemoteOperationAbortController;
    protected dbAdapter: DBAdapter | null;
    protected syncParams: SharedSyncInitOptions | null;
    protected logger: ILogger;
    protected lastConnectOptions: PowerSyncConnectionOptions | undefined;
    syncStatus: SyncStatus;
    broadCastLogger: ILogger;
    constructor();
    waitForStatus(status: SyncStatusOptions): Promise<void>;
    get lastSyncedAt(): Date | undefined;
    get isConnected(): boolean;
    waitForReady(): Promise<void>;
    /**
     * Configures the DBAdapter connection and a streaming sync client.
     */
    setParams(params: SharedSyncInitOptions): Promise<void>;
    dispose(): Promise<void | undefined>;
    /**
     * Connects to the PowerSync backend instance.
     * Multiple tabs can safely call this in their initialization.
     * The connection will simply be reconnected whenever a new tab
     * connects.
     */
    connect(options?: PowerSyncConnectionOptions): Promise<any>;
    disconnect(): Promise<any>;
    /**
     * Adds a new client tab's message port to the list of connected ports
     */
    addPort(port: MessagePort): void;
    /**
     * Removes a message port client from this manager's managed
     * clients.
     */
    removePort(port: MessagePort): Promise<void>;
    triggerCrudUpload(): void;
    obtainLock<T>(lockOptions: LockOptions<T>): Promise<T>;
    hasCompletedSync(): Promise<boolean>;
    getWriteCheckpoint(): Promise<string>;
    protected generateStreamingImplementation(): WebStreamingSyncImplementation;
    protected openInternalDB(): Promise<void>;
    /**
     * A method to update the all shared statuses for each
     * client.
     */
    private updateAllStatuses;
    /**
     * A function only used for unit tests which updates the internal
     * sync stream client and all tab client's sync status
     */
    private _testUpdateAllStatuses;
}
