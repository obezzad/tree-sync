import type { Node, TreeNodeData, TreeUtils } from '../types/tree';

const adjectives = [
  'Quick', 'Bright', 'Smart', 'Clever', 'Wise',
  'Happy', 'Calm', 'Gentle', 'Bold', 'Fresh',
  'Swift', 'Neat', 'Kind', 'Pure', 'Warm'
];

const nouns = [
  'Fox', 'Bird', 'Tree', 'Star', 'Cloud',
  'River', 'Lake', 'Moon', 'Sun', 'Wind',
  'Ocean', 'Forest', 'Mountain', 'Valley', 'Garden'
];

export const CHILDREN_PAGE_SIZE = 50;

export const treeUtils: TreeUtils = {
  generateReadableName: () => {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const id = Math.floor(256 + (Math.random() * 3840)).toString(16);
    return `${adjective} ${noun} ${id}`;
  },

  isNodeInSubtree: (nodeId: string, subtreeRoot: TreeNodeData): boolean => {
    if (subtreeRoot.id === nodeId) return true;
    return subtreeRoot.children.some(child => treeUtils.isNodeInSubtree(nodeId, child));
  },

  findNode: (nodeId: string, tree: TreeNodeData[]): TreeNodeData | null => {
    for (const node of tree) {
      if (node.id === nodeId) return node;
      const found = treeUtils.findNode(nodeId, node.children);
      if (found) return found;
    }
    return null;
  },

  buildTree: (nodes: Node[], parentId: string | null = null): TreeNodeData[] => {
    return nodes
      .filter(node => node.parent_id === parentId)
      .map(node => ({
        ...node,
        children: treeUtils.buildTree(nodes, node.id)
      }));
  }
};
