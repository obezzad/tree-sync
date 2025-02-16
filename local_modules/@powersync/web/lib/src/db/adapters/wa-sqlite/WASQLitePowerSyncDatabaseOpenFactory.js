import { PowerSyncDatabase } from '../../../db/PowerSyncDatabase';
import { AbstractWebPowerSyncDatabaseOpenFactory } from '../AbstractWebPowerSyncDatabaseOpenFactory';
import { WASQLiteOpenFactory } from './WASQLiteOpenFactory';
/**
 * @deprecated {@link PowerSyncDatabase} can now be constructed directly
 * @example
 * ```typescript
 * const powersync = new PowerSyncDatabase({database: {
 *  dbFileName: 'powersync.db'
 * }});
 * ```
 */
export class WASQLitePowerSyncDatabaseOpenFactory extends AbstractWebPowerSyncDatabaseOpenFactory {
    openDB() {
        const factory = new WASQLiteOpenFactory(this.options);
        return factory.openDB();
    }
    generateInstance(options) {
        return new PowerSyncDatabase(options);
    }
}
