import { PowerSyncDatabase, PowerSyncDatabaseOptions, QueryResult } from '@powersync/web';

export class LoggingPowerSyncDatabase extends PowerSyncDatabase {
	constructor(options: any) {
		super(options);
	}

	private logQuery(type: string, sql: string, bindingArgs?: any[]) {
		const startTime = performance.now();
		console.debug(`[PowerSync] ${type} START: ${sql}`, bindingArgs);

		return {
			logEnd: (result?: any) => {
				const duration = performance.now() - startTime;
				console.debug(`[PowerSync] ${type} END: ${sql} (Duration: ${duration.toFixed(2)}ms)`, { bindingArgs, result });
			},
			logError: (error: any) => {
				const duration = performance.now() - startTime;
				console.error(`[PowerSync] ${type} FAILED: ${sql} (Duration: ${duration.toFixed(2)}ms)`, {
					bindingArgs,
					error
				});
			}
		};
	}

	async execute(sql: string, bindingArgs?: any[]): Promise<QueryResult> {
		const { logEnd, logError } = this.logQuery('Execute', sql, bindingArgs);
		try {
			const result = await super.execute(sql, bindingArgs);
			logEnd(result);
			return result;
		} catch (error) {
			logError(error);
			throw error;
		}
	}

	async get<T>(sql: string, bindingArgs?: any[]): Promise<T | null> {
		const { logEnd, logError } = this.logQuery('Get', sql, bindingArgs);
		try {
			const result = await super.get<T>(sql, bindingArgs);
			logEnd(result);
			return result;
		} catch (error) {
			logError(error);
			throw error;
		}
	}

	async getAll<T>(sql: string, bindingArgs?: any[]): Promise<T[]> {
		const { logEnd, logError } = this.logQuery('GetAll', sql, bindingArgs);
		try {
			const result = await super.getAll<T>(sql, bindingArgs);
			logEnd(result);
			return result;
		} catch (error) {
			logError(error);
			throw error;
		}
	}
}
