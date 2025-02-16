import * as Comlink from 'comlink';
import { resolveWebPowerSyncFlags } from '../../PowerSyncDatabase';
import { LockedAsyncDatabaseAdapter } from '../LockedAsyncDatabaseAdapter';
import { TemporaryStorageOption } from '../web-sql-flags';
import { WorkerWrappedAsyncDatabaseConnection } from '../WorkerWrappedAsyncDatabaseConnection';
import { WASQLiteOpenFactory } from './WASQLiteOpenFactory';
/**
 * Adapter for WA-SQLite SQLite connections.
 */
export class WASQLiteDBAdapter extends LockedAsyncDatabaseAdapter {
    constructor(options) {
        super({
            name: options.dbFilename,
            openConnection: async () => {
                const { workerPort, temporaryStorage } = options;
                if (workerPort) {
                    const remote = Comlink.wrap(workerPort);
                    return new WorkerWrappedAsyncDatabaseConnection({
                        remote,
                        identifier: options.dbFilename,
                        baseConnection: await remote({
                            ...options,
                            temporaryStorage: temporaryStorage ?? TemporaryStorageOption.MEMORY,
                            flags: resolveWebPowerSyncFlags(options.flags),
                            encryptionKey: options.encryptionKey
                        })
                    });
                }
                const openFactory = new WASQLiteOpenFactory({
                    dbFilename: options.dbFilename,
                    dbLocation: options.dbLocation,
                    debugMode: options.debugMode,
                    flags: options.flags,
                    temporaryStorage,
                    logger: options.logger,
                    vfs: options.vfs,
                    encryptionKey: options.encryptionKey,
                    worker: options.worker
                });
                return openFactory.openConnection();
            },
            debugMode: options.debugMode,
            logger: options.logger
        });
    }
}
