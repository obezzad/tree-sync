'use client';

import { useEffect, useState, useRef } from 'react';
import { usePowerSync } from '@powersync/react';
import { useQuery, useStatus } from '@powersync/react';
import store from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';
import { SimplePerfTest, SimplePerfTestRef, TestResult } from '@/components/SimplePerfTest';

const PerfPage = observer(() => {
	const db = usePowerSync();
	const [testStarted, setTestStarted] = useState(false);
	const mountTimeRef = useRef<number | null>(null);
	const perfTestRef = useRef<SimplePerfTestRef>(null);
	const initialRunStarted = useRef(false);
	const [timeToConnected, setTimeToConnected] = useState<number | null>(null);
	const [timeToSynced, setTimeToSynced] = useState<number | null>(null);
	const [timeToReady, setTimeToReady] = useState<number | null>(null);
	const [timeToFirstSync, setTimeToFirstSync] = useState<number | null>(null);
	const [perfTestResults, setPerfTestResults] = useState<TestResult[]>([]);
	const [isPerfTestRunning, setIsPerfTestRunning] = useState(false);

	if (!db) throw new Error('PowerSync context not found');

	const local_id = store.session?.user?.user_metadata?.local_id;

	// Test Query 1: Simple count all nodes
	const startTime1 = performance.now();
	const { data: allNodes } = useQuery('SELECT count(id) as count FROM nodes');
	const endTime1 = performance.now();

	// Test Query 2: Count user nodes
	const startTime2 = performance.now();
	const { data: userNodes } = useQuery('SELECT count(id) as count FROM nodes WHERE user_id = ?', [local_id]);
	const endTime2 = performance.now();

	// Test Query 3: Count remote nodes (non-pending)
	const startTime3 = performance.now();
	const { data: remoteNodes } = useQuery('SELECT count(id) as count FROM nodes WHERE user_id = ? AND _is_pending IS NULL', [local_id]);
	const endTime3 = performance.now();

	// Test Query 4: Simple node fetch with limit
	const startTime4 = performance.now();
	const { data: sampleNodes } = useQuery('SELECT id, created_at, user_id FROM nodes WHERE user_id = ? LIMIT 100', [local_id]);
	const endTime4 = performance.now();

	const { connected, hasSynced } = useStatus();

	const handleTestsStart = () => {
		setPerfTestResults([]);
		setIsPerfTestRunning(true);
	};

	const handleNewResult = (result: TestResult) => {
		setPerfTestResults(prevResults => [...prevResults, result]);
	};

	const handleTestsComplete = () => {
		setIsPerfTestRunning(false);
	};

	useEffect(() => {
		mountTimeRef.current = performance.now();

		const measurePromises = async () => {
			if (!db || !mountTimeRef.current) return;

			if (initialRunStarted.current) return;
			initialRunStarted.current = true;

			const mountTime = mountTimeRef.current;

			await db.waitForReady();
			setTimeToReady(performance.now() - mountTime);
			perfTestRef.current?.runTests();

			await db.waitForFirstSync();
			setTimeToFirstSync(performance.now() - mountTime);
		};

		measurePromises();
	}, [db]);

	useEffect(() => {
		if (mountTimeRef.current === null) return;
		if (connected && timeToConnected === null) {
			setTimeToConnected(performance.now() - mountTimeRef.current);
		}
		if (hasSynced && timeToSynced === null) {
			setTimeToSynced(performance.now() - mountTimeRef.current);
		}
	}, [connected, hasSynced, timeToConnected, timeToSynced]);

	// Track query times
	useEffect(() => {
		if (allNodes && userNodes && remoteNodes && sampleNodes && !testStarted) {
			setTestStarted(true);
			const times = {
				'Count All Nodes (useQuery)': endTime1 - startTime1,
				'Count User Nodes (useQuery)': endTime2 - startTime2,
				'Count Remote Nodes (useQuery)': endTime3 - startTime3,
				'Fetch Sample Nodes (useQuery)': endTime4 - startTime4,
			};

			console.log('=== USEQUERY PERFORMANCE TEST ===');
			Object.entries(times).forEach(([query, time]) => {
				console.log(`${query}: ${time.toFixed(2)}ms`);
			});
			console.log('====================================');
		}
	}, [allNodes, userNodes, remoteNodes, sampleNodes, testStarted, endTime1, startTime1, endTime2, startTime2, endTime3, startTime3, endTime4, startTime4]);

	return (
		<main className="p-8 max-w-6xl mx-auto space-y-8">
			<div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
				<div className="flex items-center justify-between">
					<h1 className="text-3xl font-bold">Database Performance Testing</h1>
					<a
						href="/"
						className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
					>
						← Back to App
					</a>
				</div>
				<p className="text-gray-600 mt-2">
					Isolated performance testing to identify bottlenecks with large datasets
				</p>
			</div>

			<div className="bg-white rounded-lg shadow-lg p-6">
				<h2 className="text-2xl font-bold mb-6">System Status</h2>

				<div className="mb-6 p-4 bg-gray-50 rounded">
					<h3 className="text-lg font-semibold mb-2">Connection Status</h3>
					<div className="space-y-1 text-sm">
						<div>Database Ready: <span className={timeToReady !== null ? 'text-green-600' : 'text-red-600'}>{timeToReady !== null ? 'Yes' : 'No'}</span></div>
						<div>Initial Sync: <span className={hasSynced ? 'text-green-600' : 'text-red-600'}>{hasSynced ? 'Complete' : 'Pending'}</span></div>
						<div>Connected to Server: <span className={connected ? 'text-green-600' : 'text-red-600'}>{connected ? 'Yes' : 'No'}</span></div>
						<div>User ID: <span className="font-mono text-xs">{local_id}</span></div>
						<div className="pt-2">
							<div>Time to Ready: <b className="font-mono">{timeToReady !== null ? `${(timeToReady / 1000).toFixed(2)}s` : '...'}</b></div>
							<div>Time to First Sync: <b className="font-mono">{timeToFirstSync !== null ? `${(timeToFirstSync / 1000).toFixed(2)}s` : '...'}</b></div>
							<div>Time to Connect: <b className="font-mono">{timeToConnected !== null ? `${(timeToConnected / 1000).toFixed(2)}s` : '...'}</b></div>
						</div>
					</div>
				</div>

				<div className="mb-6 p-4 bg-blue-50 rounded">
					<h3 className="text-lg font-semibold mb-2">PowerSync useQuery Results</h3>
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>Total Nodes: <span className="font-bold">{allNodes?.[0]?.count ?? 'Loading...'}</span></div>
						<div>User Nodes: <span className="font-bold">{userNodes?.[0]?.count ?? 'Loading...'}</span></div>
						<div>Synced Nodes: <span className="font-bold">{remoteNodes?.[0]?.count ?? 'Loading...'}</span></div>
						<div>Sample Fetched: <span className="font-bold">{sampleNodes?.length ?? 'Loading...'}</span></div>
					</div>
				</div>

				<div className="p-4 bg-gray-50 rounded">
					<h4 className="font-semibold mb-2">Sample Data (First 3 nodes)</h4>
					<pre className="text-xs overflow-auto max-h-40">
						{JSON.stringify(sampleNodes?.slice(0, 3), null, 2)}
					</pre>
				</div>
			</div>

			<SimplePerfTest
				ref={perfTestRef}
				testResults={perfTestResults}
				isRunning={isPerfTestRunning}
				onNewResult={handleNewResult}
				onTestsStart={handleTestsStart}
				onTestsComplete={handleTestsComplete}
			/>

			<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
				<h2 className="text-lg font-bold mb-2">Performance Analysis Guide</h2>
				<div className="space-y-3 text-sm">
					<div>
						<strong>If PowerSync useQuery is slow but raw database is fast:</strong>
						<p className="text-gray-700">Problem is in PowerSync's reactive layer, React re-rendering, or change detection overhead.</p>
					</div>
					<div>
						<strong>If both PowerSync and raw database are slow:</strong>
						<p className="text-gray-700">Problem is at the database level - check indexes, query optimization, or SQLite configuration.</p>
					</div>
					<div>
						<strong>If both are fast:</strong>
						<p className="text-gray-700">Problem was in the application layer (tree rendering, complex UI operations, etc.).</p>
					</div>
				</div>
			</div>
		</main>
	);
});

export default PerfPage;
