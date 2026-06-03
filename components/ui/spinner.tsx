"use client"

import { useEffect } from "react"


export function Spinner({
  size = 60,
  color,
  className,
}: {
  size?: number
  color?: string
  className?: string
}) {
  useEffect(() => {
    import("ldrs").then(({ mirage }) => mirage.register())
  }, [])

  return (
    <div className={className}>
      <l-mirage
        size={size}
        speed="2.5"
        color={color ?? "currentColor"}
      />
    </div>
  )
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-ef-ocean dark:text-ef-sky">
      <Spinner size={60} />
    </div>
  )
}
