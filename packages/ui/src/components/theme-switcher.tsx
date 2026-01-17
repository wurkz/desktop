"use client"

import * as React from "react"
import { useThemeColor } from "./theme-provider"
import { Button } from "./ui/button"
import { cn } from "../lib/utils"
import { useTheme } from "next-themes"

export function ThemeSwitcher() {
  const { color, setColor } = useThemeColor()
  const { theme, setTheme } = useTheme()

  const colors = [
    "zinc", "red", "orange", "yellow", "green", 
    "blue", "purple", "pink", "brown"
  ]

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card text-card-foreground">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Mode</h3>
        <Button 
          variant={theme === 'light' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setTheme('light')}
        >
          Light
        </Button>
        <Button 
          variant={theme === 'dark' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setTheme('dark')}
        >
          Dark
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Color Theme</h3>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <Button
              key={c}
              variant="outline"
              size="sm"
              className={cn(
                "w-8 h-8 rounded-full p-0 border-2",
                color === c ? "border-primary" : "border-transparent"
              )}
              style={{ backgroundColor: `hsl(var(--${c === "zinc" ? "primary" : "primary"}))` }} // simplified preview
              onClick={() => setColor(c as any)}
              title={c}
            >
              <span className={cn("w-4 h-4 rounded-full", `bg-${c}-500`)} />
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
