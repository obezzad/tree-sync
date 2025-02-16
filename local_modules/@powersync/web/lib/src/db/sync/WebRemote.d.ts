import { type ILogger } from 'js-logger';
import { AbstractRemote, AbstractRemoteOptions, BSONImplementation, RemoteConnector } from '@powersync/common';
export declare class WebRemote extends AbstractRemote {
    protected connector: RemoteConnector;
    protected logger: ILogger;
    private _bson;
    constructor(connector: RemoteConnector, logger?: ILogger, options?: Partial<AbstractRemoteOptions>);
    getUserAgent(): string;
    getBSON(): Promise<BSONImplementation>;
}
