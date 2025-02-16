import * as Comlink from 'comlink';
/**
 * Wraps a provided instance of {@link AsyncDatabaseConnection}, providing necessary proxy
 * functions for worker listeners.
 */
export class WorkerWrappedAsyncDatabaseConnection {
    options;
    constructor(options) {
        this.options = options;
    }
    get baseConnection() {
        return this.options.baseConnection;
    }
    init() {
        return this.baseConnection.init();
    }
    /**
     * Get a MessagePort which can be used to share the internals of this connection.
     */
    async shareConnection() {
        const { identifier, remote } = this.options;
        const newPort = await remote[Comlink.createEndpoint]();
        return { port: newPort, identifier };
    }
    /**
     * Registers a table change notification callback with the base database.
     * This can be extended by custom implementations in order to handle proxy events.
     */
    async registerOnTableChange(callback) {
        return this.baseConnection.registerOnTableChange(Comlink.proxy(callback));
    }
    async close() {
        await this.baseConnection.close();
        this.options.remote[Comlink.releaseProxy]();
        this.options.onClose?.();
    }
    execute(sql, params) {
        return this.baseConnection.execute(sql, params);
    }
    executeBatch(sql, params) {
        return this.baseConnection.executeBatch(sql, params);
    }
    getConfig() {
        return this.baseConnection.getConfig();
    }
}
