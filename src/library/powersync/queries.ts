import { v5 as uuidv5 } from 'uuid';

const getDescendantsOfNodeQuery = `
    WITH RECURSIVE descendants(id) AS (
    SELECT ? AS id
    UNION ALL
    SELECT n.id
    FROM nodes n
    JOIN descendants d ON n.parent_id = d.id
    )
    SELECT id FROM descendants
`;

export const queries = {
	getAllNodeIds: 'SELECT id FROM nodes',
	getAllNodeIdsForUser: 'SELECT id FROM nodes WHERE user_id = ?',
	getDescendantsOfNode: getDescendantsOfNodeQuery,
	countAllNodes: 'SELECT count(id) as count FROM nodes',
	countUserNodes: 'SELECT count(id) as count FROM nodes WHERE user_id = ?',
	countRemoteNodes: 'SELECT count(id) as count FROM nodes WHERE user_id = ? AND _is_pending IS NULL',
	getSampleNodes: 'SELECT id, created_at, user_id FROM nodes WHERE user_id = ? LIMIT 100',
	countPendingUploads: 'select count(distinct tx_id) as count from ps_crud',
	countOplogBuckets: `SELECT count(DISTINCT bucket) as bucket_count FROM ps_oplog`,
	mainAppQuery: `
    WITH parent AS (
        SELECT id, parent_id
        FROM nodes
        WHERE id = (
        SELECT parent_id
        FROM nodes
        WHERE id = ? AND ? IS NOT NULL
        )
    ),
    siblings AS (
        SELECT n.id
        FROM nodes n
        WHERE n.parent_id = (
        SELECT parent_id
        FROM nodes
        WHERE id = ? AND ? IS NOT NULL
      )
    ),
    children AS (
      SELECT id
      FROM nodes
      WHERE parent_id = ? AND ? IS NOT NULL
    ),
    focused_nodes AS (
      SELECT id FROM parent
      UNION
      SELECT id FROM siblings
      UNION
      SELECT id FROM children
      UNION
      SELECT ? AS id WHERE ? IS NOT NULL
    )
    SELECT * FROM nodes
    WHERE user_id = ?`,
    insertNode: `INSERT INTO nodes (id, created_at, payload, user_id, parent_id, _is_pending)
             VALUES (?, current_timestamp, ?, ?, ?, 1)
             RETURNING id`,
    moveNode: `UPDATE nodes SET parent_id = ? WHERE id = ? RETURNING id`,
    archiveNode: `
          UPDATE nodes
          SET archived_at = CURRENT_TIMESTAMP
          WHERE CASE
              WHEN ? THEN parent_id = ?
              ELSE id = ?
          END
          AND archived_at IS NULL
          RETURNING id;`
};
