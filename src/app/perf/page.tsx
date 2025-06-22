'use client';

import { useEffect, useState, useRef } from 'react';
import { usePowerSync } from '@powersync/react';
import { useQuery, useStatus } from '@powersync/react';
import store from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';
import { SimplePerfTest, SimplePerfTestRef, TestResult } from '@/components/SimplePerfTest';
import { queries } from '@/library/powersync/queries';

const UseQueryBenchmarks = observer(({ local_id }: { local_id: string }) => {
	const [timings, setTimings] = useState<{ [key: string]: number | null }>({});
	const allTimingsRecorded = useRef(false);

	const benchmarkQueries = {
		'Time to First Count All Nodes': {
			query: queries.countAllNodes,
			params: [],
			isReady: (data: any) => data && data[0] && data[0].count > 0,
		},
		'Time to First Count User Nodes': {
			query: queries.countUserNodes,
			params: [local_id],
			isReady: (data: any) => data && data[0] && data[0].count > 0,
		},
		'Time to First Fetched Sample': {
			query: queries.getSampleNodes,
			params: [local_id],
			isReady: (data: any) => data && data.length > 0,
		}
	};

	// --- Query 1 ---
	const startTime1 = useRef(performance.now());
	const { data: allNodes } = useQuery(benchmarkQueries['Time to First Count All Nodes'].query.sql);
	useEffect(() => {
		if (benchmarkQueries['Time to First Count All Nodes'].isReady(allNodes) && timings['Time to First Count All Nodes'] === undefined) {
			const time = performance.now() - startTime1.current;
			setTimings(prev => ({ ...prev, 'Time to First Count All Nodes': time }));
		}
	}, [allNodes]);

	// --- Query 2 ---
	const startTime2 = useRef(performance.now());
	const { data: userNodes } = useQuery(benchmarkQueries['Time to First Count User Nodes'].query.sql, [local_id]);
	useEffect(() => {
		if (benchmarkQueries['Time to First Count User Nodes'].isReady(userNodes) && timings['Time to First Count User Nodes'] === undefined) {
			const time = performance.now() - startTime2.current;
			setTimings(prev => ({ ...prev, 'Time to First Count User Nodes': time }));
		}
	}, [userNodes]);

	// --- Query 3 ---
	const startTime3 = useRef(performance.now());
	const { data: sampleNodes } = useQuery(benchmarkQueries['Time to First Fetched Sample'].query.sql, [local_id]);
	useEffect(() => {
		if (benchmarkQueries['Time to First Fetched Sample'].isReady(sampleNodes) && timings['Time to First Fetched Sample'] === undefined) {
			const time = performance.now() - startTime3.current;
			setTimings(prev => ({ ...prev, 'Time to First Fetched Sample': time }));
		}
	}, [sampleNodes]);

	// Log to console when all timings are available
	useEffect(() => {
		const recordedCount = Object.values(timings).filter(t => t !== null).length;
		if (recordedCount === Object.keys(benchmarkQueries).length && !allTimingsRecorded.current) {
			allTimingsRecorded.current = true;
			console.log('=== USEQUERY TIME TO FIRST DATA ===');
			Object.entries(timings).forEach(([query, time]) => {
				console.log(`${query}: ${(time! / 1000).toFixed(2)}s`);
			});
			console.log('====================================');
		}
	}, [timings]);

	return (
		<>
			<div className="mb-6 p-4 bg-blue-50 rounded">
				<h3 className="text-lg font-semibold mb-2">PowerSync useQuery Results</h3>
				<div className="grid grid-cols-2 gap-4 text-sm">
					<div>Total Nodes: <span className="font-bold">{allNodes?.[0]?.count ?? 'Loading...'}</span></div>
					<div>User Nodes: <span className="font-bold">{userNodes?.[0]?.count ?? 'Loading...'}</span></div>
					<div>Sample Fetched: <span className="font-bold">{sampleNodes?.length ?? 'Loading...'}</span></div>
				</div>

				<div className="mt-4 pt-4 border-t border-blue-200">
					<h4 className="font-semibold mb-2 text-md">Time to First Data</h4>
					<div className="space-y-1 text-sm">
						{Object.keys(benchmarkQueries).map((name) => (
							<div key={name} className="flex justify-between">
								<span>{name}:</span>
								<span className="font-bold font-mono">
									{timings[name] != null ? `${((timings[name] as number)/1000).toFixed(2)}s` : 'Waiting for data...'}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="p-4 bg-gray-50 rounded">
				<h4 className="font-semibold mb-2">Sample Data (First 100 nodes)</h4>
				<pre className="text-xs overflow-auto max-h-40">
						{JSON.stringify(sampleNodes, null, 2)}
					</pre>
			</div>
		</>
	);
});

const PerfPage = observer(() => {
	const db = usePowerSync();
	const mountTimeRef = useRef<number | null>(null);
	const perfTestRef = useRef<SimplePerfTestRef>(null);
	const initialRunStarted = useRef(false);
	const [timeToConnected, setTimeToConnected] = useState<number | null>(null);
	const [timeToSynced, setTimeToSynced] = useState<number | null>(null);
	const [timeToReady, setTimeToReady] = useState<number | null>(null);
	const [timeToFirstSync, setTimeToFirstSync] = useState<number | null>(null);
	const [perfTestResults, setPerfTestResults] = useState<TestResult[]>([]);
	const [isPerfTestRunning, setIsPerfTestRunning] = useState(false);
	const [rawTestsCompleted, setRawTestsCompleted] = useState(false);

	if (!db) throw new Error('PowerSync context not found');

	const local_id = store.session?.user?.user_metadata?.local_id;

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
		setRawTestsCompleted(true);
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
							<div>Time to DB Ready: <b className="font-mono">{timeToReady !== null ? `${(timeToReady / 1000).toFixed(2)}s` : '...'}</b></div>
							<div>Time to First Sync: <b className="font-mono">{timeToFirstSync !== null ? `${(timeToFirstSync / 1000).toFixed(2)}s` : '...'}</b></div>
							<div>Time to Connect: <b className="font-mono">{timeToConnected !== null ? `${(timeToConnected / 1000).toFixed(2)}s` : '...'}</b></div>
						</div>
					</div>
				</div>

				{rawTestsCompleted && local_id ? (
					<UseQueryBenchmarks local_id={local_id} />
				) : (
					<div className="mb-6 p-4 bg-blue-50 rounded">
						<h3 className="text-lg font-semibold mb-2">PowerSync useQuery Results</h3>
						<div className="text-sm text-gray-500">
							Waiting for raw performance tests to complete...
						</div>
					</div>
				)}
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
