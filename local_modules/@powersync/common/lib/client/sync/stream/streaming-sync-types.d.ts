import { BucketChecksum, Checkpoint } from '../bucket/BucketStorageAdapter.js';
import { CrudEntry, OpId } from '../bucket/CrudEntry.js';
import { SyncDataBucketJSON } from '../bucket/SyncDataBucket.js';
/**
 * For sync2.json
 */
export interface ContinueCheckpointRequest {
    /**
     * Existing bucket states. Only these buckets are synchronized.
     */
    buckets: BucketRequest[];
    checkpoint_token: string;
    limit?: number;
}
export interface SyncNewCheckpointRequest {
    /**
     * Existing bucket states. Used if include_data is specified.
     */
    buckets?: BucketRequest[];
    request_checkpoint: {
        /**
         * Whether or not to include an initial data request.
         */
        include_data: boolean;
        /**
         * Whether or not to compute a checksum.
         */
        include_checksum: boolean;
    };
    limit?: number;
}
export type SyncRequest = ContinueCheckpointRequest | SyncNewCheckpointRequest;
export interface SyncResponse {
    /**
     * Data for the buckets returned. May not have an an entry for each bucket in the request.
     */
    data?: SyncDataBucketJSON[];
    /**
     * True if the response limit has been reached, and another request must be made.
     */
    has_more: boolean;
    checkpoint_token?: string;
    checkpoint?: Checkpoint;
}
type JSONValue = string | number | boolean | null | undefined | JSONObject | JSONArray;
interface JSONObject {
    [key: string]: JSONValue;
}
type JSONArray = JSONValue[];
export type StreamingSyncRequestParameterType = JSONValue;
export interface StreamingSyncRequest {
    /**
     * Existing bucket states.
     */
    buckets?: BucketRequest[];
    /**
     * If specified, limit the response to only include these buckets.
     */
    only?: string[];
    /**
     * Whether or not to compute a checksum for each checkpoint
     */
    include_checksum: boolean;
    /**
     * Changes the response to stringified data in each OplogEntry
     */
    raw_data: boolean;
    /**
     * Client parameters to be passed to the sync rules.
     */
    parameters?: Record<string, StreamingSyncRequestParameterType>;
    client_id?: string;
}
export interface StreamingSyncCheckpoint {
    checkpoint: Checkpoint;
}
export interface StreamingSyncCheckpointDiff {
    checkpoint_diff: {
        last_op_id: OpId;
        updated_buckets: BucketChecksum[];
        removed_buckets: string[];
        write_checkpoint: string;
    };
}
export interface StreamingSyncDataJSON {
    data: SyncDataBucketJSON;
}
export interface StreamingSyncCheckpointComplete {
    checkpoint_complete: {
        last_op_id: OpId;
    };
}
export interface StreamingSyncCheckpointPartiallyComplete {
    partial_checkpoint_complete: {
        priority: number;
        last_op_id: OpId;
    };
}
export interface StreamingSyncKeepalive {
    /** If specified, token expires in this many seconds. */
    token_expires_in: number;
}
export type StreamingSyncLine = StreamingSyncDataJSON | StreamingSyncCheckpoint | StreamingSyncCheckpointDiff | StreamingSyncCheckpointComplete | StreamingSyncCheckpointPartiallyComplete | StreamingSyncKeepalive;
export interface BucketRequest {
    name: string;
    /**
     * Base-10 number. Sync all data from this bucket with op_id > after.
     */
    after: OpId;
}
export declare function isStreamingSyncData(line: StreamingSyncLine): line is StreamingSyncDataJSON;
export declare function isStreamingKeepalive(line: StreamingSyncLine): line is StreamingSyncKeepalive;
export declare function isStreamingSyncCheckpoint(line: StreamingSyncLine): line is StreamingSyncCheckpoint;
export declare function isStreamingSyncCheckpointComplete(line: StreamingSyncLine): line is StreamingSyncCheckpointComplete;
export declare function isStreamingSyncCheckpointPartiallyComplete(line: StreamingSyncLine): line is StreamingSyncCheckpointPartiallyComplete;
export declare function isStreamingSyncCheckpointDiff(line: StreamingSyncLine): line is StreamingSyncCheckpointDiff;
export declare function isContinueCheckpointRequest(request: SyncRequest): request is ContinueCheckpointRequest;
export declare function isSyncNewCheckpointRequest(request: SyncRequest): request is SyncNewCheckpointRequest;
/**
 * For crud.json
 */
export interface CrudRequest {
    data: CrudEntry[];
}
export interface CrudResponse {
    /**
     * A sync response with a checkpoint >= this checkpoint would contain all the changes in this request.
     *
     * Any earlier checkpoint may or may not contain these changes.
     *
     * May be empty when the request contains no ops.
     */
    checkpoint?: OpId;
}
export {};
