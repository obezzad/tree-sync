'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { usePowerSync } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { queries, QueryDefinition, QueryParam } from '@/library/powersync/queries';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';

export interface TestResult {
	name: string;
	key: string;
	runs: number[];
	average: number;
}

export interface SimplePerfTestRef {
	runTests: () => void;
}

interface SimplePerfTestProps {
	testResults: TestResult[];
	isRunning: boolean;
	onNewResult: (result: TestResult) => void;
	onTestsStart: () => void;
	onTestsComplete: () => void;
}

export const SimplePerfTest = forwardRef<SimplePerfTestRef, SimplePerfTestProps>((
	{ testResults, isRunning, onNewResult, onTestsStart, onTestsComplete },
	ref
) => {
	const db = usePowerSync() as AbstractPowerSyncDatabase;

	const runTests = async () => {
		if (!db || isRunning) return;

		onTestsStart();

		const local_id = store.session?.user?.user_metadata?.local_id;
		const rootNodeId = uuidv5('ROOT_NODE', userService.getUserId());
		const sampleNode: any | undefined = await db.get('SELECT id FROM nodes LIMIT 1');
		const sampleNodeId = sampleNode?.id;

		const resolveParams = (params: QueryParam[]): any[] => {
			return params.map(p => {
				switch (p) {
					case 'userId':
						return local_id;
					case 'rootNodeId':
						return rootNodeId;
					case 'nodeId':
						return sampleNodeId;
					case 'focusedNodeId':
						return sampleNodeId;
					case 'parentId':
						return rootNodeId;
					case 'newNodeId':
						return uuidv4();
					case 'payload':
						return JSON.stringify({ content: `New node ${new Date().toISOString()}` });
					case 'isRecursive':
						return false;
					default:
						return null;
				}
			});
		};

		for (const key in queries) {
			if (queries[key].isMutation) {
				console.debug(`Skipping mutation test "${key}"`);
				continue;
			}
			const test: QueryDefinition = queries[key];
			const testParams = resolveParams(test.params);

			if (test.params.includes('nodeId') && !sampleNodeId) {
				console.log(`Skipping test "${test.title}" due to missing sample node.`);
				continue;
			}

			const runs: number[] = [];
			const loopCount = 3;
			for (let i = 0; i < loopCount; i++) {
				const start = performance.now();
				await db.execute(test.sql, testParams);
				const duration = performance.now() - start;
				runs.push(duration);
				if (loopCount > 1) {
					await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between runs
				}
			}
			const average = runs.reduce((a, b) => a + b, 0) / runs.length;
			onNewResult({ name: test.title, key, runs, average });
		}
		onTestsComplete();
	};

	useImperativeHandle(ref, () => ({
		runTests
	}));

	return (
		<div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
			<h2 className="text-xl font-bold mb-4">Wrapped Database Performance</h2>
			<p className="text-sm text-gray-600 mb-4">
				Auto-runs when the database is ready. <br />
				You can <b>re-run</b> the tests <b>manually</b> to <b>control for cold start.</b> Cold start is intentionally not instant on auto-run to test for interference of queries above.
			</p>
			<button
				onClick={runTests}
				disabled={isRunning || !db}
				className={`px-4 py-2 rounded font-medium ${
					isRunning
						? 'bg-gray-300 text-gray-500 cursor-not-allowed'
						: 'bg-red-600 text-white hover:bg-red-700'
				}`}
			>
				{isRunning ? 'Running...' : 'Re-Run Wrapped Database Performance Tests (recommended)'}
			</button>

			{isRunning && (
				<div className="mt-4 text-blue-600">Running tests...</div>
			)}

			{testResults.length > 0 && (
				<div className="space-y-4 mt-4">
					{testResults.map((result, index) => (
						<div
							key={index}
							className={`p-4 rounded border ${
								result.average > 100
									? 'bg-red-50 border-red-200'
									: result.average > 50
										? 'bg-yellow-50 border-yellow-200'
										: 'bg-green-50 border-green-200'
							}`}
						>
							<div className="flex justify-between items-start mb-2">
								<div>
									<span className="font-medium">{result.name}</span>
									<div className="text-xs font-mono text-gray-500 mt-1">{result.key}</div>
								</div>
								<div
									className={`text-lg font-bold ${
										result.average > 100
											? 'text-red-600'
											: result.average > 50
												? 'text-yellow-600'
												: 'text-green-600'
									}`}
								>
									{result.average > 1
										? `${result.average.toFixed(1)}ms`
										: `${(result.average * 1000).toFixed(1)}µs`}
								</div>
							</div>
							<div className="text-sm text-gray-600">
								Runs:{' '}
								{result.runs
									.map(r =>
										r > 1
											? `${r.toFixed(1)}ms`
											: `${(r * 1000).toFixed(1)}µs`
									)
									.join(', ')}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
});
