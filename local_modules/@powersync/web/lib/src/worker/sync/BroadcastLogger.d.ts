import { type ILogLevel, type ILogger } from 'js-logger';
import { type WrappedSyncPort } from './SharedSyncImplementation';
/**
 * Broadcasts logs to all clients
 */
export declare class BroadcastLogger implements ILogger {
    protected clients: WrappedSyncPort[];
    TRACE: ILogLevel;
    DEBUG: ILogLevel;
    INFO: ILogLevel;
    TIME: ILogLevel;
    WARN: ILogLevel;
    ERROR: ILogLevel;
    OFF: ILogLevel;
    constructor(clients: WrappedSyncPort[]);
    trace(...x: any[]): void;
    debug(...x: any[]): void;
    info(...x: any[]): void;
    log(...x: any[]): void;
    warn(...x: any[]): void;
    error(...x: any[]): void;
    time(label: string): void;
    timeEnd(label: string): void;
    setLevel(level: ILogLevel): void;
    getLevel(): ILogLevel;
    enabledFor(level: ILogLevel): boolean;
    /**
     * Iterates all clients, catches individual client exceptions
     * and proceeds to execute for all clients.
     */
    protected iterateClients(callback: (client: WrappedSyncPort) => Promise<void>): Promise<void>;
    /**
     * Guards against any logging errors.
     * We don't want a logging exception to cause further issues upstream
     */
    protected sanitizeArgs(x: any[]): any[];
}
