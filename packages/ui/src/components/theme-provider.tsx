"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes/dist/types"

type ColorTheme =
    | "zinc"
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "blue"
    | "purple"
    | "pink"
    | "brown"
    | "white"
    | "black"

interface ThemeColorContextType {
    color: ColorTheme
    setColor: (color: ColorTheme) => void
}

const ThemeColorContext = React.createContext<ThemeColorContextType>({
    color: "zinc",
    setColor: () => null,
})

export function useThemeColor() {
    return React.useContext(ThemeColorContext)
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    const [color, setColor] = React.useState<ColorTheme>("zinc")

    // Inject data-theme attribute to body or root
    React.useEffect(() => {
        const root = document.documentElement
        // Remove all previous theme data attributes if needed, but here we replace value
        root.setAttribute("data-theme", color)
    }, [color])

    return (
        <ThemeColorContext.Provider value={{ color, setColor }}>
            <NextThemesProvider {...props}>
                {children}
            </NextThemesProvider>
        </ThemeColorContext.Provider>
    )
}
