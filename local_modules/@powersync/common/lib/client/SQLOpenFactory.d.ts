import { DBAdapter } from '../db/DBAdapter.js';
export interface SQLOpenOptions {
    /**
     * Filename for the database.
     */
    dbFilename: string;
    /**
     * Directory where the database file is located.
     */
    dbLocation?: string;
    /**
     * Enable debugMode to log queries to the performance timeline.
     *
     * Defaults to false.
     *
     * To enable in development builds, use:
     *
     *    debugMode: process.env.NODE_ENV !== 'production'
     */
    debugMode?: boolean;
}
export interface SQLOpenFactory {
    /**
     * Opens a connection adapter to a SQLite DB
     */
    openDB(): DBAdapter;
}
/**
 * Tests if the input is a {@link SQLOpenOptions}
 */
export declare const isSQLOpenOptions: (test: any) => test is SQLOpenOptions;
/**
 * Tests if input is a {@link SQLOpenFactory}
 */
export declare const isSQLOpenFactory: (test: any) => test is SQLOpenFactory;
/**
 * Tests if input is a {@link DBAdapter}
 */
export declare const isDBAdapter: (test: any) => test is DBAdapter;
