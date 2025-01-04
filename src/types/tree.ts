export interface Node {
  id: string;
  parent_id: string | null;
  payload: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

export interface TreeNodeData extends Node {
  children: TreeNodeData[];
}

export type NodePosition = 'before' | 'after' | 'inside';

export interface TreeViewProps {
  nodes: Node[];
  nodeService: NodeService;
  readOnly?: boolean;
}

export interface TreeNodeProps {
  node: TreeNodeData;
  level: number;
  onAddChild: (parentId: string | null) => Promise<void>;
  onDelete: (nodeId: string) => void;
  onMove: (sourceId: string, targetId: string, position: NodePosition) => Promise<void>;
  onBulkAdd: (parentId: string | null, numNodes: number, depth: number) => Promise<void>;
  readOnly: boolean;
  globalExpanded: boolean;
}

export interface NodeService {
  createNode: (node: Partial<Node>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  moveNode: (sourceId: string, targetId: string) => Promise<void>;
  createSubtree: (parentId: string | null, numNodes: number, depth: number) => Promise<void>;
}

export interface TreeUtils {
  generateReadableName: () => string;
  isNodeInSubtree: (nodeId: string, subtreeRoot: TreeNodeData) => boolean;
  findNode: (nodeId: string, tree: TreeNodeData[]) => TreeNodeData | null;
  buildTree: (nodes: Node[], parentId: string | null) => TreeNodeData[];
}
