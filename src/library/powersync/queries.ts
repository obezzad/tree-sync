export type QueryParam =
	| 'userId'
	| 'rootNodeId'
	| 'nodeId'
	| 'focusedNodeId'
	| 'newNodeId'
	| 'payload'
	| 'parentId'
	| 'isRecursive'
	| 'expandedNodesJson';

export interface QueryDefinition {
	sql: string;
	title: string;
	params: QueryParam[];
	isMutation?: boolean;
}

export const queries: { [key: string]: QueryDefinition } = {
	// Solely for benchmarks
	coldStartProbe: {
		title: '⚗️ Cold Start Sanity Check ("SELECT 1", should be <1ms) (used only for benchmarks)',
		sql: 'SELECT 1',
		params: []
	},
	getSampleNodes: {
		title: '⚗️ Fetch Sample Nodes (used only for benchmarks)',
		sql: 'SELECT id, created_at, user_id FROM nodes WHERE user_id = ? LIMIT 100',
		params: ['userId']
	},
	// Queries for the main app
	getRootNodes: {
		title: 'Get Root Nodes',
		sql: 'SELECT *, EXISTS(SELECT 1 FROM nodes AS c WHERE c.parent_id = p.id) as has_children FROM nodes AS p WHERE p.parent_id IS NULL',
		params: []
	},
	getVisibleNodes: {
		title: 'Get Visible Nodes (lazy loading the tree)',
		sql: `
		SELECT *, EXISTS(SELECT 1 FROM nodes AS c WHERE c.parent_id = p.id) as has_children
		FROM nodes AS p
		WHERE p.parent_id IS NULL OR p.parent_id IN (SELECT value FROM json_each(?))
		ORDER BY p.archived_at ASC, p.id ASC
		`,
		params: ['expandedNodesJson']
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
