"use client";

import { useEffect, useState, useRef } from "react";
import { posthog } from "@/lib/posthogClient";
import { ProBadge } from "@/components/ProBadge";
import { ProGate } from "@/components/ProGate";
import { FeatureCard } from "@/components/FeatureCard";
import { ThemeToggle } from "@/components/ThemeToggle";
// import { TiltChart } from "@/components/TiltChart"; 

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
  lastGameAt?: string | null;
};

export default function HomePage() {
  const [user, setUser] = useState<User>(null);
  const [tiltScore, setTiltScore] = useState<number | null>(null);
  const [tiltHistory, setTiltHistory] = useState<TiltHistoryItem[]>([]);
  const [lastGameDate, setLastGameDate] = useState<string | null>(null);
  
  const [loadingTilt, setLoadingTilt] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);

  // DEV CONTROL: Polling State
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const isMounted = useRef(false);

  const stripeReady = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // --- INITIAL LOAD ---
  useEffect(() => {
    isMounted.current = true;

    async function loadUser() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        const u: User = data.user ?? null;
        
        if (isMounted.current) setUser(u);

        if (u) {
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

    return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // --- SMART POLLING LOGIC ---
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const runSyncLoop = async () => {
      if (!user || !isPollingEnabled || !isMounted.current) return;

      try {
        setIsSyncing(true);
        // console.log("[Auto-Sync] Checking for new games...");

        const res = await fetch("/api/sync/games", { method: "POST" });
        
        if (res.ok) {
          const json = await res.json();
          // Only reload dashboard if we actually found new games (count > 0)
          if (json.count > 0) {
            console.log(`[Auto-Sync] Found ${json.count} new games! Updating UI...`);
            await loadDashboard();
          }
        }
      } catch (e) {
        console.error("[Auto-Sync] Failed", e);
      } finally {
        if (isMounted.current) setIsSyncing(false);
        
        if (isPollingEnabled && isMounted.current) {
          // Poll every 30 seconds
          timeoutId = setTimeout(runSyncLoop, 30000); 
        }
      }
    };

    // Trigger immediately on login
    if (user && isPollingEnabled) {
      runSyncLoop();
    }

    return () => clearTimeout(timeoutId);
  }, [user, isPollingEnabled]); 


  // --- API ACTIONS ---

  async function loadDashboard() {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) return;

      const data: DashboardData = await res.json();
      
      if (isMounted.current) {
        setTiltScore(typeof data.profile.lastTiltScore === "number" ? data.profile.lastTiltScore : null);
        setTiltHistory(data.tiltHistory || []);
        setIsPro(!!data.profile.isPro);
        setCancelAtPeriodEnd(!!data.profile.cancelAtPeriodEnd);
        setLastGameDate(data.lastGameAt || null);
      }
    } catch (e) {
      console.error("Error loading dashboard:", e);
    }
  }

  function loginWithLichess() {
    window.location.href = "/api/auth/lichess/start";
  }

  async function logout() {
    try {
      await fetch("/api/auth/lichess/logout", { method: "POST" });
    } catch (e) { console.error(e); }
    posthog.reset();
    setUser(null);
    setTiltScore(null);
    setTiltHistory([]);
    setIsPro(false);
    setError(null);
  }

  async function manageBilling() {
    if (!user || !stripeReady) return;
    try {
      setCheckoutLoading(true);
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || "Failed to open billing portal");
        return;
      }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError("No billing portal URL returned");
    } catch (e) {
      console.error(e);
      setError("Failed to open billing portal");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function startCheckout() {
    if (!user || !stripeReady) return;
    try {
      setCheckoutLoading(true);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        setError("Unable to start checkout.");
        return;
      }
      const data = await res.json();
      if (data.url) {
        posthog.capture("upgrade_clicked", { username: user.lichessUsername });
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to start Stripe checkout");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function runTiltAnalysis() {
    if (!user) return;
    setLoadingTilt(true);
    setError(null);
    posthog.capture("tilt_check_started", { username: user.lichessUsername });

    try {
      const res = await fetch("/api/tilt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Tilt analysis unavailable.");

      const data = await res.json();
      setTiltScore(data.tilt_score);
      posthog.capture("tilt_check_completed", { 
        username: user.lichessUsername, 
        tiltScore: data.tilt_score 
      });
      await loadDashboard();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoadingTilt(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background text-foreground px-4 py-12 relative overflow-hidden">
      
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* Header Section */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
          CHESS<span className="text-primary">QUANT</span>
          {isPro && !cancelAtPeriodEnd && <ProBadge />}
          {isPro && cancelAtPeriodEnd && (
            <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-500">
              Expiring
            </span>
          )}
        </h1>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 bg-card/50 border border-border rounded-full px-4 py-1.5 backdrop-blur-sm shadow-sm">
              <div className={`w-2 h-2 rounded-full ${isSyncing ? "bg-blue-500 animate-ping" : "bg-primary"}`} />
              <p className="text-xs font-mono text-muted-foreground">
                OPERATOR: <strong className="text-foreground">{user.lichessUsername}</strong>
              </p>
              
              <div className="h-4 w-px bg-border mx-1" />
              <ThemeToggle />
              <div className="h-4 w-px bg-border mx-1" />
              
              {/* DEV CONTROL: Toggle Polling */}
              <button
                onClick={() => setIsPollingEnabled(!isPollingEnabled)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                  isPollingEnabled 
                    ? "border-primary/30 text-primary bg-primary/10" 
                    : "border-destructive/30 text-destructive bg-destructive/10"
                }`}
              >
                {isPollingEnabled ? "SYNC: ON" : "SYNC: OFF"}
              </button>

              <div className="h-4 w-px bg-border mx-1" />
              
              <button
                onClick={logout}
                className="text-xs font-bold text-muted-foreground hover:text-destructive transition-colors"
              >
                LOGOUT
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithLichess}
              className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all"
            >
              INITIALIZE SESSION
            </button>
          )}
        </div>
      </div>

      {/* Feature Cards */}
      <div className="relative z-10 mt-4 w-full max-w-4xl grid gap-6 md:grid-cols-2">
        <FeatureCard
          title="Tilt Scanner"
          description="Analyze your recent games and measure your emotional tilt."
          cta={!user ? "Login Required" : loadingTilt ? "Analyzing..." : "Run Scan"}
          onClick={runTiltAnalysis}
          disabled={loadingTilt || !user}
          pro={false}
        />

        <ProGate isPro={isPro} onUpgradeClick={startCheckout}>
          <FeatureCard
            title="Deep Market Analytics"
            description="Advanced performance breakdowns and training plans tailored to your tilt patterns."
            cta={!stripeReady ? "System Offline" : checkoutLoading ? "Processing..." : "Manage Access"}
            onClick={manageBilling}
            disabled={!stripeReady}
            pro
          />
        </ProGate>
      </div>

      {!stripeReady && (
        <div className="text-[10px] font-mono text-muted-foreground opacity-60">
          * Payment Gateway: OFFLINE (Dev Build)
        </div>
      )}
      {error && <p className="text-destructive text-sm font-mono bg-destructive/10 px-3 py-1 rounded border border-destructive/20">Error: {error}</p>}

      {tiltScore !== null && !error && (
        <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Current Tilt Index
          </div>
          <div className="text-6xl font-mono font-bold text-foreground tracking-tighter">
            {tiltScore.toFixed(2)}
          </div>
        </div>
      )}

      {user && (
        <section className="relative z-10 mt-6 w-full max-w-md border border-border rounded-xl bg-card/50 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? "bg-blue-500 animate-pulse" : "bg-primary"}`} />
                Recent Scans
              </h2>
              <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
                LIVE DATA
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
              <span>Last Game Synced:</span>
              <span className="text-foreground font-semibold">
                {lastGameDate ? new Date(lastGameDate).toLocaleString() : "WAITING..."}
              </span>
            </div>
          </div>

          {!loadingDashboard && tiltHistory.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No data available.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Run your first scan to populate the grid.</p>
            </div>
          )}

          {!loadingDashboard && tiltHistory.length > 0 && (
            <div className="divide-y divide-border max-h-60 overflow-y-auto">
              {tiltHistory.map((item) => (
                <div key={item.id} className="flex justify-between items-center px-4 py-3 hover:bg-secondary/50 transition-colors group">
                  <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown"}
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {item.tiltScore !== null ? item.tiltScore.toFixed(2) : "-"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}