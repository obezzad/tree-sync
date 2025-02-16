import { BaseObserver } from '@powersync/common';
import { Mutex } from 'async-mutex';
const MOCK_QUERY_RESPONSE = {
    rowsAffected: 0
};
/**
 * Implements a Mock DB adapter for use in Server Side Rendering (SSR).
 * This adapter will return empty results for queries, which will allow
 * server rendered views to initially generate scaffolding components
 */
export class SSRDBAdapter extends BaseObserver {
    name;
    readMutex;
    writeMutex;
    constructor() {
        super();
        this.name = 'SSR DB';
        this.readMutex = new Mutex();
        this.writeMutex = new Mutex();
    }
    close() { }
    async readLock(fn, options) {
        return this.readMutex.runExclusive(() => fn(this));
    }
    async readTransaction(fn, options) {
        return this.readLock(() => fn(this.generateMockTransactionContext()));
    }
    async writeLock(fn, options) {
        return this.writeMutex.runExclusive(() => fn(this));
    }
    async writeTransaction(fn, options) {
        return this.writeLock(() => fn(this.generateMockTransactionContext()));
    }
    async execute(query, params) {
        return this.writeMutex.runExclusive(async () => MOCK_QUERY_RESPONSE);
    }
    async executeBatch(query, params) {
        return this.writeMutex.runExclusive(async () => MOCK_QUERY_RESPONSE);
    }
    async getAll(sql, parameters) {
        return [];
    }
    async getOptional(sql, parameters) {
        return null;
    }
    async get(sql, parameters) {
        throw new Error(`No values are returned in SSR mode`);
    }
    /**
     * Generates a mock context for use in read/write transactions.
     * `this` already mocks most of the API, commit and rollback mocks
     *  are added here
     */
    generateMockTransactionContext() {
        return {
            ...this,
            commit: async () => {
                return MOCK_QUERY_RESPONSE;
            },
            rollback: async () => {
                return MOCK_QUERY_RESPONSE;
            }
        };
    }
    async refreshSchema() { }
}
