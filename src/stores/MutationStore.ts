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
    console.log(`[MutationStore] mutate START ${config.name}`, config.args);
    const start = Date.now();
    console.log(`[MutationStore] waiting for writeTransaction lock for ${config.name}`);
    let affectedNodeIds: string[] = [];

    // Use no wait for move_node to avoid long lock waits
    const writeTx = async (tx: Transaction) => {
      console.log(`[MutationStore] writeTransaction callback START ${config.name}`);
      affectedNodeIds = await config.optimisticUpdate(tx);
      console.log(`[MutationStore] optimisticUpdate done ${config.name}`, affectedNodeIds);

      if (affectedNodeIds.length > 0) {
        console.log(`[MutationStore] executing _is_pending update for ${config.name}`, affectedNodeIds);
        await tx.execute(
          `UPDATE nodes SET _is_pending = 1 WHERE id IN (${affectedNodeIds.map(() => '?').join(',')})`,
          affectedNodeIds
        );
        console.log(`[MutationStore] _is_pending update done for ${config.name}`);
      }

      console.log(`[MutationStore] inserting mutation row for ${config.name}`);
      await tx.execute(
        `INSERT INTO mutations (id, name, args, created_at)
         VALUES (uuid(), ?, ?, current_timestamp)`,
        [config.name, JSON.stringify(config.args)]
      );
      console.log(`[MutationStore] mutation row inserted for ${config.name}`);

      timestamp(`PUSH ${config.name}`);
      console.log(`[MutationStore] writeTransaction callback END ${config.name}`);
    };
    const lockTimeout = config.name === 'move_node' ? 0 : undefined;
    if (lockTimeout === 0) {
      await this.db.writeTransaction(writeTx, 0);
    } else {
      await this.db.writeTransaction(writeTx);
    }
    console.log(`[MutationStore] writeTransaction resolved ${config.name} in ${Date.now() - start}ms`);
    console.log(`[MutationStore] mutate END ${config.name}`, affectedNodeIds);
    return affectedNodeIds;
  }
}
