const measurements = new Set<string>();

let init = performance.now();
let lastSync = performance.now();

export function registerStart() {
  init = performance.now();
}

export function registerLastSync() {
  lastSync = performance.now();
}

export function measureOnce(name: string) {
  if (measurements.has(name)) return

  measurements.add(name)
  const end = performance.now()

  console.debug(
    `%c[PoC::Metrics] ${name.toUpperCase()} took ${end - init}ms.`,
    "color: green; font-weight: bold; font-size: 12px;")
}

export function measure(name: string) {
  const end = performance.now()

  if (end - lastSync < 30) return

  console.debug(
    `%c[PoC::Metrics] ${name.toUpperCase()} took ${end - lastSync}ms.`,
    "color: aqua; font-weight: bold; font-size: 12px;")
}

export function timestamp(name: string) {
  console.debug(
    `%c[PoC::Metrics] ${name.toUpperCase()} executed at ${new Date().toISOString()}. (Date.now: ${Date.now()})`,
    "color: orange; font-weight: bold; font-size: 12px;",
  )
}

export function reset() {
  measurements.clear()
}

export const METRICS = {
  TIME_TO_INTERACTION: "Time to Interaction",
  TIME_TO_PARTIAL_REPLICATION: "Time to Replication",
} as const
