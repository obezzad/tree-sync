export class SyncStatus {
    options;
    constructor(options) {
        this.options = options;
    }
    /**
     * true if currently connected.
     */
    get connected() {
        return this.options.connected ?? false;
    }
    get connecting() {
        return this.options.connecting ?? false;
    }
    /**
     *  Time that a last sync has fully completed, if any.
     *  Currently this is reset to null after a restart.
     */
    get lastSyncedAt() {
        return this.options.lastSyncedAt;
    }
    /**
     * Indicates whether there has been at least one full sync, if any.
     * Is undefined when unknown, for example when state is still being loaded from the database.
     */
    get hasSynced() {
        return this.options.hasSynced;
    }
    /**
     *  Upload/download status
     */
    get dataFlowStatus() {
        return (this.options.dataFlow ?? {
            /**
             * true if actively downloading changes.
             * This is only true when {@link connected} is also true.
             */
            downloading: false,
            /**
             * true if uploading changes.
             */
            uploading: false
        });
    }
    isEqual(status) {
        return JSON.stringify(this.options) == JSON.stringify(status.options);
    }
    getMessage() {
        const dataFlow = this.dataFlowStatus;
        return `SyncStatus<connected: ${this.connected} connecting: ${this.connecting} lastSyncedAt: ${this.lastSyncedAt} hasSynced: ${this.hasSynced}. Downloading: ${dataFlow.downloading}. Uploading: ${dataFlow.uploading}`;
    }
    toJSON() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            dataFlow: this.dataFlowStatus,
            lastSyncedAt: this.lastSyncedAt,
            hasSynced: this.hasSynced
        };
    }
}
