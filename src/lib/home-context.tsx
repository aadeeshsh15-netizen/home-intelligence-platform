'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UpdateHomeSchema } from '@/domain/home.schema';

export interface HomeStats {
  totalFloors: number;
  totalRooms: number;
  totalSensors: number;
  totalDevices: number;
}

export interface HomeContextType {
  homeName: string;
  stats: HomeStats;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updateHomeName: (newName: string) => Promise<{ success: boolean; error?: string }>;
  refreshHome: () => Promise<void>;
}

const DEFAULT_STATS: HomeStats = {
  totalFloors: 2,
  totalRooms: 7,
  totalSensors: 28,
  totalDevices: 7,
};

const DEFAULT_HOME_NAME = 'Apex Horizon Estate';

const HomeContext = createContext<HomeContextType>({
  homeName: DEFAULT_HOME_NAME,
  stats: DEFAULT_STATS,
  isLoading: false,
  isSaving: false,
  error: null,
  updateHomeName: async () => ({ success: false, error: 'Provider not mounted' }),
  refreshHome: async () => {},
});

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const [homeName, setHomeName] = useState<string>(DEFAULT_HOME_NAME);
  const [stats, setStats] = useState<HomeStats>(DEFAULT_STATS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHome = useCallback(async () => {
    try {
      const res = await fetch('/api/home');
      if (res.ok) {
        const data = await res.json();
        if (data.home?.name) {
          setHomeName(data.home.name);
          try {
            localStorage.setItem('hip-home-name', data.home.name);
          } catch {}
        }
        if (data.home) {
          setStats({
            totalFloors: data.home.totalFloors ?? DEFAULT_STATS.totalFloors,
            totalRooms: data.home.totalRooms ?? DEFAULT_STATS.totalRooms,
            totalSensors: data.home.totalSensors ?? DEFAULT_STATS.totalSensors,
            totalDevices: data.home.totalDevices ?? DEFAULT_STATS.totalDevices,
          });
        }
        setError(null);
      }
    } catch (e: any) {
      console.warn('Failed to load home entity from API, using cached or default values', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Optimistic initial hydration from cache if present
    try {
      const cached = localStorage.getItem('hip-home-name');
      if (cached && cached.trim().length > 0) {
        setHomeName(cached);
      }
    } catch {}

    fetchHome();

    // Cross-tab / cross-component sync listener
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<{ name: string }>;
      if (customEvent.detail?.name) {
        setHomeName(customEvent.detail.name);
      }
    };

    window.addEventListener('hip-home-updated', handleSync);
    return () => window.removeEventListener('hip-home-updated', handleSync);
  }, [fetchHome]);

  const updateHomeName = useCallback(async (newName: string): Promise<{ success: boolean; error?: string }> => {
    // Client-side schema pre-validation
    const validation = UpdateHomeSchema.safeParse({ name: newName });
    if (!validation.success) {
      const msg = validation.error.errors[0]?.message || 'Invalid home name';
      setError(msg);
      return { success: false, error: msg };
    }

    const trimmed = validation.data.name;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/home', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const msg = errorData.details || errorData.error || `Update failed (${res.status})`;
        setError(msg);
        return { success: false, error: msg };
      }

      const data = await res.json();
      const updatedName = data.home?.name || trimmed;

      setHomeName(updatedName);
      if (data.home) {
        setStats((prev) => ({
          totalFloors: data.home.totalFloors ?? prev.totalFloors,
          totalRooms: data.home.totalRooms ?? prev.totalRooms,
          totalSensors: data.home.totalSensors ?? prev.totalSensors,
          totalDevices: data.home.totalDevices ?? prev.totalDevices,
        }));
      }

      try {
        localStorage.setItem('hip-home-name', updatedName);
      } catch {}

      // Dispatch event to synchronize all listeners instantly
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hip-home-updated', { detail: { name: updatedName } }));
      }

      return { success: true };
    } catch (e: any) {
      const msg = e.message || 'Network error updating home name';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <HomeContext.Provider
      value={{
        homeName,
        stats,
        isLoading,
        isSaving,
        error,
        updateHomeName,
        refreshHome: fetchHome,
      }}
    >
      {children}
    </HomeContext.Provider>
  );
}

export function useHome(): HomeContextType {
  const context = useContext(HomeContext);
  return context;
}
