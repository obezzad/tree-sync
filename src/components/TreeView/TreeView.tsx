'use client';

import { useMemo, useState, useCallback, memo } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import toast from 'react-hot-toast';
import { TreeNode } from './TreeNode';
import { ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { BulkAddModal } from './BulkAddModal';
import { NodeService } from '@/library/powersync/NodeService';
import type { Node } from '@/library/powersync/NodeService';
import { treeUtils } from '@/utils/treeUtils';
import { initializeStore } from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';

interface TreeNodeData extends Node {
  children: TreeNodeData[];
}

interface TreeViewProps {
  nodes: Node[];
  nodeService: NodeService;
  readOnly?: boolean;
}

const ROW_HEIGHT = 48; // 40px height + 8px margin

const MemoizedTreeNode = memo(TreeNode);

export const TreeView = observer(({ nodes, nodeService, readOnly = false }: TreeViewProps) => {
  const rootStore = initializeStore();
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [selectedNodeForBulk, setSelectedNodeForBulk] = useState<string | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const treeData = useMemo(() => {
    const nodeMap = new Map<string | null, Node[]>();

    nodes.forEach(node => {
      const parentId = node.parent_id;
      if (!nodeMap.has(parentId)) {
        nodeMap.set(parentId, []);
      }
      nodeMap.get(parentId)!.push(node);
    });

    const buildTree = (parentId: string | null): TreeNodeData[] => {
      const children = nodeMap.get(parentId) || [];
      return children.map(node => ({
        ...node,
        children: buildTree(node.id)
      }));
    };

    return buildTree(null);
  }, [nodes]);

  const collapsedNodesMap = useMemo(() => {
    const map = new Map<string, boolean>();
    nodes.forEach(node => {
      map.set(node.id, collapsedNodes.has(node.id));
    });
    return map;
  }, [nodes, collapsedNodes]);

  const flattenedNodes = useMemo(() => {
    const flattened: Array<{ node: TreeNodeData; level: number }> = [];
    const flatten = (nodes: TreeNodeData[], level: number) => {
      nodes.forEach(node => {
        flattened.push({ node, level });
        if (!collapsedNodesMap.get(node.id) && node.children.length > 0) {
          flatten(node.children, level + 1);
        }
      });
    };
    flatten(treeData, 1);
    return flattened;
  }, [treeData, collapsedNodesMap]);

  const isNodeInSubtree = useCallback((nodeId: string, subtreeRoot: TreeNodeData): boolean => {
    if (subtreeRoot.id === nodeId) return true;
    return subtreeRoot.children.some(child => isNodeInSubtree(nodeId, child));
  }, []);

  const findNode = useCallback((nodeId: string, tree: TreeNodeData[]): TreeNodeData | null => {
    for (const node of tree) {
      if (node.id === nodeId) return node;
      const found = findNode(nodeId, node.children);
      if (found) return found;
    }
    return null;
  }, []);

  const handleMove = useCallback(async (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
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
  }, [readOnly, treeData, nodeService, findNode, isNodeInSubtree]);

  const handleAddNode = useCallback(async (parentId: string | null) => {
    if (readOnly) return;

    const node = {
      parent_id: parentId,
      payload: JSON.stringify({ name: treeUtils.generateReadableName() })
    };

    await nodeService.createNode(node);
  }, [readOnly, nodeService]);

  const handleBulkAdd = useCallback((nodeId: string) => {
    setSelectedNodeForBulk(nodeId);
    setIsBulkAddModalOpen(true);
  }, []);

  const handleCloseBulkModal = useCallback(() => {
    setIsBulkAddModalOpen(false);
    setSelectedNodeForBulk(null);
  }, []);

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (readOnly) return;

    await nodeService.deleteNode(nodeId);
  }, [readOnly]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (!next.has(nodeId)) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      return next;
    });
  }, []);

  return (
    <ErrorBoundary>
      <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-2 border-b border-gray-200 flex justify-end gap-2">
          <button
            onClick={() => rootStore.setShowArchivedNodes(!rootStore.showArchivedNodes)}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 rounded flex items-center gap-1"
          >
            <Archive className="w-4 h-4" />
            {rootStore.showArchivedNodes ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            onClick={() => {
              if (collapsedNodes.size === 0) {
                const batchSize = 10000;
                const newCollapsed = new Set<string>();

                const processChunk = (startIndex: number) => {
                  const endIndex = Math.min(startIndex + batchSize, nodes.length);
                  for (let i = startIndex; i < endIndex; i++) {
                    newCollapsed.add(nodes[i].id);
                  }

                  if (endIndex < nodes.length) {
                    requestAnimationFrame(() => processChunk(endIndex));
                  } else {
                    setCollapsedNodes(newCollapsed);
                  }
                };

                requestAnimationFrame(() => processChunk(0));
              } else {
                setCollapsedNodes(new Set());
              }
            }}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 rounded flex items-center gap-1"
          >
            {collapsedNodes.size === 0 ? (
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
        <div className="overflow-x-auto" style={{ height: '40vh' }}>
          {nodes.length === 0 ? (
            <div className="text-center text-gray-500 p-4">
              <div className="mb-4">No nodes available</div>
            </div>
          ) : (
            <AutoSizer>
              {({ width, height }) => (
                <List
                  width={width}
                  height={height}
                  rowCount={flattenedNodes.length}
                  rowHeight={ROW_HEIGHT}
                  overscanRowCount={20}
                  rowRenderer={({ index, key, style }) => {
                    const { node, level } = flattenedNodes[index];
                    return (
                      <div
                        key={key}
                        style={{
                          ...style,
                        }}
                        className="flex items-center"
                      >
                        <MemoizedTreeNode
                          node={node}
                          level={level}
                          onAddChild={handleAddNode}
                          onDelete={handleDeleteNode}
                          onMove={handleMove}
                          onBulkAdd={handleBulkAdd}
                          readOnly={readOnly}
                          isExpanded={!collapsedNodesMap.get(node.id)}
                          onToggleExpand={handleToggleExpand}
                        />
                      </div>
                    );
                  }}
                />
              )}
            </AutoSizer>
          )}
        </div>
      </div>

      {/* Bulk Add Modal */}
      <BulkAddModal
        open={isBulkAddModalOpen}
        onClose={handleCloseBulkModal}
        selectedNodeId={selectedNodeForBulk}
      />
    </ErrorBoundary>
  );
});
