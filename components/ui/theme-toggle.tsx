"use client"

import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="relative"
    >
      <span className="relative size-4">
        <Sun className="absolute inset-0 size-4 transition-all duration-300 ease-in-out dark:rotate-90 dark:scale-50 dark:opacity-0" />
        <Moon className="absolute inset-0 size-4 transition-all duration-300 ease-in-out -rotate-90 scale-50 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100" />
      </span>
    </Button>
  )
}
