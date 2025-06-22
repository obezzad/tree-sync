'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { usePowerSync } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { queries, QueryDefinition, QueryParam } from '@/library/powersync/queries';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';
import { useState } from 'react';

export interface TestResult {
	name: string;
	key: string;
	runs: number[];
	average: number;
	explainPlan?: any[];
}

export interface SimplePerfTestRef {
	runTests: (explainResults?: Map<string, any[]>) => void;
}

interface SimplePerfTestProps {
	testResults: TestResult[];
	isRunning: boolean;
	onNewResult: (result: TestResult) => void;
	onTestsStart: () => void;
	onTestsComplete: () => void;
}

const TestResultItem = ({ result }: { result: TestResult }) => {
	const [isOpen, setIsOpen] = useState(false);
	const hasExplainPlan = result.explainPlan && result.explainPlan.length > 0;

	return (
		<div
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
					{result.average > 1 ? `${result.average.toFixed(1)}ms` : `${(result.average * 1000).toFixed(1)}µs`}
				</div>
			</div>
			<div className="text-sm text-gray-600">
				Runs:{' '}
				{result.runs
					.map(r => (r > 1 ? `${r.toFixed(1)}ms` : `${(r * 1000).toFixed(1)}µs`))
					.join(', ')}
			</div>
			{hasExplainPlan && (
				<div className="mt-2">
					<button onClick={() => setIsOpen(!isOpen)} className="text-sm text-blue-600 hover:underline">
						{isOpen ? '▼' : '►'} Show EXPLAIN QUERY PLAN
					</button>
					{isOpen && (
						<pre className="bg-gray-100 p-2 rounded text-xs overflow-auto mt-1">
							{JSON.stringify(result.explainPlan, null, 2)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
};

export const SimplePerfTest = forwardRef<SimplePerfTestRef, SimplePerfTestProps>((
	{ testResults, isRunning, onNewResult, onTestsStart, onTestsComplete },
	ref
) => {
	const db = usePowerSync() as AbstractPowerSyncDatabase;

	const runTests = async (explainResults?: Map<string, any[]>) => {
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
			const explainPlan = explainResults?.get(key);

			onNewResult({ name: test.title, key, runs, average, explainPlan });
		}
		onTestsComplete();
	};

	useImperativeHandle(ref, () => ({
		runTests
	}));

	return (
		<div className="bg-white rounded-lg shadow-lg p-6">
			<h2 className="text-xl font-bold mb-4">Wrapped Database Performance</h2>
			<p className="text-sm text-gray-600 mb-4">
				Auto-runs when the database is ready.
			</p>

			{isRunning && !testResults.length && (
				<div className="mt-4 text-blue-600">Running tests...</div>
			)}

			{testResults.length > 0 && (
				<div className="space-y-4 mt-4">
					{testResults.map((result, index) => (
						<TestResultItem key={index} result={result} />
					))}
				</div>
			)}
		</div>
	);
});
