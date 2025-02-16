export interface Disposable {
    dispose: () => Promise<void>;
}
export interface BaseObserverInterface<T extends BaseListener> {
    registerListener(listener: Partial<T>): () => void;
}
export type BaseListener = {
    [key: string]: ((...event: any) => any) | undefined;
};
export declare class BaseObserver<T extends BaseListener = BaseListener> implements BaseObserverInterface<T> {
    protected listeners: Set<Partial<T>>;
    constructor();
    /**
     * Register a listener for updates to the PowerSync client.
     */
    registerListener(listener: Partial<T>): () => void;
    iterateListeners(cb: (listener: Partial<T>) => any): void;
    iterateAsyncListeners(cb: (listener: Partial<T>) => Promise<any>): Promise<void>;
}
