'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { usePowerSync } from '@powersync/react';
import { AbstractPowerSyncDatabase } from '@powersync/web';
import store from '@/stores/RootStore';
import { queries, QueryDefinition, QueryParam } from '@/library/powersync/queries';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { userService } from '@/library/powersync/userService';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

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

const TestResultItem = ({
	result,
	onReRun,
	isRunning
}: {
	result: TestResult;
	onReRun: (key: string) => void;
	isRunning: boolean;
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const hasExplainPlan = result.explainPlan && result.explainPlan.length > 0;

	return (
		<div
			className={`p-4 rounded border ${isRunning ? 'bg-gray-50 border-gray-200' :
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
				<div className="flex items-center gap-4">
					<button
						onClick={() => onReRun(result.key)}
						title="Re-run test"
						className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800"
						disabled={isRunning}
					>
						<RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
					</button>
					<div
						className={`text-lg font-bold ${isRunning ? 'text-gray-500' :
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
	const [runningTests, setRunningTests] = useState<Set<string>>(new Set());

	const runTest = async (key: string) => {
		setRunningTests(prev => new Set(prev).add(key));
		const local_id = store.session?.user?.user_metadata?.local_id;
		const rootNodeId = uuidv5('ROOT_NODE', userService.getUserId());

		const sampleNodesResult = await db.execute(queries.getSampleNodes.sql, [local_id]);
		const sampleNodeIds = (sampleNodesResult.rows?._array || []).map((r: any) => r.id);
		const sampleNodeId = sampleNodeIds[0];

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
					case 'expandedNodesJson':
						return JSON.stringify(sampleNodeIds);
					default:
						return null;
				}
			});
		};

		if (queries[key].isMutation) {
			console.debug(`Skipping mutation test "${key}"`);
			return;
		}
		const test: QueryDefinition = queries[key];
		const testParams = resolveParams(test.params);

		if (test.params.includes('nodeId') && !sampleNodeId) {
			console.log(`Skipping test "${test.title}" due to missing sample node.`);
			return;
		}

		// Run EXPLAIN QUERY PLAN
		let explainPlan: any[] = [];
		try {
			const plan = await db.execute(`EXPLAIN QUERY PLAN ${test.sql}`, testParams);
			explainPlan = plan.rows?._array || [];
		} catch (e: any) {
			console.error(`Error explaining ${key}:`, e);
			explainPlan = [{ error: e.message }];
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

		onNewResult({ name: test.title, key, runs, average, explainPlan });
		setRunningTests(prev => {
			const next = new Set(prev);
			next.delete(key);
			return next;
		});
	};

	const runTests = async () => {
		if (!db || isRunning) return;

		onTestsStart();
		for (const key in queries) {
			await runTest(key);
		}
		onTestsComplete();
	};

	useImperativeHandle(ref, () => ({
		runTests
	}));

	return (
		<div className="bg-white rounded-lg shadow-lg p-6">
			<div className="flex justify-between items-center mb-4">
				<div>
					<h2 className="text-xl font-bold">Wrapped Database Performance</h2>
					<p className="text-sm text-gray-600 mb-2">
						Auto-runs when the database is ready.
					</p>
				</div>
				<button
					onClick={runTests}
					disabled={isRunning || !db}
					className={`px-4 py-2 rounded font-medium flex items-center gap-2 min-w-fit ${isRunning
						? 'bg-gray-300 text-gray-500 cursor-not-allowed'
						: 'bg-red-600 text-white hover:bg-red-700'
						}`}
				>
					<RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
					{isRunning ? 'Running...' : 'Re-Run All Tests'}
				</button>
			</div>

			{isRunning && !testResults.length && (
				<div className="mt-4 text-blue-600">Running tests...</div>
			)}

			{testResults.length > 0 && (
				<div className="space-y-4 mt-4">
					{testResults.map((result, index) => (
						<TestResultItem
							key={index}
							result={result}
							onReRun={runTest}
							isRunning={runningTests.has(result.key)}
						/>
					))}
				</div>
			)}
		</div>
	);
});
