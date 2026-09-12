'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const queryTheme = urlParams.get('theme') as Theme | null;
        if (queryTheme === 'light' || queryTheme === 'dark') return queryTheme;
        const stored = localStorage.getItem('hip-theme') as Theme | null;
        if (stored === 'light' || stored === 'dark') return stored;
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      } catch (e) {}
    }
    return 'light';
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryTheme = urlParams.get('theme') as Theme | null;
      let stored = localStorage.getItem('hip-theme') as Theme | null;
      if (queryTheme === 'light' || queryTheme === 'dark') {
        stored = queryTheme;
        try { localStorage.setItem('hip-theme', queryTheme); } catch (e) {}
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      // Default is light for first-time users unless OS explicitly prefers dark
      const initialTheme: Theme =
        stored === 'dark' || (stored !== 'light' && prefersDark) ? 'dark' : 'light';

      setThemeState(initialTheme);
      applyTheme(initialTheme);
    } catch (e) {
      applyTheme('light');
    }
  }, []);

  const applyTheme = (t: Theme) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (t === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
      }
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem('hip-theme', newTheme);
    } catch (e) {}
  };

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  return context;
}
