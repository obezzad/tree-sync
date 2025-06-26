import { AbstractPowerSyncDatabase, Transaction } from '@powersync/web';
import { Database } from '@/library/powersync/AppSchema';
import { v5 as uuidv5, v4 as uuidv4 } from 'uuid';
import { userService } from '@/library/powersync/userService';
import { MutationStore } from '@/stores/MutationStore';
import store from '@/stores/RootStore';
import { makeAutoObservable, runInAction } from 'mobx';
import { queries } from './queries';

export type Node = Database['nodes'];

export class NodeService {
  private mutationStore!: MutationStore;

  constructor(private db: AbstractPowerSyncDatabase) {
    makeAutoObservable(this);
    this.updateMutationStore();
  }

  private updateMutationStore() {
    this.mutationStore = new MutationStore(store.db!);
  }

  get activeMutationStore() {
    this.updateMutationStore();
    return this.mutationStore;
  }

  async createNode(data: Partial<Node>) {
    const user_id = userService.getUserId();
    const node_id = uuidv4();

    await this.activeMutationStore.mutate({
      name: 'create_node',
      args: { ...data, id: node_id },
      optimisticUpdate: async (tx: Transaction) => {
        const insertResult = await tx.execute(
          queries.insertNode.sql,
          [node_id, data.payload ?? '{}', user_id, data.parent_id]
        );

        return insertResult.rows?._array.map(row => row.id) ?? [];
      }
    });

    return data.parent_id;
  }

  async moveNode(nodeId: string, newParentId: string | null) {
    console.debug('[PoC::NodeService] moveNode →', { nodeId, newParentId });
    await this.activeMutationStore.mutate({
      name: 'move_node',
      args: {
        node_id_to_move: nodeId,
        new_parent_id: newParentId
      },
      optimisticUpdate: async (tx: Transaction) => {
        // HACK: Simple and efficient optimistic parent update without recursion
        const updateResult = await tx.execute(
          queries.moveNode.sql,
          [newParentId, nodeId]
        );
        return updateResult.rows?._array.map(row => row.id) ?? [];
      }
    });
    console.debug('[PoC::NodeService] moveNode DONE');

    return newParentId;
  }

  async deleteNode(node_id: string) {
    const isRoot = node_id === uuidv5("ROOT_NODE", userService.getUserId());

    await this.activeMutationStore.mutate({
      name: 'delete_node',
      args: { node_id },
      optimisticUpdate: async (tx: Transaction) => {
        // HACK: Archive only the parent node
        const updateResult = await tx.execute(queries.archiveNode.sql, [isRoot, node_id, node_id]);

        return updateResult.rows?._array.map(row => row.id) ?? [];
      }
    });
  }
}
