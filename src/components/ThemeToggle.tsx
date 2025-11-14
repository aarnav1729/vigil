// src/components/ThemeToggle.tsx
// VIGIL_THEME_TOGGLE
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const nextTheme = isDark ? "light" : "dark";

  const handleClick = () => {
    setTheme(nextTheme);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      className="fixed top-4 right-4 z-50 rounded-full shadow-md bg-background/80 backdrop-blur-sm border-border"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun
        className={`h-4 w-4 transition-all ${
          isDark ? "scale-0 opacity-0" : "scale-100 opacity-100"
        }`}
      />
      <Moon
        className={`h-4 w-4 absolute transition-all ${
          isDark ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      />
    </Button>
  );
}
