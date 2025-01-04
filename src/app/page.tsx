'use client';

import { useEffect, useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { NodeService } from '@/library/powersync/NodeService';
import { usePowerSync } from '@/components/providers/SystemProvider';
import { useQuery, useStatus } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import { initializeStore } from '@/stores/RootStore';
import { initializeAuthStore } from '@/stores/AuthStore';
import { observer } from 'mobx-react-lite';

const Home = observer(() => {
  const db = usePowerSync();

  if (!db) throw new Error('PowerSync context not found');

  const store = initializeStore();
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

  const bucketCount = buckets[0]?.bucket_count ?? 0;

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

  return (
    <main className="flex flex-col gap-4 items-center p-8">
      <p>User's buckets: <b>{bucketCount}</b></p>
      <p>All synced nodes across buckets: <b>{allNodes[0]?.count ?? 0}</b></p>
      <p>
        Nodes of this user:{' '}
        {
          local_id ?
            <b>{userNodes[0]?.count ?? 0}</b> :
            <span className='text-gray-500'>Loading...</span>
        }
      </p>
      <p>Downloaded ops: {remoteCount ?
        <b>{downloadedOps[0]?.count ?? 0}/{remoteCount} ({Math.round((downloadedOps[0]?.count ?? 0) / remoteCount * 10000)/100}%)</b> :
        <span className='text-gray-500'>Loading...</span>}
      </p>
      <p>Mutations pending upload: <b>{pendingUpload[0]?.count ?? 0}</b></p>
      <div>
        {status.connected ?
          <span className='text-green-500'>Connected to server</span> :
          <span className='text-red-500'>Not connected to server</span>}
      </div>
      <TreeView
        nodes={nodes}
        nodeService={nodeService}
      />
    </main>
  );
});

export default Home;
