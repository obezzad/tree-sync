export type SyncDataFlowStatus = Partial<{
    downloading: boolean;
    uploading: boolean;
}>;
export type SyncStatusOptions = {
    connected?: boolean;
    connecting?: boolean;
    dataFlow?: SyncDataFlowStatus;
    lastSyncedAt?: Date;
    hasSynced?: boolean;
};
export declare class SyncStatus {
    protected options: SyncStatusOptions;
    constructor(options: SyncStatusOptions);
    /**
     * true if currently connected.
     */
    get connected(): boolean;
    get connecting(): boolean;
    /**
     *  Time that a last sync has fully completed, if any.
     *  Currently this is reset to null after a restart.
     */
    get lastSyncedAt(): Date | undefined;
    /**
     * Indicates whether there has been at least one full sync, if any.
     * Is undefined when unknown, for example when state is still being loaded from the database.
     */
    get hasSynced(): boolean | undefined;
    /**
     *  Upload/download status
     */
    get dataFlowStatus(): Partial<{
        downloading: boolean;
        uploading: boolean;
    }>;
    isEqual(status: SyncStatus): boolean;
    getMessage(): string;
    toJSON(): SyncStatusOptions;
}
