import { OpId } from './CrudEntry.js';
import { OplogEntry, OplogEntryJSON } from './OplogEntry.js';
export type SyncDataBucketJSON = {
    bucket: string;
    has_more?: boolean;
    after?: string;
    next_after?: string;
    data: OplogEntryJSON[];
};
export declare class SyncDataBucket {
    bucket: string;
    data: OplogEntry[];
    /**
     * True if the response does not contain all the data for this bucket, and another request must be made.
     */
    has_more: boolean;
    /**
     * The `after` specified in the request.
     */
    after?: OpId | undefined;
    /**
     * Use this for the next request.
     */
    next_after?: OpId | undefined;
    static fromRow(row: SyncDataBucketJSON): SyncDataBucket;
    constructor(bucket: string, data: OplogEntry[], 
    /**
     * True if the response does not contain all the data for this bucket, and another request must be made.
     */
    has_more: boolean, 
    /**
     * The `after` specified in the request.
     */
    after?: OpId | undefined, 
    /**
     * Use this for the next request.
     */
    next_after?: OpId | undefined);
    toJSON(): SyncDataBucketJSON;
}
