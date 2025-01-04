import { makeAutoObservable } from 'mobx';
import { AbstractPowerSyncDatabase, Transaction } from '@powersync/web';

export type Mutation = {
  name: string;
  args: Record<string, any>;
}

export type MutatorConfig = Mutation & {
  optimisticUpdate: (tx: Transaction) => Promise<Boolean>;
};

export class MutationStore {
  constructor(private db: AbstractPowerSyncDatabase) {
    makeAutoObservable(this);
  }

  async mutate(config: MutatorConfig) {
    await this.db.writeTransaction(async (tx) => {
      await config.optimisticUpdate(tx);

      tx.execute(
        `INSERT INTO mutations (id, name, args, created_at)
         VALUES (uuid(), ?, ?, current_timestamp)`,
        [ config.name, JSON.stringify(config.args) ]
      );
    });
  }
}
