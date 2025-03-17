export type SyncDataFlowStatus = Partial<{
    downloading: boolean;
    uploading: boolean;
}>;
export interface SyncPriorityStatus {
    priority: number;
    lastSyncedAt?: Date;
    hasSynced?: boolean;
}
export type SyncStatusOptions = {
    connected?: boolean;
    connecting?: boolean;
    dataFlow?: SyncDataFlowStatus;
    lastSyncedAt?: Date;
    hasSynced?: boolean;
    priorityStatusEntries?: SyncPriorityStatus[];
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
    /**
     * Partial sync status for involved bucket priorities.
     */
    get priorityStatusEntries(): SyncPriorityStatus[];
    /**
     * Reports a pair of {@link SyncStatus#hasSynced} and {@link SyncStatus#lastSyncedAt} fields that apply
     * to a specific bucket priority instead of the entire sync operation.
     *
     * When buckets with different priorities are declared, PowerSync may choose to synchronize higher-priority
     * buckets first. When a consistent view over all buckets for all priorities up until the given priority is
     * reached, PowerSync makes data from those buckets available before lower-priority buckets have finished
     * synchronizing.
     * When PowerSync makes data for a given priority available, all buckets in higher-priorities are guaranteed to
     * be consistent with that checkpoint. For this reason, this method may also return the status for lower priorities.
     * In a state where the PowerSync just finished synchronizing buckets in priority level 3, calling this method
     * with a priority of 1 may return information for priority level 3.
     *
     * @param priority The bucket priority for which the status should be reported.
     */
    statusForPriority(priority: number): SyncPriorityStatus;
    isEqual(status: SyncStatus): boolean;
    getMessage(): string;
    toJSON(): SyncStatusOptions;
    private static comparePriorities;
}
