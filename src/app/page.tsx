'use client';

import { useEffect, useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { NodeService } from '@/library/powersync/NodeService';
import { usePowerSync } from '@powersync/react';
import { useQuery, useStatus } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { initializeAuthStore } from '@/stores/AuthStore';
import { observer } from 'mobx-react-lite';
import { v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';

const Home = observer(() => {
  const db = usePowerSync();

  if (!db) throw new Error('PowerSync context not found');

  const authStore = initializeAuthStore();

  const local_id = store.session?.user?.user_metadata?.local_id;
  const [nodeService] = useState(() => new NodeService(db as AbstractPowerSyncDatabase));

  const { data: allNodes } = useQuery('SELECT count(id) as count FROM nodes');
  const { data: userNodes } = useQuery('SELECT count(id) as count FROM nodes WHERE user_id = ?', [local_id]);
  const { data: nodes } = useQuery(`SELECT * FROM nodes WHERE user_id = ? ${store.showArchivedNodes ? '' : 'AND archived_at IS NULL'} ORDER BY created_at DESC`, [local_id]);
  const { data: buckets } = useQuery(`SELECT count(DISTINCT bucket) as bucket_count FROM ps_oplog`);
  const { data: downloadedOps } = useQuery('select count() as count from ps_oplog');
  const { data: pendingUpload } = useQuery('select count(distinct tx_id) as count from ps_crud');
  const status = useStatus();

  const [remoteCount, setRemoteCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data, count } = await authStore.supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', local_id);

      setRemoteCount(count);
    };

    fetchData();
  }, [downloadedOps]);

  useEffect(() => {
    if (!store.selectedNodeId) {
      store.selectedNodeId = uuidv5("ROOT_NODE", userService.getUserId())
    }
  }, []);

  return (
    <main className="flex flex-col gap-4 items-center p-8">
      <p>User's buckets: <b>{buckets[0]?.bucket_count ?? 0}</b></p>
      <p>All synced nodes across buckets: {' '}
        <b>
          {allNodes[0]?.count ?? 0}
          {remoteCount ?
            <>
              {' /'} {remoteCount} ({Math.round((allNodes[0]?.count ?? 0) / remoteCount * 10000) / 100}%)
            </> : <span className='text-gray-500'>Loading...</span>}
        </b>
      </p>
      <p>
        Nodes of this user:{' '}
        {
          local_id ?
            <b>{userNodes[0]?.count ?? 0}</b> :
            <span className='text-gray-500'>Loading...</span>
        }
      </p>
      <p>Downloaded ops: <b>{downloadedOps[0]?.count ?? 0}</b></p>
      <p>Mutations pending upload: <b>{pendingUpload[0]?.count ?? 0}</b></p>
      <p>Last selected node: <b>{store.selectedNodeId}</b></p>
      <p>Selected nodes: <b>{store._syncedNodes.length}</b></p>
      <div>
        {status.connected ?
          <span className='text-green-500'>Connected to server</span> :
          <span className='text-red-500'>Not connected to server</span>}
      </div>
      <div>
        {status.hasSynced ?
          <span className='text-green-500'>Initial sync completed</span> :
          <span className='text-red-500'>Initial sync pending</span>}
      </div>
      <TreeView
        nodes={nodes}
        nodeService={nodeService}
      />
    </main>
  );
});

export default Home;
