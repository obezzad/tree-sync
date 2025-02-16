import { DBAdapter } from '@powersync/common';
import { AbstractWebSQLOpenFactory } from '../AbstractWebSQLOpenFactory';
import { AsyncDatabaseConnection } from '../AsyncDatabaseConnection';
import { ResolvedWebSQLOpenOptions, WebSQLOpenFactoryOptions } from '../web-sql-flags';
import { WASQLiteVFS } from './WASQLiteConnection';
export interface WASQLiteOpenFactoryOptions extends WebSQLOpenFactoryOptions {
    vfs?: WASQLiteVFS;
}
export interface ResolvedWASQLiteOpenFactoryOptions extends ResolvedWebSQLOpenOptions {
    vfs: WASQLiteVFS;
}
/**
 * Opens a SQLite connection using WA-SQLite.
 */
export declare class WASQLiteOpenFactory extends AbstractWebSQLOpenFactory {
    constructor(options: WASQLiteOpenFactoryOptions);
    get waOptions(): WASQLiteOpenFactoryOptions;
    protected openAdapter(): DBAdapter;
    openConnection(): Promise<AsyncDatabaseConnection>;
}
