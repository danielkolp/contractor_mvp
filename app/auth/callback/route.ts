import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { dashboardPathForRole, getProfileRole } from "@/lib/user-role"

function safeInternalPath(path: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null
  }

  return path
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = safeInternalPath(requestUrl.searchParams.get("next"))

  if (!code) {
    const message =
      requestUrl.searchParams.get("error_description") ??
      "Email verification link is missing a login code. Please resend the verification email."

    return NextResponse.redirect(
      `${requestUrl.origin}/login?message=${encodeURIComponent(message)}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${requestUrl.origin}/login?message=${encodeURIComponent(
        "Email verification link is invalid or expired. Please resend the verification email."
      )}`
    )
  }

  if (next) {
    return NextResponse.redirect(`${requestUrl.origin}${next}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(
      `${requestUrl.origin}/login?message=${encodeURIComponent(
        "Email verified. Sign in to continue."
      )}`
    )
  }

  const profileRole = await getProfileRole(supabase, user.id)

  // user_metadata.role is set at signup time and is the authoritative source
  // for new users. If the DB trigger didn't write the role to profiles (e.g.
  // migration not yet applied, or conflict with a stale row), the profile
  // defaults to "contractor". Detect that mismatch and repair it here.
  const metaRole =
    user.user_metadata?.role === "client" ? "client" : "contractor"

  let role = profileRole
  if (profileRole !== metaRole) {
    await supabase
      .from("profiles")
      .update({ role: metaRole })
      .eq("user_id", user.id)
    role = metaRole
  }

  return NextResponse.redirect(
    `${requestUrl.origin}${dashboardPathForRole(role)}`
  )
}
