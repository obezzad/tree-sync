import { AbstractPowerSyncDatabase, Transaction } from '@powersync/web';
import { Database } from '@/library/powersync/AppSchema';
import { v5 as uuidv5, v4 as uuidv4 } from 'uuid';
import { userService } from '@/library/powersync/userService';
import { MutationStore } from '@/stores/MutationStore';

export type Node = Database['nodes'];

export class NodeService {
  private mutationStore: MutationStore;

  constructor(private db: AbstractPowerSyncDatabase) {
    this.mutationStore = new MutationStore(db);
  }

  async createNode(data: Partial<Node>) {
    const user_id = userService.getUserId();
    const node_id = uuidv4();

    await this.mutationStore.mutate({
      name: 'create_node',
      args: { ...data, id: node_id },
      optimisticUpdate: async (tx: Transaction) => {
        await tx.execute(
          `INSERT INTO nodes (id, created_at, payload, user_id, parent_id, _is_pending)
           VALUES (?, current_timestamp, ?, ?, ?, 1)`,
          [node_id, data.payload ?? '{}', user_id, data.parent_id]
        );

        return true;
      }
    });
  }

  async moveNode(nodeId: string, newParentId: string | null) {
    await this.mutationStore.mutate({
      name: 'move_node',
      args: {
        node_id_to_move: nodeId,
        new_parent_id: newParentId
      },
      optimisticUpdate: async (tx: Transaction) => {
        await tx.execute(`
          WITH RECURSIVE ancestors AS (
            -- Base: start with the proposed new parent
            SELECT id, parent_id
            FROM nodes
            WHERE id = ? AND ? IS NOT NULL  -- only do this check if new_parent_id is not NULL

            UNION ALL

            -- Recursive: keep getting parents until reaching root
            SELECT n.id, n.parent_id
            FROM nodes n
            JOIN ancestors a ON n.id = a.parent_id
          )
          UPDATE nodes
          SET parent_id = ? -- new_parent_id
          WHERE id = ?      -- node_id_to_move
          AND (
            ? IS NULL  -- Allow moving to root
            OR ? NOT IN (SELECT id FROM ancestors)  -- Check ancestors if not moving to root
        );`, [newParentId, newParentId, newParentId, nodeId, newParentId, nodeId]);

        return true;
      }
    });
  }

  async deleteNode(node_id: string) {
    await this.mutationStore.mutate({
      name: 'delete_node',
      args: { node_id },
      optimisticUpdate: async (tx: Transaction) => {
        // HACK: Archive only the parent node
        await tx.execute(`
          UPDATE nodes
          SET archived_at = CURRENT_TIMESTAMP
          WHERE CASE
              WHEN ? THEN parent_id = ?
              ELSE id = ?
          END
          AND archived_at IS NULL;`, [node_id === uuidv5("ROOT_NODE", userService.getUserId()), node_id, node_id]);

        return true;
      }
    });
  }
}
