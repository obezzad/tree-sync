'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { usePowerSync } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { queries } from '@/library/powersync/queries';
import { v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';

export interface TestResult {
	name: string;
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

		const tests = [
			{ name: 'Cold Start Probe (SELECT 1)', query: 'SELECT 1 as probe', params: [] },
			{ name: 'List All Node IDs', query: queries.getAllNodeIds, params: [] },
			{
				name: 'List All Node IDs for User',
				query: queries.getAllNodeIdsForUser,
				params: [local_id]
			},
			{
				name: 'List All Descendant IDs of Root',
				query: queries.getDescendantsOfNode,
				params: [rootNodeId]
			}
		];

		for (const test of tests) {
			const runs: number[] = [];
			for (let i = 0; i < 3; i++) {
				const start = performance.now();
				await db.execute(test.query, test.params);
				const duration = performance.now() - start;
				runs.push(duration);
				await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between runs
			}
			const average = runs.reduce((a, b) => a + b, 0) / runs.length;
			onNewResult({ name: test.name, runs, average });
		}
		onTestsComplete();
	};

	useImperativeHandle(ref, () => ({
		runTests
	}));

	return (
		<div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
			<h2 className="text-xl font-bold mb-4">Raw Database Performance</h2>
			<p className="text-sm text-gray-600 mb-4">
				Auto-runs when the database is ready. <br />
				You can <b>re-run</b> them <b>manually</b> to <b>control for cold start.</b>
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
				{isRunning ? 'Running...' : 'Run Raw Performance Tests'}
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
								<span className="font-medium">{result.name}</span>
								<div
									className={`text-lg font-bold ${
										result.average > 100
											? 'text-red-600'
											: result.average > 50
												? 'text-yellow-600'
												: 'text-green-600'
									}`}
								>
									{result.average.toFixed(1)}ms
								</div>
							</div>
							<div className="text-sm text-gray-600">
								Runs: {result.runs.map(r => `${r.toFixed(1)}ms`).join(', ')}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
});
