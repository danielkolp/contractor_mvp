import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL   = "https://lgjsatykcfkwatczyvla.supabase.co"
const ANON_KEY       = "REMOVED_SUPABASE_PUBLISHABLE_KEY"
const SVC_KEY        = "REMOVED_SUPABASE_SERVICE_ROLE_KEY"
const CONTRACTOR_ID  = "fe5124bc-0757-470c-85b9-ec64c1ff6ca0"
const JOB_REQUEST_ID = "1fc71558-53e7-463e-a304-bc2e9f9561d3"

const client = createClient(SUPABASE_URL, ANON_KEY)
const svc    = createClient(SUPABASE_URL, SVC_KEY, { auth: { persistSession: false } })

await client.auth.signInWithPassword({ email: "danielkolpakov00@gmail.com", password: "REMOVED_E2E_CONTRACTOR_PASSWORD" })

// Check existing estimates to see estimate_number format
const { data: existing } = await client
  .from("estimates")
  .select("id,estimate_number,status,payment_status,client_total_cents,job_request_id")
  .eq("user_id", CONTRACTOR_ID)
  .order("created_at", { ascending: false })
  .limit(5)

console.log("Existing estimates:")
existing?.forEach(e => console.log(`  ${e.estimate_number} | ${e.status} | payment=${e.payment_status} | total=${e.client_total_cents} | jr=${e.job_request_id}`))

// Look for an existing accepted estimate without payment amounts
const acceptedWithoutPayment = existing?.find(e =>
  (e.status === "Accepted" || e.status === "Won") && !e.client_total_cents
)

if (acceptedWithoutPayment) {
  console.log("\nUpdating existing estimate with payment amounts:", acceptedWithoutPayment.id)
  const { data: updated, error } = await client
    .from("estimates")
    .update({
      contractor_amount_cents: 100000,
      platform_fee_cents:      15000,
      client_total_cents:      115000,
    })
    .eq("id", acceptedWithoutPayment.id)
    .select()
    .single()

  if (error) console.error("Update error:", error.message)
  else {
    console.log("✅ Updated estimate with payment amounts")
    console.log("  id:", updated.id)
    console.log("  estimate_number:", updated.estimate_number)
    console.log("  status:", updated.status)
    console.log("  payment_status:", updated.payment_status)
    console.log("  client_total_cents:", updated.client_total_cents)
  }
} else {
  // Generate estimate number like EST-001
  const maxNum = existing?.length > 0
    ? Math.max(...existing.map(e => parseInt(e.estimate_number?.replace(/\D/g, "") || "0")))
    : 0
  const estimateNumber = `EST-${String(maxNum + 1).padStart(3, "0")}`

  console.log("\nCreating new estimate:", estimateNumber)
  const { data: newEst, error } = await client.from("estimates").insert({
    user_id:                 CONTRACTOR_ID,
    job_request_id:          JOB_REQUEST_ID,
    estimate_number:         estimateNumber,
    status:                  "Accepted",
    contractor_amount_cents: 100000,
    platform_fee_cents:      15000,
    client_total_cents:      115000,
    notes:                   "QA Test Estimate — Stripe Payment Flow",
    amount:                  "1000.00",
  }).select().single()

  if (error) console.error("❌ Insert error:", error.message, error.hint, error.details)
  else {
    console.log("✅ Estimate created!")
    console.log("  id:", newEst.id)
    console.log("  estimate_number:", newEst.estimate_number)
    console.log("  client_total_cents:", newEst.client_total_cents)
    console.log("  payment_status:", newEst.payment_status)
  }
}
