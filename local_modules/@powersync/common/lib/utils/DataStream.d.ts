import { ILogger } from 'js-logger';
import { BaseListener, BaseObserver } from './BaseObserver.js';
export type DataStreamOptions = {
    /**
     * Close the stream if any consumer throws an error
     */
    closeOnError?: boolean;
    pressure?: {
        highWaterMark?: number;
        lowWaterMark?: number;
    };
    logger?: ILogger;
};
export type DataStreamCallback<Data extends any = any> = (data: Data) => Promise<void>;
export interface DataStreamListener<Data extends any = any> extends BaseListener {
    data: (data: Data) => Promise<void>;
    closed: () => void;
    error: (error: Error) => void;
    highWater: () => Promise<void>;
    lowWater: () => Promise<void>;
}
export declare const DEFAULT_PRESSURE_LIMITS: {
    highWater: number;
    lowWater: number;
};
/**
 * A very basic implementation of a data stream with backpressure support which does not use
 * native JS streams or async iterators.
 * This is handy for environments such as React Native which need polyfills for the above.
 */
export declare class DataStream<Data extends any = any> extends BaseObserver<DataStreamListener<Data>> {
    protected options?: DataStreamOptions | undefined;
    dataQueue: Data[];
    protected isClosed: boolean;
    protected processingPromise: Promise<void> | null;
    protected logger: ILogger;
    constructor(options?: DataStreamOptions | undefined);
    get highWatermark(): number;
    get lowWatermark(): number;
    get closed(): boolean;
    close(): Promise<void>;
    /**
     * Enqueues data for the consumers to read
     */
    enqueueData(data: Data): void;
    /**
     * Reads data once from the data stream
     * @returns a Data payload or Null if the stream closed.
     */
    read(): Promise<Data | null>;
    /**
     * Executes a callback for each data item in the stream
     */
    forEach(callback: DataStreamCallback<Data>): () => void;
    protected processQueue(): Promise<void>;
    /**
     * Creates a new data stream which is a map of the original
     */
    map<ReturnData>(callback: (data: Data) => ReturnData): DataStream<ReturnData>;
    protected hasDataReader(): boolean;
    protected _processQueue(): Promise<void>;
    protected iterateAsyncErrored(cb: (l: BaseListener) => Promise<void>): Promise<void>;
}
