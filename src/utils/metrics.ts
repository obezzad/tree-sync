const measurements = new Set<string>()
const starts = new Map<string, number>()

export function registerStart(name: string) {
  if (starts.has(name)) return;

  starts.set(name, performance.now())
  timestamp(name)
}

export function measureOnce(name: string) {
  if (measurements.has(name)) return

  measurements.add(name)
  const end = performance.now()

  const durationsMap = Object.fromEntries(
    Array.from(starts.entries()).map(([startName, startTime]) => [
      startName,
      { duration_since: end - startTime }
    ])
  )

  console.log(`%c[${name.toUpperCase()}]`, "color: green; font-weight: bold; font-size: 12px;")
  console.table(durationsMap);
}

export function timestamp(name: string) {
  console.log(
    `%c[${name.toUpperCase()}] Executed at ${new Date().toISOString()}. (Date.now: ${Date.now()})`,
    "color: orange; font-weight: bold; font-size: 12px;",
  )
}

export function reset() {
  measurements.clear();
  starts.clear();
  timestamp("Reset measurements")
}

export const METRICS = {
  TIME_TO_INTERACTION: "Time to Interaction",
  TIME_TO_PARTIAL_REPLICATION: "Time to Replication; Partial",
  TIME_TO_FULL_REPLICATION: "Time to Replication; Full",
} as const
