import Logger from 'js-logger';
import { SSRDBAdapter } from './SSRDBAdapter';
import { isServerSide, resolveWebSQLFlags } from './web-sql-flags';
export class AbstractWebSQLOpenFactory {
    options;
    resolvedFlags;
    logger;
    constructor(options) {
        this.options = options;
        this.resolvedFlags = resolveWebSQLFlags(options.flags);
        this.logger = options.logger ?? Logger.get(`AbstractWebSQLOpenFactory - ${this.options.dbFilename}`);
    }
    /**
     * Opens a {@link DBAdapter} using resolved flags.
     * A SSR implementation is loaded if SSR mode is detected.
     */
    openDB() {
        const { resolvedFlags: { disableSSRWarning, enableMultiTabs, ssrMode = isServerSide() } } = this;
        if (ssrMode && !disableSSRWarning) {
            console.warn(`
  Running PowerSync in SSR mode.
  Only empty query results will be returned.
  Disable this warning by setting 'disableSSRWarning: true' in options.`);
        }
        if (!enableMultiTabs) {
            console.warn('Multiple tab support is not enabled. Using this site across multiple tabs may not function correctly.');
        }
        if (ssrMode) {
            return new SSRDBAdapter();
        }
        return this.openAdapter();
    }
}
