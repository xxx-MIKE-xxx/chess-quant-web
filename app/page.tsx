"use client";

import { useEffect, useState } from "react";
import { posthog } from "@/lib/posthogClient";
import { ProGate } from "@/components/ProGate";
import { ProBadge } from "@/components/ProBadge";
import { useUserDashboard } from "@/lib/hooks/useUserDashboard";

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

export default function HomePage() {
  const [user, setUser] = useState<User>(null);
  const [tiltScore, setTiltScore] = useState<number | null>(null);
  const [tiltHistory, setTiltHistory] = useState<TiltHistoryItem[]>([]);
  const [loadingTilt, setLoadingTilt] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);

  // Stripe enabled?
  const stripeReady = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // 1) Load session on mount, then dashboard if logged in
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        const u: User = data.user ?? null;
        setUser(u);

        if (u) {
          // Identify user in PostHog
          posthog.identify(u.lichessId || u.lichessUsername, {
            lichessId: u.lichessId,
            lichessUsername: u.lichessUsername,
          });
          await loadDashboard();
        }
      } catch (e) {
        console.error("Error loading user:", e);
      }
    }

    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboard() {
    setLoadingDashboard(true);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) {
        console.error("Dashboard error:", res.status);
        return;
      }

      const data: DashboardData = await res.json();
      setTiltScore(
        typeof data.profile.lastTiltScore === "number"
          ? data.profile.lastTiltScore
          : null
      );
      setTiltHistory(data.tiltHistory || []);
      setIsPro(!!data.profile.isPro);
    } catch (e) {
      console.error("Error loading dashboard:", e);
    } finally {
      setLoadingDashboard(false);
    }
  }

  function loginWithLichess() {
    window.location.href = "/api/auth/lichess/start";
  }

  async function logout() {
    try {
      await fetch("/api/auth/lichess/logout", { method: "POST" });
    } catch (e) {
      console.error("Logout failed:", e);
    }
    posthog.reset();
    setUser(null);
    setTiltScore(null);
    setTiltHistory([]);
    setIsPro(false);
    setError(null);
  }

  async function startCheckout() {
    if (!user) return;

    if (!stripeReady) {
      console.warn("Stripe not configured in this build");
      return;
    }

    try {
      setCheckoutLoading(true);

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        console.error("Checkout error", res.status);
        const text = await res.text();
        setError(text || "Stripe checkout error");
        return;
      }

      const data = await res.json();
      if (data.url) {
        posthog.capture("upgrade_clicked", {
          lichessUsername: user.lichessUsername,
        });
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned from server");
      }
    } catch (e) {
      console.error("startCheckout failed:", e);
      setError("Failed to start Stripe checkout");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function runTiltAnalysis() {
    if (!user) return;

    setLoadingTilt(true);
    setError(null);

    posthog.capture("tilt_check_started", {
      lichessUsername: user.lichessUsername,
      source: "lichess",
    });

    try {
      const res = await fetch("/api/tilt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // backend uses session
      });

      if (!res.ok) {
        const text = await res.text();

        posthog.capture("tilt_check_failed", {
          lichessUsername: user.lichessUsername,
          status: res.status,
          errorText: text.slice(0, 500),
        });

        throw new Error(`API error ${res.status}: ${text}`);
      }

      const data = await res.json();
      setTiltScore(data.tilt_score);

      posthog.capture("tilt_check_completed", {
        lichessUsername: user.lichessUsername,
        tiltScore: data.tilt_score,
        source: "lichess",
      });

      await loadDashboard();
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
    } finally {
      setLoadingTilt(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-black text-white px-4">
      <h1 className="text-3xl font-bold">Chess Quant</h1>

      {/* Auth status */}
      <div className="flex flex-col items-center gap-2">
        {user ? (
          <>
            <div className="flex items-center gap-2">
              <p className="text-sm text-green-400">
                Logged in as <strong>{user.lichessUsername}</strong>
              </p>
              {isPro && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-400 text-black font-semibold">
                  PRO
                </span>
              )}
            </div>
            <button
              onClick={logout}
              className="px-3 py-1 rounded bg-neutral-800 text-xs border border-neutral-600 hover:bg-neutral-700"
            >
              Log out
            </button>
          </>
        ) : (
          <button
            onClick={loginWithLichess}
            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-500"
          >
            Login with Lichess
          </button>
        )}
      </div>

      {/* Main actions */}
      <div className="flex flex-col items-center gap-3">
        {/* Tilt button */}
        <button
          onClick={runTiltAnalysis}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
          disabled={loadingTilt || !user}
        >
          {loadingTilt ? "Calculating..." : "Check my tilt"}
        </button>

        {/* Stripe / Upgrade button */}
        <button
          onClick={startCheckout}
          className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 text-sm"
          disabled={!user || checkoutLoading || !stripeReady || isPro}
        >
          {!stripeReady
            ? "Pro coming soon"
            : isPro
            ? "You’re Chess Quant Pro ✅"
            : checkoutLoading
            ? "Opening Stripe…"
            : "Upgrade to Chess Quant Pro"}
        </button>

        {!stripeReady && (
          <p className="text-[11px] text-neutral-400 max-w-xs text-center">
            Payments are disabled in this dev build. You can still use tilt
            analysis freely.
          </p>
        )}
      </div>

      {/* Status / errors */}
      {error && <p className="text-red-500 text-sm mt-2">Error: {error}</p>}

      {tiltScore !== null && !error && (
        <p className="mt-2 text-lg">
          Your tilt score:{" "}
          <span className="font-mono">{tiltScore.toFixed(2)}</span>
        </p>
      )}

      {/* Tilt history */}
      {user && (
        <section className="mt-6 w-full max-w-md border border-neutral-800 rounded-lg p-4 bg-neutral-900/40">
          <h2 className="font-semibold mb-2 text-lg">Recent tilt checks</h2>

          {loadingDashboard && (
            <p className="text-sm text-neutral-400">Loading history…</p>
          )}

          {!loadingDashboard && tiltHistory.length === 0 && (
            <p className="text-sm text-neutral-400">
              No tilt checks yet. Press &quot;Check my tilt&quot; to create your
              first one.
            </p>
          )}

          {!loadingDashboard && tiltHistory.length > 0 && (
            <ul className="space-y-1 text-sm">
              {tiltHistory.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between border-b border-neutral-800/70 py-1 last:border-b-0"
                >
                  <span>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : "Unknown time"}
                  </span>
                  <span className="font-mono">
                    {item.tiltScore !== null ? item.tiltScore.toFixed(2) : "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
