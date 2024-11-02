import { AbstractPowerSyncDatabase, PowerSyncBackendConnector, UpdateType } from '@powersync/web';
import { initializeStore } from '@/stores/RootStore';
import { initializeAuthStore } from '@/stores/AuthStore';
import { userService } from '@/library/powersync/userService';
import { Database } from './AppSchema';

export class BackendConnector implements PowerSyncBackendConnector {
  private syncEndpoint: string | undefined;
  private powersyncUrl: string | undefined;
  private authStore = initializeAuthStore();

  constructor() {
    this.syncEndpoint = `${process.env.NEXT_PUBLIC_API_ENDPOINT}/sync`;
    this.powersyncUrl = process.env.NEXT_PUBLIC_POWERSYNC_URL;

    if (!this.syncEndpoint) {
      throw new Error('Missing sync endpoint configuration');
    }
  }

  async fetchCredentials() {
    const store = initializeStore();
    const session = await store.refreshSession();

    if (!this.powersyncUrl || !session) {
      console.warn('Missing sync endpoint or access token');
      return null;
    }

    return {
      endpoint: this.powersyncUrl,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    try {
      const userId = userService.getUserId();

      const mutations = transaction.crud
        .filter(op => op.table === 'mutations' && op.op === UpdateType.PUT);

      if (mutations.length === 0) {
        await transaction.complete();
        return;
      }

      if (mutations.length > 1) {
        throw new Error('Only one mutation by transaction is permitted');
      }

      const { name, args } = mutations[0].opData as Database['mutations'];

      if (!name) {
        throw new Error('Missing mutation name');
      }

      let parsed_args = JSON.parse(args ?? "{}");

      // Remove local-only columns
      Object.keys(parsed_args).forEach(key => {
        if (key.startsWith('_')) {
          delete parsed_args[key];
        }
      });

      if (parsed_args.payload) {
        try {
          parsed_args = {
            ...parsed_args,
            payload: JSON.parse(parsed_args.payload ?? "{}")
          };
        } catch (e) {
          console.error('Failed to parse payload:', e);
          throw new Error('Invalid payload format');
        }
      }

      const { data, error } = await this.authStore.supabase.rpc(name, { ...parsed_args });

      if (error) {
        console.error('Failed to process mutation:', error, data);
        throw error; // Propagate error to trigger transaction retry
      }

      await transaction.complete();
    } catch (error: any) {
      console.error('Upload error:', error);

      await transaction.complete();
    }
  }
}
