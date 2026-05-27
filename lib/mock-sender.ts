// Mock sender service — replace with Twilio/SendGrid when ready.
// Returns deterministic shape so callers can store the provider ID.

export type MockSendResult = {
  success: true
  providerId: string
  timestamp: string
  channel: "sms" | "email" | "manual"
  to: string | null
}

function makeProviderId(): string {
  return `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function mockSendSms(
  to: string | null,
  // message param kept for future real implementation
  _message: string
): MockSendResult {
  return {
    success: true,
    providerId: makeProviderId(),
    timestamp: new Date().toISOString(),
    channel: "sms",
    to,
  }
}

export function mockSendEmail(
  to: string | null,
  _message: string
): MockSendResult {
  return {
    success: true,
    providerId: makeProviderId(),
    timestamp: new Date().toISOString(),
    channel: "email",
    to,
  }
}
