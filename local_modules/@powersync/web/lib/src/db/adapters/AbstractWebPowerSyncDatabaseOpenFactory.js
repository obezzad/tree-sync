import { AbstractPowerSyncDatabaseOpenFactory } from '@powersync/common';
import { PowerSyncDatabase, resolveWebPowerSyncFlags } from '../../db/PowerSyncDatabase';
/**
 * Intermediate PowerSync Database Open factory for Web which uses a mock
 * SSR DB Adapter if running on server side.
 * Most SQLite DB implementations only run on client side, this will safely return
 * empty query results in SSR which will allow for generating server partial views.
 */
export class AbstractWebPowerSyncDatabaseOpenFactory extends AbstractPowerSyncDatabaseOpenFactory {
    options;
    constructor(options) {
        super(options);
        this.options = options;
    }
    generateOptions() {
        return {
            ...this.options,
            database: this.openDB(),
            schema: this.schema,
            flags: resolveWebPowerSyncFlags(this.options.flags)
        };
    }
    generateInstance(options) {
        return new PowerSyncDatabase(options);
    }
}
