import { Mutex } from 'async-mutex';
import Logger, { ILogger } from 'js-logger';
import { DBAdapter, Transaction, extractTableUpdates } from '../../../db/DBAdapter.js';
import { BaseObserver } from '../../../utils/BaseObserver.js';
import { MAX_OP_ID } from '../../constants.js';
import {
  BucketChecksum,
  BucketState,
  BucketStorageAdapter,
  BucketStorageListener,
  Checkpoint,
  PSInternalTable,
  SyncLocalDatabaseResult
} from './BucketStorageAdapter.js';
import { CrudBatch } from './CrudBatch.js';
import { CrudEntry, CrudEntryJSON } from './CrudEntry.js';
import { SyncDataBatch } from './SyncDataBatch.js';

const COMPACT_OPERATION_INTERVAL = 1_000;

export class SqliteBucketStorage extends BaseObserver<BucketStorageListener> implements BucketStorageAdapter {
  public tableNames: Set<string>;
  private pendingBucketDeletes: boolean;
  private _hasCompletedSync: boolean;
  private updateListener: () => void;
  private _clientId?: Promise<string>;

  /**
   * Count up, and do a compact on startup.
   */
  private compactCounter = COMPACT_OPERATION_INTERVAL;

  constructor(
    private db: DBAdapter,
    private mutex: Mutex,
    private logger: ILogger = Logger.get('SqliteBucketStorage')
  ) {
    super();
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
    const existingTableRows = await this.db.getAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ps_data_*'`
    );
    for (const row of existingTableRows ?? []) {
      this.tableNames.add(row.name);
    }
  }

  async dispose() {
    this.updateListener?.();
  }

  async _getClientId() {
    const row = await this.db.get<{ client_id: string }>('SELECT powersync_client_id() as client_id');
    return row['client_id'];
  }

  getClientId() {
    if (this._clientId == null) {
      this._clientId = this._getClientId();
    }
    return this._clientId!;
  }

  getMaxOpId() {
    return MAX_OP_ID;
  }

  /**
   * Reset any caches.
   */
  startSession(): void {}

  async getBucketStates(): Promise<BucketState[]> {
    const methodName = 'getBucketStates';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}.`);
    const result = await this.db.getAll<BucketState>(
      "SELECT name as bucket, cast(last_op as TEXT) as op_id FROM ps_buckets WHERE pending_delete = 0 AND name != '$local'"
    );
    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
    return result;
  }

  async saveSyncData(batch: SyncDataBatch) {
    const methodName = 'saveSyncData';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Buckets count: ${batch.buckets.length}`);

    await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Starting to save sync data operations to powersync_operations.`);
      let count = 0;
      for (const b of batch.buckets) {
        // Not logging individual bucket details here to avoid excessive log volume.
        // The 'save' operation itself implies what's happening.
        await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', [
          'save',
          JSON.stringify({ buckets: [b.toJSON()] })
        ]);
        count += b.data.length;
      }
      this.compactCounter += count;
      const txDuration = Date.now() - txStartTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Finished saving sync data operations. Operations count: ${count}. Transaction duration: ${txDuration}ms.`);
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  async removeBuckets(buckets: string[]): Promise<void> {
    const methodName = 'removeBuckets';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Bucket IDs: ${JSON.stringify(buckets)}`);

    // deleteBucket is called in a loop, and it has its own transaction and logging.
    for (const bucket of buckets) {
      await this.deleteBucket(bucket);
    }

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  /**
   * Mark a bucket for deletion.
   */
  private async deleteBucket(bucket: string) {
    const methodName = 'deleteBucket';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Bucket ID: ${bucket}`);

    await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', ['delete_bucket', bucket]);
      const txDuration = Date.now() - txStartTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Marked bucket for deletion. Transaction duration: ${txDuration}ms.`);
    });

    this.pendingBucketDeletes = true; // Keep this logic
    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  async hasCompletedSync() {
    if (this._hasCompletedSync) {
      return true;
    }
    const r = await this.db.get<{ synced_at: string | null }>(`SELECT powersync_last_synced_at() as synced_at`);
    const completed = r.synced_at != null;
    if (completed) {
      this._hasCompletedSync = true;
    }
    return completed;
  }

  async syncLocalDatabase(checkpoint: Checkpoint, priority?: number): Promise<SyncLocalDatabaseResult> {
    const methodName = 'syncLocalDatabase';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Checkpoint last_op_id: ${checkpoint.last_op_id}, Buckets count: ${checkpoint.buckets.length}, Priority: ${priority}`);

    const r = await this.validateChecksums(checkpoint, priority);
    if (!r.checkpointValid) {
      this.logger.error(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Checksums failed for buckets: ${JSON.stringify(r.checkpointFailures)}`);
      for (const b of r.checkpointFailures ?? []) {
        await this.deleteBucket(b);
      }
      return { ready: false, checkpointValid: false, checkpointFailures: r.checkpointFailures };
    }

    const buckets = checkpoint.buckets;
    if (priority !== undefined) {
      buckets.filter((b) => hasMatchingPriority(priority, b));
    }
    const bucketNames = buckets.map((b) => b.bucket);
    const updateBucketsStartTime = Date.now();
    await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      await tx.execute(`UPDATE ps_buckets SET last_op = ? WHERE name IN (SELECT json_each.value FROM json_each(?))`, [
        checkpoint.last_op_id,
        JSON.stringify(bucketNames)
      ]);

      if (priority == null && checkpoint.write_checkpoint) {
        await tx.execute("UPDATE ps_buckets SET last_op = ? WHERE name = '$local'", [checkpoint.write_checkpoint]);
      }
      const txDuration = Date.now() - txStartTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Updated bucket last_op_ids. Transaction duration: ${txDuration}ms.`);
    });
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Finished updating bucket last_op_ids. Duration: ${Date.now() - updateBucketsStartTime}ms.`);

    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Calling updateObjectsFromBuckets.`);
    const valid = await this.updateObjectsFromBuckets(checkpoint, priority);
    if (!valid) {
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] updateObjectsFromBuckets returned false. Not at a consistent checkpoint - cannot update local db.`);
      const duration = Date.now() - startTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName} (early due to inconsistent checkpoint). Duration: ${duration}ms.`);
      return { ready: false, checkpointValid: true };
    }

    await this.forceCompact(); // forceCompact has its own logging

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
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
  private async updateObjectsFromBuckets(checkpoint: Checkpoint, priority: number | undefined) {
    const methodName = 'updateObjectsFromBuckets';
    const startTime = Date.now();
    // Checkpoint details are logged by the caller (syncLocalDatabase)
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Priority: ${priority}`);

    let arg = '';
    if (priority !== undefined) {
      const affectedBuckets: string[] = [];
      for (const desc of checkpoint.buckets) {
        if (hasMatchingPriority(priority, desc)) {
          affectedBuckets.push(desc.bucket);
        }
      }

      arg = JSON.stringify({ priority, buckets: affectedBuckets });
    }
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Executing updateObjectsFromBuckets (sync_local operation). Arg: ${arg}`);

    const result = await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      const { insertId: opResult } = await tx.execute('INSERT INTO powersync_operations(op, data) VALUES(?, ?)', [
        'sync_local',
        arg
      ]);
      const txDuration = Date.now() - txStartTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Executed powersync_operations (sync_local). Result: ${opResult}. Transaction duration: ${txDuration}ms.`);
      return opResult == 1;
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Result: ${result}. Duration: ${duration}ms.`);
    return result;
  }

  async validateChecksums(checkpoint: Checkpoint, priority: number | undefined): Promise<SyncLocalDatabaseResult> {
    const methodName = 'validateChecksums';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Checkpoint buckets: ${checkpoint.buckets.length}, Priority: ${priority}`);

    if (priority !== undefined) {
      // Only validate the buckets within the priority we care about
      const newBuckets = checkpoint.buckets.filter((cs) => hasMatchingPriority(priority, cs));
      checkpoint = { ...checkpoint, buckets: newBuckets };
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Filtered buckets for priority. New count: ${newBuckets.length}`);
    }

    const rs = await this.db.execute('SELECT powersync_validate_checkpoint(?) as result', [
      JSON.stringify({ ...checkpoint })
    ]);

    const resultItem = rs.rows?.item(0);
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] powersync_validate_checkpoint result item: ${JSON.stringify(resultItem)}`);
    if (!resultItem) {
      const duration = Date.now() - startTime;
      this.logger.warn(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] No result item from powersync_validate_checkpoint. Duration: ${duration}ms.`);
      return {
        checkpointValid: false,
        ready: false,
        checkpointFailures: []
      };
    }

    const result = JSON.parse(resultItem['result']);
    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Valid: ${result['valid']}. Failed buckets: ${JSON.stringify(result['failed_buckets'])}. Duration: ${duration}ms.`);

    if (result['valid']) {
      return { ready: true, checkpointValid: true };
    } else {
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
    const methodName = 'forceCompact';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}.`);

    this.compactCounter = COMPACT_OPERATION_INTERVAL;
    this.pendingBucketDeletes = true;

    await this.autoCompact(); // autoCompact has its own logging

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  async autoCompact() {
    const methodName = 'autoCompact';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}.`);

    await this.deletePendingBuckets(); // Has its own logging
    await this.clearRemoveOps();     // Has its own logging

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  private async deletePendingBuckets() {
    const methodName = 'deletePendingBuckets';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Pending deletes: ${this.pendingBucketDeletes}`);

    if (this.pendingBucketDeletes !== false) {
      await this.writeTransaction(async (tx) => {
        const txStartTime = Date.now();
        await tx.execute('INSERT INTO powersync_operations(op, data) VALUES (?, ?)', ['delete_pending_buckets', '']);
        const txDuration = Date.now() - txStartTime;
        this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Executed delete_pending_buckets operation. Transaction duration: ${txDuration}ms.`);
      });
      // Executed once after start-up, and again when there are pending deletes.
      this.pendingBucketDeletes = false;
    }

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  private async clearRemoveOps() {
    const methodName = 'clearRemoveOps';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Compact counter: ${this.compactCounter}`);

    if (this.compactCounter < COMPACT_OPERATION_INTERVAL) {
      const duration = Date.now() - startTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName} (skipped due to counter). Duration: ${duration}ms.`);
      return;
    }

    await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      await tx.execute('INSERT INTO powersync_operations(op, data) VALUES (?, ?)', ['clear_remove_ops', '']);
      const txDuration = Date.now() - txStartTime;
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Executed clear_remove_ops operation. Transaction duration: ${txDuration}ms.`);
    });
    this.compactCounter = 0;

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Duration: ${duration}ms.`);
  }

  async updateLocalTarget(cb: () => Promise<string>): Promise<boolean> {
    const methodName = 'updateLocalTarget';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}.`);

    const rs1 = await this.db.getAll(
      "SELECT target_op FROM ps_buckets WHERE name = '$local' AND target_op = CAST(? as INTEGER)",
      [MAX_OP_ID]
    );
    if (!rs1.length) {
      // Nothing to update
      return false;
    }
    const rs = await this.db.getAll<{ seq: number }>("SELECT seq FROM sqlite_sequence WHERE name = 'ps_crud'");
    if (!rs.length) {
      // Nothing to update
      return false;
    }

    const seqBefore: number = rs[0]['seq'];

    const opId = await cb(); // cb() is external, cannot log its internals here

    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Callback provided opId: ${opId}. Proceeding with transaction.`);

    const result = await this.writeTransaction(async (tx) => {
      const txStartTime = Date.now();
      const anyData = await tx.execute('SELECT 1 FROM ps_crud LIMIT 1');
      if (anyData.rows?.length) {
        this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] ps_crud is not empty, aborting update. Transaction duration: ${Date.now() - txStartTime}ms.`);
        return false;
      }

      const rsSeq = await tx.execute("SELECT seq FROM sqlite_sequence WHERE name = 'ps_crud'");
      if (!rsSeq.rows?.length) {
        const txDuration = Date.now() - txStartTime;
        this.logger.error(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] SQLite sequence for ps_crud not found. Transaction duration: ${txDuration}ms.`);
        throw new Error('SQLite Sequence for ps_crud should not be empty');
      }

      const seqAfter: number = rsSeq.rows?.item(0)['seq'];
      if (seqAfter != seqBefore) {
        this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] ps_crud sequence changed (before: ${seqBefore}, after: ${seqAfter}), aborting update. Transaction duration: ${Date.now() - txStartTime}ms.`);
        return false;
      }

      const response = await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
        opId
      ]);
      this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${methodName}] Updated ps_buckets target_op. Response: ${JSON.stringify(response)}. Transaction duration: ${Date.now() - txStartTime}ms.`);
      return true;
    });

    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Result: ${result}. Duration: ${duration}ms.`);
    return result;
  }

  async nextCrudItem(): Promise<CrudEntry | undefined> {
    const next = await this.db.getOptional<CrudEntryJSON>('SELECT * FROM ps_crud ORDER BY id ASC LIMIT 1');
    if (!next) {
      return;
    }
    return CrudEntry.fromRow(next);
  }

  async hasCrud(): Promise<boolean> {
    const anyData = await this.db.getOptional('SELECT 1 FROM ps_crud LIMIT 1');
    return !!anyData;
  }

  /**
   * Get a batch of objects to send to the server.
   * When the objects are successfully sent to the server, call .complete()
   */
  async getCrudBatch(limit: number = 100): Promise<CrudBatch | null> {
    if (!(await this.hasCrud())) { // hasCrud has its own basic logging
      return null;
    }

    // This method doesn't directly involve a writeTransaction itself, but its `complete` callback does.
    // So, minimal logging for the main part of getCrudBatch.
    const methodName = 'getCrudBatch';
    const startTime = Date.now();
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${methodName}. Limit: ${limit}`);

    const crudResult = await this.db.getAll<CrudEntryJSON>('SELECT * FROM ps_crud ORDER BY id ASC LIMIT ?', [limit]);

    const all: CrudEntry[] = [];
    for (const row of crudResult) {
      all.push(CrudEntry.fromRow(row));
    }

    if (all.length === 0) {
      return null;
    }

    const last = all[all.length - 1];
    return {
      crud: all,
      haveMore: true, // This is not always true, it should be `all.length == limit` if we fetch limit+1
      complete: async (writeCheckpoint?: string) => {
        const completeMethodName = 'getCrudBatch.complete';
        const completeStartTime = Date.now();
        this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Entering ${completeMethodName}. WriteCheckpoint: ${writeCheckpoint}, LastClientID: ${last.clientId}`);

        const result = await this.writeTransaction(async (tx) => {
          const txStartTime = Date.now();
          await tx.execute('DELETE FROM ps_crud WHERE id <= ?', [last.clientId]);
          this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${completeMethodName}] Deleted processed CRUD items up to ID ${last.clientId}.`);

          if (writeCheckpoint) {
            const crudCheckResult = await tx.execute('SELECT 1 FROM ps_crud LIMIT 1');
            if (!crudCheckResult.rows?.length) { // Corrected logic: if ps_crud is NOW empty
              await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
                writeCheckpoint
              ]);
              this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${completeMethodName}] ps_crud is empty, updated $local bucket target_op to ${writeCheckpoint}.`);
            } else {
              this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${completeMethodName}] ps_crud is NOT empty, $local bucket target_op not updated with writeCheckpoint.`);
            }
          } else {
            // Original logic: always update if no writeCheckpoint, regardless of ps_crud content.
            // This seems to be the intended behavior for clearing the slate if no specific checkpoint is given.
            await tx.execute("UPDATE ps_buckets SET target_op = CAST(? as INTEGER) WHERE name='$local'", [
              this.getMaxOpId()
            ]);
            this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${completeMethodName}] No writeCheckpoint provided, updated $local bucket target_op to MAX_OP_ID.`);
          }
          const txDuration = Date.now() - txStartTime;
          this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage][${completeMethodName}] Transaction finished. Duration: ${txDuration}ms.`);
        });
        const completeDuration = Date.now() - completeStartTime;
        this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${completeMethodName}. Duration: ${completeDuration}ms.`);
        return result;
      }
    };
    // Add exit log for the main getCrudBatch method
    const duration = Date.now() - startTime;
    this.logger.debug(`[PowerSyncSDK][SqliteBucketStorage] Exiting ${methodName}. Crud items fetched: ${all.length}. Duration: ${duration}ms.`);
    return batch; // Return the constructed batch object
  }

  async writeTransaction<T>(callback: (tx: Transaction) => Promise<T>, options?: { timeoutMs: number }): Promise<T> {
    return this.db.writeTransaction(callback, options);
  }

  /**
   * Set a target checkpoint.
   */
  async setTargetCheckpoint(checkpoint: Checkpoint) {
    // No-op for now
  }
}

function hasMatchingPriority(priority: number, bucket: BucketChecksum) {
  return bucket.priority != null && bucket.priority <= priority;
}
