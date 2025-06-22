'use client';

import { useMemo, useState, useCallback, memo, useEffect, useRef } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import toast from 'react-hot-toast';
import { TreeNode } from './TreeNode';
import { Archive } from 'lucide-react';
import { BulkAddModal } from './BulkAddModal';
import { NodeService } from '@/library/powersync/NodeService';
import type { Node } from '@/library/powersync/NodeService';
import { treeUtils } from '@/utils/treeUtils';
import rootStore from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';

interface TreeNodeData extends Node {
  children: TreeNodeData[];
}

interface TreeViewProps {
  nodes: Node[];
  nodeService: NodeService;
  readOnly?: boolean;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
}

const ROW_HEIGHT = 48; // 40px height + 8px margin

const MemoizedTreeNode = memo(TreeNode);

export const TreeView = observer(({ nodes, nodeService, readOnly = false, expandedNodes, onToggleExpand }: TreeViewProps) => {
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [selectedNodeForBulk, setSelectedNodeForBulk] = useState<string | null>(null);

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>();
    nodes.forEach(node => {
      map.set(node.id, node);
    });
    return map;
  }, [nodes]);

  const treeData = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      return [];
    }

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

  const expandedNodesMap = useMemo(() => {
    const map = new Map<string, boolean>();
    nodes.forEach(node => {
      map.set(node.id, expandedNodes.has(node.id));
    });
    return map;
  }, [nodes, expandedNodes]);

  const flattenedNodes = useMemo(() => {
    const flattened: Array<{ node: TreeNodeData; level: number }> = [];
    const flatten = (tree: TreeNodeData[], level: number) => {
      tree.forEach(treeNode => {
        flattened.push({ node: treeNode, level });
        if (expandedNodesMap.get(treeNode.id) && treeNode.children.length > 0) {
          flatten(treeNode.children, level + 1);
        }
      });
    };
    flatten(treeData, 0);
    return flattened;
  }, [treeData, expandedNodesMap]);

  const listRef = useRef<List>(null);
  const lastSelectedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const { selectedNodeId } = rootStore;
    if (listRef.current && selectedNodeId && selectedNodeId !== lastSelectedNodeIdRef.current) {
      lastSelectedNodeIdRef.current = selectedNodeId;

      const selectedIndex = flattenedNodes.findIndex(({ node }) => node.id === selectedNodeId);

      if (selectedIndex !== -1) {
        listRef.current.scrollToRow(selectedIndex);
      } else {
        const node = nodeMap.get(selectedNodeId);
        if (node) {
          const parentIdsToExpand: string[] = [];
          let parent = nodeMap.get(node.parent_id);
          while (parent) {
            if (!expandedNodes.has(parent.id)) {
              parentIdsToExpand.push(parent.id);
            }
            parent = nodeMap.get(parent.parent_id);
          }
          parentIdsToExpand.reverse().forEach(onToggleExpand);
        }
      }
    }
  }, [rootStore.selectedNodeId, flattenedNodes, expandedNodes, onToggleExpand, nodeMap]);

  const isNodeAncestorOf = useCallback((potentialAncestorId: string, nodeId: string): boolean => {
    let currentNode = nodeMap.get(nodeId);
    while (currentNode && currentNode.parent_id) {
      if (currentNode.parent_id === potentialAncestorId) {
        return true;
      }
      currentNode = nodeMap.get(currentNode.parent_id);
    }
    return false;
  }, [nodeMap]);

  const handleMove = useCallback(async (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    console.debug('👉 handleMove(', sourceId, ',', targetId, ',', position, ')');
    if (readOnly) return;

    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    if (!sourceNode || !targetNode) {
      toast.error('Unable to move node: Node not found');
      return;
    }

    if (sourceId === targetId || isNodeAncestorOf(sourceId, targetId)) {
      toast.error('Cannot move a node into its own subtree');
      return;
    }

    try {
      console.debug('   calling nodeService.moveNode…');
      if (position !== 'inside') {
        throw new Error('Siblings reordering is not supported yet');
      }

      await nodeService.moveNode(sourceId, targetId);
      console.debug('   moveNode resolved');

      toast.success('Node moved successfully');
    } catch (error: any) {
      console.error('Failed to move node:', error);
      toast.error(error.message ?? 'Failed to move node');
    }
  }, [readOnly, nodeMap, nodeService, isNodeAncestorOf]);

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

    try {
      await nodeService.deleteNode(nodeId);
      toast.success('Node deleted successfully');
    } catch (error: any) {
      console.error('Failed to delete node:', error);
      toast.error(error.message ?? 'Failed to delete node');
    }
  }, [readOnly, nodeService]);

  return (
    <ErrorBoundary>
      <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-2 border-b border-gray-200 flex justify-end items-center">
        <div className="flex gap-2">
          <button
            onClick={() => rootStore.setShowArchivedNodes(!rootStore.showArchivedNodes)}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 rounded flex items-center gap-1"
          >
            <Archive className="w-4 h-4" />
            {rootStore.showArchivedNodes ? 'Hide Archived' : 'Show Archived'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto" style={{ height: '80vh' }}>
          {nodes.length === 0 ? (
            <div className="text-center text-gray-500 p-4">
              <div className="mb-4">No nodes available</div>
            </div>
          ) : (
            <AutoSizer>
              {({ width, height }) => (
                <List
                  ref={listRef}
                  width={width}
                  height={height}
                  rowCount={flattenedNodes.length}
                  rowHeight={ROW_HEIGHT}
                  overscanRowCount={20}
                  recomputeRowHeights={false}
                  scrollToAlignment="auto"
                  rowRenderer={({ index, key, style }) => {
                    const { node, level } = flattenedNodes[index];
                    const isSelected = rootStore.selectedNodeId === node.id;

                    return (
                      <div
                        key={`${key}-${isSelected}`}
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
                          isExpanded={expandedNodes.has(node.id)}
                          onToggleExpand={onToggleExpand}
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
