"use client"

import { createContext, useContext, useEffect, useState } from "react"

type ThemePreference = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const ThemeContext = createContext<{
  /** The user's stored preference: light, dark, or system. */
  preference: ThemePreference
  /** The actual theme currently applied. */
  theme: ResolvedTheme
  /** Set an explicit preference (persisted). */
  setPreference: (preference: ThemePreference) => void
  /** Quick toggle between light and dark (used by the top-bar button). */
  toggleTheme: () => void
}>({
  preference: "system",
  theme: "light",
  setPreference: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system")
  const [theme, setTheme] = useState<ResolvedTheme>("light")

  // Read stored preference on mount.
  useEffect(() => {
    const stored = localStorage.getItem("theme")
    if (stored === "dark" || stored === "light" || stored === "system") {
      setPreferenceState(stored)
    } else {
      setPreferenceState("system")
    }
  }, [])

  // Resolve preference → applied theme, and keep the <html> class in sync.
  useEffect(() => {
    const resolved = preference === "system" ? systemTheme() : preference
    setTheme(resolved)
    document.documentElement.classList.toggle("dark", resolved === "dark")
    localStorage.setItem("theme", preference)
  }, [preference])

  // When following the system, react to OS-level changes live.
  useEffect(() => {
    if (preference !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    function onChange() {
      const resolved = systemTheme()
      setTheme(resolved)
      document.documentElement.classList.toggle("dark", resolved === "dark")
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [preference])

  function setPreference(next: ThemePreference) {
    setPreferenceState(next)
  }

  function toggleTheme() {
    setPreferenceState(theme === "dark" ? "light" : "dark")
  }

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
