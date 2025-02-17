import Logger from 'js-logger';
import { Buffer as Buffer$1 } from 'buffer';

const E_CANCELED = new Error('request for lock canceled');

var __awaiter$2 = function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Semaphore {
    constructor(_value, _cancelError = E_CANCELED) {
        this._value = _value;
        this._cancelError = _cancelError;
        this._weightedQueues = [];
        this._weightedWaiters = [];
    }
    acquire(weight = 1) {
        if (weight <= 0)
            throw new Error(`invalid weight ${weight}: must be positive`);
        return new Promise((resolve, reject) => {
            if (!this._weightedQueues[weight - 1])
                this._weightedQueues[weight - 1] = [];
            this._weightedQueues[weight - 1].push({ resolve, reject });
            this._dispatch();
        });
    }
    runExclusive(callback, weight = 1) {
        return __awaiter$2(this, void 0, void 0, function* () {
            const [value, release] = yield this.acquire(weight);
            try {
                return yield callback(value);
            }
            finally {
                release();
            }
        });
    }
    waitForUnlock(weight = 1) {
        if (weight <= 0)
            throw new Error(`invalid weight ${weight}: must be positive`);
        return new Promise((resolve) => {
            if (!this._weightedWaiters[weight - 1])
                this._weightedWaiters[weight - 1] = [];
            this._weightedWaiters[weight - 1].push(resolve);
            this._dispatch();
        });
    }
    isLocked() {
        return this._value <= 0;
    }
    getValue() {
        return this._value;
    }
    setValue(value) {
        this._value = value;
        this._dispatch();
    }
    release(weight = 1) {
        if (weight <= 0)
            throw new Error(`invalid weight ${weight}: must be positive`);
        this._value += weight;
        this._dispatch();
    }
    cancel() {
        this._weightedQueues.forEach((queue) => queue.forEach((entry) => entry.reject(this._cancelError)));
        this._weightedQueues = [];
    }
    _dispatch() {
        var _a;
        for (let weight = this._value; weight > 0; weight--) {
            const queueEntry = (_a = this._weightedQueues[weight - 1]) === null || _a === void 0 ? void 0 : _a.shift();
            if (!queueEntry)
                continue;
            const previousValue = this._value;
            const previousWeight = weight;
            this._value -= weight;
            weight = this._value + 1;
            queueEntry.resolve([previousValue, this._newReleaser(previousWeight)]);
        }
        this._drainUnlockWaiters();
    }
    _newReleaser(weight) {
        let called = false;
        return () => {
            if (called)
                return;
            called = true;
            this.release(weight);
        };
    }
    _drainUnlockWaiters() {
        for (let weight = this._value; weight > 0; weight--) {
            if (!this._weightedWaiters[weight - 1])
                continue;
            this._weightedWaiters[weight - 1].forEach((waiter) => waiter());
            this._weightedWaiters[weight - 1] = [];
        }
    }
}

var __awaiter$1 = function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class Mutex {
    constructor(cancelError) {
        this._semaphore = new Semaphore(1, cancelError);
    }
    acquire() {
        return __awaiter$1(this, void 0, void 0, function* () {
            const [, releaser] = yield this._semaphore.acquire();
            return releaser;
        });
    }
    runExclusive(callback) {
        return this._semaphore.runExclusive(() => callback());
    }
    isLocked() {
        return this._semaphore.isLocked();
    }
    waitForUnlock() {
        return this._semaphore.waitForUnlock();
    }
    release() {
        if (this._semaphore.isLocked())
            this._semaphore.release();
    }
    cancel() {
        return this._semaphore.cancel();
    }
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var node = {};

var eventIterator = {};

Object.defineProperty(eventIterator, "__esModule", { value: true });
class EventQueue {
    constructor() {
        this.pullQueue = [];
        this.pushQueue = [];
        this.eventHandlers = {};
        this.isPaused = false;
        this.isStopped = false;
    }
    push(value) {
        if (this.isStopped)
            return;
        const resolution = { value, done: false };
        if (this.pullQueue.length) {
            const placeholder = this.pullQueue.shift();
            if (placeholder)
                placeholder.resolve(resolution);
        }
        else {
            this.pushQueue.push(Promise.resolve(resolution));
            if (this.highWaterMark !== undefined &&
                this.pushQueue.length >= this.highWaterMark &&
                !this.isPaused) {
                this.isPaused = true;
                if (this.eventHandlers.highWater) {
                    this.eventHandlers.highWater();
                }
                else if (console) {
                    console.warn(`EventIterator queue reached ${this.pushQueue.length} items`);
                }
            }
        }
    }
    stop() {
        if (this.isStopped)
            return;
        this.isStopped = true;
        this.remove();
        for (const placeholder of this.pullQueue) {
            placeholder.resolve({ value: undefined, done: true });
        }
        this.pullQueue.length = 0;
    }
    fail(error) {
        if (this.isStopped)
            return;
        this.isStopped = true;
        this.remove();
        if (this.pullQueue.length) {
            for (const placeholder of this.pullQueue) {
                placeholder.reject(error);
            }
            this.pullQueue.length = 0;
        }
        else {
            const rejection = Promise.reject(error);
            /* Attach error handler to avoid leaking an unhandled promise rejection. */
            rejection.catch(() => { });
            this.pushQueue.push(rejection);
        }
    }
    remove() {
        Promise.resolve().then(() => {
            if (this.removeCallback)
                this.removeCallback();
        });
    }
    [Symbol.asyncIterator]() {
        return {
            next: (value) => {
                const result = this.pushQueue.shift();
                if (result) {
                    if (this.lowWaterMark !== undefined &&
                        this.pushQueue.length <= this.lowWaterMark &&
                        this.isPaused) {
                        this.isPaused = false;
                        if (this.eventHandlers.lowWater) {
                            this.eventHandlers.lowWater();
                        }
                    }
                    return result;
                }
                else if (this.isStopped) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                else {
                    return new Promise((resolve, reject) => {
                        this.pullQueue.push({ resolve, reject });
                    });
                }
            },
            return: () => {
                this.isStopped = true;
                this.pushQueue.length = 0;
                this.remove();
                return Promise.resolve({ value: undefined, done: true });
            },
        };
    }
}
let EventIterator$1 = class EventIterator {
    constructor(listen, { highWaterMark = 100, lowWaterMark = 1 } = {}) {
        const queue = new EventQueue();
        queue.highWaterMark = highWaterMark;
        queue.lowWaterMark = lowWaterMark;
        queue.removeCallback =
            listen({
                push: value => queue.push(value),
                stop: () => queue.stop(),
                fail: error => queue.fail(error),
                on: (event, fn) => {
                    queue.eventHandlers[event] = fn;
                },
            }) || (() => { });
        this[Symbol.asyncIterator] = () => queue[Symbol.asyncIterator]();
        Object.freeze(this);
    }
};
eventIterator.EventIterator = EventIterator$1;
eventIterator.default = EventIterator$1;

Object.defineProperty(node, "__esModule", { value: true });
const event_iterator_1 = eventIterator;
var EventIterator = node.EventIterator = event_iterator_1.EventIterator;
function stream(evOptions) {
    return new event_iterator_1.EventIterator(queue => {
        this.addListener("data", queue.push);
        this.addListener("end", queue.stop);
        this.addListener("error", queue.fail);
        queue.on("highWater", () => this.pause());
        queue.on("lowWater", () => this.resume());
        return () => {
            this.removeListener("data", queue.push);
            this.removeListener("end", queue.stop);
            this.removeListener("error", queue.fail);
            /* We are no longer interested in any data; attempt to close the stream. */
            if (this.destroy) {
                this.destroy();
            }
            else if (typeof this.close == "function") {
                this.close();
            }
        };
    }, evOptions);
}
node.stream = stream;
node.default = event_iterator_1.EventIterator;

/**
 * Set of generic interfaces to allow PowerSync compatibility with
 * different SQLite DB implementations.
 */
/**
 * Update table operation numbers from SQLite
 */
var RowUpdateType;
(function (RowUpdateType) {
    RowUpdateType[RowUpdateType["SQLITE_INSERT"] = 18] = "SQLITE_INSERT";
    RowUpdateType[RowUpdateType["SQLITE_DELETE"] = 9] = "SQLITE_DELETE";
    RowUpdateType[RowUpdateType["SQLITE_UPDATE"] = 23] = "SQLITE_UPDATE";
})(RowUpdateType || (RowUpdateType = {}));
function isBatchedUpdateNotification(update) {
    return 'tables' in update;
}
function extractTableUpdates(update) {
    return isBatchedUpdateNotification(update) ? update.tables : [update.table];
}

class SyncStatus {
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

class UploadQueueStats {
    count;
    size;
    constructor(
    /**
     * Number of records in the upload queue.
     */
    count, 
    /**
     * Size of the upload queue in bytes.
     */
    size = null) {
        this.count = count;
        this.size = size;
    }
    toString() {
        if (this.size == null) {
            return `UploadQueueStats<count:${this.count}>`;
        }
        else {
            return `UploadQueueStats<count: $count size: ${this.size / 1024}kB>`;
        }
    }
}

class BaseObserver {
    listeners = new Set();
    constructor() { }
    /**
     * Register a listener for updates to the PowerSync client.
     */
    registerListener(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    iterateListeners(cb) {
        for (const listener of this.listeners) {
            cb(listener);
        }
    }
    async iterateAsyncListeners(cb) {
        for (let i of Array.from(this.listeners.values())) {
            await cb(i);
        }
    }
}

class ControlledExecutor {
    task;
    /**
     * Represents the currently running task, which could be a Promise or undefined if no task is running.
     */
    runningTask;
    pendingTaskParam;
    /**
     * Flag to determine if throttling is enabled, which controls whether tasks are queued or run immediately.
     */
    isThrottling;
    closed;
    constructor(task, options) {
        this.task = task;
        const { throttleEnabled = true } = options ?? {};
        this.isThrottling = throttleEnabled;
        this.closed = false;
    }
    schedule(param) {
        if (this.closed) {
            return;
        }
        if (!this.isThrottling) {
            this.task(param);
            return;
        }
        if (this.runningTask) {
            // set or replace the pending task param with latest one
            this.pendingTaskParam = param;
            return;
        }
        this.execute(param);
    }
    dispose() {
        this.closed = true;
        if (this.runningTask) {
            this.runningTask = undefined;
        }
    }
    async execute(param) {
        this.runningTask = this.task(param);
        await this.runningTask;
        this.runningTask = undefined;
        if (this.pendingTaskParam) {
            const pendingParam = this.pendingTaskParam;
            this.pendingTaskParam = undefined;
            this.execute(pendingParam);
        }
    }
}

/**
 * Wrapper for async-mutex runExclusive, which allows for a timeout on each exclusive lock.
 */
async function mutexRunExclusive(mutex, callback, options) {
    return new Promise((resolve, reject) => {
        const timeout = options?.timeoutMs;
        let timedOut = false;
        const timeoutId = timeout
            ? setTimeout(() => {
                timedOut = true;
                reject(new Error('Timeout waiting for lock'));
            }, timeout)
            : undefined;
        mutex.runExclusive(async () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (timedOut)
                return;
            try {
                resolve(await callback());
            }
            catch (ex) {
                reject(ex);
            }
        });
    });
}

/**
 * Throttle a function to be called at most once every "wait" milliseconds,
 * on the trailing edge.
 *
 * Roughly equivalent to lodash/throttle with {leading: false, trailing: true}
 */
function throttleTrailing(func, wait) {
    let timeoutId = null;
    const later = () => {
        func();
        timeoutId = null;
    };
    return function () {
        if (timeoutId == null) {
            timeoutId = setTimeout(later, wait);
        }
    };
}
/**
 * Throttle a function to be called at most once every "wait" milliseconds,
 * on the leading and trailing edge.
 *
 * Roughly equivalent to lodash/throttle with {leading: true, trailing: true}
 */
function throttleLeadingTrailing(func, wait) {
    let timeoutId = null;
    let lastCallTime = 0;
    const invokeFunction = () => {
        func();
        lastCallTime = Date.now();
        timeoutId = null;
    };
    return function () {
        const now = Date.now();
        const timeToWait = wait - (now - lastCallTime);
        if (timeToWait <= 0) {
            // Leading edge: Call the function immediately if enough time has passed
            invokeFunction();
        }
        else if (!timeoutId) {
            // Set a timeout for the trailing edge if not already set
            timeoutId = setTimeout(invokeFunction, timeToWait);
        }
    };
}

/**
 * Tests if the input is a {@link SQLOpenOptions}
 */
const isSQLOpenOptions = (test) => {
    // typeof null is `object`, but you cannot use the `in` operator on `null.
    return test && typeof test == 'object' && 'dbFilename' in test;
};
/**
 * Tests if input is a {@link SQLOpenFactory}
 */
const isSQLOpenFactory = (test) => {
    return typeof test?.openDB == 'function';
};
/**
 * Tests if input is a {@link DBAdapter}
 */
const isDBAdapter = (test) => {
    return typeof test?.writeTransaction == 'function';
};

var PSInternalTable;
(function (PSInternalTable) {
    PSInternalTable["DATA"] = "ps_data";
    PSInternalTable["CRUD"] = "ps_crud";
    PSInternalTable["BUCKETS"] = "ps_buckets";
    PSInternalTable["OPLOG"] = "ps_oplog";
    PSInternalTable["UNTYPED"] = "ps_untyped";
})(PSInternalTable || (PSInternalTable = {}));

/**
 * A batch of client-side changes.
 */
class CrudBatch {
    crud;
    haveMore;
    complete;
    constructor(
    /**
     * List of client-side changes.
     */
    crud, 
    /**
     * true if there are more changes in the local queue.
     */
    haveMore, 
    /**
     * Call to remove the changes from the local queue, once successfully uploaded.
     */
    complete) {
        this.crud = crud;
        this.haveMore = haveMore;
        this.complete = complete;
    }
}

/**
 * Type of local change.
 */
var UpdateType;
(function (UpdateType) {
    /** Insert or replace existing row. All non-null columns are included in the data. Generated by INSERT statements. */
    UpdateType["PUT"] = "PUT";
    /** Update existing row. Contains the id, and value of each changed column. Generated by UPDATE statements. */
    UpdateType["PATCH"] = "PATCH";
    /** Delete existing row. Contains the id. Generated by DELETE statements. */
    UpdateType["DELETE"] = "DELETE";
})(UpdateType || (UpdateType = {}));
/**
 * A single client-side change.
 */
class CrudEntry {
    /**
     * Auto-incrementing client-side id.
     */
    clientId;
    /**
     * ID of the changed row.
     */
    id;
    /**
     * Type of change.
     */
    op;
    /**
     * Data associated with the change.
     */
    opData;
    /**
     * Table that contained the change.
     */
    table;
    /**
     * Auto-incrementing transaction id. This is the same for all operations within the same transaction.
     */
    transactionId;
    static fromRow(dbRow) {
        const data = JSON.parse(dbRow.data);
        return new CrudEntry(parseInt(dbRow.id), data.op, data.type, data.id, dbRow.tx_id, data.data);
    }
    constructor(clientId, op, table, id, transactionId, opData) {
        this.clientId = clientId;
        this.id = id;
        this.op = op;
        this.opData = opData;
        this.table = table;
        this.transactionId = transactionId;
    }
    /**
     * Converts the change to JSON format.
     */
    toJSON() {
        return {
            op_id: this.clientId,
            op: this.op,
            type: this.table,
            id: this.id,
            tx_id: this.transactionId,
            data: this.opData
        };
    }
    equals(entry) {
        return JSON.stringify(this.toComparisonArray()) == JSON.stringify(entry.toComparisonArray());
    }
    /**
     * The hash code for this object.
     * @deprecated This should not be necessary in the JS SDK.
     * Use the  @see CrudEntry#equals method instead.
     * TODO remove in the next major release.
     */
    hashCode() {
        return JSON.stringify(this.toComparisonArray());
    }
    /**
     * Generates an array for use in deep comparison operations
     */
    toComparisonArray() {
        return [this.transactionId, this.clientId, this.op, this.table, this.id, this.opData];
    }
}

class CrudTransaction extends CrudBatch {
    crud;
    complete;
    transactionId;
    constructor(
    /**
     * List of client-side changes.
     */
    crud, 
    /**
     * Call to remove the changes from the local queue, once successfully uploaded.
     */
    complete, 
    /**
     * If null, this contains a list of changes recorded without an explicit transaction associated.
     */
    transactionId) {
        super(crud, false, complete);
        this.crud = crud;
        this.complete = complete;
        this.transactionId = transactionId;
    }
}

/**
 * Calls to Abortcontroller.abort(reason: any) will result in the
 * `reason` being thrown. This is not necessarily an error,
 *  but extends error for better logging purposes.
 */
class AbortOperation extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        // Set the prototype explicitly
        Object.setPrototypeOf(this, AbortOperation.prototype);
        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AbortOperation);
        }
    }
}

var OpTypeEnum;
(function (OpTypeEnum) {
    OpTypeEnum[OpTypeEnum["CLEAR"] = 1] = "CLEAR";
    OpTypeEnum[OpTypeEnum["MOVE"] = 2] = "MOVE";
    OpTypeEnum[OpTypeEnum["PUT"] = 3] = "PUT";
    OpTypeEnum[OpTypeEnum["REMOVE"] = 4] = "REMOVE";
})(OpTypeEnum || (OpTypeEnum = {}));
/**
 * Used internally for sync buckets.
 */
class OpType {
    value;
    static fromJSON(jsonValue) {
        return new OpType(OpTypeEnum[jsonValue]);
    }
    constructor(value) {
        this.value = value;
    }
    toJSON() {
        return Object.entries(OpTypeEnum).find(([, value]) => value === this.value)[0];
    }
}

class OplogEntry {
    op_id;
    op;
    checksum;
    subkey;
    object_type;
    object_id;
    data;
    static fromRow(row) {
        return new OplogEntry(row.op_id, OpType.fromJSON(row.op), row.checksum, typeof row.subkey == 'string' ? row.subkey : JSON.stringify(row.subkey), row.object_type, row.object_id, row.data);
    }
    constructor(op_id, op, checksum, subkey, object_type, object_id, data) {
        this.op_id = op_id;
        this.op = op;
        this.checksum = checksum;
        this.subkey = subkey;
        this.object_type = object_type;
        this.object_id = object_id;
        this.data = data;
    }
    toJSON() {
        return {
            op_id: this.op_id,
            op: this.op.toJSON(),
            object_type: this.object_type,
            object_id: this.object_id,
            checksum: this.checksum,
            data: this.data,
            subkey: JSON.stringify(this.subkey)
        };
    }
}

class SyncDataBucket {
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

var canNamespace = {};

/*exported ndjsonStream*/

var namespace = canNamespace;

var ndjsonStream = function(response) {
  // For cancellation
  var is_reader, cancellationRequest = false;
  return new ReadableStream({
    start: function(controller) {
      var reader = response.getReader();
      is_reader = reader;
      var decoder = new TextDecoder();
      var data_buf = "";

      reader.read().then(function processResult(result) {
        if (result.done) {
          if (cancellationRequest) {
            // Immediately exit
            return;
          }

          data_buf = data_buf.trim();
          if (data_buf.length !== 0) {
            try {
              var data_l = JSON.parse(data_buf);
              controller.enqueue(data_l);
            } catch(e) {
              controller.error(e);
              return;
            }
          }
          controller.close();
          return;
        }

        var data = decoder.decode(result.value, {stream: true});
        data_buf += data;
        var lines = data_buf.split("\n");
        for(var i = 0; i < lines.length - 1; ++i) {
          var l = lines[i].trim();
          if (l.length > 0) {
            try {
              var data_line = JSON.parse(l);
              controller.enqueue(data_line);
            } catch(e) {
              controller.error(e);
              cancellationRequest = true;
              reader.cancel();
              return;
            }
          }
        }
        data_buf = lines[lines.length-1];

        return reader.read().then(processResult);
      });

    },
    cancel: function(reason) {
      console.log("Cancel registered due to ", reason);
      cancellationRequest = true;
      is_reader.cancel();
    }
  });
};

var canNdjsonStream = namespace.ndjsonStream = ndjsonStream;

var ndjsonStream$1 = /*@__PURE__*/getDefaultExportFromCjs(canNdjsonStream);

var dist$1 = {};

var Codecs = {};

var Frames = {};

(function (exports) {
	/*
	 * Copyright 2021-2022 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Frame = exports.Lengths = exports.Flags = exports.FrameTypes = void 0;
	var FrameTypes;
	(function (FrameTypes) {
	    FrameTypes[FrameTypes["RESERVED"] = 0] = "RESERVED";
	    FrameTypes[FrameTypes["SETUP"] = 1] = "SETUP";
	    FrameTypes[FrameTypes["LEASE"] = 2] = "LEASE";
	    FrameTypes[FrameTypes["KEEPALIVE"] = 3] = "KEEPALIVE";
	    FrameTypes[FrameTypes["REQUEST_RESPONSE"] = 4] = "REQUEST_RESPONSE";
	    FrameTypes[FrameTypes["REQUEST_FNF"] = 5] = "REQUEST_FNF";
	    FrameTypes[FrameTypes["REQUEST_STREAM"] = 6] = "REQUEST_STREAM";
	    FrameTypes[FrameTypes["REQUEST_CHANNEL"] = 7] = "REQUEST_CHANNEL";
	    FrameTypes[FrameTypes["REQUEST_N"] = 8] = "REQUEST_N";
	    FrameTypes[FrameTypes["CANCEL"] = 9] = "CANCEL";
	    FrameTypes[FrameTypes["PAYLOAD"] = 10] = "PAYLOAD";
	    FrameTypes[FrameTypes["ERROR"] = 11] = "ERROR";
	    FrameTypes[FrameTypes["METADATA_PUSH"] = 12] = "METADATA_PUSH";
	    FrameTypes[FrameTypes["RESUME"] = 13] = "RESUME";
	    FrameTypes[FrameTypes["RESUME_OK"] = 14] = "RESUME_OK";
	    FrameTypes[FrameTypes["EXT"] = 63] = "EXT";
	})(FrameTypes = exports.FrameTypes || (exports.FrameTypes = {}));
	(function (Flags) {
	    Flags[Flags["NONE"] = 0] = "NONE";
	    Flags[Flags["COMPLETE"] = 64] = "COMPLETE";
	    Flags[Flags["FOLLOWS"] = 128] = "FOLLOWS";
	    Flags[Flags["IGNORE"] = 512] = "IGNORE";
	    Flags[Flags["LEASE"] = 64] = "LEASE";
	    Flags[Flags["METADATA"] = 256] = "METADATA";
	    Flags[Flags["NEXT"] = 32] = "NEXT";
	    Flags[Flags["RESPOND"] = 128] = "RESPOND";
	    Flags[Flags["RESUME_ENABLE"] = 128] = "RESUME_ENABLE";
	})(exports.Flags || (exports.Flags = {}));
	(function (Flags) {
	    function hasMetadata(flags) {
	        return (flags & Flags.METADATA) === Flags.METADATA;
	    }
	    Flags.hasMetadata = hasMetadata;
	    function hasComplete(flags) {
	        return (flags & Flags.COMPLETE) === Flags.COMPLETE;
	    }
	    Flags.hasComplete = hasComplete;
	    function hasNext(flags) {
	        return (flags & Flags.NEXT) === Flags.NEXT;
	    }
	    Flags.hasNext = hasNext;
	    function hasFollows(flags) {
	        return (flags & Flags.FOLLOWS) === Flags.FOLLOWS;
	    }
	    Flags.hasFollows = hasFollows;
	    function hasIgnore(flags) {
	        return (flags & Flags.IGNORE) === Flags.IGNORE;
	    }
	    Flags.hasIgnore = hasIgnore;
	    function hasRespond(flags) {
	        return (flags & Flags.RESPOND) === Flags.RESPOND;
	    }
	    Flags.hasRespond = hasRespond;
	    function hasLease(flags) {
	        return (flags & Flags.LEASE) === Flags.LEASE;
	    }
	    Flags.hasLease = hasLease;
	    function hasResume(flags) {
	        return (flags & Flags.RESUME_ENABLE) === Flags.RESUME_ENABLE;
	    }
	    Flags.hasResume = hasResume;
	})(exports.Flags || (exports.Flags = {}));
	(function (Lengths) {
	    Lengths[Lengths["FRAME"] = 3] = "FRAME";
	    Lengths[Lengths["HEADER"] = 6] = "HEADER";
	    Lengths[Lengths["METADATA"] = 3] = "METADATA";
	    Lengths[Lengths["REQUEST"] = 3] = "REQUEST";
	})(exports.Lengths || (exports.Lengths = {}));
	(function (Frame) {
	    function isConnection(frame) {
	        return frame.streamId === 0;
	    }
	    Frame.isConnection = isConnection;
	    function isRequest(frame) {
	        return (FrameTypes.REQUEST_RESPONSE <= frame.type &&
	            frame.type <= FrameTypes.REQUEST_CHANNEL);
	    }
	    Frame.isRequest = isRequest;
	})(exports.Frame || (exports.Frame = {}));
	
} (Frames));

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (exports) {
	var __generator = (commonjsGlobal && commonjsGlobal.__generator) || function (thisArg, body) {
	    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
	    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
	    function verb(n) { return function (v) { return step([n, v]); }; }
	    function step(op) {
	        if (f) throw new TypeError("Generator is already executing.");
	        while (_) try {
	            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
	            if (y = 0, t) op = [op[0] & 2, t.value];
	            switch (op[0]) {
	                case 0: case 1: t = op; break;
	                case 4: _.label++; return { value: op[1], done: false };
	                case 5: _.label++; y = op[1]; op = [0]; continue;
	                case 7: op = _.ops.pop(); _.trys.pop(); continue;
	                default:
	                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
	                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
	                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
	                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
	                    if (t[2]) _.ops.pop();
	                    _.trys.pop(); continue;
	            }
	            op = body.call(thisArg, _);
	        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
	        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
	    }
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Deserializer = exports.sizeOfFrame = exports.serializeFrame = exports.deserializeFrame = exports.serializeFrameWithLength = exports.deserializeFrames = exports.deserializeFrameWithLength = exports.writeUInt64BE = exports.readUInt64BE = exports.writeUInt24BE = exports.readUInt24BE = exports.MAX_VERSION = exports.MAX_TTL = exports.MAX_STREAM_ID = exports.MAX_RESUME_LENGTH = exports.MAX_REQUEST_N = exports.MAX_REQUEST_COUNT = exports.MAX_MIME_LENGTH = exports.MAX_METADATA_LENGTH = exports.MAX_LIFETIME = exports.MAX_KEEPALIVE = exports.MAX_CODE = exports.FRAME_TYPE_OFFFSET = exports.FLAGS_MASK = void 0;
	var Frames_1 = Frames;
	exports.FLAGS_MASK = 0x3ff; // low 10 bits
	exports.FRAME_TYPE_OFFFSET = 10; // frame type is offset 10 bytes within the uint16 containing type + flags
	exports.MAX_CODE = 0x7fffffff; // uint31
	exports.MAX_KEEPALIVE = 0x7fffffff; // uint31
	exports.MAX_LIFETIME = 0x7fffffff; // uint31
	exports.MAX_METADATA_LENGTH = 0xffffff; // uint24
	exports.MAX_MIME_LENGTH = 0xff; // int8
	exports.MAX_REQUEST_COUNT = 0x7fffffff; // uint31
	exports.MAX_REQUEST_N = 0x7fffffff; // uint31
	exports.MAX_RESUME_LENGTH = 0xffff; // uint16
	exports.MAX_STREAM_ID = 0x7fffffff; // uint31
	exports.MAX_TTL = 0x7fffffff; // uint31
	exports.MAX_VERSION = 0xffff; // uint16
	/**
	 * Mimimum value that would overflow bitwise operators (2^32).
	 */
	var BITWISE_OVERFLOW = 0x100000000;
	/**
	 * Read a uint24 from a buffer starting at the given offset.
	 */
	function readUInt24BE(buffer, offset) {
	    var val1 = buffer.readUInt8(offset) << 16;
	    var val2 = buffer.readUInt8(offset + 1) << 8;
	    var val3 = buffer.readUInt8(offset + 2);
	    return val1 | val2 | val3;
	}
	exports.readUInt24BE = readUInt24BE;
	/**
	 * Writes a uint24 to a buffer starting at the given offset, returning the
	 * offset of the next byte.
	 */
	function writeUInt24BE(buffer, value, offset) {
	    offset = buffer.writeUInt8(value >>> 16, offset); // 3rd byte
	    offset = buffer.writeUInt8((value >>> 8) & 0xff, offset); // 2nd byte
	    return buffer.writeUInt8(value & 0xff, offset); // 1st byte
	}
	exports.writeUInt24BE = writeUInt24BE;
	/**
	 * Read a uint64 (technically supports up to 53 bits per JS number
	 * representation).
	 */
	function readUInt64BE(buffer, offset) {
	    var high = buffer.readUInt32BE(offset);
	    var low = buffer.readUInt32BE(offset + 4);
	    return high * BITWISE_OVERFLOW + low;
	}
	exports.readUInt64BE = readUInt64BE;
	/**
	 * Write a uint64 (technically supports up to 53 bits per JS number
	 * representation).
	 */
	function writeUInt64BE(buffer, value, offset) {
	    var high = (value / BITWISE_OVERFLOW) | 0;
	    var low = value % BITWISE_OVERFLOW;
	    offset = buffer.writeUInt32BE(high, offset); // first half of uint64
	    return buffer.writeUInt32BE(low, offset); // second half of uint64
	}
	exports.writeUInt64BE = writeUInt64BE;
	/**
	 * Frame header is:
	 * - stream id (uint32 = 4)
	 * - type + flags (uint 16 = 2)
	 */
	var FRAME_HEADER_SIZE = 6;
	/**
	 * Size of frame length and metadata length fields.
	 */
	var UINT24_SIZE = 3;
	/**
	 * Reads a frame from a buffer that is prefixed with the frame length.
	 */
	function deserializeFrameWithLength(buffer) {
	    var frameLength = readUInt24BE(buffer, 0);
	    return deserializeFrame(buffer.slice(UINT24_SIZE, UINT24_SIZE + frameLength));
	}
	exports.deserializeFrameWithLength = deserializeFrameWithLength;
	/**
	 * Given a buffer that may contain zero or more length-prefixed frames followed
	 * by zero or more bytes of a (partial) subsequent frame, returns an array of
	 * the frames and an int representing the buffer offset.
	 */
	function deserializeFrames(buffer) {
	    var offset, frameLength, frameStart, frameEnd, frameBuffer, frame;
	    return __generator(this, function (_a) {
	        switch (_a.label) {
	            case 0:
	                offset = 0;
	                _a.label = 1;
	            case 1:
	                if (!(offset + UINT24_SIZE < buffer.length)) return [3 /*break*/, 3];
	                frameLength = readUInt24BE(buffer, offset);
	                frameStart = offset + UINT24_SIZE;
	                frameEnd = frameStart + frameLength;
	                if (frameEnd > buffer.length) {
	                    // not all bytes of next frame received
	                    return [3 /*break*/, 3];
	                }
	                frameBuffer = buffer.slice(frameStart, frameEnd);
	                frame = deserializeFrame(frameBuffer);
	                offset = frameEnd;
	                return [4 /*yield*/, [frame, offset]];
	            case 2:
	                _a.sent();
	                return [3 /*break*/, 1];
	            case 3: return [2 /*return*/];
	        }
	    });
	}
	exports.deserializeFrames = deserializeFrames;
	/**
	 * Writes a frame to a buffer with a length prefix.
	 */
	function serializeFrameWithLength(frame) {
	    var buffer = serializeFrame(frame);
	    var lengthPrefixed = Buffer.allocUnsafe(buffer.length + UINT24_SIZE);
	    writeUInt24BE(lengthPrefixed, buffer.length, 0);
	    buffer.copy(lengthPrefixed, UINT24_SIZE);
	    return lengthPrefixed;
	}
	exports.serializeFrameWithLength = serializeFrameWithLength;
	/**
	 * Read a frame from the buffer.
	 */
	function deserializeFrame(buffer) {
	    var offset = 0;
	    var streamId = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   streamId >= 0,
	    //   'RSocketBinaryFraming: Invalid frame, expected a positive stream id, got `%s.',
	    //   streamId,
	    // );
	    var typeAndFlags = buffer.readUInt16BE(offset);
	    offset += 2;
	    var type = typeAndFlags >>> exports.FRAME_TYPE_OFFFSET; // keep highest 6 bits
	    var flags = typeAndFlags & exports.FLAGS_MASK; // keep lowest 10 bits
	    switch (type) {
	        case Frames_1.FrameTypes.SETUP:
	            return deserializeSetupFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.PAYLOAD:
	            return deserializePayloadFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.ERROR:
	            return deserializeErrorFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.KEEPALIVE:
	            return deserializeKeepAliveFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.REQUEST_FNF:
	            return deserializeRequestFnfFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.REQUEST_RESPONSE:
	            return deserializeRequestResponseFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.REQUEST_STREAM:
	            return deserializeRequestStreamFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.REQUEST_CHANNEL:
	            return deserializeRequestChannelFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.METADATA_PUSH:
	            return deserializeMetadataPushFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.REQUEST_N:
	            return deserializeRequestNFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.RESUME:
	            return deserializeResumeFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.RESUME_OK:
	            return deserializeResumeOkFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.CANCEL:
	            return deserializeCancelFrame(buffer, streamId, flags);
	        case Frames_1.FrameTypes.LEASE:
	            return deserializeLeaseFrame(buffer, streamId, flags);
	        // invariant(
	        //   false,
	        //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
	        //   getFrameTypeName(type)
	        // );
	    }
	}
	exports.deserializeFrame = deserializeFrame;
	/**
	 * Convert the frame to a (binary) buffer.
	 */
	function serializeFrame(frame) {
	    switch (frame.type) {
	        case Frames_1.FrameTypes.SETUP:
	            return serializeSetupFrame(frame);
	        case Frames_1.FrameTypes.PAYLOAD:
	            return serializePayloadFrame(frame);
	        case Frames_1.FrameTypes.ERROR:
	            return serializeErrorFrame(frame);
	        case Frames_1.FrameTypes.KEEPALIVE:
	            return serializeKeepAliveFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_FNF:
	        case Frames_1.FrameTypes.REQUEST_RESPONSE:
	            return serializeRequestFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_STREAM:
	        case Frames_1.FrameTypes.REQUEST_CHANNEL:
	            return serializeRequestManyFrame(frame);
	        case Frames_1.FrameTypes.METADATA_PUSH:
	            return serializeMetadataPushFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_N:
	            return serializeRequestNFrame(frame);
	        case Frames_1.FrameTypes.RESUME:
	            return serializeResumeFrame(frame);
	        case Frames_1.FrameTypes.RESUME_OK:
	            return serializeResumeOkFrame(frame);
	        case Frames_1.FrameTypes.CANCEL:
	            return serializeCancelFrame(frame);
	        case Frames_1.FrameTypes.LEASE:
	            return serializeLeaseFrame(frame);
	        // invariant(
	        //   false,
	        //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
	        //   getFrameTypeName(frame.type)
	        // );
	    }
	}
	exports.serializeFrame = serializeFrame;
	/**
	 * Byte size of frame without size prefix
	 */
	function sizeOfFrame(frame) {
	    switch (frame.type) {
	        case Frames_1.FrameTypes.SETUP:
	            return sizeOfSetupFrame(frame);
	        case Frames_1.FrameTypes.PAYLOAD:
	            return sizeOfPayloadFrame(frame);
	        case Frames_1.FrameTypes.ERROR:
	            return sizeOfErrorFrame(frame);
	        case Frames_1.FrameTypes.KEEPALIVE:
	            return sizeOfKeepAliveFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_FNF:
	        case Frames_1.FrameTypes.REQUEST_RESPONSE:
	            return sizeOfRequestFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_STREAM:
	        case Frames_1.FrameTypes.REQUEST_CHANNEL:
	            return sizeOfRequestManyFrame(frame);
	        case Frames_1.FrameTypes.METADATA_PUSH:
	            return sizeOfMetadataPushFrame(frame);
	        case Frames_1.FrameTypes.REQUEST_N:
	            return sizeOfRequestNFrame();
	        case Frames_1.FrameTypes.RESUME:
	            return sizeOfResumeFrame(frame);
	        case Frames_1.FrameTypes.RESUME_OK:
	            return sizeOfResumeOkFrame();
	        case Frames_1.FrameTypes.CANCEL:
	            return sizeOfCancelFrame();
	        case Frames_1.FrameTypes.LEASE:
	            return sizeOfLeaseFrame(frame);
	        // invariant(
	        //   false,
	        //   "RSocketBinaryFraming: Unsupported frame type `%s`.",
	        //   getFrameTypeName(frame.type)
	        // );
	    }
	}
	exports.sizeOfFrame = sizeOfFrame;
	/**
	 * Writes a SETUP frame into a new buffer and returns it.
	 *
	 * Prefix size is:
	 * - version (2x uint16 = 4)
	 * - keepalive (uint32 = 4)
	 * - lifetime (uint32 = 4)
	 * - mime lengths (2x uint8 = 2)
	 */
	var SETUP_FIXED_SIZE = 14;
	var RESUME_TOKEN_LENGTH_SIZE = 2;
	function serializeSetupFrame(frame) {
	    var resumeTokenLength = frame.resumeToken != null ? frame.resumeToken.byteLength : 0;
	    var metadataMimeTypeLength = frame.metadataMimeType != null
	        ? Buffer.byteLength(frame.metadataMimeType, "ascii")
	        : 0;
	    var dataMimeTypeLength = frame.dataMimeType != null
	        ? Buffer.byteLength(frame.dataMimeType, "ascii")
	        : 0;
	    var payloadLength = getPayloadLength(frame);
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE +
	        SETUP_FIXED_SIZE + //
	        (resumeTokenLength ? RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength : 0) +
	        metadataMimeTypeLength +
	        dataMimeTypeLength +
	        payloadLength);
	    var offset = writeHeader(frame, buffer);
	    offset = buffer.writeUInt16BE(frame.majorVersion, offset);
	    offset = buffer.writeUInt16BE(frame.minorVersion, offset);
	    offset = buffer.writeUInt32BE(frame.keepAlive, offset);
	    offset = buffer.writeUInt32BE(frame.lifetime, offset);
	    if (frame.flags & Frames_1.Flags.RESUME_ENABLE) {
	        offset = buffer.writeUInt16BE(resumeTokenLength, offset);
	        if (frame.resumeToken != null) {
	            offset += frame.resumeToken.copy(buffer, offset);
	        }
	    }
	    offset = buffer.writeUInt8(metadataMimeTypeLength, offset);
	    if (frame.metadataMimeType != null) {
	        offset += buffer.write(frame.metadataMimeType, offset, offset + metadataMimeTypeLength, "ascii");
	    }
	    offset = buffer.writeUInt8(dataMimeTypeLength, offset);
	    if (frame.dataMimeType != null) {
	        offset += buffer.write(frame.dataMimeType, offset, offset + dataMimeTypeLength, "ascii");
	    }
	    writePayload(frame, buffer, offset);
	    return buffer;
	}
	function sizeOfSetupFrame(frame) {
	    var resumeTokenLength = frame.resumeToken != null ? frame.resumeToken.byteLength : 0;
	    var metadataMimeTypeLength = frame.metadataMimeType != null
	        ? Buffer.byteLength(frame.metadataMimeType, "ascii")
	        : 0;
	    var dataMimeTypeLength = frame.dataMimeType != null
	        ? Buffer.byteLength(frame.dataMimeType, "ascii")
	        : 0;
	    var payloadLength = getPayloadLength(frame);
	    return (FRAME_HEADER_SIZE +
	        SETUP_FIXED_SIZE + //
	        (resumeTokenLength ? RESUME_TOKEN_LENGTH_SIZE + resumeTokenLength : 0) +
	        metadataMimeTypeLength +
	        dataMimeTypeLength +
	        payloadLength);
	}
	/**
	 * Reads a SETUP frame from the buffer and returns it.
	 */
	function deserializeSetupFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   'RSocketBinaryFraming: Invalid SETUP frame, expected stream id to be 0.',
	    // );
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var majorVersion = buffer.readUInt16BE(offset);
	    offset += 2;
	    var minorVersion = buffer.readUInt16BE(offset);
	    offset += 2;
	    var keepAlive = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   keepAlive >= 0 && keepAlive <= MAX_KEEPALIVE,
	    //   'RSocketBinaryFraming: Invalid SETUP frame, expected keepAlive to be ' +
	    //     '>= 0 and <= %s. Got `%s`.',
	    //   MAX_KEEPALIVE,
	    //   keepAlive,
	    // );
	    var lifetime = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   lifetime >= 0 && lifetime <= MAX_LIFETIME,
	    //   'RSocketBinaryFraming: Invalid SETUP frame, expected lifetime to be ' +
	    //     '>= 0 and <= %s. Got `%s`.',
	    //   MAX_LIFETIME,
	    //   lifetime,
	    // );
	    var resumeToken = null;
	    if (flags & Frames_1.Flags.RESUME_ENABLE) {
	        var resumeTokenLength = buffer.readInt16BE(offset);
	        offset += 2;
	        // invariant(
	        //   resumeTokenLength >= 0 && resumeTokenLength <= MAX_RESUME_LENGTH,
	        //   'RSocketBinaryFraming: Invalid SETUP frame, expected resumeToken length ' +
	        //     'to be >= 0 and <= %s. Got `%s`.',
	        //   MAX_RESUME_LENGTH,
	        //   resumeTokenLength,
	        // );
	        resumeToken = buffer.slice(offset, offset + resumeTokenLength);
	        offset += resumeTokenLength;
	    }
	    var metadataMimeTypeLength = buffer.readUInt8(offset);
	    offset += 1;
	    var metadataMimeType = buffer.toString("ascii", offset, offset + metadataMimeTypeLength);
	    offset += metadataMimeTypeLength;
	    var dataMimeTypeLength = buffer.readUInt8(offset);
	    offset += 1;
	    var dataMimeType = buffer.toString("ascii", offset, offset + dataMimeTypeLength);
	    offset += dataMimeTypeLength;
	    var frame = {
	        data: null,
	        dataMimeType: dataMimeType,
	        flags: flags,
	        keepAlive: keepAlive,
	        lifetime: lifetime,
	        majorVersion: majorVersion,
	        metadata: null,
	        metadataMimeType: metadataMimeType,
	        minorVersion: minorVersion,
	        resumeToken: resumeToken,
	        // streamId,
	        streamId: 0,
	        type: Frames_1.FrameTypes.SETUP,
	    };
	    readPayload(buffer, frame, offset);
	    return frame;
	}
	/**
	 * Writes an ERROR frame into a new buffer and returns it.
	 *
	 * Prefix size is for the error code (uint32 = 4).
	 */
	var ERROR_FIXED_SIZE = 4;
	function serializeErrorFrame(frame) {
	    var messageLength = frame.message != null ? Buffer.byteLength(frame.message, "utf8") : 0;
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + ERROR_FIXED_SIZE + messageLength);
	    var offset = writeHeader(frame, buffer);
	    offset = buffer.writeUInt32BE(frame.code, offset);
	    if (frame.message != null) {
	        buffer.write(frame.message, offset, offset + messageLength, "utf8");
	    }
	    return buffer;
	}
	function sizeOfErrorFrame(frame) {
	    var messageLength = frame.message != null ? Buffer.byteLength(frame.message, "utf8") : 0;
	    return FRAME_HEADER_SIZE + ERROR_FIXED_SIZE + messageLength;
	}
	/**
	 * Reads an ERROR frame from the buffer and returns it.
	 */
	function deserializeErrorFrame(buffer, streamId, flags) {
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var code = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   code >= 0 && code <= MAX_CODE,
	    //   "RSocketBinaryFraming: Invalid ERROR frame, expected code to be >= 0 and <= %s. Got `%s`.",
	    //   MAX_CODE,
	    //   code
	    // );
	    var messageLength = buffer.length - offset;
	    var message = "";
	    if (messageLength > 0) {
	        message = buffer.toString("utf8", offset, offset + messageLength);
	        offset += messageLength;
	    }
	    return {
	        code: code,
	        flags: flags,
	        message: message,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.ERROR,
	    };
	}
	/**
	 * Writes a KEEPALIVE frame into a new buffer and returns it.
	 *
	 * Prefix size is for the last received position (uint64 = 8).
	 */
	var KEEPALIVE_FIXED_SIZE = 8;
	function serializeKeepAliveFrame(frame) {
	    var dataLength = frame.data != null ? frame.data.byteLength : 0;
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + KEEPALIVE_FIXED_SIZE + dataLength);
	    var offset = writeHeader(frame, buffer);
	    offset = writeUInt64BE(buffer, frame.lastReceivedPosition, offset);
	    if (frame.data != null) {
	        frame.data.copy(buffer, offset);
	    }
	    return buffer;
	}
	function sizeOfKeepAliveFrame(frame) {
	    var dataLength = frame.data != null ? frame.data.byteLength : 0;
	    return FRAME_HEADER_SIZE + KEEPALIVE_FIXED_SIZE + dataLength;
	}
	/**
	 * Reads a KEEPALIVE frame from the buffer and returns it.
	 */
	function deserializeKeepAliveFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   "RSocketBinaryFraming: Invalid KEEPALIVE frame, expected stream id to be 0."
	    // );
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var lastReceivedPosition = readUInt64BE(buffer, offset);
	    offset += 8;
	    var data = null;
	    if (offset < buffer.length) {
	        data = buffer.slice(offset, buffer.length);
	    }
	    return {
	        data: data,
	        flags: flags,
	        lastReceivedPosition: lastReceivedPosition,
	        // streamId,
	        streamId: 0,
	        type: Frames_1.FrameTypes.KEEPALIVE,
	    };
	}
	/**
	 * Writes a LEASE frame into a new buffer and returns it.
	 *
	 * Prefix size is for the ttl (uint32) and requestcount (uint32).
	 */
	var LEASE_FIXED_SIZE = 8;
	function serializeLeaseFrame(frame) {
	    var metaLength = frame.metadata != null ? frame.metadata.byteLength : 0;
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + LEASE_FIXED_SIZE + metaLength);
	    var offset = writeHeader(frame, buffer);
	    offset = buffer.writeUInt32BE(frame.ttl, offset);
	    offset = buffer.writeUInt32BE(frame.requestCount, offset);
	    if (frame.metadata != null) {
	        frame.metadata.copy(buffer, offset);
	    }
	    return buffer;
	}
	function sizeOfLeaseFrame(frame) {
	    var metaLength = frame.metadata != null ? frame.metadata.byteLength : 0;
	    return FRAME_HEADER_SIZE + LEASE_FIXED_SIZE + metaLength;
	}
	/**
	 * Reads a LEASE frame from the buffer and returns it.
	 */
	function deserializeLeaseFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   "RSocketBinaryFraming: Invalid LEASE frame, expected stream id to be 0."
	    // );
	    // const length = buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var ttl = buffer.readUInt32BE(offset);
	    offset += 4;
	    var requestCount = buffer.readUInt32BE(offset);
	    offset += 4;
	    var metadata = null;
	    if (offset < buffer.length) {
	        metadata = buffer.slice(offset, buffer.length);
	    }
	    return {
	        flags: flags,
	        metadata: metadata,
	        requestCount: requestCount,
	        // streamId,
	        streamId: 0,
	        ttl: ttl,
	        type: Frames_1.FrameTypes.LEASE,
	    };
	}
	/**
	 * Writes a REQUEST_FNF or REQUEST_RESPONSE frame to a new buffer and returns
	 * it.
	 *
	 * Note that these frames have the same shape and only differ in their type.
	 */
	function serializeRequestFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadLength);
	    var offset = writeHeader(frame, buffer);
	    writePayload(frame, buffer, offset);
	    return buffer;
	}
	function sizeOfRequestFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    return FRAME_HEADER_SIZE + payloadLength;
	}
	/**
	 * Writes a METADATA_PUSH frame to a new buffer and returns
	 * it.
	 */
	function serializeMetadataPushFrame(frame) {
	    var metadata = frame.metadata;
	    if (metadata != null) {
	        var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + metadata.byteLength);
	        var offset = writeHeader(frame, buffer);
	        metadata.copy(buffer, offset);
	        return buffer;
	    }
	    else {
	        var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE);
	        writeHeader(frame, buffer);
	        return buffer;
	    }
	}
	function sizeOfMetadataPushFrame(frame) {
	    return (FRAME_HEADER_SIZE + (frame.metadata != null ? frame.metadata.byteLength : 0));
	}
	function deserializeRequestFnfFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_FNF frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    var frame = {
	        data: null,
	        flags: flags,
	        // length,
	        metadata: null,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.REQUEST_FNF,
	    };
	    readPayload(buffer, frame, FRAME_HEADER_SIZE);
	    return frame;
	}
	function deserializeRequestResponseFrame(buffer, streamId, flags) {
	    // invariant(
	    // streamId > 0,
	    // "RSocketBinaryFraming: Invalid REQUEST_RESPONSE frame, expected stream id to be > 0."
	    // );
	    // const length = buffer.length;
	    var frame = {
	        data: null,
	        flags: flags,
	        // length,
	        metadata: null,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.REQUEST_RESPONSE,
	    };
	    readPayload(buffer, frame, FRAME_HEADER_SIZE);
	    return frame;
	}
	function deserializeMetadataPushFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   "RSocketBinaryFraming: Invalid METADATA_PUSH frame, expected stream id to be 0."
	    // );
	    // const length = buffer.length;
	    return {
	        flags: flags,
	        // length,
	        metadata: length === FRAME_HEADER_SIZE
	            ? null
	            : buffer.slice(FRAME_HEADER_SIZE, length),
	        // streamId,
	        streamId: 0,
	        type: Frames_1.FrameTypes.METADATA_PUSH,
	    };
	}
	/**
	 * Writes a REQUEST_STREAM or REQUEST_CHANNEL frame to a new buffer and returns
	 * it.
	 *
	 * Note that these frames have the same shape and only differ in their type.
	 *
	 * Prefix size is for requestN (uint32 = 4).
	 */
	var REQUEST_MANY_HEADER = 4;
	function serializeRequestManyFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + REQUEST_MANY_HEADER + payloadLength);
	    var offset = writeHeader(frame, buffer);
	    offset = buffer.writeUInt32BE(frame.requestN, offset);
	    writePayload(frame, buffer, offset);
	    return buffer;
	}
	function sizeOfRequestManyFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    return FRAME_HEADER_SIZE + REQUEST_MANY_HEADER + payloadLength;
	}
	function deserializeRequestStreamFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var requestN = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   requestN > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
	    //   requestN
	    // );
	    var frame = {
	        data: null,
	        flags: flags,
	        // length,
	        metadata: null,
	        requestN: requestN,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.REQUEST_STREAM,
	    };
	    readPayload(buffer, frame, offset);
	    return frame;
	}
	function deserializeRequestChannelFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_CHANNEL frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var requestN = buffer.readInt32BE(offset);
	    offset += 4;
	    // invariant(
	    //   requestN > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
	    //   requestN
	    // );
	    var frame = {
	        data: null,
	        flags: flags,
	        // length,
	        metadata: null,
	        requestN: requestN,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.REQUEST_CHANNEL,
	    };
	    readPayload(buffer, frame, offset);
	    return frame;
	}
	/**
	 * Writes a REQUEST_N frame to a new buffer and returns it.
	 *
	 * Prefix size is for requestN (uint32 = 4).
	 */
	var REQUEST_N_HEADER = 4;
	function serializeRequestNFrame(frame) {
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + REQUEST_N_HEADER);
	    var offset = writeHeader(frame, buffer);
	    buffer.writeUInt32BE(frame.requestN, offset);
	    return buffer;
	}
	function sizeOfRequestNFrame(frame) {
	    return FRAME_HEADER_SIZE + REQUEST_N_HEADER;
	}
	function deserializeRequestNFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_N frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    var requestN = buffer.readInt32BE(FRAME_HEADER_SIZE);
	    // invariant(
	    //   requestN > 0,
	    //   "RSocketBinaryFraming: Invalid REQUEST_STREAM frame, expected requestN to be > 0, got `%s`.",
	    //   requestN
	    // );
	    return {
	        flags: flags,
	        // length,
	        requestN: requestN,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.REQUEST_N,
	    };
	}
	/**
	 * Writes a CANCEL frame to a new buffer and returns it.
	 */
	function serializeCancelFrame(frame) {
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE);
	    writeHeader(frame, buffer);
	    return buffer;
	}
	function sizeOfCancelFrame(frame) {
	    return FRAME_HEADER_SIZE;
	}
	function deserializeCancelFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid CANCEL frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    return {
	        flags: flags,
	        // length,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.CANCEL,
	    };
	}
	/**
	 * Writes a PAYLOAD frame to a new buffer and returns it.
	 */
	function serializePayloadFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadLength);
	    var offset = writeHeader(frame, buffer);
	    writePayload(frame, buffer, offset);
	    return buffer;
	}
	function sizeOfPayloadFrame(frame) {
	    var payloadLength = getPayloadLength(frame);
	    return FRAME_HEADER_SIZE + payloadLength;
	}
	function deserializePayloadFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId > 0,
	    //   "RSocketBinaryFraming: Invalid PAYLOAD frame, expected stream id to be > 0."
	    // );
	    buffer.length;
	    var frame = {
	        data: null,
	        flags: flags,
	        // length,
	        metadata: null,
	        streamId: streamId,
	        type: Frames_1.FrameTypes.PAYLOAD,
	    };
	    readPayload(buffer, frame, FRAME_HEADER_SIZE);
	    return frame;
	}
	/**
	 * Writes a RESUME frame into a new buffer and returns it.
	 *
	 * Fixed size is:
	 * - major version (uint16 = 2)
	 * - minor version (uint16 = 2)
	 * - token length (uint16 = 2)
	 * - client position (uint64 = 8)
	 * - server position (uint64 = 8)
	 */
	var RESUME_FIXED_SIZE = 22;
	function serializeResumeFrame(frame) {
	    var resumeTokenLength = frame.resumeToken.byteLength;
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + RESUME_FIXED_SIZE + resumeTokenLength);
	    var offset = writeHeader(frame, buffer);
	    offset = buffer.writeUInt16BE(frame.majorVersion, offset);
	    offset = buffer.writeUInt16BE(frame.minorVersion, offset);
	    offset = buffer.writeUInt16BE(resumeTokenLength, offset);
	    offset += frame.resumeToken.copy(buffer, offset);
	    offset = writeUInt64BE(buffer, frame.serverPosition, offset);
	    writeUInt64BE(buffer, frame.clientPosition, offset);
	    return buffer;
	}
	function sizeOfResumeFrame(frame) {
	    var resumeTokenLength = frame.resumeToken.byteLength;
	    return FRAME_HEADER_SIZE + RESUME_FIXED_SIZE + resumeTokenLength;
	}
	function deserializeResumeFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   "RSocketBinaryFraming: Invalid RESUME frame, expected stream id to be 0."
	    // );
	    buffer.length;
	    var offset = FRAME_HEADER_SIZE;
	    var majorVersion = buffer.readUInt16BE(offset);
	    offset += 2;
	    var minorVersion = buffer.readUInt16BE(offset);
	    offset += 2;
	    var resumeTokenLength = buffer.readInt16BE(offset);
	    offset += 2;
	    // invariant(
	    //   resumeTokenLength >= 0 && resumeTokenLength <= MAX_RESUME_LENGTH,
	    //   "RSocketBinaryFraming: Invalid SETUP frame, expected resumeToken length " +
	    //     "to be >= 0 and <= %s. Got `%s`.",
	    //   MAX_RESUME_LENGTH,
	    //   resumeTokenLength
	    // );
	    var resumeToken = buffer.slice(offset, offset + resumeTokenLength);
	    offset += resumeTokenLength;
	    var serverPosition = readUInt64BE(buffer, offset);
	    offset += 8;
	    var clientPosition = readUInt64BE(buffer, offset);
	    offset += 8;
	    return {
	        clientPosition: clientPosition,
	        flags: flags,
	        // length,
	        majorVersion: majorVersion,
	        minorVersion: minorVersion,
	        resumeToken: resumeToken,
	        serverPosition: serverPosition,
	        // streamId,
	        streamId: 0,
	        type: Frames_1.FrameTypes.RESUME,
	    };
	}
	/**
	 * Writes a RESUME_OK frame into a new buffer and returns it.
	 *
	 * Fixed size is:
	 * - client position (uint64 = 8)
	 */
	var RESUME_OK_FIXED_SIZE = 8;
	function serializeResumeOkFrame(frame) {
	    var buffer = Buffer.allocUnsafe(FRAME_HEADER_SIZE + RESUME_OK_FIXED_SIZE);
	    var offset = writeHeader(frame, buffer);
	    writeUInt64BE(buffer, frame.clientPosition, offset);
	    return buffer;
	}
	function sizeOfResumeOkFrame(frame) {
	    return FRAME_HEADER_SIZE + RESUME_OK_FIXED_SIZE;
	}
	function deserializeResumeOkFrame(buffer, streamId, flags) {
	    // invariant(
	    //   streamId === 0,
	    //   "RSocketBinaryFraming: Invalid RESUME frame, expected stream id to be 0."
	    // );
	    buffer.length;
	    var clientPosition = readUInt64BE(buffer, FRAME_HEADER_SIZE);
	    return {
	        clientPosition: clientPosition,
	        flags: flags,
	        // length,
	        // streamId,
	        streamId: 0,
	        type: Frames_1.FrameTypes.RESUME_OK,
	    };
	}
	/**
	 * Write the header of the frame into the buffer.
	 */
	function writeHeader(frame, buffer) {
	    var offset = buffer.writeInt32BE(frame.streamId, 0);
	    // shift frame to high 6 bits, extract lowest 10 bits from flags
	    return buffer.writeUInt16BE((frame.type << exports.FRAME_TYPE_OFFFSET) | (frame.flags & exports.FLAGS_MASK), offset);
	}
	/**
	 * Determine the length of the payload section of a frame. Only applies to
	 * frame types that MAY have both metadata and data.
	 */
	function getPayloadLength(frame) {
	    var payloadLength = 0;
	    if (frame.data != null) {
	        payloadLength += frame.data.byteLength;
	    }
	    if (Frames_1.Flags.hasMetadata(frame.flags)) {
	        payloadLength += UINT24_SIZE;
	        if (frame.metadata != null) {
	            payloadLength += frame.metadata.byteLength;
	        }
	    }
	    return payloadLength;
	}
	/**
	 * Write the payload of a frame into the given buffer. Only applies to frame
	 * types that MAY have both metadata and data.
	 */
	function writePayload(frame, buffer, offset) {
	    if (Frames_1.Flags.hasMetadata(frame.flags)) {
	        if (frame.metadata != null) {
	            var metaLength = frame.metadata.byteLength;
	            offset = writeUInt24BE(buffer, metaLength, offset);
	            offset += frame.metadata.copy(buffer, offset);
	        }
	        else {
	            offset = writeUInt24BE(buffer, 0, offset);
	        }
	    }
	    if (frame.data != null) {
	        frame.data.copy(buffer, offset);
	    }
	}
	/**
	 * Read the payload from a buffer and write it into the frame. Only applies to
	 * frame types that MAY have both metadata and data.
	 */
	function readPayload(buffer, frame, offset) {
	    if (Frames_1.Flags.hasMetadata(frame.flags)) {
	        var metaLength = readUInt24BE(buffer, offset);
	        offset += UINT24_SIZE;
	        if (metaLength > 0) {
	            frame.metadata = buffer.slice(offset, offset + metaLength);
	            offset += metaLength;
	        }
	    }
	    if (offset < buffer.length) {
	        frame.data = buffer.slice(offset, buffer.length);
	    }
	}
	// exported as class to facilitate testing
	var Deserializer = /** @class */ (function () {
	    function Deserializer() {
	    }
	    /**
	     * Read a frame from the buffer.
	     */
	    Deserializer.prototype.deserializeFrame = function (buffer) {
	        return deserializeFrame(buffer);
	    };
	    /**
	     * Reads a frame from a buffer that is prefixed with the frame length.
	     */
	    Deserializer.prototype.deserializeFrameWithLength = function (buffer) {
	        return deserializeFrameWithLength(buffer);
	    };
	    /**
	     * Given a buffer that may contain zero or more length-prefixed frames followed
	     * by zero or more bytes of a (partial) subsequent frame, returns an array of
	     * the frames and a int representing the buffer offset.
	     */
	    Deserializer.prototype.deserializeFrames = function (buffer) {
	        return deserializeFrames(buffer);
	    };
	    return Deserializer;
	}());
	exports.Deserializer = Deserializer;
	
} (Codecs));

var Common = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(Common, "__esModule", { value: true });

var Deferred$1 = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __values$4 = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(Deferred$1, "__esModule", { value: true });
Deferred$1.Deferred = void 0;
var Deferred = /** @class */ (function () {
    function Deferred() {
        this._done = false;
        this.onCloseCallbacks = [];
    }
    Object.defineProperty(Deferred.prototype, "done", {
        get: function () {
            return this._done;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Signals to an observer that the Deferred operation has been closed, which invokes
     * the provided `onClose` callback.
     */
    Deferred.prototype.close = function (error) {
        var e_1, _a, e_2, _b;
        if (this.done) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        this._done = true;
        this._error = error;
        if (error) {
            try {
                for (var _c = __values$4(this.onCloseCallbacks), _d = _c.next(); !_d.done; _d = _c.next()) {
                    var callback = _d.value;
                    callback(error);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return;
        }
        try {
            for (var _e = __values$4(this.onCloseCallbacks), _f = _e.next(); !_f.done; _f = _e.next()) {
                var callback = _f.value;
                callback();
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
            }
            finally { if (e_2) throw e_2.error; }
        }
    };
    /**
     * Registers a callback to be called when the Closeable is closed. optionally with an Error.
     */
    Deferred.prototype.onClose = function (callback) {
        if (this._done) {
            callback(this._error);
            return;
        }
        this.onCloseCallbacks.push(callback);
    };
    return Deferred;
}());
Deferred$1.Deferred = Deferred;

var Errors = {};

(function (exports) {
	/*
	 * Copyright 2021-2022 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
	    var extendStatics = function (d, b) {
	        extendStatics = Object.setPrototypeOf ||
	            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
	            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
	        return extendStatics(d, b);
	    };
	    return function (d, b) {
	        if (typeof b !== "function" && b !== null)
	            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
	        extendStatics(d, b);
	        function __() { this.constructor = d; }
	        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	    };
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ErrorCodes = exports.RSocketError = void 0;
	var RSocketError = /** @class */ (function (_super) {
	    __extends(RSocketError, _super);
	    function RSocketError(code, message) {
	        var _this = _super.call(this, message) || this;
	        _this.code = code;
	        return _this;
	    }
	    return RSocketError;
	}(Error));
	exports.RSocketError = RSocketError;
	(function (ErrorCodes) {
	    ErrorCodes[ErrorCodes["RESERVED"] = 0] = "RESERVED";
	    ErrorCodes[ErrorCodes["INVALID_SETUP"] = 1] = "INVALID_SETUP";
	    ErrorCodes[ErrorCodes["UNSUPPORTED_SETUP"] = 2] = "UNSUPPORTED_SETUP";
	    ErrorCodes[ErrorCodes["REJECTED_SETUP"] = 3] = "REJECTED_SETUP";
	    ErrorCodes[ErrorCodes["REJECTED_RESUME"] = 4] = "REJECTED_RESUME";
	    ErrorCodes[ErrorCodes["CONNECTION_CLOSE"] = 258] = "CONNECTION_CLOSE";
	    ErrorCodes[ErrorCodes["CONNECTION_ERROR"] = 257] = "CONNECTION_ERROR";
	    ErrorCodes[ErrorCodes["APPLICATION_ERROR"] = 513] = "APPLICATION_ERROR";
	    ErrorCodes[ErrorCodes["REJECTED"] = 514] = "REJECTED";
	    ErrorCodes[ErrorCodes["CANCELED"] = 515] = "CANCELED";
	    ErrorCodes[ErrorCodes["INVALID"] = 516] = "INVALID";
	    ErrorCodes[ErrorCodes["RESERVED_EXTENSION"] = 4294967295] = "RESERVED_EXTENSION";
	})(exports.ErrorCodes || (exports.ErrorCodes = {}));
	
} (Errors));

var RSocket = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(RSocket, "__esModule", { value: true });

var RSocketConnector = {};

var ClientServerMultiplexerDemultiplexer = {};

var hasRequiredClientServerMultiplexerDemultiplexer;

function requireClientServerMultiplexerDemultiplexer () {
	if (hasRequiredClientServerMultiplexerDemultiplexer) return ClientServerMultiplexerDemultiplexer;
	hasRequiredClientServerMultiplexerDemultiplexer = 1;
	(function (exports) {
		/*
		 * Copyright 2021-2022 the original author or authors.
		 *
		 * Licensed under the Apache License, Version 2.0 (the "License");
		 * you may not use this file except in compliance with the License.
		 * You may obtain a copy of the License at
		 *
		 *     http://www.apache.org/licenses/LICENSE-2.0
		 *
		 * Unless required by applicable law or agreed to in writing, software
		 * distributed under the License is distributed on an "AS IS" BASIS,
		 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
		 * See the License for the specific language governing permissions and
		 * limitations under the License.
		 */
		var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
		    var extendStatics = function (d, b) {
		        extendStatics = Object.setPrototypeOf ||
		            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
		            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
		        return extendStatics(d, b);
		    };
		    return function (d, b) {
		        if (typeof b !== "function" && b !== null)
		            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
		        extendStatics(d, b);
		        function __() { this.constructor = d; }
		        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
		    };
		})();
		var __awaiter = (commonjsGlobal && commonjsGlobal.__awaiter) || function (thisArg, _arguments, P, generator) {
		    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
		    return new (P || (P = Promise))(function (resolve, reject) {
		        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
		        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
		        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
		        step((generator = generator.apply(thisArg, _arguments || [])).next());
		    });
		};
		var __generator = (commonjsGlobal && commonjsGlobal.__generator) || function (thisArg, body) {
		    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
		    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
		    function verb(n) { return function (v) { return step([n, v]); }; }
		    function step(op) {
		        if (f) throw new TypeError("Generator is already executing.");
		        while (_) try {
		            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
		            if (y = 0, t) op = [op[0] & 2, t.value];
		            switch (op[0]) {
		                case 0: case 1: t = op; break;
		                case 4: _.label++; return { value: op[1], done: false };
		                case 5: _.label++; y = op[1]; op = [0]; continue;
		                case 7: op = _.ops.pop(); _.trys.pop(); continue;
		                default:
		                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
		                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
		                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
		                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
		                    if (t[2]) _.ops.pop();
		                    _.trys.pop(); continue;
		            }
		            op = body.call(thisArg, _);
		        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
		        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
		    }
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer = exports.ResumableClientServerInputMultiplexerDemultiplexer = exports.ClientServerInputMultiplexerDemultiplexer = exports.StreamIdGenerator = void 0;
		var _1 = requireDist();
		var Deferred_1 = Deferred$1;
		var Errors_1 = Errors;
		var Frames_1 = Frames;
		(function (StreamIdGenerator) {
		    function create(seedId) {
		        return new StreamIdGeneratorImpl(seedId);
		    }
		    StreamIdGenerator.create = create;
		    var StreamIdGeneratorImpl = /** @class */ (function () {
		        function StreamIdGeneratorImpl(currentId) {
		            this.currentId = currentId;
		        }
		        StreamIdGeneratorImpl.prototype.next = function (handler) {
		            var nextId = this.currentId + 2;
		            if (!handler(nextId)) {
		                return;
		            }
		            this.currentId = nextId;
		        };
		        return StreamIdGeneratorImpl;
		    }());
		})(exports.StreamIdGenerator || (exports.StreamIdGenerator = {}));
		var ClientServerInputMultiplexerDemultiplexer = /** @class */ (function (_super) {
		    __extends(ClientServerInputMultiplexerDemultiplexer, _super);
		    function ClientServerInputMultiplexerDemultiplexer(streamIdSupplier, outbound, closeable) {
		        var _this = _super.call(this) || this;
		        _this.streamIdSupplier = streamIdSupplier;
		        _this.outbound = outbound;
		        _this.closeable = closeable;
		        _this.registry = {};
		        closeable.onClose(_this.close.bind(_this));
		        return _this;
		    }
		    ClientServerInputMultiplexerDemultiplexer.prototype.handle = function (frame) {
		        if (Frames_1.Frame.isConnection(frame)) {
		            if (frame.type === _1.FrameTypes.RESERVED) {
		                // TODO: throw
		                return;
		            }
		            this.connectionFramesHandler.handle(frame);
		            // TODO: Connection Handler
		        }
		        else if (Frames_1.Frame.isRequest(frame)) {
		            if (this.registry[frame.streamId]) {
		                // TODO: Send error and close connection
		                return;
		            }
		            this.requestFramesHandler.handle(frame, this);
		        }
		        else {
		            var handler = this.registry[frame.streamId];
		            if (!handler) {
		                // TODO: add validation
		                return;
		            }
		            handler.handle(frame);
		        }
		        // TODO: add extensions support
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.connectionInbound = function (handler) {
		        if (this.connectionFramesHandler) {
		            throw new Error("Connection frame handler has already been installed");
		        }
		        this.connectionFramesHandler = handler;
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.handleRequestStream = function (handler) {
		        if (this.requestFramesHandler) {
		            throw new Error("Stream handler has already been installed");
		        }
		        this.requestFramesHandler = handler;
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.send = function (frame) {
		        this.outbound.send(frame);
		    };
		    Object.defineProperty(ClientServerInputMultiplexerDemultiplexer.prototype, "connectionOutbound", {
		        get: function () {
		            return this;
		        },
		        enumerable: false,
		        configurable: true
		    });
		    ClientServerInputMultiplexerDemultiplexer.prototype.createRequestStream = function (streamHandler) {
		        var _this = this;
		        // handle requester side stream registration
		        if (this.done) {
		            streamHandler.handleReject(new Error("Already closed"));
		            return;
		        }
		        var registry = this.registry;
		        this.streamIdSupplier.next(function (streamId) { return streamHandler.handleReady(streamId, _this); }, Object.keys(registry));
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.connect = function (handler) {
		        this.registry[handler.streamId] = handler;
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.disconnect = function (stream) {
		        delete this.registry[stream.streamId];
		    };
		    ClientServerInputMultiplexerDemultiplexer.prototype.close = function (error) {
		        if (this.done) {
		            _super.prototype.close.call(this, error);
		            return;
		        }
		        for (var streamId in this.registry) {
		            var stream = this.registry[streamId];
		            stream.close(new Error("Closed. ".concat(error ? "Original cause [".concat(error, "].") : "")));
		        }
		        _super.prototype.close.call(this, error);
		    };
		    return ClientServerInputMultiplexerDemultiplexer;
		}(Deferred_1.Deferred));
		exports.ClientServerInputMultiplexerDemultiplexer = ClientServerInputMultiplexerDemultiplexer;
		var ResumableClientServerInputMultiplexerDemultiplexer = /** @class */ (function (_super) {
		    __extends(ResumableClientServerInputMultiplexerDemultiplexer, _super);
		    function ResumableClientServerInputMultiplexerDemultiplexer(streamIdSupplier, outbound, closeable, frameStore, token, sessionStoreOrReconnector, sessionTimeout) {
		        var _this = _super.call(this, streamIdSupplier, outbound, new Deferred_1.Deferred()) || this;
		        _this.frameStore = frameStore;
		        _this.token = token;
		        _this.sessionTimeout = sessionTimeout;
		        if (sessionStoreOrReconnector instanceof Function) {
		            _this.reconnector = sessionStoreOrReconnector;
		        }
		        else {
		            _this.sessionStore = sessionStoreOrReconnector;
		        }
		        closeable.onClose(_this.handleConnectionClose.bind(_this));
		        return _this;
		    }
		    ResumableClientServerInputMultiplexerDemultiplexer.prototype.send = function (frame) {
		        if (Frames_1.Frame.isConnection(frame)) {
		            if (frame.type === _1.FrameTypes.KEEPALIVE) {
		                frame.lastReceivedPosition = this.frameStore.lastReceivedFramePosition;
		            }
		            else if (frame.type === _1.FrameTypes.ERROR) {
		                this.outbound.send(frame);
		                if (this.sessionStore) {
		                    delete this.sessionStore[this.token];
		                }
		                _super.prototype.close.call(this, new Errors_1.RSocketError(frame.code, frame.message));
		                return;
		            }
		        }
		        else {
		            this.frameStore.store(frame);
		        }
		        this.outbound.send(frame);
		    };
		    ResumableClientServerInputMultiplexerDemultiplexer.prototype.handle = function (frame) {
		        if (Frames_1.Frame.isConnection(frame)) {
		            if (frame.type === _1.FrameTypes.KEEPALIVE) {
		                try {
		                    this.frameStore.dropTo(frame.lastReceivedPosition);
		                }
		                catch (re) {
		                    this.outbound.send({
		                        type: _1.FrameTypes.ERROR,
		                        streamId: 0,
		                        flags: _1.Flags.NONE,
		                        code: re.code,
		                        message: re.message,
		                    });
		                    this.close(re);
		                }
		            }
		            else if (frame.type === _1.FrameTypes.ERROR) {
		                _super.prototype.handle.call(this, frame);
		                if (this.sessionStore) {
		                    delete this.sessionStore[this.token];
		                }
		                _super.prototype.close.call(this, new Errors_1.RSocketError(frame.code, frame.message));
		                return;
		            }
		        }
		        else {
		            this.frameStore.record(frame);
		        }
		        _super.prototype.handle.call(this, frame);
		    };
		    ResumableClientServerInputMultiplexerDemultiplexer.prototype.resume = function (frame, outbound, closeable) {
		        this.outbound = outbound;
		        switch (frame.type) {
		            case _1.FrameTypes.RESUME: {
		                clearTimeout(this.timeoutId);
		                if (this.frameStore.lastReceivedFramePosition < frame.clientPosition) {
		                    var e = new Errors_1.RSocketError(_1.ErrorCodes.REJECTED_RESUME, "Impossible to resume since first available client frame position is greater than last received server frame position");
		                    this.outbound.send({
		                        type: _1.FrameTypes.ERROR,
		                        streamId: 0,
		                        flags: _1.Flags.NONE,
		                        code: e.code,
		                        message: e.message,
		                    });
		                    this.close(e);
		                    return;
		                }
		                try {
		                    this.frameStore.dropTo(frame.serverPosition);
		                }
		                catch (re) {
		                    this.outbound.send({
		                        type: _1.FrameTypes.ERROR,
		                        streamId: 0,
		                        flags: _1.Flags.NONE,
		                        code: re.code,
		                        message: re.message,
		                    });
		                    this.close(re);
		                    return;
		                }
		                this.outbound.send({
		                    type: _1.FrameTypes.RESUME_OK,
		                    streamId: 0,
		                    flags: _1.Flags.NONE,
		                    clientPosition: this.frameStore.lastReceivedFramePosition,
		                });
		                break;
		            }
		            case _1.FrameTypes.RESUME_OK: {
		                try {
		                    this.frameStore.dropTo(frame.clientPosition);
		                }
		                catch (re) {
		                    this.outbound.send({
		                        type: _1.FrameTypes.ERROR,
		                        streamId: 0,
		                        flags: _1.Flags.NONE,
		                        code: re.code,
		                        message: re.message,
		                    });
		                    this.close(re);
		                }
		                break;
		            }
		        }
		        this.frameStore.drain(this.outbound.send.bind(this.outbound));
		        closeable.onClose(this.handleConnectionClose.bind(this));
		        this.connectionFramesHandler.resume();
		    };
		    ResumableClientServerInputMultiplexerDemultiplexer.prototype.handleConnectionClose = function (_error) {
		        return __awaiter(this, void 0, void 0, function () {
		            var e_1;
		            return __generator(this, function (_a) {
		                switch (_a.label) {
		                    case 0:
		                        this.connectionFramesHandler.pause();
		                        if (!this.reconnector) return [3 /*break*/, 5];
		                        _a.label = 1;
		                    case 1:
		                        _a.trys.push([1, 3, , 4]);
		                        return [4 /*yield*/, this.reconnector(this, this.frameStore)];
		                    case 2:
		                        _a.sent();
		                        return [3 /*break*/, 4];
		                    case 3:
		                        e_1 = _a.sent();
		                        this.close(e_1);
		                        return [3 /*break*/, 4];
		                    case 4: return [3 /*break*/, 6];
		                    case 5:
		                        this.timeoutId = setTimeout(this.close.bind(this), this.sessionTimeout);
		                        _a.label = 6;
		                    case 6: return [2 /*return*/];
		                }
		            });
		        });
		    };
		    return ResumableClientServerInputMultiplexerDemultiplexer;
		}(ClientServerInputMultiplexerDemultiplexer));
		exports.ResumableClientServerInputMultiplexerDemultiplexer = ResumableClientServerInputMultiplexerDemultiplexer;
		var ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer = /** @class */ (function () {
		    function ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer(outbound, closeable, delegate) {
		        this.outbound = outbound;
		        this.closeable = closeable;
		        this.delegate = delegate;
		        this.resumed = false;
		    }
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.close = function () {
		        this.delegate.close();
		    };
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.onClose = function (callback) {
		        this.delegate.onClose(callback);
		    };
		    Object.defineProperty(ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype, "connectionOutbound", {
		        get: function () {
		            return this.delegate.connectionOutbound;
		        },
		        enumerable: false,
		        configurable: true
		    });
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.createRequestStream = function (streamHandler) {
		        this.delegate.createRequestStream(streamHandler);
		    };
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.connectionInbound = function (handler) {
		        this.delegate.connectionInbound(handler);
		    };
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.handleRequestStream = function (handler) {
		        this.delegate.handleRequestStream(handler);
		    };
		    ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer.prototype.handle = function (frame) {
		        var _this = this;
		        if (!this.resumed) {
		            if (frame.type === _1.FrameTypes.RESUME_OK) {
		                this.resumed = true;
		                this.delegate.resume(frame, this.outbound, this.closeable);
		                return;
		            }
		            else {
		                this.outbound.send({
		                    type: _1.FrameTypes.ERROR,
		                    streamId: 0,
		                    code: _1.ErrorCodes.CONNECTION_ERROR,
		                    message: "Incomplete RESUME handshake. Unexpected frame ".concat(frame.type, " received"),
		                    flags: _1.Flags.NONE,
		                });
		                this.closeable.close();
		                this.closeable.onClose(function () {
		                    return _this.delegate.close(new Errors_1.RSocketError(_1.ErrorCodes.CONNECTION_ERROR, "Incomplete RESUME handshake. Unexpected frame ".concat(frame.type, " received")));
		                });
		            }
		            return;
		        }
		        this.delegate.handle(frame);
		    };
		    return ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer;
		}());
		exports.ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer = ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer;
		
	} (ClientServerMultiplexerDemultiplexer));
	return ClientServerMultiplexerDemultiplexer;
}

var RSocketSupport = {};

var RequestChannelStream = {};

var Fragmenter = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __generator = (commonjsGlobal && commonjsGlobal.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(Fragmenter, "__esModule", { value: true });
Fragmenter.fragmentWithRequestN = Fragmenter.fragment = Fragmenter.isFragmentable = void 0;
var Frames_1$5 = Frames;
function isFragmentable(payload, fragmentSize, frameType) {
    if (fragmentSize === 0) {
        return false;
    }
    return (payload.data.byteLength +
        (payload.metadata ? payload.metadata.byteLength + Frames_1$5.Lengths.METADATA : 0) +
        (frameType == Frames_1$5.FrameTypes.REQUEST_STREAM ||
            frameType == Frames_1$5.FrameTypes.REQUEST_CHANNEL
            ? Frames_1$5.Lengths.REQUEST
            : 0) >
        fragmentSize);
}
Fragmenter.isFragmentable = isFragmentable;
function fragment(streamId, payload, fragmentSize, frameType, isComplete) {
    var dataLength, firstFrame, remaining, metadata, metadataLength, metadataPosition, nextMetadataPosition, nextMetadataPosition, dataPosition, data, nextDataPosition, nextDataPosition;
    var _a, _b;
    if (isComplete === void 0) { isComplete = false; }
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                dataLength = (_b = (_a = payload.data) === null || _a === void 0 ? void 0 : _a.byteLength) !== null && _b !== void 0 ? _b : 0;
                firstFrame = frameType !== Frames_1$5.FrameTypes.PAYLOAD;
                remaining = fragmentSize;
                if (!payload.metadata) return [3 /*break*/, 6];
                metadataLength = payload.metadata.byteLength;
                if (!(metadataLength === 0)) return [3 /*break*/, 1];
                remaining -= Frames_1$5.Lengths.METADATA;
                metadata = Buffer.allocUnsafe(0);
                return [3 /*break*/, 6];
            case 1:
                metadataPosition = 0;
                if (!firstFrame) return [3 /*break*/, 3];
                remaining -= Frames_1$5.Lengths.METADATA;
                nextMetadataPosition = Math.min(metadataLength, metadataPosition + remaining);
                metadata = payload.metadata.slice(metadataPosition, nextMetadataPosition);
                remaining -= metadata.byteLength;
                metadataPosition = nextMetadataPosition;
                if (!(remaining === 0)) return [3 /*break*/, 3];
                firstFrame = false;
                return [4 /*yield*/, {
                        type: frameType,
                        flags: Frames_1$5.Flags.FOLLOWS | Frames_1$5.Flags.METADATA,
                        data: undefined,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 2:
                _c.sent();
                metadata = undefined;
                remaining = fragmentSize;
                _c.label = 3;
            case 3:
                if (!(metadataPosition < metadataLength)) return [3 /*break*/, 6];
                remaining -= Frames_1$5.Lengths.METADATA;
                nextMetadataPosition = Math.min(metadataLength, metadataPosition + remaining);
                metadata = payload.metadata.slice(metadataPosition, nextMetadataPosition);
                remaining -= metadata.byteLength;
                metadataPosition = nextMetadataPosition;
                if (!(remaining === 0 || dataLength === 0)) return [3 /*break*/, 5];
                return [4 /*yield*/, {
                        type: Frames_1$5.FrameTypes.PAYLOAD,
                        flags: Frames_1$5.Flags.NEXT |
                            Frames_1$5.Flags.METADATA |
                            (metadataPosition === metadataLength &&
                                isComplete &&
                                dataLength === 0
                                ? Frames_1$5.Flags.COMPLETE
                                : Frames_1$5.Flags.FOLLOWS),
                        data: undefined,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 4:
                _c.sent();
                metadata = undefined;
                remaining = fragmentSize;
                _c.label = 5;
            case 5: return [3 /*break*/, 3];
            case 6:
                dataPosition = 0;
                if (!firstFrame) return [3 /*break*/, 8];
                nextDataPosition = Math.min(dataLength, dataPosition + remaining);
                data = payload.data.slice(dataPosition, nextDataPosition);
                remaining -= data.byteLength;
                dataPosition = nextDataPosition;
                return [4 /*yield*/, {
                        type: frameType,
                        flags: Frames_1$5.Flags.FOLLOWS | (metadata ? Frames_1$5.Flags.METADATA : Frames_1$5.Flags.NONE),
                        data: data,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 7:
                _c.sent();
                metadata = undefined;
                data = undefined;
                remaining = fragmentSize;
                _c.label = 8;
            case 8:
                if (!(dataPosition < dataLength)) return [3 /*break*/, 10];
                nextDataPosition = Math.min(dataLength, dataPosition + remaining);
                data = payload.data.slice(dataPosition, nextDataPosition);
                remaining -= data.byteLength;
                dataPosition = nextDataPosition;
                return [4 /*yield*/, {
                        type: Frames_1$5.FrameTypes.PAYLOAD,
                        flags: dataPosition === dataLength
                            ? (isComplete ? Frames_1$5.Flags.COMPLETE : Frames_1$5.Flags.NONE) |
                                Frames_1$5.Flags.NEXT |
                                (metadata ? Frames_1$5.Flags.METADATA : 0)
                            : Frames_1$5.Flags.FOLLOWS | Frames_1$5.Flags.NEXT | (metadata ? Frames_1$5.Flags.METADATA : 0),
                        data: data,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 9:
                _c.sent();
                metadata = undefined;
                data = undefined;
                remaining = fragmentSize;
                return [3 /*break*/, 8];
            case 10: return [2 /*return*/];
        }
    });
}
Fragmenter.fragment = fragment;
function fragmentWithRequestN(streamId, payload, fragmentSize, frameType, requestN, isComplete) {
    var dataLength, firstFrame, remaining, metadata, metadataLength, metadataPosition, nextMetadataPosition, nextMetadataPosition, dataPosition, data, nextDataPosition, nextDataPosition;
    var _a, _b;
    if (isComplete === void 0) { isComplete = false; }
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                dataLength = (_b = (_a = payload.data) === null || _a === void 0 ? void 0 : _a.byteLength) !== null && _b !== void 0 ? _b : 0;
                firstFrame = true;
                remaining = fragmentSize;
                if (!payload.metadata) return [3 /*break*/, 6];
                metadataLength = payload.metadata.byteLength;
                if (!(metadataLength === 0)) return [3 /*break*/, 1];
                remaining -= Frames_1$5.Lengths.METADATA;
                metadata = Buffer.allocUnsafe(0);
                return [3 /*break*/, 6];
            case 1:
                metadataPosition = 0;
                if (!firstFrame) return [3 /*break*/, 3];
                remaining -= Frames_1$5.Lengths.METADATA + Frames_1$5.Lengths.REQUEST;
                nextMetadataPosition = Math.min(metadataLength, metadataPosition + remaining);
                metadata = payload.metadata.slice(metadataPosition, nextMetadataPosition);
                remaining -= metadata.byteLength;
                metadataPosition = nextMetadataPosition;
                if (!(remaining === 0)) return [3 /*break*/, 3];
                firstFrame = false;
                return [4 /*yield*/, {
                        type: frameType,
                        flags: Frames_1$5.Flags.FOLLOWS | Frames_1$5.Flags.METADATA,
                        data: undefined,
                        requestN: requestN,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 2:
                _c.sent();
                metadata = undefined;
                remaining = fragmentSize;
                _c.label = 3;
            case 3:
                if (!(metadataPosition < metadataLength)) return [3 /*break*/, 6];
                remaining -= Frames_1$5.Lengths.METADATA;
                nextMetadataPosition = Math.min(metadataLength, metadataPosition + remaining);
                metadata = payload.metadata.slice(metadataPosition, nextMetadataPosition);
                remaining -= metadata.byteLength;
                metadataPosition = nextMetadataPosition;
                if (!(remaining === 0 || dataLength === 0)) return [3 /*break*/, 5];
                return [4 /*yield*/, {
                        type: Frames_1$5.FrameTypes.PAYLOAD,
                        flags: Frames_1$5.Flags.NEXT |
                            Frames_1$5.Flags.METADATA |
                            (metadataPosition === metadataLength &&
                                isComplete &&
                                dataLength === 0
                                ? Frames_1$5.Flags.COMPLETE
                                : Frames_1$5.Flags.FOLLOWS),
                        data: undefined,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 4:
                _c.sent();
                metadata = undefined;
                remaining = fragmentSize;
                _c.label = 5;
            case 5: return [3 /*break*/, 3];
            case 6:
                dataPosition = 0;
                if (!firstFrame) return [3 /*break*/, 8];
                remaining -= Frames_1$5.Lengths.REQUEST;
                nextDataPosition = Math.min(dataLength, dataPosition + remaining);
                data = payload.data.slice(dataPosition, nextDataPosition);
                remaining -= data.byteLength;
                dataPosition = nextDataPosition;
                return [4 /*yield*/, {
                        type: frameType,
                        flags: Frames_1$5.Flags.FOLLOWS | (metadata ? Frames_1$5.Flags.METADATA : Frames_1$5.Flags.NONE),
                        data: data,
                        requestN: requestN,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 7:
                _c.sent();
                metadata = undefined;
                data = undefined;
                remaining = fragmentSize;
                _c.label = 8;
            case 8:
                if (!(dataPosition < dataLength)) return [3 /*break*/, 10];
                nextDataPosition = Math.min(dataLength, dataPosition + remaining);
                data = payload.data.slice(dataPosition, nextDataPosition);
                remaining -= data.byteLength;
                dataPosition = nextDataPosition;
                return [4 /*yield*/, {
                        type: Frames_1$5.FrameTypes.PAYLOAD,
                        flags: dataPosition === dataLength
                            ? (isComplete ? Frames_1$5.Flags.COMPLETE : Frames_1$5.Flags.NONE) |
                                Frames_1$5.Flags.NEXT |
                                (metadata ? Frames_1$5.Flags.METADATA : 0)
                            : Frames_1$5.Flags.FOLLOWS | Frames_1$5.Flags.NEXT | (metadata ? Frames_1$5.Flags.METADATA : 0),
                        data: data,
                        metadata: metadata,
                        streamId: streamId,
                    }];
            case 9:
                _c.sent();
                metadata = undefined;
                data = undefined;
                remaining = fragmentSize;
                return [3 /*break*/, 8];
            case 10: return [2 /*return*/];
        }
    });
}
Fragmenter.fragmentWithRequestN = fragmentWithRequestN;

var Reassembler$4 = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(Reassembler$4, "__esModule", { value: true });
Reassembler$4.cancel = Reassembler$4.reassemble = Reassembler$4.add = void 0;
function add(holder, dataFragment, metadataFragment) {
    if (!holder.hasFragments) {
        holder.hasFragments = true;
        holder.data = dataFragment;
        if (metadataFragment) {
            holder.metadata = metadataFragment;
        }
        return true;
    }
    // TODO: add validation
    holder.data = holder.data
        ? Buffer.concat([holder.data, dataFragment])
        : dataFragment;
    if (holder.metadata && metadataFragment) {
        holder.metadata = Buffer.concat([holder.metadata, metadataFragment]);
    }
    return true;
}
Reassembler$4.add = add;
function reassemble(holder, dataFragment, metadataFragment) {
    // TODO: add validation
    holder.hasFragments = false;
    var data = holder.data
        ? Buffer.concat([holder.data, dataFragment])
        : dataFragment;
    holder.data = undefined;
    if (holder.metadata) {
        var metadata = metadataFragment
            ? Buffer.concat([holder.metadata, metadataFragment])
            : holder.metadata;
        holder.metadata = undefined;
        return {
            data: data,
            metadata: metadata,
        };
    }
    return {
        data: data,
    };
}
Reassembler$4.reassemble = reassemble;
function cancel(holder) {
    holder.hasFragments = false;
    holder.data = undefined;
    holder.metadata = undefined;
}
Reassembler$4.cancel = cancel;

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding$3 = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault$3 = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar$3 = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$3(result, mod, k);
    __setModuleDefault$3(result, mod);
    return result;
};
var __values$3 = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(RequestChannelStream, "__esModule", { value: true });
RequestChannelStream.RequestChannelResponderStream = RequestChannelStream.RequestChannelRequesterStream = void 0;
var Errors_1$4 = Errors;
var Fragmenter_1$3 = Fragmenter;
var Frames_1$4 = Frames;
var Reassembler$3 = __importStar$3(Reassembler$4);
var RequestChannelRequesterStream = /** @class */ (function () {
    function RequestChannelRequesterStream(payload, isComplete, receiver, fragmentSize, initialRequestN, leaseManager) {
        this.payload = payload;
        this.isComplete = isComplete;
        this.receiver = receiver;
        this.fragmentSize = fragmentSize;
        this.initialRequestN = initialRequestN;
        this.leaseManager = leaseManager;
        this.streamType = Frames_1$4.FrameTypes.REQUEST_CHANNEL;
        // TODO: add payload size validation
    }
    RequestChannelRequesterStream.prototype.handleReady = function (streamId, stream) {
        var e_1, _a;
        if (this.outboundDone) {
            return false;
        }
        this.streamId = streamId;
        this.stream = stream;
        stream.connect(this);
        var isCompleted = this.isComplete;
        if (isCompleted) {
            this.outboundDone = isCompleted;
        }
        if ((0, Fragmenter_1$3.isFragmentable)(this.payload, this.fragmentSize, Frames_1$4.FrameTypes.REQUEST_CHANNEL)) {
            try {
                for (var _b = __values$3((0, Fragmenter_1$3.fragmentWithRequestN)(streamId, this.payload, this.fragmentSize, Frames_1$4.FrameTypes.REQUEST_CHANNEL, this.initialRequestN, isCompleted)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$4.FrameTypes.REQUEST_CHANNEL,
                data: this.payload.data,
                metadata: this.payload.metadata,
                requestN: this.initialRequestN,
                flags: (this.payload.metadata !== undefined ? Frames_1$4.Flags.METADATA : Frames_1$4.Flags.NONE) |
                    (isCompleted ? Frames_1$4.Flags.COMPLETE : Frames_1$4.Flags.NONE),
                streamId: streamId,
            });
        }
        if (this.hasExtension) {
            this.stream.send({
                type: Frames_1$4.FrameTypes.EXT,
                streamId: streamId,
                extendedContent: this.extendedContent,
                extendedType: this.extendedType,
                flags: this.flags,
            });
        }
        return true;
    };
    RequestChannelRequesterStream.prototype.handleReject = function (error) {
        if (this.inboundDone) {
            return;
        }
        this.inboundDone = true;
        this.outboundDone = true;
        this.receiver.onError(error);
    };
    RequestChannelRequesterStream.prototype.handle = function (frame) {
        var errorMessage;
        var frameType = frame.type;
        switch (frameType) {
            case Frames_1$4.FrameTypes.PAYLOAD: {
                var hasComplete = Frames_1$4.Flags.hasComplete(frame.flags);
                var hasNext = Frames_1$4.Flags.hasNext(frame.flags);
                if (hasComplete || !Frames_1$4.Flags.hasFollows(frame.flags)) {
                    if (hasComplete) {
                        this.inboundDone = true;
                        if (this.outboundDone) {
                            this.stream.disconnect(this);
                        }
                        if (!hasNext) {
                            // TODO: add validation no frame in reassembly
                            this.receiver.onComplete();
                            return;
                        }
                    }
                    var payload = this.hasFragments
                        ? Reassembler$3.reassemble(this, frame.data, frame.metadata)
                        : {
                            data: frame.data,
                            metadata: frame.metadata,
                        };
                    this.receiver.onNext(payload, hasComplete);
                    return;
                }
                if (Reassembler$3.add(this, frame.data, frame.metadata)) {
                    return;
                }
                errorMessage = "Unexpected frame size";
                break;
            }
            case Frames_1$4.FrameTypes.CANCEL: {
                if (this.outboundDone) {
                    return;
                }
                this.outboundDone = true;
                if (this.inboundDone) {
                    this.stream.disconnect(this);
                }
                this.receiver.cancel();
                return;
            }
            case Frames_1$4.FrameTypes.REQUEST_N: {
                if (this.outboundDone) {
                    return;
                }
                if (this.hasFragments) {
                    errorMessage = "Unexpected frame type [".concat(frameType, "] during reassembly");
                    break;
                }
                this.receiver.request(frame.requestN);
                return;
            }
            case Frames_1$4.FrameTypes.ERROR: {
                var outboundDone = this.outboundDone;
                this.inboundDone = true;
                this.outboundDone = true;
                this.stream.disconnect(this);
                Reassembler$3.cancel(this);
                if (!outboundDone) {
                    this.receiver.cancel();
                }
                this.receiver.onError(new Errors_1$4.RSocketError(frame.code, frame.message));
                return;
            }
            case Frames_1$4.FrameTypes.EXT:
                this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$4.Flags.hasIgnore(frame.flags));
                return;
            default: {
                errorMessage = "Unexpected frame type [".concat(frameType, "]");
            }
        }
        this.close(new Errors_1$4.RSocketError(Errors_1$4.ErrorCodes.CANCELED, errorMessage));
        this.stream.send({
            type: Frames_1$4.FrameTypes.CANCEL,
            streamId: this.streamId,
            flags: Frames_1$4.Flags.NONE,
        });
        this.stream.disconnect(this);
    };
    RequestChannelRequesterStream.prototype.request = function (n) {
        if (this.inboundDone) {
            return;
        }
        if (!this.streamId) {
            this.initialRequestN += n;
            return;
        }
        this.stream.send({
            type: Frames_1$4.FrameTypes.REQUEST_N,
            flags: Frames_1$4.Flags.NONE,
            requestN: n,
            streamId: this.streamId,
        });
    };
    RequestChannelRequesterStream.prototype.cancel = function () {
        var _a;
        var inboundDone = this.inboundDone;
        var outboundDone = this.outboundDone;
        if (inboundDone && outboundDone) {
            return;
        }
        this.inboundDone = true;
        this.outboundDone = true;
        if (!outboundDone) {
            this.receiver.cancel();
        }
        if (!this.streamId) {
            (_a = this.leaseManager) === null || _a === void 0 ? void 0 : _a.cancelRequest(this);
            return;
        }
        this.stream.send({
            type: inboundDone ? Frames_1$4.FrameTypes.ERROR : Frames_1$4.FrameTypes.CANCEL,
            flags: Frames_1$4.Flags.NONE,
            streamId: this.streamId,
            code: Errors_1$4.ErrorCodes.CANCELED,
            message: "Cancelled",
        });
        this.stream.disconnect(this);
        Reassembler$3.cancel(this);
    };
    RequestChannelRequesterStream.prototype.onNext = function (payload, isComplete) {
        var e_2, _a;
        if (this.outboundDone) {
            return;
        }
        if (isComplete) {
            this.outboundDone = true;
            if (this.inboundDone) {
                this.stream.disconnect(this);
            }
        }
        if ((0, Fragmenter_1$3.isFragmentable)(payload, this.fragmentSize, Frames_1$4.FrameTypes.PAYLOAD)) {
            try {
                for (var _b = __values$3((0, Fragmenter_1$3.fragment)(this.streamId, payload, this.fragmentSize, Frames_1$4.FrameTypes.PAYLOAD, isComplete)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$4.FrameTypes.PAYLOAD,
                streamId: this.streamId,
                flags: Frames_1$4.Flags.NEXT |
                    (payload.metadata ? Frames_1$4.Flags.METADATA : Frames_1$4.Flags.NONE) |
                    (isComplete ? Frames_1$4.Flags.COMPLETE : Frames_1$4.Flags.NONE),
                data: payload.data,
                metadata: payload.metadata,
            });
        }
    };
    RequestChannelRequesterStream.prototype.onComplete = function () {
        if (!this.streamId) {
            this.isComplete = true;
            return;
        }
        if (this.outboundDone) {
            return;
        }
        this.outboundDone = true;
        this.stream.send({
            type: Frames_1$4.FrameTypes.PAYLOAD,
            streamId: this.streamId,
            flags: Frames_1$4.Flags.COMPLETE,
            data: null,
            metadata: null,
        });
        if (this.inboundDone) {
            this.stream.disconnect(this);
        }
    };
    RequestChannelRequesterStream.prototype.onError = function (error) {
        if (this.outboundDone) {
            return;
        }
        var inboundDone = this.inboundDone;
        this.outboundDone = true;
        this.inboundDone = true;
        this.stream.send({
            type: Frames_1$4.FrameTypes.ERROR,
            streamId: this.streamId,
            flags: Frames_1$4.Flags.NONE,
            code: error instanceof Errors_1$4.RSocketError
                ? error.code
                : Errors_1$4.ErrorCodes.APPLICATION_ERROR,
            message: error.message,
        });
        this.stream.disconnect(this);
        if (!inboundDone) {
            this.receiver.onError(error);
        }
    };
    RequestChannelRequesterStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.outboundDone) {
            return;
        }
        if (!this.streamId) {
            this.hasExtension = true;
            this.extendedType = extendedType;
            this.extendedContent = content;
            this.flags = canBeIgnored ? Frames_1$4.Flags.IGNORE : Frames_1$4.Flags.NONE;
            return;
        }
        this.stream.send({
            streamId: this.streamId,
            type: Frames_1$4.FrameTypes.EXT,
            extendedType: extendedType,
            extendedContent: content,
            flags: canBeIgnored ? Frames_1$4.Flags.IGNORE : Frames_1$4.Flags.NONE,
        });
    };
    RequestChannelRequesterStream.prototype.close = function (error) {
        if (this.inboundDone && this.outboundDone) {
            return;
        }
        var inboundDone = this.inboundDone;
        var outboundDone = this.outboundDone;
        this.inboundDone = true;
        this.outboundDone = true;
        Reassembler$3.cancel(this);
        if (!outboundDone) {
            this.receiver.cancel();
        }
        if (!inboundDone) {
            if (error) {
                this.receiver.onError(error);
            }
            else {
                this.receiver.onComplete();
            }
        }
    };
    return RequestChannelRequesterStream;
}());
RequestChannelStream.RequestChannelRequesterStream = RequestChannelRequesterStream;
var RequestChannelResponderStream = /** @class */ (function () {
    function RequestChannelResponderStream(streamId, stream, fragmentSize, handler, frame) {
        this.streamId = streamId;
        this.stream = stream;
        this.fragmentSize = fragmentSize;
        this.handler = handler;
        this.streamType = Frames_1$4.FrameTypes.REQUEST_CHANNEL;
        stream.connect(this);
        if (Frames_1$4.Flags.hasFollows(frame.flags)) {
            Reassembler$3.add(this, frame.data, frame.metadata);
            this.initialRequestN = frame.requestN;
            this.isComplete = Frames_1$4.Flags.hasComplete(frame.flags);
            return;
        }
        var payload = {
            data: frame.data,
            metadata: frame.metadata,
        };
        var hasComplete = Frames_1$4.Flags.hasComplete(frame.flags);
        this.inboundDone = hasComplete;
        try {
            this.receiver = handler(payload, frame.requestN, hasComplete, this);
            if (this.outboundDone && this.defferedError) {
                this.receiver.onError(this.defferedError);
            }
        }
        catch (error) {
            if (this.outboundDone && !this.inboundDone) {
                this.cancel();
            }
            else {
                this.inboundDone = true;
            }
            this.onError(error);
        }
    }
    RequestChannelResponderStream.prototype.handle = function (frame) {
        var errorMessage;
        var frameType = frame.type;
        switch (frameType) {
            case Frames_1$4.FrameTypes.PAYLOAD: {
                if (Frames_1$4.Flags.hasFollows(frame.flags)) {
                    if (Reassembler$3.add(this, frame.data, frame.metadata)) {
                        return;
                    }
                    errorMessage = "Unexpected frame size";
                    break;
                }
                var payload = this.hasFragments
                    ? Reassembler$3.reassemble(this, frame.data, frame.metadata)
                    : {
                        data: frame.data,
                        metadata: frame.metadata,
                    };
                var hasComplete = Frames_1$4.Flags.hasComplete(frame.flags);
                if (!this.receiver) {
                    var inboundDone = this.isComplete || hasComplete;
                    if (inboundDone) {
                        this.inboundDone = true;
                        if (this.outboundDone) {
                            this.stream.disconnect(this);
                        }
                    }
                    try {
                        this.receiver = this.handler(payload, this.initialRequestN, inboundDone, this);
                        if (this.outboundDone && this.defferedError) {
                        }
                    }
                    catch (error) {
                        if (this.outboundDone && !this.inboundDone) {
                            this.cancel();
                        }
                        else {
                            this.inboundDone = true;
                        }
                        this.onError(error);
                    }
                }
                else {
                    if (hasComplete) {
                        this.inboundDone = true;
                        if (this.outboundDone) {
                            this.stream.disconnect(this);
                        }
                        if (!Frames_1$4.Flags.hasNext(frame.flags)) {
                            this.receiver.onComplete();
                            return;
                        }
                    }
                    this.receiver.onNext(payload, hasComplete);
                }
                return;
            }
            case Frames_1$4.FrameTypes.REQUEST_N: {
                if (!this.receiver || this.hasFragments) {
                    errorMessage = "Unexpected frame type [".concat(frameType, "] during reassembly");
                    break;
                }
                this.receiver.request(frame.requestN);
                return;
            }
            case Frames_1$4.FrameTypes.ERROR:
            case Frames_1$4.FrameTypes.CANCEL: {
                var inboundDone = this.inboundDone;
                var outboundDone = this.outboundDone;
                this.inboundDone = true;
                this.outboundDone = true;
                this.stream.disconnect(this);
                Reassembler$3.cancel(this);
                if (!this.receiver) {
                    return;
                }
                if (!outboundDone) {
                    this.receiver.cancel();
                }
                if (!inboundDone) {
                    var error = frameType === Frames_1$4.FrameTypes.CANCEL
                        ? new Errors_1$4.RSocketError(Errors_1$4.ErrorCodes.CANCELED, "Cancelled")
                        : new Errors_1$4.RSocketError(frame.code, frame.message);
                    this.receiver.onError(error);
                }
                return;
            }
            case Frames_1$4.FrameTypes.EXT: {
                if (!this.receiver || this.hasFragments) {
                    errorMessage = "Unexpected frame type [".concat(frameType, "] during reassembly");
                    break;
                }
                this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$4.Flags.hasIgnore(frame.flags));
                return;
            }
            default: {
                errorMessage = "Unexpected frame type [".concat(frameType, "]");
                // TODO: throws if strict
            }
        }
        this.stream.send({
            type: Frames_1$4.FrameTypes.ERROR,
            flags: Frames_1$4.Flags.NONE,
            code: Errors_1$4.ErrorCodes.CANCELED,
            message: errorMessage,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
        this.close(new Errors_1$4.RSocketError(Errors_1$4.ErrorCodes.CANCELED, errorMessage));
    };
    RequestChannelResponderStream.prototype.onError = function (error) {
        if (this.outboundDone) {
            console.warn("Trying to error for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        var inboundDone = this.inboundDone;
        this.outboundDone = true;
        this.inboundDone = true;
        this.stream.send({
            type: Frames_1$4.FrameTypes.ERROR,
            flags: Frames_1$4.Flags.NONE,
            code: error instanceof Errors_1$4.RSocketError
                ? error.code
                : Errors_1$4.ErrorCodes.APPLICATION_ERROR,
            message: error.message,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
        if (!inboundDone) {
            if (this.receiver) {
                this.receiver.onError(error);
            }
            else {
                this.defferedError = error;
            }
        }
    };
    RequestChannelResponderStream.prototype.onNext = function (payload, isCompletion) {
        var e_3, _a;
        if (this.outboundDone) {
            return;
        }
        if (isCompletion) {
            this.outboundDone = true;
        }
        // TODO: add payload size validation
        if ((0, Fragmenter_1$3.isFragmentable)(payload, this.fragmentSize, Frames_1$4.FrameTypes.PAYLOAD)) {
            try {
                for (var _b = __values$3((0, Fragmenter_1$3.fragment)(this.streamId, payload, this.fragmentSize, Frames_1$4.FrameTypes.PAYLOAD, isCompletion)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_3) throw e_3.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$4.FrameTypes.PAYLOAD,
                flags: Frames_1$4.Flags.NEXT |
                    (isCompletion ? Frames_1$4.Flags.COMPLETE : Frames_1$4.Flags.NONE) |
                    (payload.metadata ? Frames_1$4.Flags.METADATA : Frames_1$4.Flags.NONE),
                data: payload.data,
                metadata: payload.metadata,
                streamId: this.streamId,
            });
        }
        if (isCompletion && this.inboundDone) {
            this.stream.disconnect(this);
        }
    };
    RequestChannelResponderStream.prototype.onComplete = function () {
        if (this.outboundDone) {
            return;
        }
        this.outboundDone = true;
        this.stream.send({
            type: Frames_1$4.FrameTypes.PAYLOAD,
            flags: Frames_1$4.Flags.COMPLETE,
            streamId: this.streamId,
            data: null,
            metadata: null,
        });
        if (this.inboundDone) {
            this.stream.disconnect(this);
        }
    };
    RequestChannelResponderStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.outboundDone && this.inboundDone) {
            return;
        }
        this.stream.send({
            type: Frames_1$4.FrameTypes.EXT,
            streamId: this.streamId,
            flags: canBeIgnored ? Frames_1$4.Flags.IGNORE : Frames_1$4.Flags.NONE,
            extendedType: extendedType,
            extendedContent: content,
        });
    };
    RequestChannelResponderStream.prototype.request = function (n) {
        if (this.inboundDone) {
            return;
        }
        this.stream.send({
            type: Frames_1$4.FrameTypes.REQUEST_N,
            flags: Frames_1$4.Flags.NONE,
            streamId: this.streamId,
            requestN: n,
        });
    };
    RequestChannelResponderStream.prototype.cancel = function () {
        if (this.inboundDone) {
            return;
        }
        this.inboundDone = true;
        this.stream.send({
            type: Frames_1$4.FrameTypes.CANCEL,
            flags: Frames_1$4.Flags.NONE,
            streamId: this.streamId,
        });
        if (this.outboundDone) {
            this.stream.disconnect(this);
        }
    };
    RequestChannelResponderStream.prototype.close = function (error) {
        if (this.inboundDone && this.outboundDone) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        var inboundDone = this.inboundDone;
        var outboundDone = this.outboundDone;
        this.inboundDone = true;
        this.outboundDone = true;
        Reassembler$3.cancel(this);
        var receiver = this.receiver;
        if (!receiver) {
            return;
        }
        if (!outboundDone) {
            receiver.cancel();
        }
        if (!inboundDone) {
            if (error) {
                receiver.onError(error);
            }
            else {
                receiver.onComplete();
            }
        }
    };
    return RequestChannelResponderStream;
}());
RequestChannelStream.RequestChannelResponderStream = RequestChannelResponderStream;

var RequestFnFStream = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding$2 = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault$2 = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar$2 = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$2(result, mod, k);
    __setModuleDefault$2(result, mod);
    return result;
};
var __values$2 = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(RequestFnFStream, "__esModule", { value: true });
RequestFnFStream.RequestFnfResponderStream = RequestFnFStream.RequestFnFRequesterStream = void 0;
var Errors_1$3 = Errors;
var Fragmenter_1$2 = Fragmenter;
var Frames_1$3 = Frames;
var Reassembler$2 = __importStar$2(Reassembler$4);
var RequestFnFRequesterStream = /** @class */ (function () {
    function RequestFnFRequesterStream(payload, receiver, fragmentSize, leaseManager) {
        this.payload = payload;
        this.receiver = receiver;
        this.fragmentSize = fragmentSize;
        this.leaseManager = leaseManager;
        this.streamType = Frames_1$3.FrameTypes.REQUEST_FNF;
    }
    RequestFnFRequesterStream.prototype.handleReady = function (streamId, stream) {
        var e_1, _a;
        if (this.done) {
            return false;
        }
        this.streamId = streamId;
        if ((0, Fragmenter_1$2.isFragmentable)(this.payload, this.fragmentSize, Frames_1$3.FrameTypes.REQUEST_FNF)) {
            try {
                for (var _b = __values$2((0, Fragmenter_1$2.fragment)(streamId, this.payload, this.fragmentSize, Frames_1$3.FrameTypes.REQUEST_FNF)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    stream.send(frame);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        else {
            stream.send({
                type: Frames_1$3.FrameTypes.REQUEST_FNF,
                data: this.payload.data,
                metadata: this.payload.metadata,
                flags: this.payload.metadata ? Frames_1$3.Flags.METADATA : 0,
                streamId: streamId,
            });
        }
        this.done = true;
        this.receiver.onComplete();
        return true;
    };
    RequestFnFRequesterStream.prototype.handleReject = function (error) {
        if (this.done) {
            return;
        }
        this.done = true;
        this.receiver.onError(error);
    };
    RequestFnFRequesterStream.prototype.cancel = function () {
        var _a;
        if (this.done) {
            return;
        }
        this.done = true;
        (_a = this.leaseManager) === null || _a === void 0 ? void 0 : _a.cancelRequest(this);
    };
    RequestFnFRequesterStream.prototype.handle = function (frame) {
        if (frame.type == Frames_1$3.FrameTypes.ERROR) {
            this.close(new Errors_1$3.RSocketError(frame.code, frame.message));
            return;
        }
        this.close(new Errors_1$3.RSocketError(Errors_1$3.ErrorCodes.CANCELED, "Received invalid frame"));
    };
    RequestFnFRequesterStream.prototype.close = function (error) {
        if (this.done) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        if (error) {
            this.receiver.onError(error);
        }
        else {
            this.receiver.onComplete();
        }
    };
    return RequestFnFRequesterStream;
}());
RequestFnFStream.RequestFnFRequesterStream = RequestFnFRequesterStream;
var RequestFnfResponderStream = /** @class */ (function () {
    function RequestFnfResponderStream(streamId, stream, handler, frame) {
        this.streamId = streamId;
        this.stream = stream;
        this.handler = handler;
        this.streamType = Frames_1$3.FrameTypes.REQUEST_FNF;
        if (Frames_1$3.Flags.hasFollows(frame.flags)) {
            Reassembler$2.add(this, frame.data, frame.metadata);
            stream.connect(this);
            return;
        }
        var payload = {
            data: frame.data,
            metadata: frame.metadata,
        };
        try {
            this.cancellable = handler(payload, this);
        }
        catch (e) {
            // do nothing
        }
    }
    RequestFnfResponderStream.prototype.handle = function (frame) {
        var errorMessage;
        if (frame.type == Frames_1$3.FrameTypes.PAYLOAD) {
            if (Frames_1$3.Flags.hasFollows(frame.flags)) {
                if (Reassembler$2.add(this, frame.data, frame.metadata)) {
                    return;
                }
                errorMessage = "Unexpected fragment size";
            }
            else {
                this.stream.disconnect(this);
                var payload = Reassembler$2.reassemble(this, frame.data, frame.metadata);
                try {
                    this.cancellable = this.handler(payload, this);
                }
                catch (e) {
                    // do nothing
                }
                return;
            }
        }
        else {
            errorMessage = "Unexpected frame type [".concat(frame.type, "]");
        }
        this.done = true;
        if (frame.type != Frames_1$3.FrameTypes.CANCEL && frame.type != Frames_1$3.FrameTypes.ERROR) {
            this.stream.send({
                type: Frames_1$3.FrameTypes.ERROR,
                streamId: this.streamId,
                flags: Frames_1$3.Flags.NONE,
                code: Errors_1$3.ErrorCodes.CANCELED,
                message: errorMessage,
            });
        }
        this.stream.disconnect(this);
        Reassembler$2.cancel(this);
        // TODO: throws if strict
    };
    RequestFnfResponderStream.prototype.close = function (error) {
        var _a;
        if (this.done) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        this.done = true;
        Reassembler$2.cancel(this);
        (_a = this.cancellable) === null || _a === void 0 ? void 0 : _a.cancel();
    };
    RequestFnfResponderStream.prototype.onError = function (error) { };
    RequestFnfResponderStream.prototype.onComplete = function () { };
    return RequestFnfResponderStream;
}());
RequestFnFStream.RequestFnfResponderStream = RequestFnfResponderStream;

var RequestResponseStream = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding$1 = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault$1 = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar$1 = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding$1(result, mod, k);
    __setModuleDefault$1(result, mod);
    return result;
};
var __values$1 = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(RequestResponseStream, "__esModule", { value: true });
RequestResponseStream.RequestResponseResponderStream = RequestResponseStream.RequestResponseRequesterStream = void 0;
var Errors_1$2 = Errors;
var Fragmenter_1$1 = Fragmenter;
var Frames_1$2 = Frames;
var Reassembler$1 = __importStar$1(Reassembler$4);
var RequestResponseRequesterStream = /** @class */ (function () {
    function RequestResponseRequesterStream(payload, receiver, fragmentSize, leaseManager) {
        this.payload = payload;
        this.receiver = receiver;
        this.fragmentSize = fragmentSize;
        this.leaseManager = leaseManager;
        this.streamType = Frames_1$2.FrameTypes.REQUEST_RESPONSE;
    }
    RequestResponseRequesterStream.prototype.handleReady = function (streamId, stream) {
        var e_1, _a;
        if (this.done) {
            return false;
        }
        this.streamId = streamId;
        this.stream = stream;
        stream.connect(this);
        if ((0, Fragmenter_1$1.isFragmentable)(this.payload, this.fragmentSize, Frames_1$2.FrameTypes.REQUEST_RESPONSE)) {
            try {
                for (var _b = __values$1((0, Fragmenter_1$1.fragment)(streamId, this.payload, this.fragmentSize, Frames_1$2.FrameTypes.REQUEST_RESPONSE)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$2.FrameTypes.REQUEST_RESPONSE,
                data: this.payload.data,
                metadata: this.payload.metadata,
                flags: this.payload.metadata ? Frames_1$2.Flags.METADATA : 0,
                streamId: streamId,
            });
        }
        if (this.hasExtension) {
            this.stream.send({
                type: Frames_1$2.FrameTypes.EXT,
                streamId: streamId,
                extendedContent: this.extendedContent,
                extendedType: this.extendedType,
                flags: this.flags,
            });
        }
        return true;
    };
    RequestResponseRequesterStream.prototype.handleReject = function (error) {
        if (this.done) {
            return;
        }
        this.done = true;
        this.receiver.onError(error);
    };
    RequestResponseRequesterStream.prototype.handle = function (frame) {
        var errorMessage;
        var frameType = frame.type;
        switch (frameType) {
            case Frames_1$2.FrameTypes.PAYLOAD: {
                var hasComplete = Frames_1$2.Flags.hasComplete(frame.flags);
                var hasPayload = Frames_1$2.Flags.hasNext(frame.flags);
                if (hasComplete || !Frames_1$2.Flags.hasFollows(frame.flags)) {
                    this.done = true;
                    this.stream.disconnect(this);
                    if (!hasPayload) {
                        // TODO: add validation no frame in reassembly
                        this.receiver.onComplete();
                        return;
                    }
                    var payload = this.hasFragments
                        ? Reassembler$1.reassemble(this, frame.data, frame.metadata)
                        : {
                            data: frame.data,
                            metadata: frame.metadata,
                        };
                    this.receiver.onNext(payload, true);
                    return;
                }
                if (!Reassembler$1.add(this, frame.data, frame.metadata)) {
                    errorMessage = "Unexpected fragment size";
                    break;
                }
                return;
            }
            case Frames_1$2.FrameTypes.ERROR: {
                this.done = true;
                this.stream.disconnect(this);
                Reassembler$1.cancel(this);
                this.receiver.onError(new Errors_1$2.RSocketError(frame.code, frame.message));
                return;
            }
            case Frames_1$2.FrameTypes.EXT: {
                if (this.hasFragments) {
                    errorMessage = "Unexpected frame type [".concat(frameType, "] during reassembly");
                    break;
                }
                this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$2.Flags.hasIgnore(frame.flags));
                return;
            }
            default: {
                errorMessage = "Unexpected frame type [".concat(frameType, "]");
            }
        }
        this.close(new Errors_1$2.RSocketError(Errors_1$2.ErrorCodes.CANCELED, errorMessage));
        this.stream.send({
            type: Frames_1$2.FrameTypes.CANCEL,
            streamId: this.streamId,
            flags: Frames_1$2.Flags.NONE,
        });
        this.stream.disconnect(this);
        // TODO: throw an exception if strict frame handling mode
    };
    RequestResponseRequesterStream.prototype.cancel = function () {
        var _a;
        if (this.done) {
            return;
        }
        this.done = true;
        if (!this.streamId) {
            (_a = this.leaseManager) === null || _a === void 0 ? void 0 : _a.cancelRequest(this);
            return;
        }
        this.stream.send({
            type: Frames_1$2.FrameTypes.CANCEL,
            flags: Frames_1$2.Flags.NONE,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
        Reassembler$1.cancel(this);
    };
    RequestResponseRequesterStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.done) {
            return;
        }
        if (!this.streamId) {
            this.hasExtension = true;
            this.extendedType = extendedType;
            this.extendedContent = content;
            this.flags = canBeIgnored ? Frames_1$2.Flags.IGNORE : Frames_1$2.Flags.NONE;
            return;
        }
        this.stream.send({
            streamId: this.streamId,
            type: Frames_1$2.FrameTypes.EXT,
            extendedType: extendedType,
            extendedContent: content,
            flags: canBeIgnored ? Frames_1$2.Flags.IGNORE : Frames_1$2.Flags.NONE,
        });
    };
    RequestResponseRequesterStream.prototype.close = function (error) {
        if (this.done) {
            return;
        }
        this.done = true;
        Reassembler$1.cancel(this);
        if (error) {
            this.receiver.onError(error);
        }
        else {
            this.receiver.onComplete();
        }
    };
    return RequestResponseRequesterStream;
}());
RequestResponseStream.RequestResponseRequesterStream = RequestResponseRequesterStream;
var RequestResponseResponderStream = /** @class */ (function () {
    function RequestResponseResponderStream(streamId, stream, fragmentSize, handler, frame) {
        this.streamId = streamId;
        this.stream = stream;
        this.fragmentSize = fragmentSize;
        this.handler = handler;
        this.streamType = Frames_1$2.FrameTypes.REQUEST_RESPONSE;
        stream.connect(this);
        if (Frames_1$2.Flags.hasFollows(frame.flags)) {
            Reassembler$1.add(this, frame.data, frame.metadata);
            return;
        }
        var payload = {
            data: frame.data,
            metadata: frame.metadata,
        };
        try {
            this.receiver = handler(payload, this);
        }
        catch (error) {
            this.onError(error);
        }
    }
    RequestResponseResponderStream.prototype.handle = function (frame) {
        var _a;
        var errorMessage;
        if (!this.receiver || this.hasFragments) {
            if (frame.type === Frames_1$2.FrameTypes.PAYLOAD) {
                if (Frames_1$2.Flags.hasFollows(frame.flags)) {
                    if (Reassembler$1.add(this, frame.data, frame.metadata)) {
                        return;
                    }
                    errorMessage = "Unexpected fragment size";
                }
                else {
                    var payload = Reassembler$1.reassemble(this, frame.data, frame.metadata);
                    try {
                        this.receiver = this.handler(payload, this);
                    }
                    catch (error) {
                        this.onError(error);
                    }
                    return;
                }
            }
            else {
                errorMessage = "Unexpected frame type [".concat(frame.type, "] during reassembly");
            }
        }
        else if (frame.type === Frames_1$2.FrameTypes.EXT) {
            this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$2.Flags.hasIgnore(frame.flags));
            return;
        }
        else {
            errorMessage = "Unexpected frame type [".concat(frame.type, "]");
        }
        this.done = true;
        (_a = this.receiver) === null || _a === void 0 ? void 0 : _a.cancel();
        if (frame.type !== Frames_1$2.FrameTypes.CANCEL && frame.type !== Frames_1$2.FrameTypes.ERROR) {
            this.stream.send({
                type: Frames_1$2.FrameTypes.ERROR,
                flags: Frames_1$2.Flags.NONE,
                code: Errors_1$2.ErrorCodes.CANCELED,
                message: errorMessage,
                streamId: this.streamId,
            });
        }
        this.stream.disconnect(this);
        Reassembler$1.cancel(this);
        // TODO: throws if strict
    };
    RequestResponseResponderStream.prototype.onError = function (error) {
        if (this.done) {
            console.warn("Trying to error for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        this.done = true;
        this.stream.send({
            type: Frames_1$2.FrameTypes.ERROR,
            flags: Frames_1$2.Flags.NONE,
            code: error instanceof Errors_1$2.RSocketError
                ? error.code
                : Errors_1$2.ErrorCodes.APPLICATION_ERROR,
            message: error.message,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
    };
    RequestResponseResponderStream.prototype.onNext = function (payload, isCompletion) {
        var e_2, _a;
        if (this.done) {
            return;
        }
        this.done = true;
        // TODO: add payload size validation
        if ((0, Fragmenter_1$1.isFragmentable)(payload, this.fragmentSize, Frames_1$2.FrameTypes.PAYLOAD)) {
            try {
                for (var _b = __values$1((0, Fragmenter_1$1.fragment)(this.streamId, payload, this.fragmentSize, Frames_1$2.FrameTypes.PAYLOAD, true)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$2.FrameTypes.PAYLOAD,
                flags: Frames_1$2.Flags.NEXT | Frames_1$2.Flags.COMPLETE | (payload.metadata ? Frames_1$2.Flags.METADATA : 0),
                data: payload.data,
                metadata: payload.metadata,
                streamId: this.streamId,
            });
        }
        this.stream.disconnect(this);
    };
    RequestResponseResponderStream.prototype.onComplete = function () {
        if (this.done) {
            return;
        }
        this.done = true;
        this.stream.send({
            type: Frames_1$2.FrameTypes.PAYLOAD,
            flags: Frames_1$2.Flags.COMPLETE,
            streamId: this.streamId,
            data: null,
            metadata: null,
        });
        this.stream.disconnect(this);
    };
    RequestResponseResponderStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.done) {
            return;
        }
        this.stream.send({
            type: Frames_1$2.FrameTypes.EXT,
            streamId: this.streamId,
            flags: canBeIgnored ? Frames_1$2.Flags.IGNORE : Frames_1$2.Flags.NONE,
            extendedType: extendedType,
            extendedContent: content,
        });
    };
    RequestResponseResponderStream.prototype.close = function (error) {
        var _a;
        if (this.done) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        Reassembler$1.cancel(this);
        (_a = this.receiver) === null || _a === void 0 ? void 0 : _a.cancel();
    };
    return RequestResponseResponderStream;
}());
RequestResponseStream.RequestResponseResponderStream = RequestResponseResponderStream;

var RequestStreamStream = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(RequestStreamStream, "__esModule", { value: true });
RequestStreamStream.RequestStreamResponderStream = RequestStreamStream.RequestStreamRequesterStream = void 0;
var Errors_1$1 = Errors;
var Fragmenter_1 = Fragmenter;
var Frames_1$1 = Frames;
var Reassembler = __importStar(Reassembler$4);
var RequestStreamRequesterStream = /** @class */ (function () {
    function RequestStreamRequesterStream(payload, receiver, fragmentSize, initialRequestN, leaseManager) {
        this.payload = payload;
        this.receiver = receiver;
        this.fragmentSize = fragmentSize;
        this.initialRequestN = initialRequestN;
        this.leaseManager = leaseManager;
        this.streamType = Frames_1$1.FrameTypes.REQUEST_STREAM;
        // TODO: add payload size validation
    }
    RequestStreamRequesterStream.prototype.handleReady = function (streamId, stream) {
        var e_1, _a;
        if (this.done) {
            return false;
        }
        this.streamId = streamId;
        this.stream = stream;
        stream.connect(this);
        if ((0, Fragmenter_1.isFragmentable)(this.payload, this.fragmentSize, Frames_1$1.FrameTypes.REQUEST_STREAM)) {
            try {
                for (var _b = __values((0, Fragmenter_1.fragmentWithRequestN)(streamId, this.payload, this.fragmentSize, Frames_1$1.FrameTypes.REQUEST_STREAM, this.initialRequestN)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$1.FrameTypes.REQUEST_STREAM,
                data: this.payload.data,
                metadata: this.payload.metadata,
                requestN: this.initialRequestN,
                flags: this.payload.metadata !== undefined ? Frames_1$1.Flags.METADATA : 0,
                streamId: streamId,
            });
        }
        if (this.hasExtension) {
            this.stream.send({
                type: Frames_1$1.FrameTypes.EXT,
                streamId: streamId,
                extendedContent: this.extendedContent,
                extendedType: this.extendedType,
                flags: this.flags,
            });
        }
        return true;
    };
    RequestStreamRequesterStream.prototype.handleReject = function (error) {
        if (this.done) {
            return;
        }
        this.done = true;
        this.receiver.onError(error);
    };
    RequestStreamRequesterStream.prototype.handle = function (frame) {
        var errorMessage;
        var frameType = frame.type;
        switch (frameType) {
            case Frames_1$1.FrameTypes.PAYLOAD: {
                var hasComplete = Frames_1$1.Flags.hasComplete(frame.flags);
                var hasNext = Frames_1$1.Flags.hasNext(frame.flags);
                if (hasComplete || !Frames_1$1.Flags.hasFollows(frame.flags)) {
                    if (hasComplete) {
                        this.done = true;
                        this.stream.disconnect(this);
                        if (!hasNext) {
                            // TODO: add validation no frame in reassembly
                            this.receiver.onComplete();
                            return;
                        }
                    }
                    var payload = this.hasFragments
                        ? Reassembler.reassemble(this, frame.data, frame.metadata)
                        : {
                            data: frame.data,
                            metadata: frame.metadata,
                        };
                    this.receiver.onNext(payload, hasComplete);
                    return;
                }
                if (!Reassembler.add(this, frame.data, frame.metadata)) {
                    errorMessage = "Unexpected fragment size";
                    break;
                }
                return;
            }
            case Frames_1$1.FrameTypes.ERROR: {
                this.done = true;
                this.stream.disconnect(this);
                Reassembler.cancel(this);
                this.receiver.onError(new Errors_1$1.RSocketError(frame.code, frame.message));
                return;
            }
            case Frames_1$1.FrameTypes.EXT: {
                if (this.hasFragments) {
                    errorMessage = "Unexpected frame type [".concat(frameType, "] during reassembly");
                    break;
                }
                this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$1.Flags.hasIgnore(frame.flags));
                return;
            }
            default: {
                errorMessage = "Unexpected frame type [".concat(frameType, "]");
            }
        }
        this.close(new Errors_1$1.RSocketError(Errors_1$1.ErrorCodes.CANCELED, errorMessage));
        this.stream.send({
            type: Frames_1$1.FrameTypes.CANCEL,
            streamId: this.streamId,
            flags: Frames_1$1.Flags.NONE,
        });
        this.stream.disconnect(this);
        // TODO: throw an exception if strict frame handling mode
    };
    RequestStreamRequesterStream.prototype.request = function (n) {
        if (this.done) {
            return;
        }
        if (!this.streamId) {
            this.initialRequestN += n;
            return;
        }
        this.stream.send({
            type: Frames_1$1.FrameTypes.REQUEST_N,
            flags: Frames_1$1.Flags.NONE,
            requestN: n,
            streamId: this.streamId,
        });
    };
    RequestStreamRequesterStream.prototype.cancel = function () {
        var _a;
        if (this.done) {
            return;
        }
        this.done = true;
        if (!this.streamId) {
            (_a = this.leaseManager) === null || _a === void 0 ? void 0 : _a.cancelRequest(this);
            return;
        }
        this.stream.send({
            type: Frames_1$1.FrameTypes.CANCEL,
            flags: Frames_1$1.Flags.NONE,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
        Reassembler.cancel(this);
    };
    RequestStreamRequesterStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.done) {
            return;
        }
        if (!this.streamId) {
            this.hasExtension = true;
            this.extendedType = extendedType;
            this.extendedContent = content;
            this.flags = canBeIgnored ? Frames_1$1.Flags.IGNORE : Frames_1$1.Flags.NONE;
            return;
        }
        this.stream.send({
            streamId: this.streamId,
            type: Frames_1$1.FrameTypes.EXT,
            extendedType: extendedType,
            extendedContent: content,
            flags: canBeIgnored ? Frames_1$1.Flags.IGNORE : Frames_1$1.Flags.NONE,
        });
    };
    RequestStreamRequesterStream.prototype.close = function (error) {
        if (this.done) {
            return;
        }
        this.done = true;
        Reassembler.cancel(this);
        if (error) {
            this.receiver.onError(error);
        }
        else {
            this.receiver.onComplete();
        }
    };
    return RequestStreamRequesterStream;
}());
RequestStreamStream.RequestStreamRequesterStream = RequestStreamRequesterStream;
var RequestStreamResponderStream = /** @class */ (function () {
    function RequestStreamResponderStream(streamId, stream, fragmentSize, handler, frame) {
        this.streamId = streamId;
        this.stream = stream;
        this.fragmentSize = fragmentSize;
        this.handler = handler;
        this.streamType = Frames_1$1.FrameTypes.REQUEST_STREAM;
        stream.connect(this);
        if (Frames_1$1.Flags.hasFollows(frame.flags)) {
            this.initialRequestN = frame.requestN;
            Reassembler.add(this, frame.data, frame.metadata);
            return;
        }
        var payload = {
            data: frame.data,
            metadata: frame.metadata,
        };
        try {
            this.receiver = handler(payload, frame.requestN, this);
        }
        catch (error) {
            this.onError(error);
        }
    }
    RequestStreamResponderStream.prototype.handle = function (frame) {
        var _a;
        var errorMessage;
        if (!this.receiver || this.hasFragments) {
            if (frame.type === Frames_1$1.FrameTypes.PAYLOAD) {
                if (Frames_1$1.Flags.hasFollows(frame.flags)) {
                    if (Reassembler.add(this, frame.data, frame.metadata)) {
                        return;
                    }
                    errorMessage = "Unexpected frame size";
                }
                else {
                    var payload = Reassembler.reassemble(this, frame.data, frame.metadata);
                    try {
                        this.receiver = this.handler(payload, this.initialRequestN, this);
                    }
                    catch (error) {
                        this.onError(error);
                    }
                    return;
                }
            }
            else {
                errorMessage = "Unexpected frame type [".concat(frame.type, "] during reassembly");
            }
        }
        else if (frame.type === Frames_1$1.FrameTypes.REQUEST_N) {
            this.receiver.request(frame.requestN);
            return;
        }
        else if (frame.type === Frames_1$1.FrameTypes.EXT) {
            this.receiver.onExtension(frame.extendedType, frame.extendedContent, Frames_1$1.Flags.hasIgnore(frame.flags));
            return;
        }
        else {
            errorMessage = "Unexpected frame type [".concat(frame.type, "]");
        }
        this.done = true;
        Reassembler.cancel(this);
        (_a = this.receiver) === null || _a === void 0 ? void 0 : _a.cancel();
        if (frame.type !== Frames_1$1.FrameTypes.CANCEL && frame.type !== Frames_1$1.FrameTypes.ERROR) {
            this.stream.send({
                type: Frames_1$1.FrameTypes.ERROR,
                flags: Frames_1$1.Flags.NONE,
                code: Errors_1$1.ErrorCodes.CANCELED,
                message: errorMessage,
                streamId: this.streamId,
            });
        }
        this.stream.disconnect(this);
        // TODO: throws if strict
    };
    RequestStreamResponderStream.prototype.onError = function (error) {
        if (this.done) {
            console.warn("Trying to error for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        this.done = true;
        this.stream.send({
            type: Frames_1$1.FrameTypes.ERROR,
            flags: Frames_1$1.Flags.NONE,
            code: error instanceof Errors_1$1.RSocketError
                ? error.code
                : Errors_1$1.ErrorCodes.APPLICATION_ERROR,
            message: error.message,
            streamId: this.streamId,
        });
        this.stream.disconnect(this);
    };
    RequestStreamResponderStream.prototype.onNext = function (payload, isCompletion) {
        var e_2, _a;
        if (this.done) {
            return;
        }
        if (isCompletion) {
            this.done = true;
        }
        // TODO: add payload size validation
        if ((0, Fragmenter_1.isFragmentable)(payload, this.fragmentSize, Frames_1$1.FrameTypes.PAYLOAD)) {
            try {
                for (var _b = __values((0, Fragmenter_1.fragment)(this.streamId, payload, this.fragmentSize, Frames_1$1.FrameTypes.PAYLOAD, isCompletion)), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var frame = _c.value;
                    this.stream.send(frame);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
        }
        else {
            this.stream.send({
                type: Frames_1$1.FrameTypes.PAYLOAD,
                flags: Frames_1$1.Flags.NEXT |
                    (isCompletion ? Frames_1$1.Flags.COMPLETE : Frames_1$1.Flags.NONE) |
                    (payload.metadata ? Frames_1$1.Flags.METADATA : Frames_1$1.Flags.NONE),
                data: payload.data,
                metadata: payload.metadata,
                streamId: this.streamId,
            });
        }
        if (isCompletion) {
            this.stream.disconnect(this);
        }
    };
    RequestStreamResponderStream.prototype.onComplete = function () {
        if (this.done) {
            return;
        }
        this.done = true;
        this.stream.send({
            type: Frames_1$1.FrameTypes.PAYLOAD,
            flags: Frames_1$1.Flags.COMPLETE,
            streamId: this.streamId,
            data: null,
            metadata: null,
        });
        this.stream.disconnect(this);
    };
    RequestStreamResponderStream.prototype.onExtension = function (extendedType, content, canBeIgnored) {
        if (this.done) {
            return;
        }
        this.stream.send({
            type: Frames_1$1.FrameTypes.EXT,
            streamId: this.streamId,
            flags: canBeIgnored ? Frames_1$1.Flags.IGNORE : Frames_1$1.Flags.NONE,
            extendedType: extendedType,
            extendedContent: content,
        });
    };
    RequestStreamResponderStream.prototype.close = function (error) {
        var _a;
        if (this.done) {
            console.warn("Trying to close for the second time. ".concat(error ? "Dropping error [".concat(error, "].") : ""));
            return;
        }
        Reassembler.cancel(this);
        (_a = this.receiver) === null || _a === void 0 ? void 0 : _a.cancel();
    };
    return RequestStreamResponderStream;
}());
RequestStreamStream.RequestStreamResponderStream = RequestStreamResponderStream;

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(RSocketSupport, "__esModule", { value: true });
RSocketSupport.KeepAliveSender = RSocketSupport.KeepAliveHandler = RSocketSupport.DefaultConnectionFrameHandler = RSocketSupport.DefaultStreamRequestHandler = RSocketSupport.LeaseHandler = RSocketSupport.RSocketRequester = void 0;
var Errors_1 = Errors;
var Frames_1 = Frames;
var RequestChannelStream_1 = RequestChannelStream;
var RequestFnFStream_1 = RequestFnFStream;
var RequestResponseStream_1 = RequestResponseStream;
var RequestStreamStream_1 = RequestStreamStream;
var RSocketRequester = /** @class */ (function () {
    function RSocketRequester(connection, fragmentSize, leaseManager) {
        this.connection = connection;
        this.fragmentSize = fragmentSize;
        this.leaseManager = leaseManager;
    }
    RSocketRequester.prototype.fireAndForget = function (payload, responderStream) {
        var handler = new RequestFnFStream_1.RequestFnFRequesterStream(payload, responderStream, this.fragmentSize, this.leaseManager);
        if (this.leaseManager) {
            this.leaseManager.requestLease(handler);
        }
        else {
            this.connection.multiplexerDemultiplexer.createRequestStream(handler);
        }
        return handler;
    };
    RSocketRequester.prototype.requestResponse = function (payload, responderStream) {
        var handler = new RequestResponseStream_1.RequestResponseRequesterStream(payload, responderStream, this.fragmentSize, this.leaseManager);
        if (this.leaseManager) {
            this.leaseManager.requestLease(handler);
        }
        else {
            this.connection.multiplexerDemultiplexer.createRequestStream(handler);
        }
        return handler;
    };
    RSocketRequester.prototype.requestStream = function (payload, initialRequestN, responderStream) {
        var handler = new RequestStreamStream_1.RequestStreamRequesterStream(payload, responderStream, this.fragmentSize, initialRequestN, this.leaseManager);
        if (this.leaseManager) {
            this.leaseManager.requestLease(handler);
        }
        else {
            this.connection.multiplexerDemultiplexer.createRequestStream(handler);
        }
        return handler;
    };
    RSocketRequester.prototype.requestChannel = function (payload, initialRequestN, isCompleted, responderStream) {
        var handler = new RequestChannelStream_1.RequestChannelRequesterStream(payload, isCompleted, responderStream, this.fragmentSize, initialRequestN, this.leaseManager);
        if (this.leaseManager) {
            this.leaseManager.requestLease(handler);
        }
        else {
            this.connection.multiplexerDemultiplexer.createRequestStream(handler);
        }
        return handler;
    };
    RSocketRequester.prototype.metadataPush = function (metadata, responderStream) {
        throw new Error("Method not implemented.");
    };
    RSocketRequester.prototype.close = function (error) {
        this.connection.close(error);
    };
    RSocketRequester.prototype.onClose = function (callback) {
        this.connection.onClose(callback);
    };
    return RSocketRequester;
}());
RSocketSupport.RSocketRequester = RSocketRequester;
var LeaseHandler = /** @class */ (function () {
    function LeaseHandler(maxPendingRequests, multiplexer) {
        this.maxPendingRequests = maxPendingRequests;
        this.multiplexer = multiplexer;
        this.pendingRequests = [];
        this.expirationTime = 0;
        this.availableLease = 0;
    }
    LeaseHandler.prototype.handle = function (frame) {
        this.expirationTime = frame.ttl + Date.now();
        this.availableLease = frame.requestCount;
        while (this.availableLease > 0 && this.pendingRequests.length > 0) {
            var handler = this.pendingRequests.shift();
            this.availableLease--;
            this.multiplexer.createRequestStream(handler);
        }
    };
    LeaseHandler.prototype.requestLease = function (handler) {
        var availableLease = this.availableLease;
        if (availableLease > 0 && Date.now() < this.expirationTime) {
            this.availableLease = availableLease - 1;
            this.multiplexer.createRequestStream(handler);
            return;
        }
        if (this.pendingRequests.length >= this.maxPendingRequests) {
            handler.handleReject(new Errors_1.RSocketError(Errors_1.ErrorCodes.REJECTED, "No available lease given"));
            return;
        }
        this.pendingRequests.push(handler);
    };
    LeaseHandler.prototype.cancelRequest = function (handler) {
        var index = this.pendingRequests.indexOf(handler);
        if (index > -1) {
            this.pendingRequests.splice(index, 1);
        }
    };
    return LeaseHandler;
}());
RSocketSupport.LeaseHandler = LeaseHandler;
var DefaultStreamRequestHandler = /** @class */ (function () {
    function DefaultStreamRequestHandler(rsocket, fragmentSize) {
        this.rsocket = rsocket;
        this.fragmentSize = fragmentSize;
    }
    DefaultStreamRequestHandler.prototype.handle = function (frame, stream) {
        switch (frame.type) {
            case Frames_1.FrameTypes.REQUEST_FNF:
                if (this.rsocket.fireAndForget) {
                    new RequestFnFStream_1.RequestFnfResponderStream(frame.streamId, stream, this.rsocket.fireAndForget.bind(this.rsocket), frame);
                }
                return;
            case Frames_1.FrameTypes.REQUEST_RESPONSE:
                if (this.rsocket.requestResponse) {
                    new RequestResponseStream_1.RequestResponseResponderStream(frame.streamId, stream, this.fragmentSize, this.rsocket.requestResponse.bind(this.rsocket), frame);
                    return;
                }
                this.rejectRequest(frame.streamId, stream);
                return;
            case Frames_1.FrameTypes.REQUEST_STREAM:
                if (this.rsocket.requestStream) {
                    new RequestStreamStream_1.RequestStreamResponderStream(frame.streamId, stream, this.fragmentSize, this.rsocket.requestStream.bind(this.rsocket), frame);
                    return;
                }
                this.rejectRequest(frame.streamId, stream);
                return;
            case Frames_1.FrameTypes.REQUEST_CHANNEL:
                if (this.rsocket.requestChannel) {
                    new RequestChannelStream_1.RequestChannelResponderStream(frame.streamId, stream, this.fragmentSize, this.rsocket.requestChannel.bind(this.rsocket), frame);
                    return;
                }
                this.rejectRequest(frame.streamId, stream);
                return;
        }
    };
    DefaultStreamRequestHandler.prototype.rejectRequest = function (streamId, stream) {
        stream.send({
            type: Frames_1.FrameTypes.ERROR,
            streamId: streamId,
            flags: Frames_1.Flags.NONE,
            code: Errors_1.ErrorCodes.REJECTED,
            message: "No available handler found",
        });
    };
    DefaultStreamRequestHandler.prototype.close = function () { };
    return DefaultStreamRequestHandler;
}());
RSocketSupport.DefaultStreamRequestHandler = DefaultStreamRequestHandler;
var DefaultConnectionFrameHandler = /** @class */ (function () {
    function DefaultConnectionFrameHandler(connection, keepAliveHandler, keepAliveSender, leaseHandler, rsocket) {
        this.connection = connection;
        this.keepAliveHandler = keepAliveHandler;
        this.keepAliveSender = keepAliveSender;
        this.leaseHandler = leaseHandler;
        this.rsocket = rsocket;
    }
    DefaultConnectionFrameHandler.prototype.handle = function (frame) {
        switch (frame.type) {
            case Frames_1.FrameTypes.KEEPALIVE:
                this.keepAliveHandler.handle(frame);
                return;
            case Frames_1.FrameTypes.LEASE:
                if (this.leaseHandler) {
                    this.leaseHandler.handle(frame);
                    return;
                }
                // TODO throw exception and close connection
                return;
            case Frames_1.FrameTypes.ERROR:
                // TODO: add code validation
                this.connection.close(new Errors_1.RSocketError(frame.code, frame.message));
                return;
            case Frames_1.FrameTypes.METADATA_PUSH:
                if (this.rsocket.metadataPush) ;
                return;
            default:
                this.connection.multiplexerDemultiplexer.connectionOutbound.send({
                    type: Frames_1.FrameTypes.ERROR,
                    streamId: 0,
                    flags: Frames_1.Flags.NONE,
                    message: "Received unknown frame type",
                    code: Errors_1.ErrorCodes.CONNECTION_ERROR,
                });
            // TODO: throw an exception and close connection
        }
    };
    DefaultConnectionFrameHandler.prototype.pause = function () {
        var _a;
        this.keepAliveHandler.pause();
        (_a = this.keepAliveSender) === null || _a === void 0 ? void 0 : _a.pause();
    };
    DefaultConnectionFrameHandler.prototype.resume = function () {
        var _a;
        this.keepAliveHandler.start();
        (_a = this.keepAliveSender) === null || _a === void 0 ? void 0 : _a.start();
    };
    DefaultConnectionFrameHandler.prototype.close = function (error) {
        var _a;
        this.keepAliveHandler.close();
        (_a = this.rsocket.close) === null || _a === void 0 ? void 0 : _a.call(this.rsocket, error);
    };
    return DefaultConnectionFrameHandler;
}());
RSocketSupport.DefaultConnectionFrameHandler = DefaultConnectionFrameHandler;
var KeepAliveHandlerStates;
(function (KeepAliveHandlerStates) {
    KeepAliveHandlerStates[KeepAliveHandlerStates["Paused"] = 0] = "Paused";
    KeepAliveHandlerStates[KeepAliveHandlerStates["Running"] = 1] = "Running";
    KeepAliveHandlerStates[KeepAliveHandlerStates["Closed"] = 2] = "Closed";
})(KeepAliveHandlerStates || (KeepAliveHandlerStates = {}));
var KeepAliveHandler = /** @class */ (function () {
    function KeepAliveHandler(connection, keepAliveTimeoutDuration) {
        this.connection = connection;
        this.keepAliveTimeoutDuration = keepAliveTimeoutDuration;
        this.state = KeepAliveHandlerStates.Paused;
        this.outbound = connection.multiplexerDemultiplexer.connectionOutbound;
    }
    KeepAliveHandler.prototype.handle = function (frame) {
        this.keepAliveLastReceivedMillis = Date.now();
        if (Frames_1.Flags.hasRespond(frame.flags)) {
            this.outbound.send({
                type: Frames_1.FrameTypes.KEEPALIVE,
                streamId: 0,
                data: frame.data,
                flags: frame.flags ^ Frames_1.Flags.RESPOND,
                lastReceivedPosition: 0,
            });
        }
    };
    KeepAliveHandler.prototype.start = function () {
        if (this.state !== KeepAliveHandlerStates.Paused) {
            return;
        }
        this.keepAliveLastReceivedMillis = Date.now();
        this.state = KeepAliveHandlerStates.Running;
        this.activeTimeout = setTimeout(this.timeoutCheck.bind(this), this.keepAliveTimeoutDuration);
    };
    KeepAliveHandler.prototype.pause = function () {
        if (this.state !== KeepAliveHandlerStates.Running) {
            return;
        }
        this.state = KeepAliveHandlerStates.Paused;
        clearTimeout(this.activeTimeout);
    };
    KeepAliveHandler.prototype.close = function () {
        this.state = KeepAliveHandlerStates.Closed;
        clearTimeout(this.activeTimeout);
    };
    KeepAliveHandler.prototype.timeoutCheck = function () {
        var now = Date.now();
        var noKeepAliveDuration = now - this.keepAliveLastReceivedMillis;
        if (noKeepAliveDuration >= this.keepAliveTimeoutDuration) {
            this.connection.close(new Error("No keep-alive acks for ".concat(this.keepAliveTimeoutDuration, " millis")));
        }
        else {
            this.activeTimeout = setTimeout(this.timeoutCheck.bind(this), Math.max(100, this.keepAliveTimeoutDuration - noKeepAliveDuration));
        }
    };
    return KeepAliveHandler;
}());
RSocketSupport.KeepAliveHandler = KeepAliveHandler;
var KeepAliveSenderStates;
(function (KeepAliveSenderStates) {
    KeepAliveSenderStates[KeepAliveSenderStates["Paused"] = 0] = "Paused";
    KeepAliveSenderStates[KeepAliveSenderStates["Running"] = 1] = "Running";
    KeepAliveSenderStates[KeepAliveSenderStates["Closed"] = 2] = "Closed";
})(KeepAliveSenderStates || (KeepAliveSenderStates = {}));
var KeepAliveSender = /** @class */ (function () {
    function KeepAliveSender(outbound, keepAlivePeriodDuration) {
        this.outbound = outbound;
        this.keepAlivePeriodDuration = keepAlivePeriodDuration;
        this.state = KeepAliveSenderStates.Paused;
    }
    KeepAliveSender.prototype.sendKeepAlive = function () {
        this.outbound.send({
            type: Frames_1.FrameTypes.KEEPALIVE,
            streamId: 0,
            data: undefined,
            flags: Frames_1.Flags.RESPOND,
            lastReceivedPosition: 0,
        });
    };
    KeepAliveSender.prototype.start = function () {
        if (this.state !== KeepAliveSenderStates.Paused) {
            return;
        }
        this.state = KeepAliveSenderStates.Running;
        this.activeInterval = setInterval(this.sendKeepAlive.bind(this), this.keepAlivePeriodDuration);
    };
    KeepAliveSender.prototype.pause = function () {
        if (this.state !== KeepAliveSenderStates.Running) {
            return;
        }
        this.state = KeepAliveSenderStates.Paused;
        clearInterval(this.activeInterval);
    };
    KeepAliveSender.prototype.close = function () {
        this.state = KeepAliveSenderStates.Closed;
        clearInterval(this.activeInterval);
    };
    return KeepAliveSender;
}());
RSocketSupport.KeepAliveSender = KeepAliveSender;

var Resume = {};

var hasRequiredResume;

function requireResume () {
	if (hasRequiredResume) return Resume;
	hasRequiredResume = 1;
	/*
	 * Copyright 2021-2022 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	var __values = (commonjsGlobal && commonjsGlobal.__values) || function(o) {
	    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
	    if (m) return m.call(o);
	    if (o && typeof o.length === "number") return {
	        next: function () {
	            if (o && i >= o.length) o = void 0;
	            return { value: o && o[i++], done: !o };
	        }
	    };
	    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
	};
	Object.defineProperty(Resume, "__esModule", { value: true });
	Resume.FrameStore = void 0;
	var _1 = requireDist();
	var Codecs_1 = Codecs;
	var FrameStore = /** @class */ (function () {
	    function FrameStore() {
	        this.storedFrames = [];
	        this._lastReceivedFramePosition = 0;
	        this._firstAvailableFramePosition = 0;
	        this._lastSentFramePosition = 0;
	    }
	    Object.defineProperty(FrameStore.prototype, "lastReceivedFramePosition", {
	        get: function () {
	            return this._lastReceivedFramePosition;
	        },
	        enumerable: false,
	        configurable: true
	    });
	    Object.defineProperty(FrameStore.prototype, "firstAvailableFramePosition", {
	        get: function () {
	            return this._firstAvailableFramePosition;
	        },
	        enumerable: false,
	        configurable: true
	    });
	    Object.defineProperty(FrameStore.prototype, "lastSentFramePosition", {
	        get: function () {
	            return this._lastSentFramePosition;
	        },
	        enumerable: false,
	        configurable: true
	    });
	    FrameStore.prototype.store = function (frame) {
	        this._lastSentFramePosition += (0, Codecs_1.sizeOfFrame)(frame);
	        this.storedFrames.push(frame);
	    };
	    FrameStore.prototype.record = function (frame) {
	        this._lastReceivedFramePosition += (0, Codecs_1.sizeOfFrame)(frame);
	    };
	    FrameStore.prototype.dropTo = function (lastReceivedPosition) {
	        var bytesToDrop = lastReceivedPosition - this._firstAvailableFramePosition;
	        while (bytesToDrop > 0 && this.storedFrames.length > 0) {
	            var storedFrame = this.storedFrames.shift();
	            bytesToDrop -= (0, Codecs_1.sizeOfFrame)(storedFrame);
	        }
	        if (bytesToDrop !== 0) {
	            throw new _1.RSocketError(_1.ErrorCodes.CONNECTION_ERROR, "State inconsistency. Expected bytes to drop ".concat(lastReceivedPosition - this._firstAvailableFramePosition, " but actual ").concat(bytesToDrop));
	        }
	        this._firstAvailableFramePosition = lastReceivedPosition;
	    };
	    FrameStore.prototype.drain = function (consumer) {
	        var e_1, _a;
	        try {
	            for (var _b = __values(this.storedFrames), _c = _b.next(); !_c.done; _c = _b.next()) {
	                var frame = _c.value;
	                consumer(frame);
	            }
	        }
	        catch (e_1_1) { e_1 = { error: e_1_1 }; }
	        finally {
	            try {
	                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
	            }
	            finally { if (e_1) throw e_1.error; }
	        }
	    };
	    return FrameStore;
	}());
	Resume.FrameStore = FrameStore;
	
	return Resume;
}

var hasRequiredRSocketConnector;

function requireRSocketConnector () {
	if (hasRequiredRSocketConnector) return RSocketConnector;
	hasRequiredRSocketConnector = 1;
	/*
	 * Copyright 2021-2022 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	var __awaiter = (commonjsGlobal && commonjsGlobal.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	var __generator = (commonjsGlobal && commonjsGlobal.__generator) || function (thisArg, body) {
	    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
	    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
	    function verb(n) { return function (v) { return step([n, v]); }; }
	    function step(op) {
	        if (f) throw new TypeError("Generator is already executing.");
	        while (_) try {
	            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
	            if (y = 0, t) op = [op[0] & 2, t.value];
	            switch (op[0]) {
	                case 0: case 1: t = op; break;
	                case 4: _.label++; return { value: op[1], done: false };
	                case 5: _.label++; y = op[1]; op = [0]; continue;
	                case 7: op = _.ops.pop(); _.trys.pop(); continue;
	                default:
	                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
	                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
	                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
	                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
	                    if (t[2]) _.ops.pop();
	                    _.trys.pop(); continue;
	            }
	            op = body.call(thisArg, _);
	        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
	        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
	    }
	};
	Object.defineProperty(RSocketConnector, "__esModule", { value: true });
	RSocketConnector.RSocketConnector = void 0;
	var ClientServerMultiplexerDemultiplexer_1 = requireClientServerMultiplexerDemultiplexer();
	var Frames_1 = Frames;
	var RSocketSupport_1 = RSocketSupport;
	var Resume_1 = requireResume();
	var RSocketConnector$1 = /** @class */ (function () {
	    function RSocketConnector(config) {
	        this.config = config;
	    }
	    RSocketConnector.prototype.connect = function () {
	        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
	        return __awaiter(this, void 0, void 0, function () {
	            var config, setupFrame, connection, keepAliveSender, keepAliveHandler, leaseHandler, responder, connectionFrameHandler, streamsHandler;
	            var _this = this;
	            return __generator(this, function (_w) {
	                switch (_w.label) {
	                    case 0:
	                        config = this.config;
	                        setupFrame = {
	                            type: Frames_1.FrameTypes.SETUP,
	                            dataMimeType: (_b = (_a = config.setup) === null || _a === void 0 ? void 0 : _a.dataMimeType) !== null && _b !== void 0 ? _b : "application/octet-stream",
	                            metadataMimeType: (_d = (_c = config.setup) === null || _c === void 0 ? void 0 : _c.metadataMimeType) !== null && _d !== void 0 ? _d : "application/octet-stream",
	                            keepAlive: (_f = (_e = config.setup) === null || _e === void 0 ? void 0 : _e.keepAlive) !== null && _f !== void 0 ? _f : 60000,
	                            lifetime: (_h = (_g = config.setup) === null || _g === void 0 ? void 0 : _g.lifetime) !== null && _h !== void 0 ? _h : 300000,
	                            metadata: (_k = (_j = config.setup) === null || _j === void 0 ? void 0 : _j.payload) === null || _k === void 0 ? void 0 : _k.metadata,
	                            data: (_m = (_l = config.setup) === null || _l === void 0 ? void 0 : _l.payload) === null || _m === void 0 ? void 0 : _m.data,
	                            resumeToken: (_p = (_o = config.resume) === null || _o === void 0 ? void 0 : _o.tokenGenerator()) !== null && _p !== void 0 ? _p : null,
	                            streamId: 0,
	                            majorVersion: 1,
	                            minorVersion: 0,
	                            flags: (((_r = (_q = config.setup) === null || _q === void 0 ? void 0 : _q.payload) === null || _r === void 0 ? void 0 : _r.metadata) ? Frames_1.Flags.METADATA : Frames_1.Flags.NONE) |
	                                (config.lease ? Frames_1.Flags.LEASE : Frames_1.Flags.NONE) |
	                                (config.resume ? Frames_1.Flags.RESUME_ENABLE : Frames_1.Flags.NONE),
	                        };
	                        return [4 /*yield*/, config.transport.connect(function (outbound) {
	                                return config.resume
	                                    ? new ClientServerMultiplexerDemultiplexer_1.ResumableClientServerInputMultiplexerDemultiplexer(ClientServerMultiplexerDemultiplexer_1.StreamIdGenerator.create(-1), outbound, outbound, new Resume_1.FrameStore(), // TODO: add size control
	                                    setupFrame.resumeToken.toString(), function (self, frameStore) { return __awaiter(_this, void 0, void 0, function () {
	                                        var multiplexerDemultiplexerProvider, reconnectionAttempts, reconnector;
	                                        return __generator(this, function (_a) {
	                                            switch (_a.label) {
	                                                case 0:
	                                                    multiplexerDemultiplexerProvider = function (outbound) {
	                                                        outbound.send({
	                                                            type: Frames_1.FrameTypes.RESUME,
	                                                            streamId: 0,
	                                                            flags: Frames_1.Flags.NONE,
	                                                            clientPosition: frameStore.firstAvailableFramePosition,
	                                                            serverPosition: frameStore.lastReceivedFramePosition,
	                                                            majorVersion: setupFrame.minorVersion,
	                                                            minorVersion: setupFrame.majorVersion,
	                                                            resumeToken: setupFrame.resumeToken,
	                                                        });
	                                                        return new ClientServerMultiplexerDemultiplexer_1.ResumeOkAwaitingResumableClientServerInputMultiplexerDemultiplexer(outbound, outbound, self);
	                                                    };
	                                                    reconnectionAttempts = -1;
	                                                    reconnector = function () {
	                                                        reconnectionAttempts++;
	                                                        return config.resume
	                                                            .reconnectFunction(reconnectionAttempts)
	                                                            .then(function () {
	                                                            return config.transport
	                                                                .connect(multiplexerDemultiplexerProvider)
	                                                                .catch(reconnector);
	                                                        });
	                                                    };
	                                                    return [4 /*yield*/, reconnector()];
	                                                case 1:
	                                                    _a.sent();
	                                                    return [2 /*return*/];
	                                            }
	                                        });
	                                    }); })
	                                    : new ClientServerMultiplexerDemultiplexer_1.ClientServerInputMultiplexerDemultiplexer(ClientServerMultiplexerDemultiplexer_1.StreamIdGenerator.create(-1), outbound, outbound);
	                            })];
	                    case 1:
	                        connection = _w.sent();
	                        keepAliveSender = new RSocketSupport_1.KeepAliveSender(connection.multiplexerDemultiplexer.connectionOutbound, setupFrame.keepAlive);
	                        keepAliveHandler = new RSocketSupport_1.KeepAliveHandler(connection, setupFrame.lifetime);
	                        leaseHandler = config.lease
	                            ? new RSocketSupport_1.LeaseHandler((_s = config.lease.maxPendingRequests) !== null && _s !== void 0 ? _s : 256, connection.multiplexerDemultiplexer)
	                            : undefined;
	                        responder = (_t = config.responder) !== null && _t !== void 0 ? _t : {};
	                        connectionFrameHandler = new RSocketSupport_1.DefaultConnectionFrameHandler(connection, keepAliveHandler, keepAliveSender, leaseHandler, responder);
	                        streamsHandler = new RSocketSupport_1.DefaultStreamRequestHandler(responder, 0);
	                        connection.onClose(function (e) {
	                            keepAliveSender.close();
	                            keepAliveHandler.close();
	                            connectionFrameHandler.close(e);
	                        });
	                        connection.multiplexerDemultiplexer.connectionInbound(connectionFrameHandler);
	                        connection.multiplexerDemultiplexer.handleRequestStream(streamsHandler);
	                        connection.multiplexerDemultiplexer.connectionOutbound.send(setupFrame);
	                        keepAliveHandler.start();
	                        keepAliveSender.start();
	                        return [2 /*return*/, new RSocketSupport_1.RSocketRequester(connection, (_v = (_u = config.fragmentation) === null || _u === void 0 ? void 0 : _u.maxOutboundFragmentSize) !== null && _v !== void 0 ? _v : 0, leaseHandler)];
	                }
	            });
	        });
	    };
	    return RSocketConnector;
	}());
	RSocketConnector.RSocketConnector = RSocketConnector$1;
	
	return RSocketConnector;
}

var RSocketServer = {};

var hasRequiredRSocketServer;

function requireRSocketServer () {
	if (hasRequiredRSocketServer) return RSocketServer;
	hasRequiredRSocketServer = 1;
	/*
	 * Copyright 2021-2022 the original author or authors.
	 *
	 * Licensed under the Apache License, Version 2.0 (the "License");
	 * you may not use this file except in compliance with the License.
	 * You may obtain a copy of the License at
	 *
	 *     http://www.apache.org/licenses/LICENSE-2.0
	 *
	 * Unless required by applicable law or agreed to in writing, software
	 * distributed under the License is distributed on an "AS IS" BASIS,
	 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	 * See the License for the specific language governing permissions and
	 * limitations under the License.
	 */
	var __awaiter = (commonjsGlobal && commonjsGlobal.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	var __generator = (commonjsGlobal && commonjsGlobal.__generator) || function (thisArg, body) {
	    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
	    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
	    function verb(n) { return function (v) { return step([n, v]); }; }
	    function step(op) {
	        if (f) throw new TypeError("Generator is already executing.");
	        while (_) try {
	            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
	            if (y = 0, t) op = [op[0] & 2, t.value];
	            switch (op[0]) {
	                case 0: case 1: t = op; break;
	                case 4: _.label++; return { value: op[1], done: false };
	                case 5: _.label++; y = op[1]; op = [0]; continue;
	                case 7: op = _.ops.pop(); _.trys.pop(); continue;
	                default:
	                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
	                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
	                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
	                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
	                    if (t[2]) _.ops.pop();
	                    _.trys.pop(); continue;
	            }
	            op = body.call(thisArg, _);
	        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
	        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
	    }
	};
	Object.defineProperty(RSocketServer, "__esModule", { value: true });
	RSocketServer.RSocketServer = void 0;
	var ClientServerMultiplexerDemultiplexer_1 = requireClientServerMultiplexerDemultiplexer();
	var Errors_1 = Errors;
	var Frames_1 = Frames;
	var RSocketSupport_1 = RSocketSupport;
	var Resume_1 = requireResume();
	var RSocketServer$1 = /** @class */ (function () {
	    function RSocketServer(config) {
	        var _a, _b;
	        this.acceptor = config.acceptor;
	        this.transport = config.transport;
	        this.lease = config.lease;
	        this.serverSideKeepAlive = config.serverSideKeepAlive;
	        this.sessionStore = config.resume ? {} : undefined;
	        this.sessionTimeout = (_b = (_a = config.resume) === null || _a === void 0 ? void 0 : _a.sessionTimeout) !== null && _b !== void 0 ? _b : undefined;
	    }
	    RSocketServer.prototype.bind = function () {
	        return __awaiter(this, void 0, void 0, function () {
	            var _this = this;
	            return __generator(this, function (_a) {
	                switch (_a.label) {
	                    case 0: return [4 /*yield*/, this.transport.bind(function (frame, connection) { return __awaiter(_this, void 0, void 0, function () {
	                            var _a, error, error, leaseHandler, requester, responder, keepAliveHandler_1, keepAliveSender_1, connectionFrameHandler_1, streamsHandler, e_1;
	                            var _b, _c, _d, _e;
	                            return __generator(this, function (_f) {
	                                switch (_f.label) {
	                                    case 0:
	                                        _a = frame.type;
	                                        switch (_a) {
	                                            case Frames_1.FrameTypes.SETUP: return [3 /*break*/, 1];
	                                            case Frames_1.FrameTypes.RESUME: return [3 /*break*/, 5];
	                                        }
	                                        return [3 /*break*/, 6];
	                                    case 1:
	                                        _f.trys.push([1, 3, , 4]);
	                                        if (this.lease && !Frames_1.Flags.hasLease(frame.flags)) {
	                                            error = new Errors_1.RSocketError(Errors_1.ErrorCodes.REJECTED_SETUP, "Lease has to be enabled");
	                                            connection.multiplexerDemultiplexer.connectionOutbound.send({
	                                                type: Frames_1.FrameTypes.ERROR,
	                                                streamId: 0,
	                                                flags: Frames_1.Flags.NONE,
	                                                code: error.code,
	                                                message: error.message,
	                                            });
	                                            connection.close(error);
	                                            return [2 /*return*/];
	                                        }
	                                        if (Frames_1.Flags.hasLease(frame.flags) && !this.lease) {
	                                            error = new Errors_1.RSocketError(Errors_1.ErrorCodes.REJECTED_SETUP, "Lease has to be disabled");
	                                            connection.multiplexerDemultiplexer.connectionOutbound.send({
	                                                type: Frames_1.FrameTypes.ERROR,
	                                                streamId: 0,
	                                                flags: Frames_1.Flags.NONE,
	                                                code: error.code,
	                                                message: error.message,
	                                            });
	                                            connection.close(error);
	                                            return [2 /*return*/];
	                                        }
	                                        leaseHandler = Frames_1.Flags.hasLease(frame.flags)
	                                            ? new RSocketSupport_1.LeaseHandler((_b = this.lease.maxPendingRequests) !== null && _b !== void 0 ? _b : 256, connection.multiplexerDemultiplexer)
	                                            : undefined;
	                                        requester = new RSocketSupport_1.RSocketRequester(connection, (_d = (_c = this.fragmentation) === null || _c === void 0 ? void 0 : _c.maxOutboundFragmentSize) !== null && _d !== void 0 ? _d : 0, leaseHandler);
	                                        return [4 /*yield*/, this.acceptor.accept({
	                                                data: frame.data,
	                                                dataMimeType: frame.dataMimeType,
	                                                metadata: frame.metadata,
	                                                metadataMimeType: frame.metadataMimeType,
	                                                flags: frame.flags,
	                                                keepAliveMaxLifetime: frame.lifetime,
	                                                keepAliveInterval: frame.keepAlive,
	                                                resumeToken: frame.resumeToken,
	                                            }, requester)];
	                                    case 2:
	                                        responder = _f.sent();
	                                        keepAliveHandler_1 = new RSocketSupport_1.KeepAliveHandler(connection, frame.lifetime);
	                                        keepAliveSender_1 = this.serverSideKeepAlive
	                                            ? new RSocketSupport_1.KeepAliveSender(connection.multiplexerDemultiplexer.connectionOutbound, frame.keepAlive)
	                                            : undefined;
	                                        connectionFrameHandler_1 = new RSocketSupport_1.DefaultConnectionFrameHandler(connection, keepAliveHandler_1, keepAliveSender_1, leaseHandler, responder);
	                                        streamsHandler = new RSocketSupport_1.DefaultStreamRequestHandler(responder, 0);
	                                        connection.onClose(function (e) {
	                                            keepAliveSender_1 === null || keepAliveSender_1 === void 0 ? void 0 : keepAliveSender_1.close();
	                                            keepAliveHandler_1.close();
	                                            connectionFrameHandler_1.close(e);
	                                        });
	                                        connection.multiplexerDemultiplexer.connectionInbound(connectionFrameHandler_1);
	                                        connection.multiplexerDemultiplexer.handleRequestStream(streamsHandler);
	                                        keepAliveHandler_1.start();
	                                        keepAliveSender_1 === null || keepAliveSender_1 === void 0 ? void 0 : keepAliveSender_1.start();
	                                        return [3 /*break*/, 4];
	                                    case 3:
	                                        e_1 = _f.sent();
	                                        connection.multiplexerDemultiplexer.connectionOutbound.send({
	                                            type: Frames_1.FrameTypes.ERROR,
	                                            streamId: 0,
	                                            code: Errors_1.ErrorCodes.REJECTED_SETUP,
	                                            message: (_e = e_1.message) !== null && _e !== void 0 ? _e : "",
	                                            flags: Frames_1.Flags.NONE,
	                                        });
	                                        connection.close(e_1 instanceof Errors_1.RSocketError
	                                            ? e_1
	                                            : new Errors_1.RSocketError(Errors_1.ErrorCodes.REJECTED_SETUP, e_1.message));
	                                        return [3 /*break*/, 4];
	                                    case 4: return [2 /*return*/];
	                                    case 5:
	                                        {
	                                            // frame should be handled earlier
	                                            return [2 /*return*/];
	                                        }
	                                    case 6:
	                                        {
	                                            connection.multiplexerDemultiplexer.connectionOutbound.send({
	                                                type: Frames_1.FrameTypes.ERROR,
	                                                streamId: 0,
	                                                code: Errors_1.ErrorCodes.UNSUPPORTED_SETUP,
	                                                message: "Unsupported setup",
	                                                flags: Frames_1.Flags.NONE,
	                                            });
	                                            connection.close(new Errors_1.RSocketError(Errors_1.ErrorCodes.UNSUPPORTED_SETUP));
	                                        }
	                                        _f.label = 7;
	                                    case 7: return [2 /*return*/];
	                                }
	                            });
	                        }); }, function (frame, outbound) {
	                            if (frame.type === Frames_1.FrameTypes.RESUME) {
	                                if (_this.sessionStore) {
	                                    var multiplexerDemultiplexer = _this.sessionStore[frame.resumeToken.toString()];
	                                    if (!multiplexerDemultiplexer) {
	                                        outbound.send({
	                                            type: Frames_1.FrameTypes.ERROR,
	                                            streamId: 0,
	                                            code: Errors_1.ErrorCodes.REJECTED_RESUME,
	                                            message: "No session found for the given resume token",
	                                            flags: Frames_1.Flags.NONE,
	                                        });
	                                        outbound.close();
	                                        return;
	                                    }
	                                    multiplexerDemultiplexer.resume(frame, outbound, outbound);
	                                    return multiplexerDemultiplexer;
	                                }
	                                outbound.send({
	                                    type: Frames_1.FrameTypes.ERROR,
	                                    streamId: 0,
	                                    code: Errors_1.ErrorCodes.REJECTED_RESUME,
	                                    message: "Resume is not enabled",
	                                    flags: Frames_1.Flags.NONE,
	                                });
	                                outbound.close();
	                                return;
	                            }
	                            else if (frame.type === Frames_1.FrameTypes.SETUP) {
	                                if (Frames_1.Flags.hasResume(frame.flags)) {
	                                    if (!_this.sessionStore) {
	                                        var error = new Errors_1.RSocketError(Errors_1.ErrorCodes.REJECTED_SETUP, "No resume support");
	                                        outbound.send({
	                                            type: Frames_1.FrameTypes.ERROR,
	                                            streamId: 0,
	                                            flags: Frames_1.Flags.NONE,
	                                            code: error.code,
	                                            message: error.message,
	                                        });
	                                        outbound.close(error);
	                                        return;
	                                    }
	                                    var multiplexerDumiltiplexer = new ClientServerMultiplexerDemultiplexer_1.ResumableClientServerInputMultiplexerDemultiplexer(ClientServerMultiplexerDemultiplexer_1.StreamIdGenerator.create(0), outbound, outbound, new Resume_1.FrameStore(), // TODO: add size parameter
	                                    frame.resumeToken.toString(), _this.sessionStore, _this.sessionTimeout);
	                                    _this.sessionStore[frame.resumeToken.toString()] =
	                                        multiplexerDumiltiplexer;
	                                    return multiplexerDumiltiplexer;
	                                }
	                            }
	                            return new ClientServerMultiplexerDemultiplexer_1.ClientServerInputMultiplexerDemultiplexer(ClientServerMultiplexerDemultiplexer_1.StreamIdGenerator.create(0), outbound, outbound);
	                        })];
	                    case 1: return [2 /*return*/, _a.sent()];
	                }
	            });
	        });
	    };
	    return RSocketServer;
	}());
	RSocketServer.RSocketServer = RSocketServer$1;
	
	return RSocketServer;
}

var Transport = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(Transport, "__esModule", { value: true });

var hasRequiredDist;

function requireDist () {
	if (hasRequiredDist) return dist$1;
	hasRequiredDist = 1;
	(function (exports) {
		/*
		 * Copyright 2021-2022 the original author or authors.
		 *
		 * Licensed under the Apache License, Version 2.0 (the "License");
		 * you may not use this file except in compliance with the License.
		 * You may obtain a copy of the License at
		 *
		 *     http://www.apache.org/licenses/LICENSE-2.0
		 *
		 * Unless required by applicable law or agreed to in writing, software
		 * distributed under the License is distributed on an "AS IS" BASIS,
		 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
		 * See the License for the specific language governing permissions and
		 * limitations under the License.
		 */
		var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
		    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		__exportStar(Codecs, exports);
		__exportStar(Common, exports);
		__exportStar(Deferred$1, exports);
		__exportStar(Errors, exports);
		__exportStar(Frames, exports);
		__exportStar(RSocket, exports);
		__exportStar(requireRSocketConnector(), exports);
		__exportStar(requireRSocketServer(), exports);
		__exportStar(Transport, exports);
		
	} (dist$1));
	return dist$1;
}

var distExports = requireDist();

var dist = {};

var WebsocketClientTransport$1 = {};

var WebsocketDuplexConnection$1 = {};

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __extends = (commonjsGlobal && commonjsGlobal.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(WebsocketDuplexConnection$1, "__esModule", { value: true });
WebsocketDuplexConnection$1.WebsocketDuplexConnection = void 0;
var rsocket_core_1$1 = requireDist();
var WebsocketDuplexConnection = /** @class */ (function (_super) {
    __extends(WebsocketDuplexConnection, _super);
    function WebsocketDuplexConnection(websocket, deserializer, multiplexerDemultiplexerFactory) {
        var _this = _super.call(this) || this;
        _this.websocket = websocket;
        _this.deserializer = deserializer;
        _this.handleClosed = function (e) {
            _this.close(new Error(e.reason || "WebsocketDuplexConnection: Socket closed unexpectedly."));
        };
        _this.handleError = function (e) {
            _this.close(e.error);
        };
        _this.handleMessage = function (message) {
            try {
                var buffer = Buffer.from(message.data);
                var frame = _this.deserializer.deserializeFrame(buffer);
                _this.multiplexerDemultiplexer.handle(frame);
            }
            catch (error) {
                _this.close(error);
            }
        };
        websocket.addEventListener("close", _this.handleClosed);
        websocket.addEventListener("error", _this.handleError);
        websocket.addEventListener("message", _this.handleMessage);
        _this.multiplexerDemultiplexer = multiplexerDemultiplexerFactory(_this);
        return _this;
    }
    Object.defineProperty(WebsocketDuplexConnection.prototype, "availability", {
        get: function () {
            return this.done ? 0 : 1;
        },
        enumerable: false,
        configurable: true
    });
    WebsocketDuplexConnection.prototype.close = function (error) {
        if (this.done) {
            _super.prototype.close.call(this, error);
            return;
        }
        this.websocket.removeEventListener("close", this.handleClosed);
        this.websocket.removeEventListener("error", this.handleError);
        this.websocket.removeEventListener("message", this.handleMessage);
        this.websocket.close();
        delete this.websocket;
        _super.prototype.close.call(this, error);
    };
    WebsocketDuplexConnection.prototype.send = function (frame) {
        if (this.done) {
            return;
        }
        var buffer = (0, rsocket_core_1$1.serializeFrame)(frame);
        this.websocket.send(buffer);
    };
    return WebsocketDuplexConnection;
}(rsocket_core_1$1.Deferred));
WebsocketDuplexConnection$1.WebsocketDuplexConnection = WebsocketDuplexConnection;

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(WebsocketClientTransport$1, "__esModule", { value: true });
WebsocketClientTransport$1.WebsocketClientTransport = void 0;
var rsocket_core_1 = requireDist();
var WebsocketDuplexConnection_1 = WebsocketDuplexConnection$1;
var WebsocketClientTransport = /** @class */ (function () {
    function WebsocketClientTransport(options) {
        var _a;
        this.url = options.url;
        this.factory = (_a = options.wsCreator) !== null && _a !== void 0 ? _a : (function (url) { return new WebSocket(url); });
    }
    WebsocketClientTransport.prototype.connect = function (multiplexerDemultiplexerFactory) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var websocket = _this.factory(_this.url);
            websocket.binaryType = "arraybuffer";
            var openListener = function () {
                websocket.removeEventListener("open", openListener);
                websocket.removeEventListener("error", errorListener);
                resolve(new WebsocketDuplexConnection_1.WebsocketDuplexConnection(websocket, new rsocket_core_1.Deserializer(), multiplexerDemultiplexerFactory));
            };
            var errorListener = function (ev) {
                websocket.removeEventListener("open", openListener);
                websocket.removeEventListener("error", errorListener);
                reject(ev.error);
            };
            websocket.addEventListener("open", openListener);
            websocket.addEventListener("error", errorListener);
        });
    };
    return WebsocketClientTransport;
}());
WebsocketClientTransport$1.WebsocketClientTransport = WebsocketClientTransport;

/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(WebsocketClientTransport$1, exports);
	
} (dist));

const DEFAULT_PRESSURE_LIMITS = {
    highWater: 10,
    lowWater: 0
};
/**
 * A very basic implementation of a data stream with backpressure support which does not use
 * native JS streams or async iterators.
 * This is handy for environments such as React Native which need polyfills for the above.
 */
class DataStream extends BaseObserver {
    options;
    dataQueue;
    isClosed;
    processingPromise;
    logger;
    constructor(options) {
        super();
        this.options = options;
        this.processingPromise = null;
        this.isClosed = false;
        this.dataQueue = [];
        this.logger = options?.logger ?? Logger.get('DataStream');
        if (options?.closeOnError) {
            const l = this.registerListener({
                error: (ex) => {
                    l?.();
                    this.close();
                }
            });
        }
    }
    get highWatermark() {
        return this.options?.pressure?.highWaterMark ?? DEFAULT_PRESSURE_LIMITS.highWater;
    }
    get lowWatermark() {
        return this.options?.pressure?.lowWaterMark ?? DEFAULT_PRESSURE_LIMITS.lowWater;
    }
    get closed() {
        return this.isClosed;
    }
    async close() {
        this.isClosed = true;
        await this.processingPromise;
        this.iterateListeners((l) => l.closed?.());
        // Discard any data in the queue
        this.dataQueue = [];
        this.listeners.clear();
    }
    /**
     * Enqueues data for the consumers to read
     */
    enqueueData(data) {
        if (this.isClosed) {
            throw new Error('Cannot enqueue data into closed stream.');
        }
        this.dataQueue.push(data);
        this.processQueue();
    }
    /**
     * Reads data once from the data stream
     * @returns a Data payload or Null if the stream closed.
     */
    async read() {
        if (this.dataQueue.length <= this.lowWatermark) {
            await this.iterateAsyncErrored(async (l) => l.lowWater?.());
        }
        if (this.closed) {
            return null;
        }
        return new Promise((resolve, reject) => {
            const l = this.registerListener({
                data: async (data) => {
                    resolve(data);
                    // Remove the listener
                    l?.();
                },
                closed: () => {
                    resolve(null);
                    l?.();
                },
                error: (ex) => {
                    reject(ex);
                    l?.();
                }
            });
            this.processQueue();
        });
    }
    /**
     * Executes a callback for each data item in the stream
     */
    forEach(callback) {
        if (this.dataQueue.length <= this.lowWatermark) {
            this.iterateAsyncErrored(async (l) => l.lowWater?.());
        }
        return this.registerListener({
            data: callback
        });
    }
    async processQueue() {
        if (this.processingPromise) {
            return;
        }
        /**
         * Allow listeners to mutate the queue before processing.
         * This allows for operations such as dropping or compressing data
         * on high water or requesting more data on low water.
         */
        if (this.dataQueue.length >= this.highWatermark) {
            await this.iterateAsyncErrored(async (l) => l.highWater?.());
        }
        return (this.processingPromise = this._processQueue());
    }
    /**
     * Creates a new data stream which is a map of the original
     */
    map(callback) {
        const stream = new DataStream(this.options);
        const l = this.registerListener({
            data: async (data) => {
                stream.enqueueData(callback(data));
            },
            closed: () => {
                stream.close();
                l?.();
            }
        });
        return stream;
    }
    hasDataReader() {
        return Array.from(this.listeners.values()).some((l) => !!l.data);
    }
    async _processQueue() {
        if (!this.dataQueue.length || this.isClosed || !this.hasDataReader()) {
            Promise.resolve().then(() => (this.processingPromise = null));
            return;
        }
        const data = this.dataQueue.shift();
        await this.iterateAsyncErrored(async (l) => l.data?.(data));
        if (this.dataQueue.length <= this.lowWatermark) {
            await this.iterateAsyncErrored(async (l) => l.lowWater?.());
        }
        this.processingPromise = null;
        if (this.dataQueue.length) {
            // Next tick
            setTimeout(() => this.processQueue());
        }
    }
    async iterateAsyncErrored(cb) {
        for (let i of Array.from(this.listeners.values())) {
            try {
                await cb(i);
            }
            catch (ex) {
                this.logger.error(ex);
                this.iterateListeners((l) => l.error?.(ex));
            }
        }
    }
}

var version = "1.24.0";

const POWERSYNC_TRAILING_SLASH_MATCH = /\/+$/;
// Refresh at least 30 sec before it expires
const REFRESH_CREDENTIALS_SAFETY_PERIOD_MS = 30_000;
const SYNC_QUEUE_REQUEST_LOW_WATER = 5;
// Keep alive message is sent every period
const KEEP_ALIVE_MS = 20_000;
// The ACK must be received in this period
const KEEP_ALIVE_LIFETIME_MS = 30_000;
const DEFAULT_REMOTE_LOGGER = Logger.get('PowerSyncRemote');
var FetchStrategy;
(function (FetchStrategy) {
    /**
     * Queues multiple sync events before processing, reducing round-trips.
     * This comes at the cost of more processing overhead, which may cause ACK timeouts on older/weaker devices for big enough datasets.
     */
    FetchStrategy["Buffered"] = "buffered";
    /**
     * Processes each sync event immediately before requesting the next.
     * This reduces processing overhead and improves real-time responsiveness.
     */
    FetchStrategy["Sequential"] = "sequential";
})(FetchStrategy || (FetchStrategy = {}));
/**
 * Class wrapper for providing a fetch implementation.
 * The class wrapper is used to distinguish the fetchImplementation
 * option in [AbstractRemoteOptions] from the general fetch method
 * which is typeof "function"
 */
class FetchImplementationProvider {
    getFetch() {
        throw new Error('Unspecified fetch implementation');
    }
}
const DEFAULT_REMOTE_OPTIONS = {
    socketUrlTransformer: (url) => url.replace(/^https?:\/\//, function (match) {
        return match === 'https://' ? 'wss://' : 'ws://';
    }),
    fetchImplementation: new FetchImplementationProvider()
};
class AbstractRemote {
    connector;
    logger;
    credentials = null;
    options;
    constructor(connector, logger = DEFAULT_REMOTE_LOGGER, options) {
        this.connector = connector;
        this.logger = logger;
        this.options = {
            ...DEFAULT_REMOTE_OPTIONS,
            ...(options ?? {})
        };
    }
    /**
     * @returns a fetch implementation (function)
     * which can be called to perform fetch requests
     */
    get fetch() {
        const { fetchImplementation } = this.options;
        return fetchImplementation instanceof FetchImplementationProvider
            ? fetchImplementation.getFetch()
            : fetchImplementation;
    }
    async getCredentials() {
        const { expiresAt } = this.credentials ?? {};
        if (expiresAt && expiresAt > new Date(new Date().valueOf() + REFRESH_CREDENTIALS_SAFETY_PERIOD_MS)) {
            return this.credentials;
        }
        this.credentials = await this.connector.fetchCredentials();
        if (this.credentials?.endpoint.match(POWERSYNC_TRAILING_SLASH_MATCH)) {
            throw new Error(`A trailing forward slash "/" was found in the fetchCredentials endpoint: "${this.credentials.endpoint}". Remove the trailing forward slash "/" to fix this error.`);
        }
        return this.credentials;
    }
    getUserAgent() {
        return `powersync-js/${version}`;
    }
    async buildRequest(path) {
        const credentials = await this.getCredentials();
        if (credentials != null && (credentials.endpoint == null || credentials.endpoint == '')) {
            throw new Error('PowerSync endpoint not configured');
        }
        else if (credentials?.token == null || credentials?.token == '') {
            const error = new Error(`Not signed in`);
            error.status = 401;
            throw error;
        }
        const userAgent = this.getUserAgent();
        return {
            url: credentials.endpoint + path,
            headers: {
                'content-type': 'application/json',
                Authorization: `Token ${credentials.token}`,
                'x-user-agent': userAgent
            }
        };
    }
    async post(path, data, headers = {}) {
        const request = await this.buildRequest(path);
        const res = await this.fetch(request.url, {
            method: 'POST',
            headers: {
                ...headers,
                ...request.headers
            },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            throw new Error(`Received ${res.status} - ${res.statusText} when posting to ${path}: ${await res.text()}}`);
        }
        return res.json();
    }
    async get(path, headers) {
        const request = await this.buildRequest(path);
        const res = await this.fetch(request.url, {
            method: 'GET',
            headers: {
                ...headers,
                ...request.headers
            }
        });
        if (!res.ok) {
            throw new Error(`Received ${res.status} - ${res.statusText} when getting from ${path}: ${await res.text()}}`);
        }
        return res.json();
    }
    async postStreaming(path, data, headers = {}, signal) {
        const request = await this.buildRequest(path);
        const res = await this.fetch(request.url, {
            method: 'POST',
            headers: { ...headers, ...request.headers },
            body: JSON.stringify(data),
            signal,
            cache: 'no-store'
        }).catch((ex) => {
            this.logger.error(`Caught ex when POST streaming to ${path}`, ex);
            throw ex;
        });
        if (!res.ok) {
            const text = await res.text();
            this.logger.error(`Could not POST streaming to ${path} - ${res.status} - ${res.statusText}: ${text}`);
            const error = new Error(`HTTP ${res.statusText}: ${text}`);
            error.status = res.status;
            throw error;
        }
        return res;
    }
    /**
     * Connects to the sync/stream websocket endpoint
     */
    async socketStream(options) {
        const { path, fetchStrategy = FetchStrategy.Buffered } = options;
        const syncQueueRequestSize = fetchStrategy == FetchStrategy.Buffered ? 10 : 1;
        const request = await this.buildRequest(path);
        const bson = await this.getBSON();
        // Add the user agent in the setup payload - we can't set custom
        // headers with websockets on web. The browser userAgent is however added
        // automatically as a header.
        const userAgent = this.getUserAgent();
        const connector = new distExports.RSocketConnector({
            transport: new dist.WebsocketClientTransport({
                url: this.options.socketUrlTransformer(request.url)
            }),
            setup: {
                keepAlive: KEEP_ALIVE_MS,
                lifetime: KEEP_ALIVE_LIFETIME_MS,
                dataMimeType: 'application/bson',
                metadataMimeType: 'application/bson',
                payload: {
                    data: null,
                    metadata: Buffer$1.from(bson.serialize({
                        token: request.headers.Authorization,
                        user_agent: userAgent
                    }))
                }
            }
        });
        let rsocket;
        try {
            rsocket = await connector.connect();
        }
        catch (ex) {
            /**
             * On React native the connection exception can be `undefined` this causes issues
             * with detecting the exception inside async-mutex
             */
            throw new Error(`Could not connect to PowerSync instance: ${JSON.stringify(ex)}`);
        }
        const stream = new DataStream({
            logger: this.logger,
            pressure: {
                lowWaterMark: SYNC_QUEUE_REQUEST_LOW_WATER
            }
        });
        let socketIsClosed = false;
        const closeSocket = () => {
            if (socketIsClosed) {
                return;
            }
            socketIsClosed = true;
            rsocket.close();
        };
        // Helps to prevent double close scenarios
        rsocket.onClose(() => (socketIsClosed = true));
        // We initially request this amount and expect these to arrive eventually
        let pendingEventsCount = syncQueueRequestSize;
        const disposeClosedListener = stream.registerListener({
            closed: () => {
                closeSocket();
                disposeClosedListener();
            }
        });
        const socket = await new Promise((resolve, reject) => {
            let connectionEstablished = false;
            const res = rsocket.requestStream({
                data: Buffer$1.from(bson.serialize(options.data)),
                metadata: Buffer$1.from(bson.serialize({
                    path
                }))
            }, syncQueueRequestSize, // The initial N amount
            {
                onError: (e) => {
                    // Don't log closed as an error
                    if (e.message !== 'Closed. ') {
                        this.logger.error(e);
                    }
                    // RSocket will close the RSocket stream automatically
                    // Close the downstream stream as well - this will close the RSocket connection and WebSocket
                    stream.close();
                    // Handles cases where the connection failed e.g. auth error or connection error
                    if (!connectionEstablished) {
                        reject(e);
                    }
                },
                onNext: (payload) => {
                    // The connection is active
                    if (!connectionEstablished) {
                        connectionEstablished = true;
                        resolve(res);
                    }
                    const { data } = payload;
                    // Less events are now pending
                    pendingEventsCount--;
                    if (!data) {
                        return;
                    }
                    const deserializedData = bson.deserialize(data);
                    stream.enqueueData(deserializedData);
                },
                onComplete: () => {
                    stream.close();
                },
                onExtension: () => { }
            });
        });
        const l = stream.registerListener({
            lowWater: async () => {
                // Request to fill up the queue
                const required = syncQueueRequestSize - pendingEventsCount;
                if (required > 0) {
                    socket.request(syncQueueRequestSize - pendingEventsCount);
                    pendingEventsCount = syncQueueRequestSize;
                }
            },
            closed: () => {
                l();
            }
        });
        /**
         * Handle abort operations here.
         * Unfortunately cannot insert them into the connection.
         */
        if (options.abortSignal?.aborted) {
            stream.close();
        }
        else {
            options.abortSignal?.addEventListener('abort', () => {
                stream.close();
            });
        }
        return stream;
    }
    /**
     * Connects to the sync/stream http endpoint
     */
    async postStream(options) {
        const { data, path, headers, abortSignal } = options;
        const request = await this.buildRequest(path);
        /**
         * This abort controller will abort pending fetch requests.
         * If the request has resolved, it will be used to close the readable stream.
         * Which will cancel the network request.
         *
         * This nested controller is required since:
         *  Aborting the active fetch request while it is being consumed seems to throw
         *  an unhandled exception on the window level.
         */
        const controller = new AbortController();
        let requestResolved = false;
        abortSignal?.addEventListener('abort', () => {
            if (!requestResolved) {
                // Only abort via the abort controller if the request has not resolved yet
                controller.abort(abortSignal.reason ??
                    new AbortOperation('Cancelling network request before it resolves. Abort signal has been received.'));
            }
        });
        const res = await this.fetch(request.url, {
            method: 'POST',
            headers: { ...headers, ...request.headers },
            body: JSON.stringify(data),
            signal: controller.signal,
            cache: 'no-store',
            ...options.fetchOptions
        }).catch((ex) => {
            if (ex.name == 'AbortError') {
                throw new AbortOperation(`Pending fetch request to ${request.url} has been aborted.`);
            }
            throw ex;
        });
        if (!res) {
            throw new Error('Fetch request was aborted');
        }
        requestResolved = true;
        if (!res.ok || !res.body) {
            const text = await res.text();
            this.logger.error(`Could not POST streaming to ${path} - ${res.status} - ${res.statusText}: ${text}`);
            const error = new Error(`HTTP ${res.statusText}: ${text}`);
            error.status = res.status;
            throw error;
        }
        /**
         * The can-ndjson-stream does not handle aborted streams well.
         * This will intercept the readable stream and close the stream if
         * aborted.
         */
        const reader = res.body.getReader();
        // This will close the network request and read stream
        const closeReader = async () => {
            try {
                await reader.cancel();
            }
            catch (ex) {
                // an error will throw if the reader hasn't been used yet
            }
            reader.releaseLock();
        };
        abortSignal?.addEventListener('abort', () => {
            closeReader();
        });
        const outputStream = new ReadableStream({
            start: (controller) => {
                const processStream = async () => {
                    while (!abortSignal?.aborted) {
                        try {
                            const { done, value } = await reader.read();
                            // When no more data needs to be consumed, close the stream
                            if (done) {
                                break;
                            }
                            // Enqueue the next data chunk into our target stream
                            controller.enqueue(value);
                        }
                        catch (ex) {
                            this.logger.error('Caught exception when reading sync stream', ex);
                            break;
                        }
                    }
                    if (!abortSignal?.aborted) {
                        // Close the downstream readable stream
                        await closeReader();
                    }
                    controller.close();
                };
                processStream();
            }
        });
        const jsonS = ndjsonStream$1(outputStream);
        const stream = new DataStream({
            logger: this.logger
        });
        const r = jsonS.getReader();
        const l = stream.registerListener({
            lowWater: async () => {
                try {
                    const { done, value } = await r.read();
                    // Exit if we're done
                    if (done) {
                        stream.close();
                        l?.();
                        return;
                    }
                    stream.enqueueData(value);
                }
                catch (ex) {
                    stream.close();
                    throw ex;
                }
            },
            closed: () => {
                closeReader();
                l?.();
            }
        });
        return stream;
    }
}

function isStreamingSyncData(line) {
    return line.data != null;
}
function isStreamingKeepalive(line) {
    return line.token_expires_in != null;
}
function isStreamingSyncCheckpoint(line) {
    return line.checkpoint != null;
}
function isStreamingSyncCheckpointComplete(line) {
    return line.checkpoint_complete != null;
}
function isStreamingSyncCheckpointDiff(line) {
    return line.checkpoint_diff != null;
}
function isContinueCheckpointRequest(request) {
    return (Array.isArray(request.buckets) &&
        typeof request.checkpoint_token == 'string');
}
function isSyncNewCheckpointRequest(request) {
    return typeof request.request_checkpoint == 'object';
}

var LockType;
(function (LockType) {
    LockType["CRUD"] = "crud";
    LockType["SYNC"] = "sync";
})(LockType || (LockType = {}));
var SyncStreamConnectionMethod;
(function (SyncStreamConnectionMethod) {
    SyncStreamConnectionMethod["HTTP"] = "http";
    SyncStreamConnectionMethod["WEB_SOCKET"] = "web-socket";
})(SyncStreamConnectionMethod || (SyncStreamConnectionMethod = {}));
const DEFAULT_CRUD_UPLOAD_THROTTLE_MS = 1000;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_STREAMING_SYNC_OPTIONS = {
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    logger: Logger.get('PowerSyncStream'),
    crudUploadThrottleMs: DEFAULT_CRUD_UPLOAD_THROTTLE_MS
};
const DEFAULT_STREAM_CONNECTION_OPTIONS = {
    connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET,
    fetchStrategy: FetchStrategy.Buffered,
    params: {}
};
class AbstractStreamingSyncImplementation extends BaseObserver {
    _lastSyncedAt;
    options;
    abortController;
    crudUpdateListener;
    streamingSyncPromise;
    syncStatus;
    triggerCrudUpload;
    constructor(options) {
        super();
        this.options = { ...DEFAULT_STREAMING_SYNC_OPTIONS, ...options };
        this.syncStatus = new SyncStatus({
            connected: false,
            connecting: false,
            lastSyncedAt: undefined,
            dataFlow: {
                uploading: false,
                downloading: false
            }
        });
        this.abortController = null;
        this.triggerCrudUpload = throttleLeadingTrailing(() => {
            if (!this.syncStatus.connected || this.syncStatus.dataFlowStatus.uploading) {
                return;
            }
            this._uploadAllCrud();
        }, this.options.crudUploadThrottleMs);
    }
    async waitForReady() { }
    waitForStatus(status) {
        return new Promise((resolve) => {
            const l = this.registerListener({
                statusChanged: (updatedStatus) => {
                    /**
                     * Match only the partial status options provided in the
                     * matching status
                     */
                    const matchPartialObject = (compA, compB) => {
                        return Object.entries(compA).every(([key, value]) => {
                            const comparisonBValue = compB[key];
                            if (typeof value == 'object' && typeof comparisonBValue == 'object') {
                                return matchPartialObject(value, comparisonBValue);
                            }
                            return value == comparisonBValue;
                        });
                    };
                    if (matchPartialObject(status, updatedStatus.toJSON())) {
                        resolve();
                        l?.();
                    }
                }
            });
        });
    }
    get lastSyncedAt() {
        const lastSynced = this.syncStatus.lastSyncedAt;
        return lastSynced && new Date(lastSynced);
    }
    get isConnected() {
        return this.syncStatus.connected;
    }
    get logger() {
        return this.options.logger;
    }
    async dispose() {
        this.crudUpdateListener?.();
        this.crudUpdateListener = undefined;
    }
    async hasCompletedSync() {
        return this.options.adapter.hasCompletedSync();
    }
    async getWriteCheckpoint() {
        const clientId = await this.options.adapter.getClientId();
        let path = `/write-checkpoint2.json?client_id=${clientId}`;
        const response = await this.options.remote.get(path);
        return response['data']['write_checkpoint'];
    }
    async _uploadAllCrud() {
        return this.obtainLock({
            type: LockType.CRUD,
            callback: async () => {
                /**
                 * Keep track of the first item in the CRUD queue for the last `uploadCrud` iteration.
                 */
                let checkedCrudItem;
                while (true) {
                    this.updateSyncStatus({
                        dataFlow: {
                            uploading: true
                        }
                    });
                    try {
                        /**
                         * This is the first item in the FIFO CRUD queue.
                         */
                        const nextCrudItem = await this.options.adapter.nextCrudItem();
                        if (nextCrudItem) {
                            if (nextCrudItem.clientId == checkedCrudItem?.clientId) {
                                // This will force a higher log level than exceptions which are caught here.
                                this.logger.warn(`Potentially previously uploaded CRUD entries are still present in the upload queue.
Make sure to handle uploads and complete CRUD transactions or batches by calling and awaiting their [.complete()] method.
The next upload iteration will be delayed.`);
                                throw new Error('Delaying due to previously encountered CRUD item.');
                            }
                            checkedCrudItem = nextCrudItem;
                            await this.options.uploadCrud();
                        }
                        else {
                            // Uploading is completed
                            await this.options.adapter.updateLocalTarget(() => this.getWriteCheckpoint());
                            break;
                        }
                    }
                    catch (ex) {
                        checkedCrudItem = undefined;
                        this.updateSyncStatus({
                            dataFlow: {
                                uploading: false
                            }
                        });
                        await this.delayRetry();
                        if (!this.isConnected) {
                            // Exit the upload loop if the sync stream is no longer connected
                            break;
                        }
                        this.logger.debug(`Caught exception when uploading. Upload will retry after a delay. Exception: ${ex.message}`);
                    }
                    finally {
                        this.updateSyncStatus({
                            dataFlow: {
                                uploading: false
                            }
                        });
                    }
                }
            }
        });
    }
    async connect(options) {
        if (this.abortController) {
            await this.disconnect();
        }
        this.abortController = new AbortController();
        this.streamingSyncPromise = this.streamingSync(this.abortController.signal, options);
        // Return a promise that resolves when the connection status is updated
        return new Promise((resolve) => {
            const l = this.registerListener({
                statusUpdated: (update) => {
                    // This is triggered as soon as a connection is read from
                    if (typeof update.connected == 'undefined') {
                        // only concern with connection updates
                        return;
                    }
                    if (update.connected == false) {
                        /**
                         * This function does not reject if initial connect attempt failed
                         */
                        this.logger.warn('Initial connect attempt did not successfully connect to server');
                    }
                    resolve();
                    l();
                }
            });
        });
    }
    async disconnect() {
        if (!this.abortController) {
            return;
        }
        // This might be called multiple times
        if (!this.abortController.signal.aborted) {
            this.abortController.abort(new AbortOperation('Disconnect has been requested'));
        }
        // Await any pending operations before completing the disconnect operation
        try {
            await this.streamingSyncPromise;
        }
        catch (ex) {
            // The operation might have failed, all we care about is if it has completed
            this.logger.warn(ex);
        }
        this.streamingSyncPromise = undefined;
        this.abortController = null;
        this.updateSyncStatus({ connected: false, connecting: false });
    }
    /**
     * @deprecated use [connect instead]
     */
    async streamingSync(signal, options) {
        if (!signal) {
            this.abortController = new AbortController();
            signal = this.abortController.signal;
        }
        /**
         * Listen for CRUD updates and trigger upstream uploads
         */
        this.crudUpdateListener = this.options.adapter.registerListener({
            crudUpdate: () => this.triggerCrudUpload()
        });
        /**
         * Create a new abort controller which aborts items downstream.
         * This is needed to close any previous connections on exception.
         */
        let nestedAbortController = new AbortController();
        signal.addEventListener('abort', () => {
            /**
             * A request for disconnect was received upstream. Relay the request
             * to the nested abort controller.
             */
            nestedAbortController.abort(signal?.reason ?? new AbortOperation('Received command to disconnect from upstream'));
            this.crudUpdateListener?.();
            this.crudUpdateListener = undefined;
            this.updateSyncStatus({
                connected: false,
                connecting: false,
                dataFlow: {
                    downloading: false
                }
            });
        });
        /**
         * This loops runs until [retry] is false or the abort signal is set to aborted.
         * Aborting the nestedAbortController will:
         *  - Abort any pending fetch requests
         *  - Close any sync stream ReadableStreams (which will also close any established network requests)
         */
        while (true) {
            this.updateSyncStatus({ connecting: true });
            try {
                if (signal?.aborted) {
                    break;
                }
                const { retry } = await this.streamingSyncIteration(nestedAbortController.signal, options);
                if (!retry) {
                    /**
                     * A sync error ocurred that we cannot recover from here.
                     * This loop must terminate.
                     * The nestedAbortController will close any open network requests and streams below.
                     */
                    break;
                }
                // Continue immediately
            }
            catch (ex) {
                /**
                 * Either:
                 *  - A network request failed with a failed connection or not OKAY response code.
                 *  - There was a sync processing error.
                 * This loop will retry.
                 * The nested abort controller will cleanup any open network requests and streams.
                 * The WebRemote should only abort pending fetch requests or close active Readable streams.
                 */
                if (ex instanceof AbortOperation) {
                    this.logger.warn(ex);
                }
                else {
                    this.logger.error(ex);
                }
                // On error, wait a little before retrying
                await this.delayRetry();
            }
            finally {
                if (!signal.aborted) {
                    nestedAbortController.abort(new AbortOperation('Closing sync stream network requests before retry.'));
                    nestedAbortController = new AbortController();
                }
                this.updateSyncStatus({
                    connected: false,
                    connecting: true // May be unnecessary
                });
            }
        }
        // Mark as disconnected if here
        this.updateSyncStatus({ connected: false, connecting: false });
    }
    async streamingSyncIteration(signal, options) {
        return await this.obtainLock({
            type: LockType.SYNC,
            signal,
            callback: async () => {
                const resolvedOptions = {
                    ...DEFAULT_STREAM_CONNECTION_OPTIONS,
                    ...(options ?? {})
                };
                this.logger.debug('Streaming sync iteration started');
                this.options.adapter.startSession();
                const bucketEntries = await this.options.adapter.getBucketStates();
                const initialBuckets = new Map();
                bucketEntries.forEach((entry) => {
                    initialBuckets.set(entry.bucket, entry.op_id);
                });
                const req = Array.from(initialBuckets.entries()).map(([bucket, after]) => ({
                    name: bucket,
                    after: after
                }));
                // These are compared by reference
                let targetCheckpoint = null;
                let validatedCheckpoint = null;
                let appliedCheckpoint = null;
                let bucketSet = new Set(initialBuckets.keys());
                const clientId = await this.options.adapter.getClientId();
                this.logger.debug('Requesting stream from server');
                const syncOptions = {
                    path: '/sync/stream',
                    abortSignal: signal,
                    data: {
                        buckets: req,
                        include_checksum: true,
                        raw_data: true,
                        parameters: resolvedOptions.params,
                        client_id: clientId
                    }
                };
                let stream;
                if (resolvedOptions?.connectionMethod == SyncStreamConnectionMethod.HTTP) {
                    stream = await this.options.remote.postStream(syncOptions);
                }
                else {
                    stream = await this.options.remote.socketStream({
                        ...syncOptions,
                        ...{ fetchStrategy: resolvedOptions.fetchStrategy }
                    });
                }
                this.logger.debug('Stream established. Processing events');
                while (!stream.closed) {
                    const line = await stream.read();
                    if (!line) {
                        // The stream has closed while waiting
                        return { retry: true };
                    }
                    // A connection is active and messages are being received
                    if (!this.syncStatus.connected) {
                        // There is a connection now
                        Promise.resolve().then(() => this.triggerCrudUpload());
                        this.updateSyncStatus({
                            connected: true
                        });
                    }
                    if (isStreamingSyncCheckpoint(line)) {
                        targetCheckpoint = line.checkpoint;
                        const bucketsToDelete = new Set(bucketSet);
                        const newBuckets = new Set();
                        for (const checksum of line.checkpoint.buckets) {
                            newBuckets.add(checksum.bucket);
                            bucketsToDelete.delete(checksum.bucket);
                        }
                        if (bucketsToDelete.size > 0) {
                            this.logger.debug('Removing buckets', [...bucketsToDelete]);
                        }
                        bucketSet = newBuckets;
                        await this.options.adapter.removeBuckets([...bucketsToDelete]);
                        await this.options.adapter.setTargetCheckpoint(targetCheckpoint);
                    }
                    else if (isStreamingSyncCheckpointComplete(line)) {
                        this.logger.debug('Checkpoint complete', targetCheckpoint);
                        const result = await this.options.adapter.syncLocalDatabase(targetCheckpoint);
                        if (!result.checkpointValid) {
                            // This means checksums failed. Start again with a new checkpoint.
                            // TODO: better back-off
                            await new Promise((resolve) => setTimeout(resolve, 50));
                            return { retry: true };
                        }
                        else if (!result.ready) ;
                        else {
                            appliedCheckpoint = targetCheckpoint;
                            this.logger.debug('validated checkpoint', appliedCheckpoint);
                            this.updateSyncStatus({
                                connected: true,
                                lastSyncedAt: new Date(),
                                dataFlow: {
                                    downloading: false
                                }
                            });
                        }
                        validatedCheckpoint = targetCheckpoint;
                    }
                    else if (isStreamingSyncCheckpointDiff(line)) {
                        // TODO: It may be faster to just keep track of the diff, instead of the entire checkpoint
                        if (targetCheckpoint == null) {
                            throw new Error('Checkpoint diff without previous checkpoint');
                        }
                        const diff = line.checkpoint_diff;
                        const newBuckets = new Map();
                        for (const checksum of targetCheckpoint.buckets) {
                            newBuckets.set(checksum.bucket, checksum);
                        }
                        for (const checksum of diff.updated_buckets) {
                            newBuckets.set(checksum.bucket, checksum);
                        }
                        for (const bucket of diff.removed_buckets) {
                            newBuckets.delete(bucket);
                        }
                        const newCheckpoint = {
                            last_op_id: diff.last_op_id,
                            buckets: [...newBuckets.values()],
                            write_checkpoint: diff.write_checkpoint
                        };
                        targetCheckpoint = newCheckpoint;
                        bucketSet = new Set(newBuckets.keys());
                        const bucketsToDelete = diff.removed_buckets;
                        if (bucketsToDelete.length > 0) {
                            this.logger.debug('Remove buckets', bucketsToDelete);
                        }
                        await this.options.adapter.removeBuckets(bucketsToDelete);
                        await this.options.adapter.setTargetCheckpoint(targetCheckpoint);
                    }
                    else if (isStreamingSyncData(line)) {
                        const { data } = line;
                        this.updateSyncStatus({
                            dataFlow: {
                                downloading: true
                            }
                        });
                        await this.options.adapter.saveSyncData({ buckets: [SyncDataBucket.fromRow(data)] });
                    }
                    else if (isStreamingKeepalive(line)) {
                        const remaining_seconds = line.token_expires_in;
                        if (remaining_seconds == 0) {
                            // Connection would be closed automatically right after this
                            this.logger.debug('Token expiring; reconnect');
                            /**
                             * For a rare case where the backend connector does not update the token
                             * (uses the same one), this should have some delay.
                             */
                            await this.delayRetry();
                            return { retry: true };
                        }
                        this.triggerCrudUpload();
                    }
                    else {
                        this.logger.debug('Sync complete');
                        if (targetCheckpoint === appliedCheckpoint) {
                            this.updateSyncStatus({
                                connected: true,
                                lastSyncedAt: new Date()
                            });
                        }
                        else if (validatedCheckpoint === targetCheckpoint) {
                            const result = await this.options.adapter.syncLocalDatabase(targetCheckpoint);
                            if (!result.checkpointValid) {
                                // This means checksums failed. Start again with a new checkpoint.
                                // TODO: better back-off
                                await new Promise((resolve) => setTimeout(resolve, 50));
                                return { retry: false };
                            }
                            else if (!result.ready) ;
                            else {
                                appliedCheckpoint = targetCheckpoint;
                                this.updateSyncStatus({
                                    connected: true,
                                    lastSyncedAt: new Date(),
                                    dataFlow: {
                                        downloading: false
                                    }
                                });
                            }
                        }
                    }
                }
                this.logger.debug('Stream input empty');
                // Connection closed. Likely due to auth issue.
                return { retry: true };
            }
        });
    }
    updateSyncStatus(options) {
        const updatedStatus = new SyncStatus({
            connected: options.connected ?? this.syncStatus.connected,
            connecting: !options.connected && (options.connecting ?? this.syncStatus.connecting),
            lastSyncedAt: options.lastSyncedAt ?? this.syncStatus.lastSyncedAt,
            dataFlow: {
                ...this.syncStatus.dataFlowStatus,
                ...options.dataFlow
            }
        });
        if (!this.syncStatus.isEqual(updatedStatus)) {
            this.syncStatus = updatedStatus;
            // Only trigger this is there was a change
            this.iterateListeners((cb) => cb.statusChanged?.(updatedStatus));
        }
        // trigger this for all updates
        this.iterateListeners((cb) => cb.statusUpdated?.(options));
    }
    async delayRetry() {
        return new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs));
    }
}

function runOnSchemaChange(callback, db, options) {
    const triggerWatchedQuery = () => {
        const abortController = new AbortController();
        let disposeSchemaListener = null;
        const stopWatching = () => {
            abortController.abort('Abort triggered');
            disposeSchemaListener?.();
            disposeSchemaListener = null;
            // Stop listening to upstream abort for this watch
            options?.signal?.removeEventListener('abort', stopWatching);
        };
        options?.signal?.addEventListener('abort', stopWatching);
        disposeSchemaListener = db.registerListener({
            schemaChanged: async () => {
                stopWatching();
                // Re trigger the watched query (recursively), setTimeout ensures that we don't modify the list of listeners while iterating through them
                setTimeout(() => triggerWatchedQuery(), 0);
            }
        });
        callback(abortController.signal);
    };
    triggerWatchedQuery();
}

const POWERSYNC_TABLE_MATCH = /(^ps_data__|^ps_data_local__)/;
const DEFAULT_DISCONNECT_CLEAR_OPTIONS = {
    clearLocal: true
};
const DEFAULT_POWERSYNC_CLOSE_OPTIONS = {
    disconnect: true
};
const DEFAULT_WATCH_THROTTLE_MS = 30;
const DEFAULT_POWERSYNC_DB_OPTIONS = {
    retryDelayMs: 5000,
    logger: Logger.get('PowerSyncDatabase'),
    crudUploadThrottleMs: DEFAULT_CRUD_UPLOAD_THROTTLE_MS
};
const DEFAULT_CRUD_BATCH_LIMIT = 100;
/**
 * Requesting nested or recursive locks can block the application in some circumstances.
 * This default lock timeout will act as a failsafe to throw an error if a lock cannot
 * be obtained.
 */
const DEFAULT_LOCK_TIMEOUT_MS = 120_000; // 2 mins
/**
 * Tests if the input is a {@link PowerSyncDatabaseOptionsWithSettings}
 * @internal
 */
const isPowerSyncDatabaseOptionsWithSettings = (test) => {
    return typeof test == 'object' && isSQLOpenOptions(test.database);
};
class AbstractPowerSyncDatabase extends BaseObserver {
    options;
    /**
     * Transactions should be queued in the DBAdapter, but we also want to prevent
     * calls to `.execute` while an async transaction is running.
     */
    static transactionMutex = new Mutex();
    /**
     * Returns true if the connection is closed.
     */
    closed;
    ready;
    /**
     * Current connection status.
     */
    currentStatus;
    syncStreamImplementation;
    sdkVersion;
    bucketStorageAdapter;
    syncStatusListenerDisposer;
    _isReadyPromise;
    _schema;
    _database;
    constructor(options) {
        super();
        this.options = options;
        const { database, schema } = options;
        if (typeof schema?.toJSON != 'function') {
            throw new Error('The `schema` option should be provided and should be an instance of `Schema`.');
        }
        if (isDBAdapter(database)) {
            this._database = database;
        }
        else if (isSQLOpenFactory(database)) {
            this._database = database.openDB();
        }
        else if (isPowerSyncDatabaseOptionsWithSettings(options)) {
            this._database = this.openDBAdapter(options);
        }
        else {
            throw new Error('The provided `database` option is invalid.');
        }
        this.bucketStorageAdapter = this.generateBucketStorageAdapter();
        this.closed = false;
        this.currentStatus = new SyncStatus({});
        this.options = { ...DEFAULT_POWERSYNC_DB_OPTIONS, ...options };
        this._schema = schema;
        this.ready = false;
        this.sdkVersion = '';
        // Start async init
        this._isReadyPromise = this.initialize();
    }
    /**
     * Schema used for the local database.
     */
    get schema() {
        return this._schema;
    }
    /**
     * The underlying database.
     *
     * For the most part, behavior is the same whether querying on the underlying database, or on {@link AbstractPowerSyncDatabase}.
     */
    get database() {
        return this._database;
    }
    /**
     * Whether a connection to the PowerSync service is currently open.
     */
    get connected() {
        return this.currentStatus?.connected || false;
    }
    get connecting() {
        return this.currentStatus?.connecting || false;
    }
    /**
     * @returns A promise which will resolve once initialization is completed.
     */
    async waitForReady() {
        if (this.ready) {
            return;
        }
        await this._isReadyPromise;
    }
    /**
     * @returns A promise which will resolve once the first full sync has completed.
     */
    async waitForFirstSync(signal) {
        if (this.currentStatus.hasSynced) {
            return;
        }
        return new Promise((resolve) => {
            const dispose = this.registerListener({
                statusChanged: (status) => {
                    if (status.hasSynced) {
                        dispose();
                        resolve();
                    }
                }
            });
            signal?.addEventListener('abort', () => {
                dispose();
                resolve();
            });
        });
    }
    /**
     * Entry point for executing initialization logic.
     * This is to be automatically executed in the constructor.
     */
    async initialize() {
        await this._initialize();
        await this.bucketStorageAdapter.init();
        await this._loadVersion();
        await this.updateSchema(this.options.schema);
        await this.updateHasSynced();
        await this.database.execute('PRAGMA RECURSIVE_TRIGGERS=TRUE');
        this.ready = true;
        this.iterateListeners((cb) => cb.initialized?.());
    }
    async _loadVersion() {
        try {
            const { version } = await this.database.get('SELECT powersync_rs_version() as version');
            this.sdkVersion = version;
        }
        catch (e) {
            throw new Error(`The powersync extension is not loaded correctly. Details: ${e.message}`);
        }
        let versionInts;
        try {
            versionInts = this.sdkVersion.split(/[.\/]/)
                .slice(0, 3)
                .map((n) => parseInt(n));
        }
        catch (e) {
            throw new Error(`Unsupported powersync extension version. Need >=0.2.0 <1.0.0, got: ${this.sdkVersion}. Details: ${e.message}`);
        }
        // Validate >=0.2.0 <1.0.0
        if (versionInts[0] != 0 || versionInts[1] < 2 || versionInts[2] < 0) {
            throw new Error(`Unsupported powersync extension version. Need >=0.2.0 <1.0.0, got: ${this.sdkVersion}`);
        }
    }
    async updateHasSynced() {
        const result = await this.database.get('SELECT powersync_last_synced_at() as synced_at');
        const hasSynced = result.synced_at != null;
        const syncedAt = result.synced_at != null ? new Date(result.synced_at + 'Z') : undefined;
        if (hasSynced != this.currentStatus.hasSynced) {
            this.currentStatus = new SyncStatus({ ...this.currentStatus.toJSON(), hasSynced, lastSyncedAt: syncedAt });
            this.iterateListeners((l) => l.statusChanged?.(this.currentStatus));
        }
    }
    /**
     * Replace the schema with a new version. This is for advanced use cases - typically the schema should just be specified once in the constructor.
     *
     * Cannot be used while connected - this should only be called before {@link AbstractPowerSyncDatabase.connect}.
     */
    async updateSchema(schema) {
        if (this.syncStreamImplementation) {
            throw new Error('Cannot update schema while connected');
        }
        /**
         * TODO
         * Validations only show a warning for now.
         * The next major release should throw an exception.
         */
        try {
            schema.validate();
        }
        catch (ex) {
            this.options.logger?.warn('Schema validation failed. Unexpected behaviour could occur', ex);
        }
        this._schema = schema;
        await this.database.execute('SELECT powersync_replace_schema(?)', [JSON.stringify(this.schema.toJSON())]);
        await this.database.refreshSchema();
        this.iterateListeners(async (cb) => cb.schemaChanged?.(schema));
    }
    /**
     * Wait for initialization to complete.
     * While initializing is automatic, this helps to catch and report initialization errors.
     */
    async init() {
        return this.waitForReady();
    }
    // Use the options passed in during connect, or fallback to the options set during database creation or fallback to the default options
    resolvedConnectionOptions(options) {
        return {
            retryDelayMs: options?.retryDelayMs ?? this.options.retryDelayMs ?? this.options.retryDelay ?? DEFAULT_RETRY_DELAY_MS,
            crudUploadThrottleMs: options?.crudUploadThrottleMs ?? this.options.crudUploadThrottleMs ?? DEFAULT_CRUD_UPLOAD_THROTTLE_MS
        };
    }
    /**
     * Connects to stream of events from the PowerSync instance.
     */
    async connect(connector, options) {
        await this.waitForReady();
        // close connection if one is open
        await this.disconnect();
        if (this.closed) {
            throw new Error('Cannot connect using a closed client');
        }
        const { retryDelayMs, crudUploadThrottleMs } = this.resolvedConnectionOptions(options);
        this.syncStreamImplementation = this.generateSyncStreamImplementation(connector, {
            retryDelayMs,
            crudUploadThrottleMs,
        });
        this.syncStatusListenerDisposer = this.syncStreamImplementation.registerListener({
            statusChanged: (status) => {
                this.currentStatus = new SyncStatus({
                    ...status.toJSON(),
                    hasSynced: this.currentStatus?.hasSynced || !!status.lastSyncedAt
                });
                this.iterateListeners((cb) => cb.statusChanged?.(this.currentStatus));
            }
        });
        await this.syncStreamImplementation.waitForReady();
        this.syncStreamImplementation.triggerCrudUpload();
        await this.syncStreamImplementation.connect(options);
    }
    /**
     * Close the sync connection.
     *
     * Use {@link connect} to connect again.
     */
    async disconnect() {
        await this.waitForReady();
        await this.syncStreamImplementation?.disconnect();
        this.syncStatusListenerDisposer?.();
        await this.syncStreamImplementation?.dispose();
        this.syncStreamImplementation = undefined;
    }
    /**
     *  Disconnect and clear the database.
     *  Use this when logging out.
     *  The database can still be queried after this is called, but the tables
     *  would be empty.
     *
     * To preserve data in local-only tables, set clearLocal to false.
     */
    async disconnectAndClear(options = DEFAULT_DISCONNECT_CLEAR_OPTIONS) {
        await this.disconnect();
        await this.waitForReady();
        const { clearLocal } = options;
        // TODO DB name, verify this is necessary with extension
        await this.database.writeTransaction(async (tx) => {
            await tx.execute('SELECT powersync_clear(?)', [clearLocal ? 1 : 0]);
        });
        // The data has been deleted - reset the sync status
        this.currentStatus = new SyncStatus({});
        this.iterateListeners((l) => l.statusChanged?.(this.currentStatus));
    }
    /**
     * Close the database, releasing resources.
     *
     * Also disconnects any active connection.
     *
     * Once close is called, this connection cannot be used again - a new one
     * must be constructed.
     */
    async close(options = DEFAULT_POWERSYNC_CLOSE_OPTIONS) {
        await this.waitForReady();
        const { disconnect } = options;
        if (disconnect) {
            await this.disconnect();
        }
        await this.syncStreamImplementation?.dispose();
        this.database.close();
        this.closed = true;
    }
    /**
     * Get upload queue size estimate and count.
     */
    async getUploadQueueStats(includeSize) {
        return this.readTransaction(async (tx) => {
            if (includeSize) {
                const result = await tx.execute(`SELECT SUM(cast(data as blob) + 20) as size, count(*) as count FROM ${PSInternalTable.CRUD}`);
                const row = result.rows.item(0);
                return new UploadQueueStats(row?.count ?? 0, row?.size ?? 0);
            }
            else {
                const result = await tx.execute(`SELECT count(*) as count FROM ${PSInternalTable.CRUD}`);
                const row = result.rows.item(0);
                return new UploadQueueStats(row?.count ?? 0);
            }
        });
    }
    /**
     * Get a batch of crud data to upload.
     *
     * Returns null if there is no data to upload.
     *
     * Use this from the {@link PowerSyncBackendConnector.uploadData} callback.
     *
     * Once the data have been successfully uploaded, call {@link CrudBatch.complete} before
     * requesting the next batch.
     *
     * Use {@link limit} to specify the maximum number of updates to return in a single
     * batch.
     *
     * This method does include transaction ids in the result, but does not group
     * data by transaction. One batch may contain data from multiple transactions,
     * and a single transaction may be split over multiple batches.
     */
    async getCrudBatch(limit = DEFAULT_CRUD_BATCH_LIMIT) {
        const result = await this.getAll(`SELECT id, tx_id, data FROM ${PSInternalTable.CRUD} ORDER BY id ASC LIMIT ?`, [limit + 1]);
        const all = result.map((row) => CrudEntry.fromRow(row)) ?? [];
        let haveMore = false;
        if (all.length > limit) {
            all.pop();
            haveMore = true;
        }
        if (all.length == 0) {
            return null;
        }
        const last = all[all.length - 1];
        return new CrudBatch(all, haveMore, async (writeCheckpoint) => this.handleCrudCheckpoint(last.clientId, writeCheckpoint));
    }
    /**
     * Get the next recorded transaction to upload.
     *
     * Returns null if there is no data to upload.
     *
     * Use this from the {@link PowerSyncBackendConnector.uploadData} callback.
     *
     * Once the data have been successfully uploaded, call {@link CrudTransaction.complete} before
     * requesting the next transaction.
     *
     * Unlike {@link getCrudBatch}, this only returns data from a single transaction at a time.
     * All data for the transaction is loaded into memory.
     */
    async getNextCrudTransaction() {
        return await this.readTransaction(async (tx) => {
            const first = await tx.getOptional(`SELECT id, tx_id, data FROM ${PSInternalTable.CRUD} ORDER BY id ASC LIMIT 1`);
            if (!first) {
                return null;
            }
            const txId = first.tx_id;
            let all;
            if (!txId) {
                all = [CrudEntry.fromRow(first)];
            }
            else {
                const result = await tx.getAll(`SELECT id, tx_id, data FROM ${PSInternalTable.CRUD} WHERE tx_id = ? ORDER BY id ASC`, [txId]);
                all = result.map((row) => CrudEntry.fromRow(row));
            }
            const last = all[all.length - 1];
            return new CrudTransaction(all, async (writeCheckpoint) => this.handleCrudCheckpoint(last.clientId, writeCheckpoint), txId);
        });
    }
    /**
     * Get an unique client id for this database.
     *
     * The id is not reset when the database is cleared, only when the database is deleted.
     */
    async getClientId() {
        return this.bucketStorageAdapter.getClientId();
    }
    async handleCrudCheckpoint(lastClientId, writeCheckpoint) {
        return this.writeTransaction(async (tx) => {
            await tx.execute(`DELETE FROM ${PSInternalTable.CRUD} WHERE id <= ?`, [lastClientId]);
            if (writeCheckpoint) {
                const check = await tx.execute(`SELECT 1 FROM ${PSInternalTable.CRUD} LIMIT 1`);
                if (!check.rows?.length) {
                    await tx.execute(`UPDATE ${PSInternalTable.BUCKETS} SET target_op = CAST(? as INTEGER) WHERE name='$local'`, [
                        writeCheckpoint
                    ]);
                }
            }
            else {
                await tx.execute(`UPDATE ${PSInternalTable.BUCKETS} SET target_op = CAST(? as INTEGER) WHERE name='$local'`, [
                    this.bucketStorageAdapter.getMaxOpId()
                ]);
            }
        });
    }
    /**
     * Execute a write (INSERT/UPDATE/DELETE) query
     * and optionally return results.
     */
    async execute(sql, parameters) {
        await this.waitForReady();
        return this.database.execute(sql, parameters);
    }
    /**
     * Execute a write query (INSERT/UPDATE/DELETE) multiple times with each parameter set
     * and optionally return results.
     * This is faster than executing separately with each parameter set.
     */
    async executeBatch(sql, parameters) {
        await this.waitForReady();
        return this.database.executeBatch(sql, parameters);
    }
    /**
     *  Execute a read-only query and return results.
     */
    async getAll(sql, parameters) {
        await this.waitForReady();
        return this.database.getAll(sql, parameters);
    }
    /**
     * Execute a read-only query and return the first result, or null if the ResultSet is empty.
     */
    async getOptional(sql, parameters) {
        await this.waitForReady();
        return this.database.getOptional(sql, parameters);
    }
    /**
     * Execute a read-only query and return the first result, error if the ResultSet is empty.
     */
    async get(sql, parameters) {
        await this.waitForReady();
        return this.database.get(sql, parameters);
    }
    /**
     * Takes a read lock, without starting a transaction.
     * In most cases, {@link readTransaction} should be used instead.
     */
    async readLock(callback) {
        await this.waitForReady();
        return mutexRunExclusive(AbstractPowerSyncDatabase.transactionMutex, () => callback(this.database));
    }
    /**
     * Takes a global lock, without starting a transaction.
     * In most cases, {@link writeTransaction} should be used instead.
     */
    async writeLock(callback) {
        await this.waitForReady();
        return mutexRunExclusive(AbstractPowerSyncDatabase.transactionMutex, async () => {
            const res = await callback(this.database);
            return res;
        });
    }
    /**
     * Open a read-only transaction.
     * Read transactions can run concurrently to a write transaction.
     * Changes from any write transaction are not visible to read transactions started before it.
     */
    async readTransaction(callback, lockTimeout = DEFAULT_LOCK_TIMEOUT_MS) {
        await this.waitForReady();
        return this.database.readTransaction(async (tx) => {
            const res = await callback({ ...tx });
            await tx.rollback();
            return res;
        }, { timeoutMs: lockTimeout });
    }
    /**
     * Open a read-write transaction.
     * This takes a global lock - only one write transaction can execute against the database at a time.
     * Statements within the transaction must be done on the provided {@link Transaction} interface.
     */
    async writeTransaction(callback, lockTimeout = DEFAULT_LOCK_TIMEOUT_MS) {
        await this.waitForReady();
        return this.database.writeTransaction(async (tx) => {
            const res = await callback(tx);
            await tx.commit();
            return res;
        }, { timeoutMs: lockTimeout });
    }
    watch(sql, parameters, handlerOrOptions, maybeOptions) {
        if (handlerOrOptions && typeof handlerOrOptions === 'object' && 'onResult' in handlerOrOptions) {
            const handler = handlerOrOptions;
            const options = maybeOptions;
            return this.watchWithCallback(sql, parameters, handler, options);
        }
        const options = handlerOrOptions;
        return this.watchWithAsyncGenerator(sql, parameters, options);
    }
    /**
     * Execute a read query every time the source tables are modified.
     * Use {@link SQLWatchOptions.throttleMs} to specify the minimum interval between queries.
     * Source tables are automatically detected using `EXPLAIN QUERY PLAN`.
     *
     * Note that the `onChange` callback member of the handler is required.
     */
    watchWithCallback(sql, parameters, handler, options) {
        const { onResult, onError = (e) => this.options.logger?.error(e) } = handler ?? {};
        if (!onResult) {
            throw new Error('onResult is required');
        }
        const watchQuery = async (abortSignal) => {
            try {
                const resolvedTables = await this.resolveTables(sql, parameters, options);
                // Fetch initial data
                const result = await this.executeReadOnly(sql, parameters);
                onResult(result);
                this.onChangeWithCallback({
                    onChange: async () => {
                        try {
                            const result = await this.executeReadOnly(sql, parameters);
                            onResult(result);
                        }
                        catch (error) {
                            onError?.(error);
                        }
                    },
                    onError
                }, {
                    ...(options ?? {}),
                    tables: resolvedTables,
                    // Override the abort signal since we intercept it
                    signal: abortSignal
                });
            }
            catch (error) {
                onError?.(error);
            }
        };
        runOnSchemaChange(watchQuery, this, options);
    }
    /**
     * Execute a read query every time the source tables are modified.
     * Use {@link SQLWatchOptions.throttleMs} to specify the minimum interval between queries.
     * Source tables are automatically detected using `EXPLAIN QUERY PLAN`.
     */
    watchWithAsyncGenerator(sql, parameters, options) {
        return new EventIterator((eventOptions) => {
            const handler = {
                onResult: (result) => {
                    eventOptions.push(result);
                },
                onError: (error) => {
                    eventOptions.fail(error);
                }
            };
            this.watchWithCallback(sql, parameters, handler, options);
            options?.signal?.addEventListener('abort', () => {
                eventOptions.stop();
            });
        });
    }
    async resolveTables(sql, parameters, options) {
        const resolvedTables = options?.tables ? [...options.tables] : [];
        if (!options?.tables) {
            const explained = await this.getAll(`EXPLAIN ${sql}`, parameters);
            const rootPages = explained
                .filter((row) => row.opcode == 'OpenRead' && row.p3 == 0 && typeof row.p2 == 'number')
                .map((row) => row.p2);
            const tables = await this.getAll(`SELECT DISTINCT tbl_name FROM sqlite_master WHERE rootpage IN (SELECT json_each.value FROM json_each(?))`, [JSON.stringify(rootPages)]);
            for (const table of tables) {
                resolvedTables.push(table.tbl_name.replace(POWERSYNC_TABLE_MATCH, ''));
            }
        }
        return resolvedTables;
    }
    onChange(handlerOrOptions, maybeOptions) {
        if (handlerOrOptions && typeof handlerOrOptions === 'object' && 'onChange' in handlerOrOptions) {
            const handler = handlerOrOptions;
            const options = maybeOptions;
            return this.onChangeWithCallback(handler, options);
        }
        const options = handlerOrOptions;
        return this.onChangeWithAsyncGenerator(options);
    }
    /**
     * Invoke the provided callback on any changes to any of the specified tables.
     *
     * This is preferred over {@link watchWithCallback} when multiple queries need to be performed
     * together when data is changed.
     *
     * Note that the `onChange` callback member of the handler is required.
     *
     * Returns dispose function to stop watching.
     */
    onChangeWithCallback(handler, options) {
        const { onChange, onError = (e) => this.options.logger?.error(e) } = handler ?? {};
        if (!onChange) {
            throw new Error('onChange is required');
        }
        const resolvedOptions = options ?? {};
        const watchedTables = new Set((resolvedOptions?.tables ?? []).flatMap((table) => [table, `ps_data__${table}`, `ps_data_local__${table}`]));
        const changedTables = new Set();
        const throttleMs = resolvedOptions.throttleMs ?? DEFAULT_WATCH_THROTTLE_MS;
        const executor = new ControlledExecutor(async (e) => {
            await onChange(e);
        });
        const flushTableUpdates = throttleTrailing(() => this.handleTableChanges(changedTables, watchedTables, (intersection) => {
            if (resolvedOptions?.signal?.aborted)
                return;
            executor.schedule({ changedTables: intersection });
        }), throttleMs);
        const dispose = this.database.registerListener({
            tablesUpdated: async (update) => {
                try {
                    this.processTableUpdates(update, changedTables);
                    flushTableUpdates();
                }
                catch (error) {
                    onError?.(error);
                }
            }
        });
        resolvedOptions.signal?.addEventListener('abort', () => {
            executor.dispose();
            dispose();
        });
        return () => dispose();
    }
    /**
     * Create a Stream of changes to any of the specified tables.
     *
     * This is preferred over {@link watchWithAsyncGenerator} when multiple queries need to be performed
     * together when data is changed.
     *
     * Note, do not declare this as `async *onChange` as it will not work in React Native
     */
    onChangeWithAsyncGenerator(options) {
        const resolvedOptions = options ?? {};
        return new EventIterator((eventOptions) => {
            const dispose = this.onChangeWithCallback({
                onChange: (event) => {
                    eventOptions.push(event);
                },
                onError: (error) => {
                    eventOptions.fail(error);
                }
            }, options);
            resolvedOptions.signal?.addEventListener('abort', () => {
                eventOptions.stop();
                // Maybe fail?
            });
            return () => dispose();
        });
    }
    handleTableChanges(changedTables, watchedTables, onDetectedChanges) {
        if (changedTables.size > 0) {
            const intersection = Array.from(changedTables.values()).filter((change) => watchedTables.has(change));
            if (intersection.length) {
                onDetectedChanges(intersection);
            }
        }
        changedTables.clear();
    }
    processTableUpdates(updateNotification, changedTables) {
        const tables = isBatchedUpdateNotification(updateNotification)
            ? updateNotification.tables
            : [updateNotification.table];
        for (const table of tables) {
            changedTables.add(table);
        }
    }
    /**
     * @ignore
     */
    async executeReadOnly(sql, params) {
        await this.waitForReady();
        return this.database.readLock((tx) => tx.execute(sql, params));
    }
}

class AbstractPowerSyncDatabaseOpenFactory {
    options;
    constructor(options) {
        this.options = options;
        options.logger = options.logger ?? Logger.get(`PowerSync ${this.options.dbFilename}`);
    }
    /**
     * Schema used for the local database.
     */
    get schema() {
        return this.options.schema;
    }
    generateOptions() {
        return {
            database: this.openDB(),
            ...this.options
        };
    }
    getInstance() {
        const options = this.generateOptions();
        return this.generateInstance(options);
    }
}

function compilableQueryWatch(db, query, handler, options) {
    const { onResult, onError = (e) => { } } = handler ?? {};
    if (!onResult) {
        throw new Error('onResult is required');
    }
    const watchQuery = async (abortSignal) => {
        try {
            const toSql = query.compile();
            const resolvedTables = await db.resolveTables(toSql.sql, toSql.parameters, options);
            // Fetch initial data
            const result = await query.execute();
            onResult(result);
            db.onChangeWithCallback({
                onChange: async () => {
                    try {
                        const result = await query.execute();
                        onResult(result);
                    }
                    catch (error) {
                        onError(error);
                    }
                },
                onError
            }, {
                ...(options ?? {}),
                tables: resolvedTables,
                // Override the abort signal since we intercept it
                signal: abortSignal
            });
        }
        catch (error) {
            onError(error);
        }
    };
    runOnSchemaChange(watchQuery, db, options);
}

const MAX_OP_ID = '9223372036854775807';

const COMPACT_OPERATION_INTERVAL = 1_000;
class SqliteBucketStorage extends BaseObserver {
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

// TODO JSON
class SyncDataBatch {
    buckets;
    static fromJSON(json) {
        return new SyncDataBatch(json.buckets.map((bucket) => SyncDataBucket.fromRow(bucket)));
    }
    constructor(buckets) {
        this.buckets = buckets;
    }
}

// https://www.sqlite.org/lang_expr.html#castexpr
var ColumnType;
(function (ColumnType) {
    ColumnType["TEXT"] = "TEXT";
    ColumnType["INTEGER"] = "INTEGER";
    ColumnType["REAL"] = "REAL";
})(ColumnType || (ColumnType = {}));
const text = {
    type: ColumnType.TEXT
};
const integer = {
    type: ColumnType.INTEGER
};
const real = {
    type: ColumnType.REAL
};
// powersync-sqlite-core limits the number of column per table to 1999, due to internal SQLite limits.
// In earlier versions this was limited to 63.
const MAX_AMOUNT_OF_COLUMNS = 1999;
const column = {
    text,
    integer,
    real
};
class Column {
    options;
    constructor(options) {
        this.options = options;
    }
    get name() {
        return this.options.name;
    }
    get type() {
        return this.options.type;
    }
    toJSON() {
        return {
            name: this.name,
            type: this.type
        };
    }
}

const DEFAULT_INDEX_COLUMN_OPTIONS = {
    ascending: true
};
class IndexedColumn {
    options;
    static createAscending(column) {
        return new IndexedColumn({
            name: column,
            ascending: true
        });
    }
    constructor(options) {
        this.options = { ...DEFAULT_INDEX_COLUMN_OPTIONS, ...options };
    }
    get name() {
        return this.options.name;
    }
    get ascending() {
        return this.options.ascending;
    }
    toJSON(table) {
        return {
            name: this.name,
            ascending: this.ascending,
            type: table.columns.find((column) => column.name === this.name)?.type ?? ColumnType.TEXT
        };
    }
}

const DEFAULT_INDEX_OPTIONS = {
    columns: []
};
class Index {
    options;
    static createAscending(options, columnNames) {
        return new Index({
            ...options,
            columns: columnNames.map((name) => IndexedColumn.createAscending(name))
        });
    }
    constructor(options) {
        this.options = options;
        this.options = { ...DEFAULT_INDEX_OPTIONS, ...options };
    }
    get name() {
        return this.options.name;
    }
    get columns() {
        return this.options.columns ?? [];
    }
    toJSON(table) {
        return {
            name: this.name,
            columns: this.columns.map((c) => c.toJSON(table))
        };
    }
}

const DEFAULT_TABLE_OPTIONS = {
    indexes: [],
    insertOnly: false,
    localOnly: false
};
const InvalidSQLCharacters = /["'%,.#\s[\]]/;
class Table {
    options;
    _mappedColumns;
    static createLocalOnly(options) {
        return new Table({ ...options, localOnly: true, insertOnly: false });
    }
    static createInsertOnly(options) {
        return new Table({ ...options, localOnly: false, insertOnly: true });
    }
    /**
     * Create a table.
     * @deprecated This was only only included for TableV2 and is no longer necessary.
     * Prefer to use new Table() directly.
     *
     * TODO remove in the next major release.
     */
    static createTable(name, table) {
        return new Table({
            name,
            columns: table.columns,
            indexes: table.indexes,
            localOnly: table.options.localOnly,
            insertOnly: table.options.insertOnly,
            viewName: table.options.viewName
        });
    }
    constructor(optionsOrColumns, v2Options) {
        if (this.isTableV1(optionsOrColumns)) {
            this.initTableV1(optionsOrColumns);
        }
        else {
            this.initTableV2(optionsOrColumns, v2Options);
        }
    }
    isTableV1(arg) {
        return 'columns' in arg && Array.isArray(arg.columns);
    }
    initTableV1(options) {
        this.options = {
            ...options,
            indexes: options.indexes || [],
            insertOnly: options.insertOnly ?? DEFAULT_TABLE_OPTIONS.insertOnly,
            localOnly: options.localOnly ?? DEFAULT_TABLE_OPTIONS.localOnly
        };
    }
    initTableV2(columns, options) {
        const convertedColumns = Object.entries(columns).map(([name, columnInfo]) => new Column({ name, type: columnInfo.type }));
        const convertedIndexes = Object.entries(options?.indexes ?? {}).map(([name, columnNames]) => new Index({
            name,
            columns: columnNames.map((name) => new IndexedColumn({
                name: name.replace(/^-/, ''),
                ascending: !name.startsWith('-')
            }))
        }));
        this.options = {
            name: '',
            columns: convertedColumns,
            indexes: convertedIndexes,
            insertOnly: options?.insertOnly ?? DEFAULT_TABLE_OPTIONS.insertOnly,
            localOnly: options?.localOnly ?? DEFAULT_TABLE_OPTIONS.localOnly,
            viewName: options?.viewName
        };
        this._mappedColumns = columns;
    }
    get name() {
        return this.options.name;
    }
    get viewNameOverride() {
        return this.options.viewName;
    }
    get viewName() {
        return this.viewNameOverride ?? this.name;
    }
    get columns() {
        return this.options.columns;
    }
    get columnMap() {
        return (this._mappedColumns ??
            this.columns.reduce((hash, column) => {
                hash[column.name] = { type: column.type ?? ColumnType.TEXT };
                return hash;
            }, {}));
    }
    get indexes() {
        return this.options.indexes ?? [];
    }
    get localOnly() {
        return this.options.localOnly ?? false;
    }
    get insertOnly() {
        return this.options.insertOnly ?? false;
    }
    get internalName() {
        if (this.options.localOnly) {
            return `ps_data_local__${this.name}`;
        }
        return `ps_data__${this.name}`;
    }
    get validName() {
        if (InvalidSQLCharacters.test(this.name)) {
            return false;
        }
        if (this.viewNameOverride != null && InvalidSQLCharacters.test(this.viewNameOverride)) {
            return false;
        }
        return true;
    }
    validate() {
        if (InvalidSQLCharacters.test(this.name)) {
            throw new Error(`Invalid characters in table name: ${this.name}`);
        }
        if (this.viewNameOverride && InvalidSQLCharacters.test(this.viewNameOverride)) {
            throw new Error(`Invalid characters in view name: ${this.viewNameOverride}`);
        }
        if (this.columns.length > MAX_AMOUNT_OF_COLUMNS) {
            throw new Error(`Table has too many columns. The maximum number of columns is ${MAX_AMOUNT_OF_COLUMNS}.`);
        }
        const columnNames = new Set();
        columnNames.add('id');
        for (const column of this.columns) {
            const { name: columnName } = column;
            if (column.name === 'id') {
                throw new Error(`An id column is automatically added, custom id columns are not supported`);
            }
            if (columnNames.has(columnName)) {
                throw new Error(`Duplicate column ${columnName}`);
            }
            if (InvalidSQLCharacters.test(columnName)) {
                throw new Error(`Invalid characters in column name: ${column.name}`);
            }
            columnNames.add(columnName);
        }
        const indexNames = new Set();
        for (const index of this.indexes) {
            if (indexNames.has(index.name)) {
                throw new Error(`Duplicate index ${index.name}`);
            }
            if (InvalidSQLCharacters.test(index.name)) {
                throw new Error(`Invalid characters in index name: ${index.name}`);
            }
            for (const column of index.columns) {
                if (!columnNames.has(column.name)) {
                    throw new Error(`Column ${column.name} not found for index ${index.name}`);
                }
            }
            indexNames.add(index.name);
        }
    }
    toJSON() {
        return {
            name: this.name,
            view_name: this.viewName,
            local_only: this.localOnly,
            insert_only: this.insertOnly,
            columns: this.columns.map((c) => c.toJSON()),
            indexes: this.indexes.map((e) => e.toJSON(this))
        };
    }
}

/**
 * A schema is a collection of tables. It is used to define the structure of a database.
 */
class Schema {
    /*
      Only available when constructing with mapped typed definition columns
    */
    types;
    props;
    tables;
    constructor(tables) {
        if (Array.isArray(tables)) {
            /*
              We need to validate that the tables have a name here because a user could pass in an array
              of Tables that don't have a name because they are using the V2 syntax.
              Therefore, 'convertToClassicTables' won't be called on the tables resulting in a runtime error.
            */
            for (const table of tables) {
                if (table.name === '') {
                    throw new Error("It appears you are trying to create a new Schema with an array instead of an object. Passing in an object instead of an array into 'new Schema()' may resolve your issue.");
                }
            }
            this.tables = tables;
        }
        else {
            this.props = tables;
            this.tables = this.convertToClassicTables(this.props);
        }
    }
    validate() {
        for (const table of this.tables) {
            table.validate();
        }
    }
    toJSON() {
        return {
            // This is required because "name" field is not present in TableV2
            tables: this.tables.map((t) => t.toJSON())
        };
    }
    convertToClassicTables(props) {
        return Object.entries(props).map(([name, table]) => {
            const convertedTable = new Table({
                name,
                columns: table.columns,
                indexes: table.indexes,
                localOnly: table.localOnly,
                insertOnly: table.insertOnly,
                viewName: table.viewNameOverride || name
            });
            return convertedTable;
        });
    }
}

/**
  Generate a new table from the columns and indexes
  @deprecated You should use {@link Table} instead as it now allows TableV2 syntax.
  This will be removed in the next major release.
*/
class TableV2 extends Table {
}

const parseQuery = (query, parameters) => {
    let sqlStatement;
    if (typeof query == 'string') {
        sqlStatement = query;
    }
    else {
        const hasAdditionalParameters = parameters.length > 0;
        if (hasAdditionalParameters) {
            throw new Error('You cannot pass parameters to a compiled query.');
        }
        const compiled = query.compile();
        sqlStatement = compiled.sql;
        parameters = compiled.parameters;
    }
    return { sqlStatement, parameters: parameters };
};

export { AbortOperation, AbstractPowerSyncDatabase, AbstractPowerSyncDatabaseOpenFactory, AbstractRemote, AbstractStreamingSyncImplementation, BaseObserver, Column, ColumnType, CrudBatch, CrudEntry, CrudTransaction, DEFAULT_CRUD_BATCH_LIMIT, DEFAULT_CRUD_UPLOAD_THROTTLE_MS, DEFAULT_INDEX_COLUMN_OPTIONS, DEFAULT_INDEX_OPTIONS, DEFAULT_LOCK_TIMEOUT_MS, DEFAULT_POWERSYNC_CLOSE_OPTIONS, DEFAULT_POWERSYNC_DB_OPTIONS, DEFAULT_PRESSURE_LIMITS, DEFAULT_REMOTE_LOGGER, DEFAULT_REMOTE_OPTIONS, DEFAULT_RETRY_DELAY_MS, DEFAULT_STREAMING_SYNC_OPTIONS, DEFAULT_STREAM_CONNECTION_OPTIONS, DEFAULT_TABLE_OPTIONS, DEFAULT_WATCH_THROTTLE_MS, DataStream, FetchImplementationProvider, FetchStrategy, Index, IndexedColumn, InvalidSQLCharacters, LockType, MAX_AMOUNT_OF_COLUMNS, MAX_OP_ID, OpType, OpTypeEnum, OplogEntry, PSInternalTable, RowUpdateType, Schema, SqliteBucketStorage, SyncDataBatch, SyncDataBucket, SyncStatus, SyncStreamConnectionMethod, Table, TableV2, UpdateType, UploadQueueStats, column, compilableQueryWatch, extractTableUpdates, isBatchedUpdateNotification, isContinueCheckpointRequest, isDBAdapter, isPowerSyncDatabaseOptionsWithSettings, isSQLOpenFactory, isSQLOpenOptions, isStreamingKeepalive, isStreamingSyncCheckpoint, isStreamingSyncCheckpointComplete, isStreamingSyncCheckpointDiff, isStreamingSyncData, isSyncNewCheckpointRequest, parseQuery, runOnSchemaChange };
//# sourceMappingURL=bundle.mjs.map
