"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"

import { cn } from "@/lib/utils"

export const CONTRACTOR_TRADES = [
  "Appliance Repair & Installation",
  "Cabinets & Countertops",
  "Carpentry & Millwork",
  "Concrete & Foundation",
  "Decking & Outdoor Structures",
  "Demolition",
  "Drywall & Plastering",
  "Electrical",
  "Excavation & Earthwork",
  "Fencing",
  "Fire Protection & Suppression",
  "Flooring",
  "Framing",
  "General Contracting",
  "HVAC",
  "Home Automation & Smart Home",
  "Insulation",
  "Interior Design & Space Planning",
  "Irrigation & Drainage",
  "Landscaping & Grounds",
  "Masonry & Brickwork",
  "Painting & Finishing",
  "Plumbing",
  "Pools & Water Features",
  "Roofing",
  "Siding & Cladding",
  "Solar & Renewable Energy",
  "Structural Steel & Welding",
  "Tiling & Stonework",
  "Waterproofing & Membranes",
  "Windows & Doors",
] as const

export type ContractorTrade = (typeof CONTRACTOR_TRADES)[number]

type TradeMultiSelectProps = {
  value: string[]
  onChange: (trades: string[]) => void
  disabled?: boolean
  name?: string
}

export function TradeMultiSelect({
  value,
  onChange,
  disabled = false,
  name,
}: TradeMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function toggle(trade: string) {
    if (value.includes(trade)) {
      onChange(value.filter((t) => t !== trade))
    } else {
      onChange([...value, trade])
    }
  }

  function removeTrade(trade: string, event: React.MouseEvent) {
    event.stopPropagation()
    onChange(value.filter((t) => t !== trade))
  }

  const triggerLabel =
    value.length === 0
      ? "Select trades…"
      : value.length === 1
        ? value[0]
        : `${value.length} trades selected`

  return (
    <div ref={containerRef} className="relative">
      {name ? (
        <input type="hidden" name={name} value={value.join(",")} />
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-colors",
          "hover:border-ring/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "border-ring ring-3 ring-ring/50",
          value.length === 0 && "text-muted-foreground"
        )}
      >
        <span className="min-w-0 truncate text-left">{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {value.length > 0 ? (
            <div className="border-b border-border px-1 py-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange([])
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <X className="size-3" />
                Clear all
              </button>
            </div>
          ) : null}
          <div className="max-h-56 overflow-y-auto">
            {CONTRACTOR_TRADES.map((trade) => {
              const selected = value.includes(trade)
              return (
                <button
                  key={trade}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    toggle(trade)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none",
                    selected && "text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      selected
                        ? "border-ef-ocean bg-ef-ocean text-white"
                        : "border-input bg-background"
                    )}
                  >
                    {selected ? <Check className="size-2.5 stroke-[3]" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{trade}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((trade) => (
            <span
              key={trade}
              className="inline-flex items-center gap-1 rounded-md border border-ef-200 bg-ef-mist px-2 py-0.5 text-xs font-medium text-ef-ocean dark:border-ef-navy/40 dark:bg-ef-ink/30 dark:text-ef-300"
            >
              {trade}
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => removeTrade(trade, e)}
                className="ml-0.5 rounded text-ef-ocean hover:text-ef-navy disabled:cursor-not-allowed dark:text-ef-cyan dark:hover:text-ef-200"
                aria-label={`Remove ${trade}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
