"use client";

import { useEffect, useState } from "react";

type User = {
  lichessId: string;
  lichessUsername: string;
} | null;

type TiltHistoryItem = {
  id: string;
  tiltScore: number | null;
  createdAt: string | null;
};

type DashboardProfile = {
  lichessId: string | null;
  username: string;
  lastTiltScore: number | null;
  lastTiltAt: string | null;
  isPro: boolean | null;
};

type DashboardData = {
  profile: DashboardProfile;
  tiltHistory: TiltHistoryItem[];
};

export function useUserDashboard() {
  const [user, setUser] = useState<User>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) {
          setUser(null);
          setDashboard(null);
          setLoading(false);
          return;
        }
        const me = await meRes.json();
        const u: User = me.user ?? null;
        setUser(u);

        if (!u) {
          setDashboard(null);
          setLoading(false);
          return;
        }

        const dashRes = await fetch("/api/dashboard");
        if (!dashRes.ok) {
          setError("Failed to load dashboard");
          setLoading(false);
          return;
        }
        const dash = (await dashRes.json()) as DashboardData;
        setDashboard(dash);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { user, dashboard, loading, error };
}
