/**
 * Supports both shared and dedicated workers, based on how the worker is constructed (new SharedWorker vs new Worker()).
 */
import '@journeyapps/wa-sqlite';
import * as Comlink from 'comlink';
import { WASqliteConnection } from '../../db/adapters/wa-sqlite/WASQLiteConnection';
import { getNavigatorLocks } from '../../shared/navigator';
const DBMap = new Map();
const OPEN_DB_LOCK = 'open-wasqlite-db';
let nextClientId = 1;
const openWorkerConnection = async (options) => {
    const connection = new WASqliteConnection(options);
    return {
        init: Comlink.proxy(() => connection.init()),
        getConfig: Comlink.proxy(() => connection.getConfig()),
        close: Comlink.proxy(() => connection.close()),
        execute: Comlink.proxy(async (sql, params) => connection.execute(sql, params)),
        executeBatch: Comlink.proxy(async (sql, params) => connection.executeBatch(sql, params)),
        registerOnTableChange: Comlink.proxy(async (callback) => {
            // Proxy the callback remove function
            return Comlink.proxy(await connection.registerOnTableChange(callback));
        })
    };
};
const openDBShared = async (options) => {
    // Prevent multiple simultaneous opens from causing race conditions
    return getNavigatorLocks().request(OPEN_DB_LOCK, async () => {
        const clientId = nextClientId++;
        const { dbFilename } = options;
        if (!DBMap.has(dbFilename)) {
            const clientIds = new Set();
            const connection = await openWorkerConnection(options);
            await connection.init();
            DBMap.set(dbFilename, {
                clientIds,
                db: connection
            });
        }
        const dbEntry = DBMap.get(dbFilename);
        dbEntry.clientIds.add(clientId);
        const { db } = dbEntry;
        const wrappedConnection = {
            ...db,
            init: Comlink.proxy(() => {
                // the init has been done automatically
            }),
            close: Comlink.proxy(() => {
                const { clientIds } = dbEntry;
                console.debug(`Close requested from client ${clientId} of ${[...clientIds]}`);
                clientIds.delete(clientId);
                if (clientIds.size == 0) {
                    console.debug(`Closing connection to ${dbFilename}.`);
                    DBMap.delete(dbFilename);
                    return db.close?.();
                }
                console.debug(`Connection to ${dbFilename} not closed yet due to active clients.`);
                return;
            })
        };
        return Comlink.proxy(wrappedConnection);
    });
};
// Check if we're in a SharedWorker context
if (typeof SharedWorkerGlobalScope !== 'undefined') {
    const _self = self;
    _self.onconnect = function (event) {
        const port = event.ports[0];
        console.debug('Exposing shared db on port', port);
        Comlink.expose(openDBShared, port);
    };
}
else {
    // A dedicated worker can be shared externally
    Comlink.expose(openDBShared);
}
addEventListener('unload', () => {
    Array.from(DBMap.values()).forEach(async (dbConnection) => {
        const { db } = dbConnection;
        db.close?.();
    });
});
