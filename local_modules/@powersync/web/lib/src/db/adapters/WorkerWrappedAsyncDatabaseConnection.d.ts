import * as Comlink from 'comlink';
import { AsyncDatabaseConnection, OnTableChangeCallback, OpenAsyncDatabaseConnection, ProxiedQueryResult } from './AsyncDatabaseConnection';
import { ResolvedWebSQLOpenOptions } from './web-sql-flags';
export type SharedConnectionWorker = {
    identifier: string;
    port: MessagePort;
};
export type WrappedWorkerConnectionOptions<Config extends ResolvedWebSQLOpenOptions = ResolvedWebSQLOpenOptions> = {
    baseConnection: AsyncDatabaseConnection;
    identifier: string;
    /**
     * Need a remote in order to keep a reference to the Proxied worker
     */
    remote: Comlink.Remote<OpenAsyncDatabaseConnection<Config>>;
    onClose?: () => void;
};
/**
 * Wraps a provided instance of {@link AsyncDatabaseConnection}, providing necessary proxy
 * functions for worker listeners.
 */
export declare class WorkerWrappedAsyncDatabaseConnection<Config extends ResolvedWebSQLOpenOptions = ResolvedWebSQLOpenOptions> implements AsyncDatabaseConnection {
    protected options: WrappedWorkerConnectionOptions<Config>;
    constructor(options: WrappedWorkerConnectionOptions<Config>);
    protected get baseConnection(): AsyncDatabaseConnection<ResolvedWebSQLOpenOptions>;
    init(): Promise<void>;
    /**
     * Get a MessagePort which can be used to share the internals of this connection.
     */
    shareConnection(): Promise<SharedConnectionWorker>;
    /**
     * Registers a table change notification callback with the base database.
     * This can be extended by custom implementations in order to handle proxy events.
     */
    registerOnTableChange(callback: OnTableChangeCallback): Promise<() => void>;
    close(): Promise<void>;
    execute(sql: string, params?: any[]): Promise<ProxiedQueryResult>;
    executeBatch(sql: string, params?: any[]): Promise<ProxiedQueryResult>;
    getConfig(): Promise<ResolvedWebSQLOpenOptions>;
}
