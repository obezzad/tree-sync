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

export const queries: { [key: string]: QueryDefinition } = {
	coldStartProbe: {
		title: 'Cold Start Sanity Check (SELECT 1, should be instant)',
		sql: 'SELECT 1 as probe',
		params: []
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
	getDescendantsOfNode: {
		title: 'List All Descendant IDs of Root',
		sql: getDescendantsOfNodeQuery,
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
	getSampleNodes: {
		title: 'Fetch Sample Nodes',
		sql: 'SELECT id, created_at, user_id FROM nodes WHERE user_id = ? LIMIT 100',
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
	getSubtree: {
		title: 'Query Subtree from Root',
		sql: `
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
    WHERE id IN (SELECT id FROM focused_nodes) AND user_id = ?`,
		params: [
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'focusedNodeId',
			'userId'
		]
	},
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
