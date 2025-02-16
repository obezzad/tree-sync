import Logger from 'js-logger';
import { BaseObserver } from './BaseObserver.js';
export const DEFAULT_PRESSURE_LIMITS = {
    highWater: 10,
    lowWater: 0
};
/**
 * A very basic implementation of a data stream with backpressure support which does not use
 * native JS streams or async iterators.
 * This is handy for environments such as React Native which need polyfills for the above.
 */
export class DataStream extends BaseObserver {
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
