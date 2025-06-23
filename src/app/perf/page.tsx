'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { usePowerSync } from '@powersync/react';
import { useQuery, useStatus } from '@powersync/react';
import store from '@/stores/RootStore';
import { observer } from 'mobx-react-lite';
import { SimplePerfTest, SimplePerfTestRef, TestResult } from '@/components/SimplePerfTest';
import { queries } from '@/library/powersync/queries';

const useQueryBenchmarkQueries = Object.entries(queries).filter(
	([, query]) => !query.isMutation && !query.skipTests && (query.params.length === 0 || (query.params.length === 1 && query.params.includes('userId')))
).reduce((acc, [key, query]) => {
	acc[key] = {
		query,
		isReady: (data: any) => {
			if (!data) return false;
			if (Array.isArray(data)) return data.length > 0;
			if (typeof data[0]?.count === 'number') return data[0].count > 0;
			return false;
		}
	}
	return acc;
}, {} as { [key: string]: { query: typeof queries[string], isReady: (data: any) => boolean } });


const SingleQueryBenchmark = ({
	queryKey,
	query,
	params,
	isReady,
	onTimingComplete,
	initialTiming,
	rawPerfTime
}: {
	queryKey: string;
	query: { title: string; sql: string };
	params: any[];
	isReady: (data: any) => boolean;
	onTimingComplete: (key: string, time: number) => void;
	initialTiming: number | null;
	rawPerfTime?: number | null;
}) => {
	const startTime = useRef(performance.now());
	const { data } = useQuery(query.sql, params);

	useEffect(() => {
		if (initialTiming == null && isReady(data)) {
			const time = performance.now() - startTime.current;
			onTimingComplete(queryKey, time);
		}
	}, [data, isReady, onTimingComplete, queryKey, initialTiming]);

	const useQueryTimeMs = initialTiming;
	const rawTimeMs = rawPerfTime;
	const overheadMs = useQueryTimeMs != null && rawTimeMs != null ? useQueryTimeMs - rawTimeMs : null;

	const overheadColor =
		overheadMs == null ? '' : overheadMs > 100 ? 'text-red-600' : overheadMs > 50 ? 'text-yellow-600' : 'text-gray-500';

	return (
		<div className="flex justify-between items-center">
			<div>
				<div className="font-medium">{query.title}</div>
				<div className="text-xs text-gray-500 font-mono">{queryKey}</div>
			</div>
			<div className="font-mono text-right">
				<span className="font-bold">
					{useQueryTimeMs != null ? `${useQueryTimeMs.toFixed(1)}ms` : 'Waiting for data...'}
				</span>
				{rawTimeMs != null && overheadMs != null && (
					<div className={`text-xs ${overheadColor}`}>
						{`Raw: ${rawTimeMs.toFixed(1)}ms `}
						<span className="font-semibold">{`(+${overheadMs.toFixed(1)}ms)`}</span>
					</div>
				)}
			</div>
		</div>
	);
};

const UseQueryBenchmarks = observer(
	({ local_id, perfTestResults }: { local_id: string; perfTestResults: TestResult[] }) => {
		const [timings, setTimings] = useState<{ [key: string]: number | null }>({});
		const allTimingsRecorded = useRef(false);

		const rawPerfMap = useMemo(() => {
			const map = new Map<string, number>();
			if (perfTestResults) {
				perfTestResults.forEach(result => {
					map.set(result.key, result.average);
				});
			}
			return map;
		}, [perfTestResults]);

		const handleTimingComplete = (key: string, time: number) => {
			setTimings(prev => {
				if (prev[key] == null) {
					return { ...prev, [key]: time };
				}
				return prev;
			});
		};

		// Log to console when all timings are available
		useEffect(() => {
			const recordedCount = Object.values(timings).filter(t => t !== null).length;
			if (recordedCount === Object.keys(useQueryBenchmarkQueries).length && !allTimingsRecorded.current) {
				allTimingsRecorded.current = true;
				console.log('=== USEQUERY TIME TO FIRST DATA ===');
				Object.entries(useQueryBenchmarkQueries).forEach(([key, benchmark]) => {
					const time = timings[key];
					if (time) {
						console.log(`${benchmark.query.title} (${key}): ${(time! / 1000).toFixed(2)}s`);
					}
				});
				console.log('====================================');
			}
		}, [timings]);

		const queryEntries = useMemo(() => Object.entries(useQueryBenchmarkQueries), []);

		return (
			<>
				<div className="mb-6 p-4 bg-blue-50 rounded">
					<h3 className="text-lg font-semibold mb-2">PowerSync useQuery Time to First Data</h3>
					<p className="text-sm text-gray-600 mb-2">
						These queries are reactive and re-run on every change.
					</p>
					<div className="space-y-1 text-sm">
						{queryEntries.map(([key, benchmark]) => (
							<SingleQueryBenchmark
								key={key}
								queryKey={key}
								query={benchmark.query}
								params={benchmark.query.params.includes('userId') ? [local_id] : []}
								isReady={benchmark.isReady}
								onTimingComplete={handleTimingComplete}
								initialTiming={timings[key] ?? null}
								rawPerfTime={rawPerfMap.get(key)}
							/>
						))}
					</div>
				</div>
			</>
		);
	}
);

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

	const { data: nodeCountData } = useQuery(queries.countAllNodes.sql, local_id ? [local_id] : []);
	const syncedNodes = nodeCountData?.[0]?.count;

	const handleTestsStart = () => {
		setPerfTestResults([]);
		setIsPerfTestRunning(true);
	};

	const handleNewResult = (result: TestResult) => {
		setPerfTestResults(prevResults => {
			const newResults = [...prevResults];
			const index = newResults.findIndex(r => r.key === result.key);
			if (index !== -1) {
				newResults[index] = result;
			} else {
				newResults.push(result);
			}
			return newResults;
		});
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
	}, [db, local_id]);

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
						<div className="pt-2">
							<div>Synced Nodes: <b className="font-mono">{syncedNodes ?? '...'}</b></div>
						</div>
					</div>
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

			{rawTestsCompleted && local_id && <UseQueryBenchmarks local_id={local_id} perfTestResults={perfTestResults} />}

			<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
				<h2 className="text-lg font-bold mb-2">Performance Analysis Guide</h2>
				<div className="space-y-3 text-sm">
					<div>
						<strong>If "PowerSync useQuery Time to First Data" is high, but "Wrapped Database Performance" is good:</strong>
						<p className="text-gray-700">
							The overhead is likely in PowerSync's reactive layer or React's rendering
							cycle.
						</p>
					</div>
					<div>
						<strong>If both "PowerSync useQuery Time to First Data" and "Wrapped Database Performance" are poor:</strong>
						<p className="text-gray-700">
							The bottleneck could be at the database level (inefficient queries,
							missing indexes) or from overhead in the PowerSync, such as JSON serialization/deserialization between <a href="https://docs.powersync.com/architecture/client-architecture#schema" target="_blank" rel="noopener noreferrer" className='text-blue-600'>ps_data__*</a> and the views.
						</p>
					</div>
					<div>
						<strong>If both are good:</strong>
						<p className="text-gray-700">
							The performance issue is likely in expensive rendering (e.g., large tree rendering without pagination).
						</p>
					</div>
				</div>
			</div>
		</main>
	);
});

export default PerfPage;
