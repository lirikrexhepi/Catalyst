import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeContextValue, ThemeDefinition } from './types';
import {
  STEALTH_DARK_THEME,
  getRegisteredTheme,
  getAllThemes,
  registerTheme as registerThemeInRegistry,
} from './themeRegistry';

const THEME_STORAGE_KEY = 'catalyst_theme_id';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useThemeSafe = (): ThemeContextValue | null => {
  return useContext(ThemeContext);
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored || STEALTH_DARK_THEME.id;
    } catch {
      return STEALTH_DARK_THEME.id;
    }
  });

  const [themeList, setThemeList] = useState<ThemeDefinition[]>(() => getAllThemes());

  const currentTheme = useMemo(() => {
    return getRegisteredTheme(themeId);
  }, [themeId]);

  const setTheme = useCallback((newId: string) => {
    setThemeIdState(newId);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newId);
    } catch {
      // ignore
    }
  }, []);

  const registerTheme = useCallback((newTheme: ThemeDefinition) => {
    registerThemeInRegistry(newTheme);
    setThemeList(getAllThemes());
  }, []);

  // Synchronize CSS variables onto document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', currentTheme.id);

    if (currentTheme.cssVariables) {
      for (const [key, val] of Object.entries(currentTheme.cssVariables)) {
        root.style.setProperty(key, val);
      }
    }

    // Direct token helpers
    root.style.setProperty('--theme-panel-bg', currentTheme.colors.panelBackground);
    root.style.setProperty('--theme-panel-border', currentTheme.colors.panelBorder);
    root.style.setProperty('--theme-card-bg', currentTheme.colors.cardBackground);
    root.style.setProperty('--theme-card-border', currentTheme.colors.cardBorder);
    root.style.setProperty('--theme-input-bg', currentTheme.colors.inputBackground);
    root.style.setProperty('--theme-input-border', currentTheme.colors.inputBorder);
    root.style.setProperty('--theme-pill-bg', currentTheme.colors.pillBackground);
    root.style.setProperty('--theme-pill-hover', currentTheme.colors.pillHover);
    root.style.setProperty('--theme-divider', currentTheme.colors.divider);
    root.style.setProperty('--theme-text-primary', currentTheme.colors.textPrimary);
    root.style.setProperty('--theme-text-secondary', currentTheme.colors.textSecondary);
    root.style.setProperty('--theme-text-muted', currentTheme.colors.textMuted);
  }, [currentTheme]);

  const value: ThemeContextValue = useMemo(
    () => ({
      currentTheme,
      themeId,
      availableThemes: themeList,
      setTheme,
      registerTheme,
    }),
    [currentTheme, themeId, themeList, setTheme, registerTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
