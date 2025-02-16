/**
 * Wrapper for async-mutex runExclusive, which allows for a timeout on each exclusive lock.
 */
export async function mutexRunExclusive(mutex, callback, options) {
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
