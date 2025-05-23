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
  { indexes: { parent_idx: [{ column: 'parent_id' }] } }
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
