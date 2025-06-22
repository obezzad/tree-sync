export type QueryParam =
	| 'userId'
	| 'rootNodeId'
	| 'nodeId'
	| 'focusedNodeId'
	| 'newNodeId'
	| 'payload'
	| 'parentId'
	| 'isRecursive';

export interface QueryDefinition {
	sql: string;
	title: string;
	params: QueryParam[];
	isMutation?: boolean;
}

export const queries: { [key: string]: QueryDefinition } = {
	coldStartProbe: {
		title: 'Cold Start Sanity Check ("SELECT 1", should be <1ms)',
		sql: 'SELECT 1',
		params: []
	},
	getSampleNodes: {
		title: 'Fetch Sample Nodes',
		sql: 'SELECT id, created_at, user_id FROM nodes WHERE user_id = ? LIMIT 100',
		params: ['userId']
	},
	getAllNodeIds: {
		title: 'List All Node IDs',
		sql: 'SELECT id FROM nodes',
		params: []
	},
	getAllNodeIdsForUser: {
		title: 'List All Node IDs for User',
		sql: 'SELECT id FROM nodes WHERE user_id = ?',
		params: ['userId']
	},
	getAllNodes: {
		title: 'Get All Nodes',
		sql: 'SELECT * FROM nodes',
		params: []
	},
	getAllNodesForUser: {
		title: 'Get All Nodes for a User',
		sql: 'SELECT * FROM nodes WHERE user_id = ?',
		params: ['userId']
	},
	getDescendantsOfNode: {
		title: 'List All Descendant IDs of Root',
		sql: `
	WITH RECURSIVE descendants(id) AS (
		SELECT ? AS id
		UNION ALL
		SELECT n.id
		FROM nodes n
		JOIN descendants d ON n.parent_id = d.id
	)
	SELECT id FROM descendants`,
		params: ['rootNodeId']
	},
	countAllNodes: {
		title: 'Count All Nodes',
		sql: 'SELECT count(*) as count FROM nodes',
		params: []
	},
	countUserNodes: {
		title: 'Count User Nodes',
		sql: 'SELECT count(*) as count FROM nodes WHERE user_id = ?',
		params: ['userId']
	},
	countPendingUploads: {
		title: 'Count Pending Uploads',
		sql: 'select count(distinct tx_id) as count from ps_crud',
		params: []
	},
	countOplogBuckets: {
		title: 'Count Oplog Buckets',
		sql: `SELECT count(DISTINCT bucket) as bucket_count FROM ps_oplog`,
		params: []
	},
	getTotalNodeSizeForUser: {
		title: 'Get Total Node Size for User',
		sql: `SELECT
        SUM(
            IFNULL(LENGTH(id), 0) +
            IFNULL(LENGTH(created_at), 0) +
            IFNULL(LENGTH(payload), 0) +
            IFNULL(LENGTH(user_id), 0) +
            IFNULL(LENGTH(parent_id), 0) +
            IFNULL(LENGTH(rank), 0) +
            IFNULL(LENGTH(archived_at), 0)
        ) as total_size
        FROM nodes
        WHERE user_id = ?`,
		params: ['userId']
	},
	// Mutations
	insertNode: {
		title: 'Insert New Node',
		sql: `INSERT INTO nodes (id, created_at, payload, user_id, parent_id, _is_pending)
            VALUES (?, current_timestamp, ?, ?, ?, 1)
            RETURNING id`,
		params: ['newNodeId', 'payload', 'userId', 'parentId'],
		isMutation: true
	},
	moveNode: {
		title: 'Move Node',
		sql: `UPDATE nodes SET parent_id = ? WHERE id = ? RETURNING id`,
		params: ['parentId', 'nodeId'],
		isMutation: true
	},
	archiveNode: {
		title: 'Archive Node',
		sql: `
            UPDATE nodes
            SET archived_at = CURRENT_TIMESTAMP
            WHERE CASE
                WHEN ? THEN parent_id = ?
                ELSE id = ?
            END
            AND archived_at IS NULL
            RETURNING id;`,
		params: ['isRecursive', 'parentId', 'nodeId'],
		isMutation: true
	}
};
