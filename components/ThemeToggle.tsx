"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg border border-border">
      <button
        onClick={() => setTheme("light")}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
          theme === "light" 
            ? "bg-background shadow-sm text-foreground" 
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        ☀ Light
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
          theme === "dark" 
            ? "bg-background shadow-sm text-foreground" 
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Vk Dark
      </button>
    </div>
  )
}