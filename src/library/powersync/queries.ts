export type QueryParam =
	| 'userId'
	| 'rootNodeId'
	| 'nodeId'
	| 'focusedNodeId'
	| 'newNodeId'
	| 'payload'
	| 'parentId'
	| 'isRecursive'
	| 'limit'
	| 'offset'
	| 'expandedNodesJson'
	| 'expandedLimitsJson';

export interface QueryDefinition {
	sql: string;
	title: string;
	params: QueryParam[];
	isMutation?: boolean;
	skipTests?: boolean;
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
	getVisibleTree: {
		title: 'Get the full visible tree, with paginated children',
		sql: `
		WITH RECURSIVE
			expanded_tree (id, parent_id, rank, path, level, _is_pending) AS (
			SELECT id, parent_id, rank, printf('%020s', rank) || '::' || id, 0, _is_pending
			FROM nodes
			WHERE parent_id IS NULL

			UNION ALL

			SELECT
				child.id,
				child.parent_id,
				child.rank,
				parent.path || '/' || printf('%020s', child.rank) || '::' || child.id,
				parent.level + 1,
				child._is_pending
			FROM nodes AS child
			JOIN expanded_tree AS parent ON child.parent_id = parent.id
			WHERE parent.id IN (SELECT value FROM json_each(?)) -- expanded_nodes_json_array
		),
		numbered_children AS (
			SELECT
				*,
				ROW_NUMBER() OVER(PARTITION BY parent_id ORDER BY rank, id) as rn
			FROM expanded_tree
		)
		SELECT nc.id, nc.parent_id, nc.level, nc._is_pending, EXISTS(SELECT 1 FROM nodes AS c WHERE c.parent_id = nc.id) as has_children,
		(SELECT count(*) FROM nodes c WHERE c.parent_id = nc.id) as children_count
		FROM numbered_children nc
		WHERE
			nc.parent_id IS NULL
			OR nc.rn <= CAST(json_extract(?, '$.' || nc.parent_id) AS INTEGER)
		ORDER BY nc.path;
		`,
		params: ['expandedNodesJson', 'expandedLimitsJson'],
	},
	countAllNodes: {
		title: 'Count All Nodes',
		sql: 'SELECT count(*) as count FROM nodes',
		params: []
	},
	countPendingUploads: {
		title: 'Count Pending Uploads',
		sql: 'select count(distinct tx_id) as count from ps_crud',
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
