import { OplogEntry } from './OplogEntry.js';
export class SyncDataBucket {
    bucket;
    data;
    has_more;
    after;
    next_after;
    static fromRow(row) {
        return new SyncDataBucket(row.bucket, row.data.map((entry) => OplogEntry.fromRow(entry)), row.has_more ?? false, row.after, row.next_after);
    }
    constructor(bucket, data, 
    /**
     * True if the response does not contain all the data for this bucket, and another request must be made.
     */
    has_more, 
    /**
     * The `after` specified in the request.
     */
    after, 
    /**
     * Use this for the next request.
     */
    next_after) {
        this.bucket = bucket;
        this.data = data;
        this.has_more = has_more;
        this.after = after;
        this.next_after = next_after;
    }
    toJSON() {
        return {
            bucket: this.bucket,
            has_more: this.has_more,
            after: this.after,
            next_after: this.next_after,
            data: this.data.map((entry) => entry.toJSON())
        };
    }
}
