import { AbstractStreamingSyncImplementation, AbstractStreamingSyncImplementationOptions, LockOptions } from '@powersync/common';
import { ResolvedWebSQLOpenOptions, WebSQLFlags } from '../adapters/web-sql-flags';
export interface WebStreamingSyncImplementationOptions extends AbstractStreamingSyncImplementationOptions {
    flags?: WebSQLFlags;
    sync?: {
        worker?: string | URL | ((options: ResolvedWebSQLOpenOptions) => SharedWorker);
    };
}
export declare class WebStreamingSyncImplementation extends AbstractStreamingSyncImplementation {
    constructor(options: WebStreamingSyncImplementationOptions);
    get webOptions(): WebStreamingSyncImplementationOptions;
    obtainLock<T>(lockOptions: LockOptions<T>): Promise<T>;
}
