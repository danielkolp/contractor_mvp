/**
 * Lightweight concurrent load test for the client job-request intake flow.
 *
 * It fires N concurrent POSTs at /api/client-request — the single busiest,
 * most public, most "can it survive a rush?" endpoint (a contractor shares
 * their link and several clients submit at once). It measures throughput,
 * latency, and error rate so you know the app does not fall over under basic
 * concurrent usage. It is NOT a benchmark — it is a smoke/stress sanity check.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CREATES (read before running):
 *   Each successful request creates a real job_request row and may create a
 *   real client auth user. Run it against LOCAL or STAGING, never production,
 *   unless you intend to. Emails use the prefix below so they are easy to find
 *   and delete afterward.
 *
 * USAGE:
 *   npm run loadtest -- --slug <contractor_request_slug> --total 30 --concurrency 10
 *
 *   node scripts/load-test-client-requests.mjs \
 *     --slug <contractor_request_slug> \
 *     [--base-url http://127.0.0.1:3000] \
 *     [--total 30] [--concurrency 10]
 *
 *   Or via env: LOADTEST_SLUG, LOADTEST_BASE, LOADTEST_TOTAL, LOADTEST_CONCURRENCY
 *
 * Find a slug:  select request_slug from profiles where role = 'contractor';
 * Clean up:     delete the job_requests + auth users whose email starts with
 *               "loadtest+".
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from "node:crypto"

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

// --base-url is the documented flag; --base is kept as a backwards-compatible alias.
const BASE = arg(
  "base-url",
  arg("base", process.env.LOADTEST_BASE ?? "http://127.0.0.1:3000")
)
const SLUG = arg("slug", process.env.LOADTEST_SLUG ?? "")
const TOTAL = Number(arg("total", process.env.LOADTEST_TOTAL ?? "30"))
const CONCURRENCY = Number(arg("concurrency", process.env.LOADTEST_CONCURRENCY ?? "10"))
const EMAIL_PREFIX = "loadtest+"
// One run stamp keeps every email in a single run easy to find and bulk-delete.
const RUN_STAMP = Date.now()

if (!SLUG) {
  console.error(
    "ERROR: a contractor request slug is required.\n" +
      "  node scripts/load-test-client-requests.mjs --slug <slug> [--base-url URL] [--total N] [--concurrency N]\n" +
      "Find one with: select request_slug from profiles where role = 'contractor';"
  )
  process.exit(1)
}

const endpoint = `${BASE.replace(/\/$/, "")}/api/client-request`

function buildBody(i) {
  // Unique per request: loadtest+<runStamp>-<index>@example.com
  const email = `${EMAIL_PREFIX}${RUN_STAMP}-${i}@example.com`
  const id = randomUUID().slice(0, 8)
  return {
    request_slug: SLUG,
    name: `Load Test ${i}`,
    email,
    phone: "604-555-0100",
    title: "Plumbing",
    description: `Automated load-test submission #${i} (${id}). Please ignore and delete.`,
    location: "Vancouver, BC",
    address_street: "1 Load Test Ave",
    contact_preference: "Email",
  }
}

async function fireOne(i) {
  const start = performance.now()
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBody(i)),
    })
    const ms = performance.now() - start
    let detail = ""
    if (!res.ok) {
      try {
        detail = (await res.json())?.error ?? ""
      } catch {
        detail = ""
      }
    }
    return { ok: res.ok, status: res.status, ms, detail }
  } catch (err) {
    return { ok: false, status: 0, ms: performance.now() - start, detail: String(err) }
  }
}

/** Run `total` tasks with a fixed `concurrency` worker pool. */
async function runPool(total, concurrency, task) {
  const results = []
  let next = 0
  const worker = async () => {
    while (next < total) {
      const i = next++
      results[i] = await task(i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  return results
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function main() {
  console.log(`Load test → ${endpoint}`)
  console.log(`  total=${TOTAL}  concurrency=${CONCURRENCY}  slug=${SLUG}\n`)

  const wallStart = performance.now()
  const results = await runPool(TOTAL, CONCURRENCY, fireOne)
  const wallMs = performance.now() - wallStart

  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b)
  const failRate = failed.length / TOTAL

  console.log("Results")
  console.log(`  total requests:  ${TOTAL}`)
  console.log(`  successful:      ${ok.length}`)
  console.log(`  failed:          ${failed.length}`)
  console.log(`  failure rate:    ${(failRate * 100).toFixed(1)}%`)
  console.log(`  wall time:       ${wallMs.toFixed(0)} ms`)
  console.log(`  requests/sec:    ${(TOTAL / (wallMs / 1000)).toFixed(1)}`)
  console.log(`  latency p50:     ${pct(latencies, 50).toFixed(0)} ms`)
  console.log(`  latency p95:     ${pct(latencies, 95).toFixed(0)} ms`)
  console.log(`  latency max:     ${pct(latencies, 100).toFixed(0)} ms`)

  if (failed.length > 0) {
    const sample = failed.slice(0, 5)
    console.log("\nFailure sample:")
    for (const f of sample) {
      console.log(`  [${f.status}] ${f.detail || "(no body)"}`)
    }
  }

  // Non-zero exit if more than 10% failed, so CI / a shell loop can catch it.
  if (failRate > 0.1) {
    console.error(`\nFAIL: ${(failRate * 100).toFixed(0)}% error rate exceeds 10% threshold.`)
    process.exit(1)
  }
  console.log("\nOK: error rate within threshold.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
