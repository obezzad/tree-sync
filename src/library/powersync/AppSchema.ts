import { column, Schema, Table } from '@powersync/web';

const nodes = new Table(
  {
    created_at: column.text,
    payload: column.text,
    user_id: column.text,
    parent_id: column.text,
    rank: column.text,
    is_root: column.integer,
    archived_at: column.text,
    _is_pending: column.integer,
  },
  {
    indexes: {
      user_id_idx: ['user_id'],
      parent_id_idx: ['parent_id'],
      user_parent_idx: ['user_id', 'parent_id'],
      user_archived_idx: ['user_id', 'archived_at'],
      user_created_idx: ['user_id', 'created_at'],
      user_parent_created_idx: ['user_id', 'parent_id', 'created_at'],
      user_pending_idx: ['user_id', '_is_pending'],
    }
  }
);

const mutations = new Table(
  {
    name: column.text,
    args: column.text,    // JSON stringified
    created_at: column.text,
    error: column.text,
  },
  { indexes: {} }
);

export const AppSchema = new Schema({
  nodes,
  mutations,
});

export type Database = (typeof AppSchema)['types'];
