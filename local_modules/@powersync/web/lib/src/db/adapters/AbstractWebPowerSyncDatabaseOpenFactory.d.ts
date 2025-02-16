import { AbstractPowerSyncDatabase, AbstractPowerSyncDatabaseOpenFactory, PowerSyncDatabaseOptions, PowerSyncOpenFactoryOptions } from '@powersync/common';
import { WebPowerSyncDatabaseOptions, WebPowerSyncFlags } from '../../db/PowerSyncDatabase';
/**
 * {@link WebPowerSyncFlags}
 * Maintaining export for consistency with API from previous versions
 *  */
export interface WebPowerSyncOpenFlags extends WebPowerSyncFlags {
}
export interface WebPowerSyncOpenFactoryOptions extends PowerSyncOpenFactoryOptions {
    flags?: WebPowerSyncOpenFlags;
}
/**
 * Intermediate PowerSync Database Open factory for Web which uses a mock
 * SSR DB Adapter if running on server side.
 * Most SQLite DB implementations only run on client side, this will safely return
 * empty query results in SSR which will allow for generating server partial views.
 */
export declare abstract class AbstractWebPowerSyncDatabaseOpenFactory extends AbstractPowerSyncDatabaseOpenFactory {
    protected options: WebPowerSyncOpenFactoryOptions;
    constructor(options: WebPowerSyncOpenFactoryOptions);
    generateOptions(): WebPowerSyncDatabaseOptions;
    generateInstance(options: PowerSyncDatabaseOptions): AbstractPowerSyncDatabase;
}
