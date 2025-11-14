// src/components/theme-provider.tsx
// VIGIL_THEME_PROVIDER
import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = React.createContext<ThemeContextValue | undefined>(
  undefined
);

function getSystemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;

  // resolve "system" to actual light/dark
  const resolved: Theme = theme === "system" ? getSystemPreference() : theme;

  if (resolved === "dark") {
    root.classList.add("dark");
    body.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    body.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vigil-theme",
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);

  // On mount, read from localStorage or fall back to default
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey) as Theme | null;
      const initial = stored || defaultTheme;
      setThemeState(initial);
      applyTheme(initial);
    } catch {
      // ignore storage errors, still apply default theme
      applyTheme(defaultTheme);
    }
  }, [defaultTheme, storageKey]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // ignore storage errors
      }
      applyTheme(next);
    },
    [storageKey]
  );

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeProviderContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
