import { AbstractRemote, DEFAULT_REMOTE_LOGGER, FetchImplementationProvider } from '@powersync/common';
import { getUserAgentInfo } from './userAgent';
/*
 * Depends on browser's implementation of global fetch.
 */
class WebFetchProvider extends FetchImplementationProvider {
    getFetch() {
        return fetch.bind(globalThis);
    }
}
export class WebRemote extends AbstractRemote {
    connector;
    logger;
    _bson;
    constructor(connector, logger = DEFAULT_REMOTE_LOGGER, options) {
        super(connector, logger, {
            ...(options ?? {}),
            fetchImplementation: options?.fetchImplementation ?? new WebFetchProvider()
        });
        this.connector = connector;
        this.logger = logger;
    }
    getUserAgent() {
        let ua = [super.getUserAgent(), `powersync-web`];
        try {
            ua.push(...getUserAgentInfo());
        }
        catch (e) {
            this.logger.warn('Failed to get user agent info', e);
        }
        return ua.join(' ');
    }
    async getBSON() {
        if (this._bson) {
            return this._bson;
        }
        /**
         * Dynamic import to be used only when needed.
         */
        const { BSON } = await import('bson');
        this._bson = BSON;
        return this._bson;
    }
}
