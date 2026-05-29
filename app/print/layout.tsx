export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      {children}
    </div>
  )
}
