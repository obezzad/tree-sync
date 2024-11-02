'use client';

import { useState } from 'react';
import { TreeView } from '@/components/TreeView/TreeView';
import { NodeService } from '@/library/powersync/NodeService';
import { usePowerSync } from '@/components/providers/SystemProvider';
import { useQuery, useStatus } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import { initializeStore } from '@/stores/RootStore';

export default function Home() {
  const db = usePowerSync();

  if (!db) throw new Error('PowerSync context not found');

  const store = initializeStore();
  const local_id = store.session?.user?.user_metadata?.local_id;
  const [nodeService] = useState(() => new NodeService(db as AbstractPowerSyncDatabase));

  const { data: allNodes } = useQuery('SELECT count(id) as count FROM nodes');
  const { data: userNodes } = useQuery('SELECT count(id) as count FROM nodes WHERE user_id = ?', [local_id]);
  const { data: nodes } = useQuery('SELECT * FROM nodes WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at', [local_id]);
  const { data: buckets } = useQuery(`SELECT count(DISTINCT bucket) as bucket_count FROM ps_oplog`);
  const status = useStatus();

  const bucketCount = buckets[0]?.bucket_count ?? 0;

  return (
    <main className="min-h-screen flex flex-col gap-4 items-center p-8">
      <p>User's buckets/thoughtspaces: <b>{bucketCount}</b></p>
      <p>All synced nodes across thoughtspaces: <b>{allNodes[0]?.count ?? 0}</b></p>
      <p>
        Nodes of this user:{' '}
        {
          local_id ?
            <b>{userNodes[0]?.count ?? 0}</b> :
            <span className='text-gray-500'>Loading...</span>
        }
      </p>
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
}
