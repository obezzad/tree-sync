import { makeAutoObservable } from 'mobx';
import { AbstractPowerSyncDatabase, Transaction } from '@powersync/web';
import { timestamp } from '@/utils/metrics';

export type Mutation = {
  name: string;
  args: Record<string, any>;
}

export type MutatorConfig = Mutation & {
  optimisticUpdate: (tx: Transaction) => Promise<string[]>;
};

export class MutationStore {
  constructor(private db: AbstractPowerSyncDatabase) {
    makeAutoObservable(this);
  }

  async mutate(config: MutatorConfig): Promise<string[]> {
    console.debug(`[MutationStore] mutate START ${config.name}`, config.args);
    const start = Date.now();

    console.debug(`[MutationStore] waiting for writeTransaction lock for ${config.name}`);
    let affectedNodeIds: string[] = [];

    // Use no wait for move_node to avoid long lock waits
    const writeTx = async (tx: Transaction) => {
      console.debug(`[MutationStore] writeTransaction callback START ${config.name}`);
      affectedNodeIds = await config.optimisticUpdate(tx);
      console.debug(`[MutationStore] optimisticUpdate done ${config.name}`, affectedNodeIds);

      if (affectedNodeIds.length > 0) {
        console.debug(`[MutationStore] executing _is_pending update for ${config.name}`, affectedNodeIds);
        await tx.execute(
          `UPDATE nodes SET _is_pending = 1 WHERE id IN (${affectedNodeIds.map(() => '?').join(',')})`,
          affectedNodeIds
        );
        console.debug(`[MutationStore] _is_pending update done for ${config.name}`);
      }

      console.debug(`[MutationStore] inserting mutation row for ${config.name}`);
      await tx.execute(
        `INSERT INTO mutations (id, name, args, created_at)
         VALUES (uuid(), ?, ?, current_timestamp)`,
        [config.name, JSON.stringify(config.args)]
      );
      console.debug(`[MutationStore] mutation row inserted for ${config.name}`);

      timestamp(`PUSH ${config.name}`);
      console.debug(`[MutationStore] writeTransaction callback END ${config.name}`);
    };

    const lockTimeout = config.name === 'move_node' ? 0 : undefined;
    if (lockTimeout === 0) {
      await this.db.writeTransaction(writeTx, 0);
    } else {
      await this.db.writeTransaction(writeTx);
    }

    console.debug(`[MutationStore] writeTransaction resolved ${config.name} in ${Date.now() - start}ms`);
    console.debug(`[MutationStore] mutate END ${config.name}`, affectedNodeIds);
    return affectedNodeIds;
  }
}
