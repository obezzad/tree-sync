export interface NavigatorInfo {
    userAgent: string;
    userAgentData?: {
        brands?: {
            brand: string;
            version: string;
        }[];
        platform?: string;
    };
}
/**
 * Get a minimal representation of browser, version and operating system.
 *
 * The goal is to get enough environemnt info to reproduce issues, but no
 * more.
 */
export declare function getUserAgentInfo(nav?: NavigatorInfo): string[];
