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
        src="/images/EstiGator-Logo.png"
        alt="EstiGator"
        width={200}
        height={200}
        priority={priority}
        className={cn("size-9 shrink-0 object-contain", className)}
      />
    )
  }

  return (
    <Image
      src="/images/EstiGator-LogoAndText.png"
      alt="EstiGator"
      width={700}
      height={200}
      priority={priority}
      className={cn("h-10 w-auto shrink-0 object-contain", className)}
    />
  )
}
