import { DBAdapter, SQLOpenFactory } from '@powersync/common';
import { ILogger } from 'js-logger';
import { ResolvedWebSQLFlags, WebSQLOpenFactoryOptions } from './web-sql-flags';
export declare abstract class AbstractWebSQLOpenFactory implements SQLOpenFactory {
    protected options: WebSQLOpenFactoryOptions;
    protected resolvedFlags: ResolvedWebSQLFlags;
    protected logger: ILogger;
    constructor(options: WebSQLOpenFactoryOptions);
    /**
     * Opens a DBAdapter if not in SSR mode
     */
    protected abstract openAdapter(): DBAdapter;
    /**
     * Opens a {@link DBAdapter} using resolved flags.
     * A SSR implementation is loaded if SSR mode is detected.
     */
    openDB(): any;
}
