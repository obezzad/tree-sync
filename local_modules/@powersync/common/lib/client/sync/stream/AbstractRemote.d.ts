import type { BSON } from 'bson';
import { type fetch } from 'cross-fetch';
import Logger, { ILogger } from 'js-logger';
import { DataStream } from '../../../utils/DataStream.js';
import { PowerSyncCredentials } from '../../connection/PowerSyncCredentials.js';
import { StreamingSyncLine, StreamingSyncRequest } from './streaming-sync-types.js';
export type BSONImplementation = typeof BSON;
export type RemoteConnector = {
    fetchCredentials: () => Promise<PowerSyncCredentials | null>;
};
export declare const DEFAULT_REMOTE_LOGGER: Logger.ILogger;
export type SyncStreamOptions = {
    path: string;
    data: StreamingSyncRequest;
    headers?: Record<string, string>;
    abortSignal?: AbortSignal;
    fetchOptions?: Request;
};
export declare enum FetchStrategy {
    /**
     * Queues multiple sync events before processing, reducing round-trips.
     * This comes at the cost of more processing overhead, which may cause ACK timeouts on older/weaker devices for big enough datasets.
     */
    Buffered = "buffered",
    /**
     * Processes each sync event immediately before requesting the next.
     * This reduces processing overhead and improves real-time responsiveness.
     */
    Sequential = "sequential"
}
export type SocketSyncStreamOptions = SyncStreamOptions & {
    fetchStrategy: FetchStrategy;
};
export type FetchImplementation = typeof fetch;
/**
 * Class wrapper for providing a fetch implementation.
 * The class wrapper is used to distinguish the fetchImplementation
 * option in [AbstractRemoteOptions] from the general fetch method
 * which is typeof "function"
 */
export declare class FetchImplementationProvider {
    getFetch(): FetchImplementation;
}
export type AbstractRemoteOptions = {
    /**
     * Transforms the PowerSync base URL which might contain
     * `http(s)://` to the corresponding WebSocket variant
     * e.g. `ws(s)://`
     */
    socketUrlTransformer: (url: string) => string;
    /**
     * Optionally provide the fetch implementation to use.
     * Note that this usually needs to be bound to the global scope.
     * Binding should be done before passing here.
     */
    fetchImplementation: FetchImplementation | FetchImplementationProvider;
};
export declare const DEFAULT_REMOTE_OPTIONS: AbstractRemoteOptions;
export declare abstract class AbstractRemote {
    protected connector: RemoteConnector;
    protected logger: ILogger;
    protected credentials: PowerSyncCredentials | null;
    protected options: AbstractRemoteOptions;
    constructor(connector: RemoteConnector, logger?: ILogger, options?: Partial<AbstractRemoteOptions>);
    /**
     * @returns a fetch implementation (function)
     * which can be called to perform fetch requests
     */
    get fetch(): FetchImplementation;
    getCredentials(): Promise<PowerSyncCredentials | null>;
    getUserAgent(): string;
    protected buildRequest(path: string): Promise<{
        url: string;
        headers: {
            'content-type': string;
            Authorization: string;
            'x-user-agent': string;
        };
    }>;
    post(path: string, data: any, headers?: Record<string, string>): Promise<any>;
    get(path: string, headers?: Record<string, string>): Promise<any>;
    postStreaming(path: string, data: any, headers?: Record<string, string>, signal?: AbortSignal): Promise<any>;
    /**
     * Provides a BSON implementation. The import nature of this varies depending on the platform
     */
    abstract getBSON(): Promise<BSONImplementation>;
    /**
     * Connects to the sync/stream websocket endpoint
     */
    socketStream(options: SocketSyncStreamOptions): Promise<DataStream<StreamingSyncLine>>;
    /**
     * Connects to the sync/stream http endpoint
     */
    postStream(options: SyncStreamOptions): Promise<DataStream<StreamingSyncLine>>;
}
