'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { TreeView, DisplayNode } from '@/components/TreeView/TreeView';
import { Node, NodeService } from '@/library/powersync/NodeService';
import { usePowerSync, useQuery, useStatus } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';
import { v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';
import { queries } from '@/library/powersync/queries';

const CHILDREN_PAGE_SIZE = 50;

type VisibleNode = Node & {
  has_children: 0 | 1;
  level: number;
  children_count: number;
  _is_pending: number;
};

const Home = observer(() => {
  const db = usePowerSync();
  if (!db) throw new Error('PowerSync context not found');

  const [nodeService] = useState(() => new NodeService(db as AbstractPowerSyncDatabase));

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [nodeLimits, setNodeLimits] = useState<Record<string, number>>({});
  const [loadingMoreNodeId, setLoadingMoreNodeId] = useState<string | null>(null);

  // Memoize query parameters
  const expandedNodesJson = useMemo(() => JSON.stringify(Array.from(expandedNodes)), [expandedNodes]);
  const expandedLimitsJson = useMemo(() => JSON.stringify(nodeLimits), [nodeLimits]);

  const { data: visibleNodes } = useQuery<VisibleNode>(queries.getVisibleTree.sql, [
    expandedNodesJson,
    expandedLimitsJson
  ]);

  const displayNodes: DisplayNode[] = useMemo(() => {
    if (!visibleNodes) return [];

    const finalDisplayNodes: DisplayNode[] = visibleNodes.map((node) => ({
      node: node,
      level: node.level,
      isExpanded: expandedNodes.has(node.id)
    }));

    const nodeChildrenCounts: Record<string, number> = {};
    visibleNodes.forEach((node) => {
      if (node.parent_id) {
        nodeChildrenCounts[node.parent_id] = (nodeChildrenCounts[node.parent_id] || 0) + 1;
      }
    });

    for (let i = finalDisplayNodes.length - 1; i >= 0; i--) {
      const displayNode = finalDisplayNodes[i];
      const { node } = displayNode;

      if (expandedNodes.has(node.id) && node.has_children) {
        const loadedCount = nodeChildrenCounts[node.id] || 0;
        if (node.children_count > loadedCount) {
          const loadMoreNode: DisplayNode = {
            node: { parent_id: node.id, id: `load-more-${node.id}` } as any,
            level: displayNode.level + 1,
            isExpanded: false,
            isLoadMoreNode: true
          };
          finalDisplayNodes.splice(i + loadedCount + 1, 0, loadMoreNode);
        }
      }
    }
    return finalDisplayNodes;
  }, [visibleNodes, expandedNodes]);

  const handleToggleExpand = useCallback((nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
      // Set initial limit when expanding for the first time
      if (!nodeLimits[nodeId]) {
        setNodeLimits(prev => ({ ...prev, [nodeId]: CHILDREN_PAGE_SIZE }));
      }
    }
    setExpandedNodes(newExpanded);
  }, [expandedNodes, nodeLimits]);

  const handleLoadMore = useCallback(async (nodeId: string) => {
    setLoadingMoreNodeId(nodeId);
    // The query will refetch automatically when nodeLimits changes.
    // We can add a small delay to make the loading state more perceptible on fast connections.
    await new Promise(resolve => setTimeout(resolve, 300));

    setNodeLimits(prev => ({
      ...prev,
      [nodeId]: (prev[nodeId] || CHILDREN_PAGE_SIZE) + CHILDREN_PAGE_SIZE
    }));
    setLoadingMoreNodeId(null);
  }, []);

  useEffect(() => {
    if (store.selectedNodeId && !expandedNodes.has(store.selectedNodeId)) {
      // Simple case: if a node is selected, ensure it's expanded.
      // The query will handle fetching the data. The user might need to scroll.
      // A more sophisticated auto-expand to reveal logic can be added here if needed.
      const node = visibleNodes?.find(n => n.id === store.selectedNodeId);
      if (node?.has_children) {
        handleToggleExpand(node.id);
      }
    }
  }, [store.selectedNodeId, visibleNodes, expandedNodes, handleToggleExpand]);

  // Sidebar state
  const { data: pendingUpload } = useQuery(queries.countPendingUploads.sql);
  const { downloadProgress, dataFlowStatus, connected, hasSynced } = useStatus();
  const local_id = store.session?.user?.user_metadata?.local_id;
  const { data: userNodes } = useQuery(queries.countAllNodes.sql, [local_id]);

  useEffect(() => {
    if (!store.selectedNodeId) {
      store.setSelectedNodeId(uuidv5('ROOT_NODE', userService.getUserId()));
    }
  }, []);

  return (
    <main className="flex h-[calc(100vh-theme(spacing.16))]">
      <aside className="hidden sm:flex sm:w-72 py-1 px-2 border-r flex-col gap-0.5 text-xs">
        <div className="mb-2 pb-2 border-b border-gray-200">
          <a
            href="/perf"
            className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 rounded transition-colors"
          >
            🔍 Performance Testing
          </a>
        </div>

        <div className="text-gray-600 leading-tight">
          User nodes: <b className="text-black">{userNodes?.[0]?.count ?? 0}</b>
        </div>
        <div className="text-gray-600 leading-tight">
          Selected ID: <b className="text-black truncate block">{store.selectedNodeId}</b>
        </div>
        <div className="text-gray-600 leading-tight">
          Selected nodes count: <b className="text-black">{store._syncedNodes.length}</b>
        </div>
        <div className="leading-tight">
          {connected ? (
            <span className="text-green-500">Connected to sync server</span>
          ) : (
            <span className="text-red-500">Offline</span>
          )}
          {' • '}
          {hasSynced ? (
            <span className="text-green-500">Initial sync done</span>
          ) : (
            <span className="text-red-500">Pending initial sync</span>
          )}
        </div>
        {dataFlowStatus.downloading && (
          <>
            <div className="text-blue-600 leading-tight">
              <div>Downloading...</div>
              <div>
                {downloadProgress.downloadedOperations} / {downloadProgress.totalOperations}
                {` `} ({Math.round(downloadProgress.downloadedFraction * 10000) / 100}%)
              </div>
            </div>
          </>
        )}
        {dataFlowStatus.uploading && (
          <>
            <div className="text-blue-600 leading-tight">Uploading... ({pendingUpload?.[0]?.count ?? 0})</div>
          </>
        )}
      </aside>
      <section className="flex-1 h-full overflow-y-auto">
        <TreeView
          nodes={displayNodes}
          nodeService={nodeService}
          onToggleExpand={handleToggleExpand}
          onLoadMore={handleLoadMore}
          loadingMoreNodeId={loadingMoreNodeId}
        />
      </section>
    </main>
  );
});

export default Home;
