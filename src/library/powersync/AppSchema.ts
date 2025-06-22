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
      user_id_id_idx: ['user_id', 'id'],
      parent_id_id_idx: ['parent_id', 'id'],
      user_id__is_pending_idx: ['user_id', '_is_pending'],
      parent_id_archived_at_idx: ['parent_id', 'archived_at'],
      archived_at_idx: ['archived_at']
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
