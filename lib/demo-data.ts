import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

type DB = Database
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"]
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"]
type RecoveryDraftInsert =
  Database["public"]["Tables"]["recovery_drafts"]["Insert"]

const today = new Date()

function daysAgo(n: number) {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysFromNow(n: number) {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function seedDemoData(
  supabase: SupabaseClient<DB>,
  userId: string
): Promise<{ error: string | null }> {
  // ── clients ──────────────────────────────────────────────────
  const { data: clients, error: clientError } = await supabase
    .from("clients")
    .insert([
      {
        user_id: userId,
        name: "Lisa Park",
        company: "North Shore Landscaping",
        trade: "Landscaping",
        email: "lisa@northshorelandscaping.ca",
        phone: "(604) 555-0121",
        payment_reliability: "Reliable" as const,
        notes: "Long-term client. Always pays within terms.",
      },
      {
        user_id: userId,
        name: "Derek Maas",
        company: "Peak Renovations",
        trade: "Renovation",
        email: "derek@peakreno.ca",
        phone: "(604) 555-0188",
        payment_reliability: "Slow payer" as const,
        notes: "Usually pays 2–3 weeks late. Send firm reminder after 10 days.",
      },
      {
        user_id: userId,
        name: "Sandra Lim",
        company: "Cedarline Electrical",
        trade: "Electrical",
        email: "sandra@cedarlineelectric.ca",
        phone: "(778) 555-0204",
        payment_reliability: "High risk" as const,
        notes: "Disputed last invoice. Follow up carefully.",
      },
      {
        user_id: userId,
        name: "Marcus Webb",
        company: "Harbour Plumbing",
        trade: "Plumbing",
        email: "marcus@harbourplumbing.ca",
        phone: "(604) 555-0145",
        payment_reliability: "New client" as const,
      },
      {
        user_id: userId,
        name: "Jen Carlisle",
        company: "Rain City Roofing",
        trade: "Roofing",
        email: "jen@raincityroofing.ca",
        phone: "(604) 555-0167",
        payment_reliability: "Reliable" as const,
      },
    ])
    .select("id, company")

  if (clientError || !clients) {
    return { error: clientError?.message ?? "Failed to create demo clients" }
  }

  const byCompany = Object.fromEntries(clients.map((c) => [c.company, c.id]))

  // ── invoices ─────────────────────────────────────────────────
  const { data: invoices, error: invoiceError } = await supabase
    .from("invoices")
    .insert([
      {
        user_id: userId,
        client_id: byCompany["North Shore Landscaping"],
        client_name: "North Shore Landscaping",
        invoice_number: "INV-1048",
        project_name: "Spring cleanup & mulching",
        trade: "Landscaping",
        amount: 3200,
        issue_date: daysAgo(40),
        due_date: daysAgo(10),
        status: "Overdue" as const,
      },
      {
        user_id: userId,
        client_id: byCompany["Peak Renovations"],
        client_name: "Peak Renovations",
        invoice_number: "INV-1042",
        project_name: "Kitchen reno — Phase 2",
        trade: "Renovation",
        amount: 8750,
        issue_date: daysAgo(55),
        due_date: daysAgo(25),
        status: "Follow-up Sent" as const,
        notes: "Second reminder sent. Client responded asking for payment plan.",
      },
      {
        user_id: userId,
        client_id: byCompany["Cedarline Electrical"],
        client_name: "Cedarline Electrical",
        invoice_number: "INV-1037",
        project_name: "Panel upgrade — retail unit",
        trade: "Electrical",
        amount: 12600,
        issue_date: daysAgo(75),
        due_date: daysAgo(45),
        status: "Escalated" as const,
        notes: "Client disputed labour hours on panel upgrade.",
      },
      {
        user_id: userId,
        client_id: byCompany["Harbour Plumbing"],
        client_name: "Harbour Plumbing",
        invoice_number: "INV-1055",
        project_name: "Rough-in plumbing — new build",
        trade: "Plumbing",
        amount: 5400,
        issue_date: daysAgo(20),
        due_date: daysFromNow(10),
        status: "Sent" as const,
      },
      {
        user_id: userId,
        client_id: byCompany["Rain City Roofing"],
        client_name: "Rain City Roofing",
        invoice_number: "INV-1031",
        project_name: "Flat roof replacement",
        trade: "Roofing",
        amount: 18400,
        issue_date: daysAgo(90),
        due_date: daysAgo(60),
        status: "Paid" as const,
        paid_at: new Date(today.getTime() - 50 * 86_400_000).toISOString(),
      },
      {
        user_id: userId,
        client_id: byCompany["North Shore Landscaping"],
        client_name: "North Shore Landscaping",
        invoice_number: "INV-1052",
        project_name: "Irrigation installation",
        trade: "Landscaping",
        amount: 4100,
        issue_date: daysAgo(15),
        due_date: daysFromNow(15),
        status: "Draft" as const,
      },
    ])
    .select("id, invoice_number, client_name, status")

  if (invoiceError || !invoices) {
    return { error: invoiceError?.message ?? "Failed to create demo invoices" }
  }

  const byNumber = Object.fromEntries(
    invoices.map((inv) => [inv.invoice_number, inv.id])
  )

  // ── recovery actions ──────────────────────────────────────────
  const { error: actionError } = await supabase
    .from("recovery_actions")
    .insert([
      {
        user_id: userId,
        invoice_id: byNumber["INV-1048"],
        stage: "newly_overdue" as const,
        action_type: "Friendly reminder sent",
        status: "Completed" as const,
        contact_method: "Email" as const,
        recommended_next_action: "Send firm reminder if no response in 5 days.",
        notes: "Sent polite email referencing invoice number and amount.",
      },
      {
        user_id: userId,
        invoice_id: byNumber["INV-1042"],
        stage: "first_follow_up" as const,
        action_type: "First follow-up sent",
        status: "Completed" as const,
        contact_method: "Email" as const,
        notes: "Client acknowledged receipt. Asked about payment plan.",
      },
      {
        user_id: userId,
        invoice_id: byNumber["INV-1042"],
        stage: "second_follow_up" as const,
        action_type: "Second follow-up sent",
        status: "Pending" as const,
        contact_method: "Phone" as const,
        recommended_next_action: "Call client to confirm payment plan terms.",
      },
      {
        user_id: userId,
        invoice_id: byNumber["INV-1037"],
        stage: "escalated" as const,
        action_type: "Escalated — dispute unresolved",
        status: "Pending" as const,
        contact_method: "Email" as const,
        recommended_next_action:
          "Consider involving an accountant or collections agency.",
        notes: "Client disputes 12 hours of labour. Documentation sent.",
      },
    ])

  if (actionError) {
    return { error: actionError.message }
  }

  // ── reminders ────────────────────────────────────────────────
  const { error: reminderError } = await supabase
    .from("reminders")
    .insert([
      {
        user_id: userId,
        invoice_id: byNumber["INV-1048"],
        reminder_date: daysFromNow(2),
        scheduled_for: new Date(`${daysFromNow(2)}T09:00:00`).toISOString(),
        reminder_type: "Firm follow-up",
        contact_method: "Email",
        status: "Scheduled",
        completed: false,
        notes: "Send firm reminder if INV-1048 remains unpaid.",
      },
      {
        user_id: userId,
        invoice_id: byNumber["INV-1042"],
        reminder_date: daysFromNow(1),
        scheduled_for: new Date(`${daysFromNow(1)}T09:00:00`).toISOString(),
        reminder_type: "Payment plan call",
        contact_method: "Phone",
        status: "Scheduled",
        completed: false,
        notes: "Confirm payment plan terms with Derek.",
      },
    ])

  if (reminderError) {
    return { error: reminderError.message }
  }

  const demoClientPayload: ClientInsert = {
    user_id: userId,
    name: "Avery Chen",
    company: "Demo Roofing Customer",
    trade: "Roofing",
    email: "avery@demoroofingcustomer.com",
    phone: "(604) 555-0324",
    payment_reliability: "Slow payer",
    notes: "Demo customer with one overdue invoice ready for approval.",
  }

  const { data: existingDemoClients, error: existingClientError } =
    await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .eq("company", demoClientPayload.company)
      .limit(1)

  if (existingClientError) {
    return { error: existingClientError.message }
  }

  let demoClientId = existingDemoClients?.[0]?.id

  if (!demoClientId) {
    const { data: demoClient, error: demoClientError } = await supabase
      .from("clients")
      .insert(demoClientPayload)
      .select("id")
      .single()

    if (demoClientError || !demoClient) {
      return {
        error:
          demoClientError?.message ?? "Failed to create demo recovery client",
      }
    }

    demoClientId = demoClient.id
  }

  const demoInvoicePayload: InvoiceInsert = {
    user_id: userId,
    client_id: demoClientId,
    client_name: "Demo Roofing Customer",
    invoice_number: "INV-3241",
    project_name: "Roof repair follow-up",
    trade: "Roofing",
    amount: 4000,
    issue_date: daysAgo(35),
    due_date: daysAgo(14),
    status: "Overdue",
    paid_at: null,
    notes: "Demo overdue invoice with a recovery draft awaiting approval.",
  }

  const { data: existingDemoInvoices, error: existingInvoiceError } =
    await supabase
      .from("invoices")
      .select("id")
      .eq("user_id", userId)
      .eq("invoice_number", demoInvoicePayload.invoice_number)
      .limit(1)

  if (existingInvoiceError) {
    return { error: existingInvoiceError.message }
  }

  let demoInvoiceId = existingDemoInvoices?.[0]?.id

  if (demoInvoiceId) {
    const invoiceUpdate: InvoiceUpdate = {
      client_id: demoClientId,
      client_name: demoInvoicePayload.client_name,
      project_name: demoInvoicePayload.project_name,
      trade: demoInvoicePayload.trade,
      amount: demoInvoicePayload.amount,
      issue_date: demoInvoicePayload.issue_date,
      due_date: demoInvoicePayload.due_date,
      status: "Overdue",
      paid_at: null,
      notes: demoInvoicePayload.notes,
    }

    const { error: demoInvoiceUpdateError } = await supabase
      .from("invoices")
      .update(invoiceUpdate)
      .eq("id", demoInvoiceId)
      .eq("user_id", userId)

    if (demoInvoiceUpdateError) {
      return { error: demoInvoiceUpdateError.message }
    }
  } else {
    const { data: demoInvoice, error: demoInvoiceError } = await supabase
      .from("invoices")
      .insert(demoInvoicePayload)
      .select("id")
      .single()

    if (demoInvoiceError || !demoInvoice) {
      return {
        error:
          demoInvoiceError?.message ?? "Failed to create demo recovery invoice",
      }
    }

    demoInvoiceId = demoInvoice.id
  }

  const { data: existingDemoDrafts, error: existingDraftError } =
    await supabase
      .from("recovery_drafts")
      .select("id")
      .eq("user_id", userId)
      .eq("invoice_id", demoInvoiceId)
      .not("status", "in", "(resolved,cancelled)")
      .limit(1)

  if (existingDraftError) {
    return { error: existingDraftError.message }
  }

  if (!existingDemoDrafts?.[0]) {
    const draftPayload: RecoveryDraftInsert = {
      user_id: userId,
      client_id: demoClientId,
      invoice_id: demoInvoiceId,
      channel: "email",
      message_body:
        "Hi Demo Roofing Customer, following up again on invoice INV-3241 for $4,000. This still appears unpaid on our end. Please let me know when we can expect payment or if there's anything holding this up.",
      status: "needs_approval",
      recommended_action: "Send a firm payment reminder.",
      days_overdue: 14,
    }

    const { error: draftError } = await supabase
      .from("recovery_drafts")
      .insert(draftPayload)

    if (draftError) {
      return { error: draftError.message }
    }
  }

  return { error: null }
}
