"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"

const AREA_GROUPS: { label: string; areas: string[] }[] = [
  {
    label: "Canada",
    areas: [
      "Vancouver, BC",
      "Victoria, BC",
      "Kelowna, BC",
      "Surrey, BC",
      "Burnaby, BC",
      "Calgary, AB",
      "Edmonton, AB",
      "Red Deer, AB",
      "Lethbridge, AB",
      "Saskatoon, SK",
      "Regina, SK",
      "Winnipeg, MB",
      "Toronto, ON",
      "Ottawa, ON",
      "Hamilton, ON",
      "Brampton, ON",
      "Mississauga, ON",
      "London, ON",
      "Kitchener-Waterloo, ON",
      "Windsor, ON",
      "Kingston, ON",
      "Sudbury, ON",
      "Thunder Bay, ON",
      "Montreal, QC",
      "Quebec City, QC",
      "Laval, QC",
      "Gatineau, QC",
      "Halifax, NS",
      "Fredericton, NB",
      "Moncton, NB",
      "Saint John, NB",
      "St. John's, NL",
      "Charlottetown, PE",
    ],
  },
  {
    label: "United States",
    areas: [
      "Atlanta, GA",
      "Austin, TX",
      "Baltimore, MD",
      "Boston, MA",
      "Charlotte, NC",
      "Chicago, IL",
      "Cleveland, OH",
      "Columbus, OH",
      "Dallas, TX",
      "Denver, CO",
      "Detroit, MI",
      "El Paso, TX",
      "Fort Worth, TX",
      "Fresno, CA",
      "Houston, TX",
      "Indianapolis, IN",
      "Jacksonville, FL",
      "Kansas City, MO",
      "Las Vegas, NV",
      "Los Angeles, CA",
      "Louisville, KY",
      "Memphis, TN",
      "Mesa, AZ",
      "Miami, FL",
      "Milwaukee, WI",
      "Minneapolis, MN",
      "Nashville, TN",
      "New York, NY",
      "Oklahoma City, OK",
      "Omaha, NE",
      "Philadelphia, PA",
      "Phoenix, AZ",
      "Portland, OR",
      "Raleigh, NC",
      "Sacramento, CA",
      "San Antonio, TX",
      "San Diego, CA",
      "San Francisco, CA",
      "San Jose, CA",
      "Seattle, WA",
      "Tucson, AZ",
      "Virginia Beach, VA",
      "Washington, DC",
    ],
  },
]

export const SERVICE_AREAS = AREA_GROUPS.flatMap((g) => g.areas)

type ServiceAreaSelectProps = {
  value: string
  onChange: (area: string) => void
  disabled?: boolean
  name?: string
  placeholder?: string
}

export function ServiceAreaSelect({
  value,
  onChange,
  disabled = false,
  name,
  placeholder = "Select area...",
}: ServiceAreaSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredGroups = AREA_GROUPS.map((group) => ({
    ...group,
    areas: group.areas.filter((area) =>
      area.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((group) => group.areas.length > 0)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 0)
    } else {
      setSearch("")
    }
  }, [isOpen])

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

  return (
    <div ref={containerRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-colors",
          "hover:border-ring/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "border-ring ring-3 ring-ring/50",
          !value && "text-muted-foreground"
        )}
      >
        <span className="min-w-0 truncate text-left">{value || placeholder}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border px-2.5 py-2">
            <div className="flex items-center gap-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cities..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No areas found.
              </p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </div>
                  {group.areas.map((area) => {
                    const selected = value === area
                    return (
                      <button
                        key={area}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          onChange(area)
                          setIsOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                          selected && "text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                            selected
                              ? "border-ef-ocean bg-ef-ocean text-white"
                              : "border-input bg-background"
                          )}
                        >
                          {selected ? (
                            <Check className="size-2.5 stroke-[3]" />
                          ) : null}
                        </span>
                        <span className="min-w-0 truncate">{area}</span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
