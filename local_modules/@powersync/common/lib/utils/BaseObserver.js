export class BaseObserver {
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
