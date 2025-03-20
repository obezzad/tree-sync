import * as Comlink from 'comlink';
import { OpenAsyncDatabaseConnection } from '../..//db/adapters/AsyncDatabaseConnection';
import { WASQLiteVFS } from '../../db/adapters/wa-sqlite/WASQLiteConnection';
/**
 * Opens a shared or dedicated worker which exposes opening of database connections
 */
export declare function openWorkerDatabasePort(workerIdentifier: string, multipleTabs?: boolean, worker?: string | URL, vfs?: WASQLiteVFS): Worker | MessagePort;
/**
 * @returns A function which allows for opening database connections inside
 * a worker.
 */
export declare function getWorkerDatabaseOpener(workerIdentifier: string, multipleTabs?: boolean, worker?: string | URL): Comlink.Remote<OpenAsyncDatabaseConnection>;
export declare function resolveWorkerDatabasePortFactory(worker: () => Worker | SharedWorker): Worker | MessagePort;
export declare function isSharedWorker(worker: Worker | SharedWorker): worker is SharedWorker;
