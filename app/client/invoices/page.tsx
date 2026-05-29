import { redirect } from "next/navigation"

export default function ClientInvoicesPage() {
  redirect("/client/dashboard#invoices")
}
