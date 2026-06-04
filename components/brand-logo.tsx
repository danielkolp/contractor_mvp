import Image from "next/image"

import { cn } from "@/lib/utils"

type BrandLogoProps = {
  variant?: "full" | "mark"
  className?: string
  priority?: boolean
}

export function BrandLogo({
  variant = "full",
  className,
  priority = false,
}: BrandLogoProps) {
  if (variant === "mark") {
    return (
      <Image
        src="/images/euroflo-mark.svg"
        alt="Euroflo"
        width={128}
        height={128}
        priority={priority}
        className={cn("size-9 shrink-0 object-contain", className)}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex h-10 min-w-0 shrink-0 items-center gap-2.5 text-ef-ink dark:text-white",
        className
      )}
      aria-label="Euroflo"
    >
      <Image
        src="/images/euroflo-mark.svg"
        alt=""
        width={128}
        height={128}
        priority={priority}
        className="size-full max-h-10 max-w-10 shrink-0 object-contain"
      />
      <span className="font-display text-[1.55rem] font-bold leading-none tracking-normal">
        Euroflo
      </span>
    </div>
  )
}
