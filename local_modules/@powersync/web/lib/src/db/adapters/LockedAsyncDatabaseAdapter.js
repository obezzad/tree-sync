import { BaseObserver } from '@powersync/common';
import Logger from 'js-logger';
import { getNavigatorLocks } from '../..//shared/navigator';
import { WorkerWrappedAsyncDatabaseConnection } from './WorkerWrappedAsyncDatabaseConnection';
/**
 * @internal
 * Wraps a {@link AsyncDatabaseConnection} and provides exclusive locking functions in
 * order to implement {@link DBAdapter}.
 */
export class LockedAsyncDatabaseAdapter extends BaseObserver {
    options;
    logger;
    dbGetHelpers;
    debugMode;
    _dbIdentifier;
    initPromise;
    _db = null;
    _disposeTableChangeListener = null;
    _config = null;
    constructor(options) {
        super();
        this.options = options;
        this._dbIdentifier = options.name;
        this.logger = options.logger ?? Logger.get(`LockedAsyncDatabaseAdapter - ${this._dbIdentifier}`);
        // Set the name if provided. We can query for the name if not available yet
        this.debugMode = options.debugMode ?? false;
        if (this.debugMode) {
            const originalExecute = this._execute.bind(this);
            this._execute = async (sql, bindings) => {
                const start = performance.now();
                try {
                    const r = await originalExecute(sql, bindings);
                    performance.measure(`[SQL] ${sql}`, { start });
                    return r;
                }
                catch (e) {
                    performance.measure(`[SQL] [ERROR: ${e.message}] ${sql}`, { start });
                    throw e;
                }
            };
        }
        this.dbGetHelpers = this.generateDBHelpers({
            execute: (query, params) => this.acquireLock(() => this._execute(query, params))
        });
        this.initPromise = this._init();
    }
    get baseDB() {
        if (!this._db) {
            throw new Error(`Initialization has not completed yet. Cannot access base db`);
        }
        return this._db;
    }
    get name() {
        return this._dbIdentifier;
    }
    /**
     * Init is automatic, this helps catch errors or explicitly await initialization
     */
    async init() {
        return this.initPromise;
    }
    async _init() {
        this._db = await this.options.openConnection();
        await this._db.init();
        this._config = await this._db.getConfig();
        await this.registerOnChangeListener(this._db);
        this.iterateListeners((cb) => cb.initialized?.());
    }
    getConfiguration() {
        if (!this._config) {
            throw new Error(`Cannot get config before initialization is completed`);
        }
        return this._config;
    }
    async waitForInitialized() {
        // Awaiting this will expose errors on function calls like .execute etc
        await this.initPromise;
    }
    async shareConnection() {
        if (false == this._db instanceof WorkerWrappedAsyncDatabaseConnection) {
            throw new Error(`Only worker connections can be shared`);
        }
        return this._db.shareConnection();
    }
    /**
     * Registers a table change notification callback with the base database.
     * This can be extended by custom implementations in order to handle proxy events.
     */
    async registerOnChangeListener(db) {
        this._disposeTableChangeListener = await db.registerOnTableChange((event) => {
            this.iterateListeners((cb) => cb.tablesUpdated?.(event));
        });
    }
    /**
     * This is currently a no-op on web
     */
    async refreshSchema() { }
    async execute(query, params) {
        return this.writeLock((ctx) => ctx.execute(query, params));
    }
    async executeBatch(query, params) {
        return this.writeLock((ctx) => this._executeBatch(query, params));
    }
    /**
     * Attempts to close the connection.
     * Shared workers might not actually close the connection if other
     * tabs are still using it.
     */
    close() {
        this._disposeTableChangeListener?.();
        this.baseDB?.close?.();
    }
    async getAll(sql, parameters) {
        await this.waitForInitialized();
        return this.dbGetHelpers.getAll(sql, parameters);
    }
    async getOptional(sql, parameters) {
        await this.waitForInitialized();
        return this.dbGetHelpers.getOptional(sql, parameters);
    }
    async get(sql, parameters) {
        await this.waitForInitialized();
        return this.dbGetHelpers.get(sql, parameters);
    }
    async readLock(fn, options) {
        await this.waitForInitialized();
        return this.acquireLock(async () => fn(this.generateDBHelpers({ execute: this._execute })));
    }
    async writeLock(fn, options) {
        await this.waitForInitialized();
        return this.acquireLock(async () => fn(this.generateDBHelpers({ execute: this._execute })));
    }
    acquireLock(callback) {
        return getNavigatorLocks().request(`db-lock-${this._dbIdentifier}`, callback);
    }
    async readTransaction(fn, options) {
        return this.readLock(this.wrapTransaction(fn));
    }
    writeTransaction(fn, options) {
        return this.writeLock(this.wrapTransaction(fn));
    }
    generateDBHelpers(tx) {
        return {
            ...tx,
            /**
             *  Execute a read-only query and return results
             */
            async getAll(sql, parameters) {
                const res = await tx.execute(sql, parameters);
                return res.rows?._array ?? [];
            },
            /**
             * Execute a read-only query and return the first result, or null if the ResultSet is empty.
             */
            async getOptional(sql, parameters) {
                const res = await tx.execute(sql, parameters);
                return res.rows?.item(0) ?? null;
            },
            /**
             * Execute a read-only query and return the first result, error if the ResultSet is empty.
             */
            async get(sql, parameters) {
                const res = await tx.execute(sql, parameters);
                const first = res.rows?.item(0);
                if (!first) {
                    throw new Error('Result set is empty');
                }
                return first;
            }
        };
    }
    /**
     * Wraps a lock context into a transaction context
     */
    wrapTransaction(cb) {
        return async (tx) => {
            await this._execute('BEGIN TRANSACTION');
            let finalized = false;
            const commit = async () => {
                if (finalized) {
                    return { rowsAffected: 0 };
                }
                finalized = true;
                return this._execute('COMMIT');
            };
            const rollback = () => {
                finalized = true;
                return this._execute('ROLLBACK');
            };
            try {
                const result = await cb({
                    ...tx,
                    commit,
                    rollback
                });
                if (!finalized) {
                    await commit();
                }
                return result;
            }
            catch (ex) {
                this.logger.debug('Caught ex in transaction', ex);
                try {
                    await rollback();
                }
                catch (ex2) {
                    // In rare cases, a rollback may fail.
                    // Safe to ignore.
                }
                throw ex;
            }
        };
    }
    /**
     * Wraps the worker execute function, awaiting for it to be available
     */
    _execute = async (sql, bindings) => {
        await this.waitForInitialized();
        const result = await this.baseDB.execute(sql, bindings);
        return {
            ...result,
            rows: {
                ...result.rows,
                item: (idx) => result.rows._array[idx]
            }
        };
    };
    /**
     * Wraps the worker executeBatch function, awaiting for it to be available
     */
    _executeBatch = async (query, params) => {
        await this.waitForInitialized();
        const result = await this.baseDB.executeBatch(query, params);
        return {
            ...result,
            rows: undefined
        };
    };
}
