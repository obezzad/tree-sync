'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { TreeNode } from './TreeNode';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NodeService } from '@/library/powersync/NodeService';
import type { Node } from '@/library/powersync/NodeService';
import { treeUtils } from '@/utils/treeUtils';

interface TreeNodeData extends Node {
  children: TreeNodeData[];
}

interface TreeViewProps {
  nodes: Node[];
  nodeService: NodeService;
  readOnly?: boolean;
}

export const TreeView = ({ nodes, nodeService, readOnly = false }: TreeViewProps) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [globalExpanded, setGlobalExpanded] = useState(false);

  const treeData = useMemo(() => {
    const buildTree = (nodes: Node[], parentId: string | null = null): TreeNodeData[] => {
      return nodes
        .filter(node => node.parent_id === parentId)
        .map(node => ({
          ...node,
          children: buildTree(nodes, node.id)
        }));
    };

    return buildTree(nodes, null);
  }, [nodes]);

  // Helper function to check if a node is in a subtree
  const isNodeInSubtree = (nodeId: string, subtreeRoot: TreeNodeData): boolean => {
    if (subtreeRoot.id === nodeId) return true;
    return subtreeRoot.children.some(child => isNodeInSubtree(nodeId, child));
  };

  // Find node by ID in the tree
  const findNode = (nodeId: string, tree: TreeNodeData[]): TreeNodeData | null => {
    for (const node of tree) {
      if (node.id === nodeId) return node;
      const found = findNode(nodeId, node.children);
      if (found) return found;
    }
    return null;
  };

  const handleMove = async (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    if (readOnly) return;

    const sourceNode = findNode(sourceId, treeData);
    const targetNode = findNode(targetId, treeData);

    if (!sourceNode || !targetNode) {
      toast.error('Unable to move node: Node not found');
      return;
    }

    // Prevent moving a node into its own subtree
    if (isNodeInSubtree(targetId, sourceNode)) {
      toast.error('Cannot move a node into its own subtree');
      return;
    }

    try {
      if (position !== 'inside') {
        throw new Error('Siblings reordering is not supported yet');
      }

      await nodeService.moveNode(sourceId, targetId);
      toast.success('Node moved successfully');
    } catch (error: any) {
      console.error('Failed to move node:', error);
      toast.error(error.message ?? 'Failed to move node');
    }
  };

  const handleAddNode = async (parentId: string | null) => {
    if (readOnly) return;

    const node = {
      parent_id: parentId,
      payload: JSON.stringify({ name: treeUtils.generateReadableName() })
    };

    await nodeService.createNode(node);
  };

  const handleBulkAdd = async (parentId: string | null, count: number, depth: number) => {
    return; // HACK: Disable bulk add for now
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (readOnly) return;
    setNodeToDelete(nodeId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
    if (nodeToDelete) {
      await nodeService.deleteNode(nodeToDelete);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-2 border-b flex justify-end gap-2">
        <button
          className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 rounded"
          onClick={() => setGlobalExpanded(!globalExpanded)}
        >
          {globalExpanded ? (
            <>
              <ChevronDown className="w-4 h-4" />
              Collapse All
            </>
          ) : (
            <>
              <ChevronRight className="w-4 h-4" />
              Expand All
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto">
        {nodes.length === 0 ? (
          <div className="text-center text-gray-500 p-4">
            <div className="mb-4">No nodes available</div>
          </div>
        ) : (
          <div className="min-w-max">
            {treeData.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                level={1}
                onAddChild={handleAddNode}
                onDelete={handleDeleteNode}
                onMove={handleMove}
                onBulkAdd={handleBulkAdd}
                readOnly={readOnly}
                globalExpanded={globalExpanded}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && nodeToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Node</h3>
            <p className="mb-4">Are you sure you want to delete this node and all its children?</p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-gray-600 hover:text-gray-800 bg-gray-100 rounded"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setNodeToDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                onClick={confirmDelete}
                autoFocus
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
