import Logger from 'js-logger';
/**
 * Broadcasts logs to all clients
 */
export class BroadcastLogger {
    clients;
    TRACE;
    DEBUG;
    INFO;
    TIME;
    WARN;
    ERROR;
    OFF;
    constructor(clients) {
        this.clients = clients;
        this.TRACE = Logger.TRACE;
        this.DEBUG = Logger.DEBUG;
        this.INFO = Logger.INFO;
        this.TIME = Logger.TIME;
        this.WARN = Logger.WARN;
        this.ERROR = Logger.ERROR;
        this.OFF = Logger.OFF;
    }
    trace(...x) {
        console.trace(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.trace(...sanitized));
    }
    debug(...x) {
        console.debug(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.debug(...sanitized));
    }
    info(...x) {
        console.info(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.info(...sanitized));
    }
    log(...x) {
        console.log(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.log(...sanitized));
    }
    warn(...x) {
        console.warn(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.warn(...sanitized));
    }
    error(...x) {
        console.error(...x);
        const sanitized = this.sanitizeArgs(x);
        this.iterateClients((client) => client.clientProvider.error(...sanitized));
    }
    time(label) {
        console.time(label);
        this.iterateClients((client) => client.clientProvider.time(label));
    }
    timeEnd(label) {
        console.timeEnd(label);
        this.iterateClients((client) => client.clientProvider.timeEnd(label));
    }
    setLevel(level) {
        // Levels are not adjustable on this level.
    }
    getLevel() {
        // Levels are not adjustable on this level.
        return Logger.INFO;
    }
    enabledFor(level) {
        // Levels are not adjustable on this level.
        return true;
    }
    /**
     * Iterates all clients, catches individual client exceptions
     * and proceeds to execute for all clients.
     */
    async iterateClients(callback) {
        for (const client of this.clients) {
            try {
                await callback(client);
            }
            catch (ex) {
                console.error('Caught exception when iterating client', ex);
            }
        }
    }
    /**
     * Guards against any logging errors.
     * We don't want a logging exception to cause further issues upstream
     */
    sanitizeArgs(x) {
        const sanitizedParams = x.map((param) => {
            try {
                // Try and clone here first. If it fails it won't be passable over a MessagePort
                return structuredClone(param);
            }
            catch (ex) {
                console.error(ex);
                return 'Could not serialize log params. Check shared worker logs for more details.';
            }
        });
        return sanitizedParams;
    }
}
