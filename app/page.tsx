"use client";

import { useEffect, useState } from "react";
import { posthog } from "@/lib/posthogClient";
import { ProBadge } from "@/components/ProBadge";
import { ProGate } from "@/components/ProGate";
import { FeatureCard } from "@/components/FeatureCard";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  cancelAtPeriodEnd?: boolean;
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
  const [billingLoading, setBillingLoading] = useState(false); 
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);


  // Stripe enabled in this build?
  const stripeReady = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // Load session + dashboard on mount
  useEffect(() => {
    async function loadUserAndDashboard() {
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

    loadUserAndDashboard();
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
      
      // NEW: Set the cancellation state from the backend
      setCancelAtPeriodEnd(!!data.profile.cancelAtPeriodEnd);
      
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



  // app/page.tsx

  async function manageBilling() {
    if (!user) return;
    if (!stripeReady) return;

    try {
      setCheckoutLoading(true);

      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Billing portal error", res.status, text);
        setError(text || "Failed to open billing portal");
        return;
      }

      const data = await res.json();
      if (data.url) {
        // FIX: Use current window so the "Return" button brings them back here
        // and refreshes the page state.
        window.location.href = data.url;
      } else {
        setError("No billing portal URL returned from server");
      }
    } catch (e) {
      console.error("manageBilling failed:", e);
      setError("Failed to open billing portal");
    } finally {
      // If we redirect, this state change technically doesn't matter, 
      // but it's good practice in case redirect fails.
      setCheckoutLoading(false);
    }
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
        const text = await res.text();
        console.error("Checkout error", res.status, text);
        setError("Unable to start checkout. Please try again in a moment.");
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


  async function openBillingPortal() {
    if (!user) return;

    try {
      setBillingLoading(true);
      setError(null);

      const res = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!res.ok) {
        console.error("Billing portal error", res.status);
        const text = await res.text();
        setError(text || "Unable to open billing portal");
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No billing portal URL returned from server");
      }
    } catch (e) {
      console.error("openBillingPortal failed:", e);
      setError("Failed to open billing portal");
    } finally {
      setBillingLoading(false);
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

        const genericMessage =
          res.status === 500 || res.status === 503
            ? "Tilt analysis is temporarily unavailable. Please try again in a minute."
            : "Something went wrong while checking your tilt. Please try again.";

        throw new Error(genericMessage);
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
      setError(
        err?.message ??
          "Something went wrong while checking your tilt. Please try again."
      );
    } finally {
      setLoadingTilt(false);
    }
  }


  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background text-foreground px-4">
      {/* Title */}
      <h1 className="text-3xl font-bold flex items-center gap-2">
        Chess Quant
        {/* LOGIC: Show Badge if active, 'Ends Soon' if canceling */}
        {isPro && !cancelAtPeriodEnd && <ProBadge />}
        {isPro && cancelAtPeriodEnd && (
          <span className="bg-yellow-600/80 border border-yellow-500 text-white text-xs px-2 py-0.5 rounded ml-2 select-none">
            Ends Soon
          </span>
        )}
      </h1>

      {/* Auth status */}
      <div className="flex flex-col items-center gap-2">
        {user ? (
          <>
            <p className="text-sm text-green-400">
              Logged in as <strong>{user.lichessUsername}</strong>
            </p>
            
            {/* NEW: Theme Toggle */}
            <ThemeToggle /> 
            
            <button
              onClick={logout}
              className="px-3 py-1 mt-2 rounded bg-neutral-800 text-xs border border-neutral-600 hover:bg-neutral-700"
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

      {/* Feature cards */}
      <div className="mt-4 w-full max-w-2xl grid gap-4 md:grid-cols-2">
        <FeatureCard
          title="Tilt check"
          description="Analyze your recent games and measure your emotional tilt."
          cta={
            !user
              ? "Login to run tilt"
              : loadingTilt
              ? "Calculating..."
              : "Check my tilt"
          }
          onClick={runTiltAnalysis}
          disabled={loadingTilt || !user}
          pro={false}
        />

        {/* Pro-only feature slot */}
        <ProGate isPro={isPro} onUpgradeClick={startCheckout}>
          <FeatureCard
            title="Deep Pro analytics"
            description="(Coming soon) Advanced performance breakdowns and training plans tailored to your tilt patterns."
            cta={
              !stripeReady
                ? "Pro coming soon"
                : !user
                ? "Log in to upgrade"
                : checkoutLoading
                ? isPro
                  ? "Opening billing…"
                  : "Opening Stripe…"
                : isPro
                ? "Manage subscription"
                : "Upgrade to Pro"
            }
            onClick={
              !stripeReady || !user
                ? undefined
                : isPro
                ? manageBilling
                : startCheckout
            }
            disabled={!user || checkoutLoading || !stripeReady}
            pro
          />
        </ProGate>
      </div>

      {/* Stripe disabled message */}
      {!stripeReady && (
        <p className="text-[11px] text-neutral-400 max-w-xs text-center">
          Payments are disabled in this build. You can still use tilt analysis
          freely.
        </p>
      )}

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
        <section className="mt-6 w-full max-w-md border border-border rounded-lg p-4 bg-card text-card-foreground">
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