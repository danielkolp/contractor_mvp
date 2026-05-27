"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Phase = "skeleton" | "exiting" | "content"

export function ContentReveal({
  isLoading,
  skeleton,
  children,
  minDisplayMs = 400,
  className,
}: {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  minDisplayMs?: number
  className?: string
}) {
  const [phase, setPhase] = useState<Phase>(isLoading ? "skeleton" : "content")
  const loadStartRef = useRef(Date.now())
  const t1Ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (t1Ref.current !== null) {
      clearTimeout(t1Ref.current)
      t1Ref.current = null
    }
    if (t2Ref.current !== null) {
      clearTimeout(t2Ref.current)
      t2Ref.current = null
    }

    if (isLoading) {
      loadStartRef.current = Date.now()
      setPhase("skeleton")
      return
    }

    const elapsed = Date.now() - loadStartRef.current
    const remaining = Math.max(0, minDisplayMs - elapsed)

    t1Ref.current = setTimeout(() => {
      setPhase("exiting")
      t2Ref.current = setTimeout(() => setPhase("content"), 215)
    }, remaining)

    return () => {
      if (t1Ref.current !== null) {
        clearTimeout(t1Ref.current)
        t1Ref.current = null
      }
      if (t2Ref.current !== null) {
        clearTimeout(t2Ref.current)
        t2Ref.current = null
      }
    }
  }, [isLoading, minDisplayMs])

  return (
    <div className={cn("relative", className)}>
      {phase !== "content" && (
        <div
          className={cn(
            "transition-opacity ease-out motion-reduce:transition-none",
            phase === "exiting" ? "opacity-0" : "opacity-100"
          )}
          style={{ transitionDuration: "200ms" }}
        >
          {skeleton}
        </div>
      )}
      {phase === "content" && (
        <div className="animate-[content-reveal_0.3s_ease-out_both] motion-reduce:animate-none">
          {children}
        </div>
      )}
    </div>
  )
}
