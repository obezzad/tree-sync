import { SQLOpenOptions } from '@powersync/common';
import { ILogger } from 'js-logger';
/**
 * Common settings used when creating SQL connections on web.
 */
export interface WebSQLFlags {
    /**
     * Broadcast logs from shared workers, such as the shared sync worker,
     * to individual tabs. This defaults to true.
     */
    broadcastLogs?: boolean;
    /**
     * SQLite operations are currently not supported in SSR mode.
     * A warning will be logged if attempting to use SQLite in SSR.
     * Setting this to `true` will disabled the warning above.
     */
    disableSSRWarning?: boolean;
    /**
     * Enables multi tab support
     */
    enableMultiTabs?: boolean;
    /**
     * The SQLite connection is often executed through a web worker
     * in order to offload computation. This can be used to manually
     * disable the use of web workers in environments where web workers
     * might be unstable.
     */
    useWebWorker?: boolean;
    /**
     * Open in SSR placeholder mode. DB operations and Sync operations will be a No-op
     */
    ssrMode?: boolean;
}
export type ResolvedWebSQLFlags = Required<WebSQLFlags>;
export interface ResolvedWebSQLOpenOptions extends SQLOpenOptions {
    flags: ResolvedWebSQLFlags;
    /**
     * Where to store SQLite temporary files. Defaults to 'MEMORY'.
     * Setting this to `FILESYSTEM` can cause issues with larger queries or datasets.
     */
    temporaryStorage: TemporaryStorageOption;
    cacheSizeKb: number;
    /**
     * Encryption key for the database.
     * If set, the database will be encrypted using ChaCha20.
     */
    encryptionKey?: string;
}
export declare enum TemporaryStorageOption {
    MEMORY = "memory",
    FILESYSTEM = "file"
}
export declare const DEFAULT_CACHE_SIZE_KB: number;
/**
 * Options for opening a Web SQL connection
 */
export interface WebSQLOpenFactoryOptions extends SQLOpenOptions {
    flags?: WebSQLFlags;
    /**
     * Allows you to override the default wasqlite db worker.
     *
     * You can either provide a path to the worker script
     * or a factory method that returns a worker.
     */
    worker?: string | URL | ((options: ResolvedWebSQLOpenOptions) => Worker | SharedWorker);
    logger?: ILogger;
    /**
     * Where to store SQLite temporary files. Defaults to 'MEMORY'.
     * Setting this to `FILESYSTEM` can cause issues with larger queries or datasets.
     *
     * For details, see: https://www.sqlite.org/pragma.html#pragma_temp_store
     */
    temporaryStorage?: TemporaryStorageOption;
    /**
     * Maximum SQLite cache size. Defaults to 50MB.
     *
     * For details, see: https://www.sqlite.org/pragma.html#pragma_cache_size
     */
    cacheSizeKb?: number;
    /**
     * Encryption key for the database.
     * If set, the database will be encrypted using ChaCha20.
     */
    encryptionKey?: string;
}
export declare function isServerSide(): boolean;
export declare const DEFAULT_WEB_SQL_FLAGS: ResolvedWebSQLFlags;
export declare function resolveWebSQLFlags(flags?: WebSQLFlags): ResolvedWebSQLFlags;
