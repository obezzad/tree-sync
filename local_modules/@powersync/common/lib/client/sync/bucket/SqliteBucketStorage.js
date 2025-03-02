import Logger from 'js-logger';
import { extractTableUpdates } from '../../../db/DBAdapter.js';
import { BaseObserver } from '../../../utils/BaseObserver.js';
import { MAX_OP_ID } from '../../constants.js';
import { PSInternalTable } from './BucketStorageAdapter.js';
import { CrudEntry } from './CrudEntry.js';
const COMPACT_OPERATION_INTERVAL = 1_000;
export class SqliteBucketStorage extends BaseObserver {
    db;
    mutex;
    logger;
    tableNames;
    pendingBucketDeletes;
    _hasCompletedSync;
    updateListener;
    _clientId;
    /**
     * Count up, and do a compact on startup.
     */
    compactCounter = COMPACT_OPERATION_INTERVAL;
    constructor(db, mutex, logger = Logger.get('SqliteBucketStorage')) {
        super();
        this.db = db;
        this.mutex = mutex;
        this.logger = logger;
        this._hasCompletedSync = false;
        this.pendingBucketDeletes = true;
        this.tableNames = new Set();
        this.updateListener = db.registerListener({
            tablesUpdated: (update) => {
                const tables = extractTableUpdates(update);
                if (tables.includes(PSInternalTable.CRUD)) {
                    this.iterateListeners((l) => l.crudUpdate?.());
                }
            }
        });
    }
    async init() {
        this._hasCompletedSync = false;
        const existingTableRows = await this.db.getAll(`SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ps_data_*'`);
        for (const row of existingTableRows ?? []) {
            this.tableNames.add(row.name);
        }
    }
    async dispose() {
        this.updateListener?.();
    }
    async _getClientId() {
        const row = await this.db.get('SELECT powersync_client_id() as client_id');
        return row['client_id'];
    }
    getClientId() {
        if (this._clientId == null) {
            this._clientId = this._getClientId();
        }
        return this._clientId;
    }
    getMaxOpId() {
        return MAX_OP_ID;
    }
    /**
     * Reset any caches.
     */
    startSession() { }
    async getBucketStates() {
        const result = await this.db.getAll("SELECT name as bucket, cast(last_op as TEXT) as op_id FROM ps_buckets WHERE pending_delete = 0 AND name != '$local'");
        return result;
    }
    async saveSyncData(batch) {
        await this.writeTransaction(async (tx) => {
            let count = 0;
            for (const b of batch.buckets) {
                const result = await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', [
                    'save',
                    JSON.stringify({ buckets: [b.toJSON()] })
                ]);
                this.logger.debug('saveSyncData', JSON.stringify(result));
                count += b.data.length;
            }
            this.compactCounter += count;
        });
    }
    async removeBuckets(buckets) {
        for (const bucket of buckets) {
            await this.deleteBucket(bucket);
        }
    }
    /**
     * Mark a bucket for deletion.
     */
    async deleteBucket(bucket) {
        await this.writeTransaction(async (tx) => {
            await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', ['delete_bucket', bucket]);
        });
        this.logger.debug('done deleting bucket');
        this.pendingBucketDeletes = true;
    }
    async hasCompletedSync() {
        if (this._hasCompletedSync) {
            return true;
        }
        const r = await this.db.get(`SELECT powersync_last_synced_at() as synced_at`);
        const completed = r.synced_at != null;
        if (completed) {
            this._hasCompletedSync = true;
        }
        return completed;
    }
    async syncLocalDatabase(checkpoint) {
        const r = await this.validateChecksums(checkpoint);
        if (!r.checkpointValid) {
            this.logger.error('Checksums failed for', r.checkpointFailures);
            for (const b of r.checkpointFailures ?? []) {
                await this.deleteBucket(b);
            }
            return { ready: false, checkpointValid: false, checkpointFailures: r.checkpointFailures };
        }
        const bucketNames = checkpoint.buckets.map((b) => b.bucket);
        await this.writeTransaction(async (tx) => {
            await tx.execute(`UPDATE ps_buckets SET last_op = ? WHERE name IN (SELECT json_each.value FROM json_each(?))`, [
                checkpoint.last_op_id,
                JSON.stringify(bucketNames)
            ]);
            if (checkpoint.write_checkpoint) {
                await tx.execute("UPDATE ps_buckets SET last_op = ? WHERE name = '$local'", [checkpoint.write_checkpoint]);
            }
        });
        const valid = await this.updateObjectsFromBuckets(checkpoint);
        if (!valid) {
            this.logger.debug('Not at a consistent checkpoint - cannot update local db');
            return { ready: false, checkpointValid: true };
        }
        await this.forceCompact();
        return {
            ready: true,
            checkpointValid: true
        };
    }
    /**
     * Atomically update the local state to the current checkpoint.
     *
     * This includes creating new tables, dropping old tables, and copying data over from the oplog.
     */
    async updateObjectsFromBuckets(checkpoint) {
        return this.writeTransaction(async (tx) => {
            const { insertId: result } = await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', [
                'sync_local',
                ''
            ]);
            return result == 1;
        });
    }
    async validateChecksums(checkpoint) {
        const rs = await this.db.execute('SELECT powersync_validate_checkpoint(?) as result', [JSON.stringify(checkpoint)]);
        const resultItem = rs.rows?.item(0);
        this.logger.debug('validateChecksums result item', resultItem);
        if (!resultItem) {
            return {
                checkpointValid: false,
                ready: false,
                checkpointFailures: []
            };
        }
        const result = JSON.parse(resultItem['result']);
        if (result['valid']) {
            return { ready: true, checkpointValid: true };
        }
        else {
            return {
                checkpointValid: false,
                ready: false,
                checkpointFailures: result['failed_buckets']
            };
        }
    }
    /**
     * Force a compact, for tests.
     */
    async forceCompact() {
        this.compactCounter = COMPACT_OPERATION_INTERVAL;
        this.pendingBucketDeletes = true;
        await this.autoCompact();
    }
    async autoCompact() {
        await this.deletePendingBuckets();
        await this.clearRemoveOps();
    }
    async deletePendingBuckets() {
        if (this.pendingBucketDeletes !== false) {
            await this.writeTransaction(async (tx) => {
                await tx.execute('INSERT INTO powersync_operations(op, data) VALUES (?, ?)', ['delete_pending_buckets', '']);
            });
            // Executed once after start-up, and again when there are pending deletes.
            this.pendingBucketDeletes = false;
        }
    }
    async clearRemoveOps() {
        if (this.compactCounter < COMPACT_OPERATION_INTERVAL) {
            return;
        }
        await this.writeTransaction(async (tx) => {
            await tx.execute('INSERT INTO powersync_operations(op, data) VALUES (?, ?)', ['clear_remove_ops', '']);
        });
        this.compactCounter = 0;
    }
    async updateLocalTarget(cb) {
        const rs1 = await this.db.getAll("SELECT target_op FROM ps_buckets WHERE name = '$local' AND target_op = CAST(? as INTEGER)", [MAX_OP_ID]);
        if (!rs1.length) {
            // Nothing to update
            return false;
        }
        const rs = await this.db.getAll("SELECT seq FROM sqlite_sequence WHERE name = 'ps_crud'");
        if (!rs.length) {
            // Nothing to update
            return false;
        }
        const seqBefore = rs[0]['seq'];
        const opId = await cb();
        this.logger.debug(`[updateLocalTarget] Updating target to checkpoint ${opId}`);
        return this.writeTransaction(async (tx) => {
            const anyData = await tx.execute('SELECT 1 FROM ps_crud LIMIT 1');
            if (anyData.rows?.length) {
                // if isNotEmpty
                this.logger.debug('updateLocalTarget', 'ps crud is not empty');
                return false;
            }
            const rs = await tx.execute("SELECT seq FROM sqlite_sequence WHERE name = 'ps_crud'");
            if (!rs.rows?.length) {
                // assert isNotEmpty
                throw new Error('SQlite Sequence should not be empty');
            }
            const seqAfter = rs.rows?.item(0)['seq'];
            this.logger.debug('seqAfter', JSON.stringify(rs.rows?.item(0)));
            if (seqAfter != seqBefore) {
                this.logger.debug('seqAfter != seqBefore', seqAfter, seqBefore);
                // New crud data may have been uploaded since we got the checkpoint. Abort.
                return false;
            }
            const response = await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
                opId
            ]);
            this.logger.debug(['[updateLocalTarget] Response from updating target_op ', JSON.stringify(response)]);
            return true;
        });
    }
    async nextCrudItem() {
        const next = await this.db.getOptional('SELECT * FROM ps_crud ORDER BY id ASC LIMIT 1');
        if (!next) {
            return;
        }
        return CrudEntry.fromRow(next);
    }
    async hasCrud() {
        const anyData = await this.db.getOptional('SELECT 1 FROM ps_crud LIMIT 1');
        return !!anyData;
    }
    /**
     * Get a batch of objects to send to the server.
     * When the objects are successfully sent to the server, call .complete()
     */
    async getCrudBatch(limit = 100) {
        if (!(await this.hasCrud())) {
            return null;
        }
        const crudResult = await this.db.getAll('SELECT * FROM ps_crud ORDER BY id ASC LIMIT ?', [limit]);
        const all = [];
        for (const row of crudResult) {
            all.push(CrudEntry.fromRow(row));
        }
        if (all.length === 0) {
            return null;
        }
        const last = all[all.length - 1];
        return {
            crud: all,
            haveMore: true,
            complete: async (writeCheckpoint) => {
                return this.writeTransaction(async (tx) => {
                    await tx.execute('DELETE FROM ps_crud WHERE id <= ?', [last.clientId]);
                    if (writeCheckpoint) {
                        const crudResult = await tx.execute('SELECT 1 FROM ps_crud LIMIT 1');
                        if (crudResult.rows?.length) {
                            await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
                                writeCheckpoint
                            ]);
                        }
                    }
                    else {
                        await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
                            this.getMaxOpId()
                        ]);
                    }
                });
            }
        };
    }
    async writeTransaction(callback, options) {
        return this.db.writeTransaction(callback, options);
    }
    /**
     * Set a target checkpoint.
     */
    async setTargetCheckpoint(checkpoint) {
        // No-op for now
    }
}
