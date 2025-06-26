'use client';

import { useMemo, useState, useCallback, memo, useEffect, useRef } from 'react';
import { AutoSizer, List, ListRowProps } from 'react-virtualized';
import { useInView } from 'react-intersection-observer';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import toast from 'react-hot-toast';
import { TreeNode } from './TreeNode';
import { Archive, MoreHorizontal, Loader } from 'lucide-react';
import { BulkAddModal } from './BulkAddModal';
import { NodeService } from '@/library/powersync/NodeService';
import type { Node } from '@/library/powersync/NodeService';
import { treeUtils } from '@/utils/treeUtils';
import rootStore from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';

export interface DisplayNode {
  node: Node & { has_children?: 0 | 1; children_count?: number; _is_pending?: number };
  level: number;
  isExpanded: boolean;
  // Pseudo-node for loading more children
  isLoadMoreNode?: boolean;
}

interface TreeViewProps {
  nodes: DisplayNode[];
  nodeService: NodeService;
  readOnly?: boolean;
  onToggleExpand: (nodeId: string) => void;
  onLoadMore?: (nodeId: string) => void;
  loadingMoreNodeId?: string | null;
}

const LoadMoreNode = ({
  displayNode,
  isLoading,
  onLoadMore
}: {
  displayNode: DisplayNode;
  isLoading: boolean;
  onLoadMore?: (nodeId: string) => void;
}) => {
  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: true, // Ensures it only fires once per appearance
    rootMargin: '500px 0px 500px 0px' // Trigger when 500px away from the viewport vertically
  });

  useEffect(() => {
    if (inView && !isLoading && onLoadMore && displayNode.node.parent_id) {
      onLoadMore(displayNode.node.parent_id);
    }
  }, [inView, isLoading, onLoadMore, displayNode.node.parent_id]);

  return (
    <div
      ref={ref}
      className={`w-full h-full flex items-center select-none rounded transition-colors ${isLoading ? 'cursor-default' : ''
        }`}
    >
      <div className="flex items-center min-h-[40px] px-2 w-full">
        <div style={{ paddingLeft: `${displayNode.level * 1.5}rem` }} className="flex-shrink-0" />
        <div className="w-6 flex-shrink-0 flex items-center justify-center rounded mx-1 my-0.5">
          {isLoading ? (
            <Loader className="w-4 h-4 text-gray-500 animate-spin" />
          ) : (
            <MoreHorizontal className="w-4 h-4 text-gray-500" />
          )}
        </div>
        <div className="flex-1 grow truncate">
          <div className="font-medium truncate text-gray-500 italic">
            {isLoading ? 'Loading...' : 'Loading...'}
          </div>
        </div>
      </div>
    </div>
  );
};

const ROW_HEIGHT = 48; // 40px height + 8px margin

const MemoizedTreeNode = memo(TreeNode);

export const TreeView = observer(
  ({ nodes, nodeService, readOnly = false, onToggleExpand, onLoadMore, loadingMoreNodeId }: TreeViewProps) => {
    const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
    const [selectedNodeForBulk, setSelectedNodeForBulk] = useState<string | null>(null);

    const listRef = useRef<List>(null);
    const lastSelectedNodeIdRef = useRef<string | null>(null);

    const nodeMap = useMemo(() => {
      const map = new Map<string, Node>();
      nodes.forEach(({ node }) => {
        if (node) {
          map.set(node.id, node);
        }
      });
      return map;
    }, [nodes]);

    useEffect(() => {
      const { selectedNodeId } = rootStore;
      if (listRef.current && selectedNodeId && selectedNodeId !== lastSelectedNodeIdRef.current) {
        lastSelectedNodeIdRef.current = selectedNodeId;

        const selectedIndex = nodes.findIndex(({ node }) => node && node.id === selectedNodeId);

        if (selectedIndex !== -1) {
          listRef.current.scrollToRow(selectedIndex);
        }
      }
    }, [rootStore.selectedNodeId, nodes]);

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

    const handleMove = useCallback(
      async (draggedNodeId: string, dropTargetNodeId: string | null) => {
        console.debug('[PoC::TreeView] 👉 handleMove(', draggedNodeId, ',', dropTargetNodeId, ')');
        if (readOnly) return;

        const sourceNode = nodeMap.get(draggedNodeId);
        const targetNode = dropTargetNodeId ? nodeMap.get(dropTargetNodeId) : null;

        if (!sourceNode || (dropTargetNodeId && !targetNode)) {
          toast.error('Unable to move node: Node not found');
          return;
        }

        if (draggedNodeId === dropTargetNodeId || isNodeAncestorOf(draggedNodeId, dropTargetNodeId || '')) {
          toast.error('Cannot move a node into its own subtree');
          return;
        }

        try {
          console.debug('[PoC::TreeView]    calling nodeService.moveNode…');
          if (!dropTargetNodeId) {
            throw new Error('Siblings reordering is not supported yet');
          }

          const newParentId = await nodeService.moveNode(draggedNodeId, dropTargetNodeId);
          if (newParentId) {
            rootStore.setSelectedNodeId(newParentId);
          }
          console.debug('[PoC::TreeView]    moveNode resolved');
          toast.success('Node moved successfully');
        } catch (error: any) {
          console.error('Failed to move node:', error);
          toast.error(error.message ?? 'Failed to move node');
        }
      },
      [readOnly, nodeMap, nodeService, isNodeAncestorOf, onToggleExpand]
    );

    const handleAddNode = useCallback(
      async (parentId: string | null) => {
        if (readOnly) return;

        try {
          const newParentId = await nodeService.createNode({
            parent_id: parentId,
            payload: JSON.stringify({ name: treeUtils.generateReadableName() })
          });
          if (newParentId) {
            rootStore.setSelectedNodeId(newParentId);
          }
          toast.success('Node added successfully');
        } catch (error: any) {
          console.error('Failed to add node:', error);
          toast.error(error.message ?? 'Failed to add node');
        }
      },
      [readOnly, nodeService]
    );

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

    const rowRenderer = ({ index, key, style }: ListRowProps) => {
      const displayNode = nodes[index];
      const { node, level, isExpanded, isLoadMoreNode } = displayNode;

      if (isLoadMoreNode && node.parent_id) {
        const isLoading = loadingMoreNodeId === node.parent_id;
        return (
          <div key={key} style={style} className="flex items-center">
            <LoadMoreNode displayNode={displayNode} isLoading={isLoading} onLoadMore={onLoadMore} />
          </div>
        );
      }

      const isSelected = rootStore.selectedNodeId === node.id;

      return (
        <div
          key={`${key}-${isSelected}`}
          style={{
            ...style
          }}
          className="flex items-center"
        >
          <MemoizedTreeNode
            node={{ ...node, children: [] }}
            level={level}
            onAddChild={handleAddNode}
            onDelete={handleDeleteNode}
            onMove={handleMove}
            onBulkAdd={handleBulkAdd}
            readOnly={readOnly}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
          />
        </div>
      );
    };

    return (
      <ErrorBoundary>
        <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
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
                    rowCount={nodes.length}
                    rowHeight={ROW_HEIGHT}
                    overscanRowCount={20}
                    recomputeRowHeights={false}
                    scrollToAlignment="auto"
                    rowRenderer={rowRenderer}
                  />
                )}
              </AutoSizer>
            )}
          </div>
          {isBulkAddModalOpen && (
            <BulkAddModal
              open={isBulkAddModalOpen}
              onClose={handleCloseBulkModal}
              selectedNodeId={selectedNodeForBulk!}
            />
          )}
        </div>
      </ErrorBoundary>
    );
  }
);
