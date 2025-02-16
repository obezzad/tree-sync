import { Mutex } from 'async-mutex';
/**
 * Wrapper for async-mutex runExclusive, which allows for a timeout on each exclusive lock.
 */
export declare function mutexRunExclusive<T>(mutex: Mutex, callback: () => Promise<T>, options?: {
    timeoutMs: number;
}): Promise<T>;
