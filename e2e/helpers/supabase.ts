import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "../../lib/supabase/database.types"
import { loadEnv, requiredEnv } from "./env"

export type FlowTestData = {
  runId: string
  contractorEmail: string
  contractorPassword: string
  contractorId: string
  requestSlug: string
  clientEmail: string
  clientPassword: string
  clientUserId?: string
  jobRequestId?: string
  estimateId?: string
}

export type SupabaseDbClient = SupabaseClient<Database>

type JobRequest = Database["public"]["Tables"]["job_requests"]["Row"]
type Estimate = Database["public"]["Tables"]["estimates"]["Row"]

const E2E_CLIENT_EMAIL = /^e2e-\d+-[0-9a-f-]+@example\.com$/i

function throwIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`)
}

export function createServiceRoleClient() {
  loadEnv()

  return createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export async function createAuthenticatedClient(email: string, password: string) {
  loadEnv()

  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)

  return supabase
}

export async function createFlowTestData(): Promise<FlowTestData> {
  const supabase = createServiceRoleClient()
  const contractorEmail = requiredEnv("E2E_CONTRACTOR_EMAIL").toLowerCase()
  const contractorPassword = requiredEnv("E2E_CONTRACTOR_PASSWORD")

  const { data: contractorId, error: contractorLookupError } =
    await supabase.rpc("get_auth_user_id_by_email", {
      lookup_email: contractorEmail,
    })

  if (contractorLookupError || !contractorId) {
    throw new Error(
      `Could not resolve E2E contractor user: ${
        contractorLookupError?.message ?? contractorEmail
      }`
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("request_slug, role")
    .eq("user_id", contractorId)
    .maybeSingle()

  if (profileError || !profile?.request_slug) {
    throw new Error(
      `Contractor profile is missing a public request slug: ${
        profileError?.message ?? contractorEmail
      }`
    )
  }

  if (profile.role !== "contractor") {
    throw new Error(`E2E user must be a contractor, found role ${profile.role}`)
  }

  await cleanupStaleE2EData(
    supabase,
    contractorId,
    contractorEmail,
    contractorPassword
  )

  const runId = `e2e-${Date.now()}-${randomUUID().slice(0, 8)}`

  return {
    runId,
    contractorEmail,
    contractorPassword,
    contractorId,
    requestSlug: profile.request_slug,
    clientEmail: `${runId}@example.com`,
    clientPassword: `E2e-${randomUUID()}!1`,
  }
}

export async function getJobRequest(
  supabase: SupabaseDbClient,
  jobRequestId: string
) {
  const { data, error } = await supabase
    .from("job_requests")
    .select("*")
    .eq("id", jobRequestId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function getEstimatesForJob(
  supabase: SupabaseDbClient,
  jobRequestId: string
) {
  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("job_request_id", jobRequestId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getEstimate(
  supabase: SupabaseDbClient,
  estimateId: string
) {
  const { data, error } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function setClientPassword(
  supabase: SupabaseDbClient,
  clientUserId: string,
  password: string
) {
  const { error } = await supabase.auth.admin.updateUserById(clientUserId, {
    password,
    email_confirm: true,
    user_metadata: { role: "client" },
  })

  if (error) throw new Error(error.message)
}

function storagePathFromPublicUrl(url: string) {
  const marker = "/storage/v1/object/public/job-request-photos/"
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length))
}

async function removeUploadedPhotos(
  supabase: SupabaseDbClient,
  storagePaths: string[]
) {
  if (storagePaths.length === 0) return

  const { error } = await supabase.storage
    .from("job-request-photos")
    .remove(storagePaths)

  if (error) {
    console.warn(`[e2e cleanup] Uploaded photo cleanup failed: ${error.message}`)
  }
}

async function lookupUserIdByEmail(supabase: SupabaseDbClient, email: string) {
  const { data, error } = await supabase.rpc("get_auth_user_id_by_email", {
    lookup_email: email,
  })

  if (error) return null
  return data
}

async function cleanupStaleE2EData(
  supabase: SupabaseDbClient,
  contractorId: string,
  contractorEmail: string,
  contractorPassword: string
) {
  const contractorDb = await createAuthenticatedClient(
    contractorEmail,
    contractorPassword
  )

  const { data: staleJobs, error: staleJobsError } = await supabase
    .from("job_requests")
    .select("id, photo_urls")
    .eq("contractor_id", contractorId)
    .like("client_email", "e2e-%@example.com")
  throwIfError(staleJobsError, "Lookup stale E2E job requests")

  for (const job of staleJobs ?? []) {
    const invoiceDelete = await contractorDb
      .from("invoices")
      .delete()
      .eq("job_request_id", job.id)
    throwIfError(invoiceDelete.error, "Cleanup stale E2E invoices")

    const estimateDelete = await contractorDb
      .from("estimates")
      .delete()
      .eq("job_request_id", job.id)
    throwIfError(estimateDelete.error, "Cleanup stale E2E estimates")
  }

  const clientDelete = await contractorDb
    .from("clients")
    .delete()
    .eq("user_id", contractorId)
    .like("email", "e2e-%@example.com")
  throwIfError(clientDelete.error, "Cleanup stale E2E clients")

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error) throw new Error(`Lookup stale E2E auth users: ${error.message}`)

    for (const user of data.users) {
      if (user.email && E2E_CLIENT_EMAIL.test(user.email)) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
        if (deleteError && !deleteError.message.toLowerCase().includes("not found")) {
          throw new Error(`Cleanup stale E2E auth user: ${deleteError.message}`)
        }
      }
    }

    if (data.users.length < 1000) break
  }

  const staleStoragePaths = (staleJobs ?? [])
    .flatMap((job) => job.photo_urls ?? [])
    .map(storagePathFromPublicUrl)
    .filter((path): path is string => Boolean(path))
  await removeUploadedPhotos(supabase, staleStoragePaths)
}

export async function cleanupFlowTestData(data: FlowTestData) {
  const supabase = createServiceRoleClient()
  const jobId = data.jobRequestId
  let job: JobRequest | null = null
  let estimates: Estimate[] = []
  const contractorDb = await createAuthenticatedClient(
    data.contractorEmail,
    data.contractorPassword
  ).catch(() => null)

  if (jobId) {
    job = await getJobRequest(supabase, jobId).catch(() => null)
    estimates = contractorDb
      ? await getEstimatesForJob(contractorDb, jobId).catch(() => [])
      : []

    if (contractorDb) {
      const invoiceDelete = await contractorDb
        .from("invoices")
        .delete()
        .eq("job_request_id", jobId)
      throwIfError(invoiceDelete.error, "Cleanup invoices")

      const estimateDelete = await contractorDb
        .from("estimates")
        .delete()
        .eq("job_request_id", jobId)
      throwIfError(estimateDelete.error, "Cleanup estimates")
    }
  }

  const photoUrls = job?.photo_urls ?? []
  const storagePaths = photoUrls
    .map(storagePathFromPublicUrl)
    .filter((path): path is string => Boolean(path))

  if (data.estimateId && !estimates.some((estimate) => estimate.id === data.estimateId)) {
    if (contractorDb) {
      const estimateDelete = await contractorDb
        .from("estimates")
        .delete()
        .eq("id", data.estimateId)
      throwIfError(estimateDelete.error, "Cleanup estimate by id")
    }
  }

  if (contractorDb) {
    const clientDelete = await contractorDb
      .from("clients")
      .delete()
      .eq("user_id", data.contractorId)
      .eq("email", data.clientEmail)
    throwIfError(clientDelete.error, "Cleanup contractor client")
  }

  const clientUserId =
    data.clientUserId ?? (await lookupUserIdByEmail(supabase, data.clientEmail))

  if (clientUserId) {
    const { error } = await supabase.auth.admin.deleteUser(clientUserId)
    if (error && !error.message.toLowerCase().includes("not found")) {
      throw new Error(`Cleanup auth user: ${error.message}`)
    }
  }

  if (jobId) {
    const remainingJob = await getJobRequest(supabase, jobId).catch(() => null)
    if (remainingJob) {
      throw new Error(`Cleanup job request: ${jobId} still exists`)
    }
  }

  if (data.estimateId && contractorDb) {
    const remainingEstimate = await getEstimate(contractorDb, data.estimateId).catch(
      () => null
    )
    if (remainingEstimate) {
      throw new Error(`Cleanup estimate: ${data.estimateId} still exists`)
    }
  }

  await removeUploadedPhotos(supabase, storagePaths)
}
