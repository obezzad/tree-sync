import Logger, { ILogger } from 'js-logger';
import { SyncStatus, SyncStatusOptions } from '../../../db/crud/SyncStatus.js';
import { BaseListener, BaseObserver, Disposable } from '../../../utils/BaseObserver.js';
import { BucketStorageAdapter } from '../bucket/BucketStorageAdapter.js';
import { AbstractRemote, FetchStrategy } from './AbstractRemote.js';
import { StreamingSyncRequestParameterType } from './streaming-sync-types.js';
export declare enum LockType {
    CRUD = "crud",
    SYNC = "sync"
}
export declare enum SyncStreamConnectionMethod {
    HTTP = "http",
    WEB_SOCKET = "web-socket"
}
/**
 * Abstract Lock to be implemented by various JS environments
 */
export interface LockOptions<T> {
    callback: () => Promise<T>;
    type: LockType;
    signal?: AbortSignal;
}
export interface AbstractStreamingSyncImplementationOptions extends AdditionalConnectionOptions {
    adapter: BucketStorageAdapter;
    uploadCrud: () => Promise<void>;
    /**
     * An identifier for which PowerSync DB this sync implementation is
     * linked to. Most commonly DB name, but not restricted to DB name.
     */
    identifier?: string;
    logger?: ILogger;
    remote: AbstractRemote;
}
export interface StreamingSyncImplementationListener extends BaseListener {
    /**
     * Triggered whenever a status update has been attempted to be made or
     * refreshed.
     */
    statusUpdated?: ((statusUpdate: SyncStatusOptions) => void) | undefined;
    /**
     * Triggers whenever the status' members have changed in value
     */
    statusChanged?: ((status: SyncStatus) => void) | undefined;
}
/**
 * Configurable options to be used when connecting to the PowerSync
 * backend instance.
 */
export interface PowerSyncConnectionOptions extends BaseConnectionOptions, AdditionalConnectionOptions {
}
/** @internal */
export interface BaseConnectionOptions {
    /**
     * The connection method to use when streaming updates from
     * the PowerSync backend instance.
     * Defaults to a HTTP streaming connection.
     */
    connectionMethod?: SyncStreamConnectionMethod;
    /**
     * The fetch strategy to use when streaming updates from the PowerSync backend instance.
     */
    fetchStrategy?: FetchStrategy;
    /**
     * These parameters are passed to the sync rules, and will be available under the`user_parameters` object.
     */
    params?: Record<string, StreamingSyncRequestParameterType>;
}
/** @internal */
export interface AdditionalConnectionOptions {
    /**
     * Delay for retrying sync streaming operations
     * from the PowerSync backend after an error occurs.
     */
    retryDelayMs?: number;
    /**
     * Backend Connector CRUD operations are throttled
     * to occur at most every `crudUploadThrottleMs`
     * milliseconds.
     */
    crudUploadThrottleMs?: number;
}
/** @internal */
export type RequiredAdditionalConnectionOptions = Required<AdditionalConnectionOptions>;
export interface StreamingSyncImplementation extends BaseObserver<StreamingSyncImplementationListener>, Disposable {
    /**
     * Connects to the sync service
     */
    connect(options?: PowerSyncConnectionOptions): Promise<void>;
    /**
     * Disconnects from the sync services.
     * @throws if not connected or if abort is not controlled internally
     */
    disconnect(): Promise<void>;
    getWriteCheckpoint: () => Promise<string>;
    hasCompletedSync: () => Promise<boolean>;
    isConnected: boolean;
    lastSyncedAt?: Date;
    syncStatus: SyncStatus;
    triggerCrudUpload: () => void;
    waitForReady(): Promise<void>;
    waitForStatus(status: SyncStatusOptions): Promise<void>;
    waitUntilStatusMatches(predicate: (status: SyncStatus) => boolean): Promise<void>;
}
export declare const DEFAULT_CRUD_UPLOAD_THROTTLE_MS = 1000;
export declare const DEFAULT_RETRY_DELAY_MS = 5000;
export declare const DEFAULT_STREAMING_SYNC_OPTIONS: {
    retryDelayMs: number;
    logger: Logger.ILogger;
    crudUploadThrottleMs: number;
};
export type RequiredPowerSyncConnectionOptions = Required<BaseConnectionOptions>;
export declare const DEFAULT_STREAM_CONNECTION_OPTIONS: RequiredPowerSyncConnectionOptions;
export declare abstract class AbstractStreamingSyncImplementation extends BaseObserver<StreamingSyncImplementationListener> implements StreamingSyncImplementation {
    protected _lastSyncedAt: Date | null;
    protected options: AbstractStreamingSyncImplementationOptions;
    protected abortController: AbortController | null;
    protected crudUpdateListener?: () => void;
    protected streamingSyncPromise?: Promise<void>;
    syncStatus: SyncStatus;
    triggerCrudUpload: () => void;
    constructor(options: AbstractStreamingSyncImplementationOptions);
    waitForReady(): Promise<void>;
    waitForStatus(status: SyncStatusOptions): Promise<void>;
    waitUntilStatusMatches(predicate: (status: SyncStatus) => boolean): Promise<void>;
    get lastSyncedAt(): Date | undefined;
    get isConnected(): boolean;
    protected get logger(): Logger.ILogger;
    dispose(): Promise<void>;
    abstract obtainLock<T>(lockOptions: LockOptions<T>): Promise<T>;
    hasCompletedSync(): Promise<boolean>;
    getWriteCheckpoint(): Promise<string>;
    protected _uploadAllCrud(): Promise<void>;
    connect(options?: PowerSyncConnectionOptions): Promise<void>;
    disconnect(): Promise<void>;
    /**
     * @deprecated use [connect instead]
     */
    streamingSync(signal?: AbortSignal, options?: PowerSyncConnectionOptions): Promise<void>;
    private collectLocalBucketState;
    protected streamingSyncIteration(signal: AbortSignal, options?: PowerSyncConnectionOptions): Promise<{
        retry?: boolean;
    }>;
    protected updateSyncStatus(options: SyncStatusOptions): void;
    private delayRetry;
}
