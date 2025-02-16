import { AbstractPowerSyncDatabase, DBAdapter, PowerSyncDatabaseOptions } from '@powersync/common';
import { AbstractWebPowerSyncDatabaseOpenFactory } from '../AbstractWebPowerSyncDatabaseOpenFactory';
/**
 * @deprecated {@link PowerSyncDatabase} can now be constructed directly
 * @example
 * ```typescript
 * const powersync = new PowerSyncDatabase({database: {
 *  dbFileName: 'powersync.db'
 * }});
 * ```
 */
export declare class WASQLitePowerSyncDatabaseOpenFactory extends AbstractWebPowerSyncDatabaseOpenFactory {
    protected openDB(): DBAdapter;
    generateInstance(options: PowerSyncDatabaseOptions): AbstractPowerSyncDatabase;
}
