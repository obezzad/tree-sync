import { type PowerSyncOpenFactoryOptions } from '@powersync/common';
import { LockedAsyncDatabaseAdapter } from '../LockedAsyncDatabaseAdapter';
import { ResolvedWebSQLOpenOptions, TemporaryStorageOption, WebSQLFlags } from '../web-sql-flags';
import { WASQLiteVFS } from './WASQLiteConnection';
/**
 * These flags are the same as {@link WebSQLFlags}.
 * This export is maintained only for API consistency
 */
export type WASQLiteFlags = WebSQLFlags;
export interface WASQLiteDBAdapterOptions extends Omit<PowerSyncOpenFactoryOptions, 'schema'> {
    flags?: WASQLiteFlags;
    /**
     * Use an existing port to an initialized worker.
     * A worker will be initialized if none is provided
     */
    workerPort?: MessagePort;
    worker?: string | URL | ((options: ResolvedWebSQLOpenOptions) => Worker | SharedWorker);
    vfs?: WASQLiteVFS;
    temporaryStorage?: TemporaryStorageOption;
    /**
     * Encryption key for the database.
     * If set, the database will be encrypted using multiple-ciphers.
     */
    encryptionKey?: string;
}
/**
 * Adapter for WA-SQLite SQLite connections.
 */
export declare class WASQLiteDBAdapter extends LockedAsyncDatabaseAdapter {
    constructor(options: WASQLiteDBAdapterOptions);
}
