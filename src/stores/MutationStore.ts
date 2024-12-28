import { makeAutoObservable } from 'mobx';
import { AbstractPowerSyncDatabase, Transaction } from '@powersync/web';

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
    let affectedNodeIds: string[] = [];

    await this.db.writeTransaction(async (tx) => {
      affectedNodeIds = await config.optimisticUpdate(tx);

      if (affectedNodeIds.length > 0) {
        await tx.execute(
          `UPDATE nodes SET _is_pending = 1 WHERE id IN (${affectedNodeIds.map(() => '?').join(',')})`,
          affectedNodeIds
        );
      }

      await tx.execute(
        `INSERT INTO mutations (id, name, args, created_at)
         VALUES (uuid(), ?, ?, current_timestamp)`,
        [ config.name, JSON.stringify(config.args) ]
      );
    });

    return affectedNodeIds;
  }
}
