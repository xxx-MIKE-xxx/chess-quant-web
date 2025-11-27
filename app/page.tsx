"use client";

import { useEffect, useState, useRef } from "react";
import { posthog } from "@/lib/posthogClient";
import { ProBadge } from "@/components/ProBadge";
import { ProGate } from "@/components/ProGate";
import { FeatureCard } from "@/components/FeatureCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAnalysisQueue } from "@/lib/hooks/useAnalysisQueue";
// import { TiltChart } from "@/components/TiltChart"; 
import type { ProcessedGame } from "@/lib/chess/gameProcessor";

type User = {
  lichessId: string;
  lichessUsername: string;
} | null;

export default function HomePage() {
  // --- STATE ---
  const [user, setUser] = useState<User>(null);
  const [tiltScore, setTiltScore] = useState<number | null>(null);
  
  // The "Raw" games from Lichess (Ephemeral - not stored)
  const [rawGames, setRawGames] = useState<any[]>([]);
  
  const [loadingTilt, setLoadingTilt] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- HOOKS ---
  // The worker engine that processes raw games
  const { analyzedGames, isAnalyzing, analyzeGame } = useAnalysisQueue();
  
  const stripeReady = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  // --- 1. INITIAL LOAD (Auth) ---
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          // Check pro status
          if (data.user) {
             checkProStatus(data.user.lichessUsername);
             posthog.identify(data.user.lichessUsername);
          }
        }
      } catch (e) { console.error(e); }
    }
    loadUser();
  }, []);

  async function checkProStatus(username: string) {
      const res = await fetch("/api/dashboard");
      if(res.ok) {
          const data = await res.json();
          setIsPro(!!data.profile?.isPro);
          setCancelAtPeriodEnd(!!data.profile?.cancelAtPeriodEnd);
      }
  }

  // --- 2. POLL LICHESS (The "Fuel" Line) ---
  useEffect(() => {
    if (!user) return;

    const fetchRecentGames = async () => {
      try {
        // This hits your new proxy. No DB write.
        const res = await fetch('/api/proxy/recent-games');
        if (res.ok) {
            const data = await res.json();
            if (data.games) {
                setRawGames(data.games);
            }
        }
      } catch(e) { console.error("Lichess fetch failed", e); }
    };
    
    fetchRecentGames(); // Run once immediately
    const interval = setInterval(fetchRecentGames, 60000); // Then every 60s
    return () => clearInterval(interval);
  }, [user]);


  // --- 3. ORCHESTRATE ANALYSIS (The "Engine" Line) ---
  useEffect(() => {
    if (!user || isAnalyzing) return;

    // Find un-analyzed game
    const nextGame = rawGames.find(
        raw => !analyzedGames.find(done => done.id === raw.id)
    );

    if (nextGame) {
      analyzeGame(nextGame, user.lichessUsername);
    } else if (analyzedGames.length > 0 && rawGames.length > 0) {
        // If we have processed everything available, check for tilt
        if (analyzedGames.length >= rawGames.length) {
             // Auto-calculate if we haven't yet or if new data came in
             // For manual trigger, we rely on the button.
             // To make it auto-update, uncomment this:
             // calculateTiltScore(analyzedGames);
        }
    }
  }, [rawGames, analyzedGames, isAnalyzing, user]);

  async function runTiltAnalysis() {
     if (loadingTilt) return;
     
     // Clear previous errors
     setError(null);
     setLoadingTilt(true);
     
     try {
        // Send purely the analyzed stats to Python
        const res = await fetch('/api/py_tilt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                games: analyzedGames, 
                personal_model: null 
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "Tilt analysis unavailable.");
        }

        const data = await res.json();
        if (data.tilt_score !== undefined) {
            setTiltScore(data.tilt_score);
        }
     } catch (e: any) { 
        console.error("Inference failed", e); 
        setError(e.message || "Tilt Check Failed");
     } finally {
        setLoadingTilt(false);
     }
  }

  // --- ACTIONS ---

  function loginWithLichess() {
    window.location.href = "/api/auth/lichess/start";
  }

  async function logout() {
    try {
      await fetch("/api/auth/lichess/logout", { method: "POST" });
      localStorage.removeItem("chess_quant_history_v1");
      window.location.reload();
    } catch(e) { console.error(e); }
  }

  async function manageBilling() {
    if (!user) return;
    setCheckoutLoading(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setCheckoutLoading(false);
  }

  async function startCheckout() {
    if (!user) return;
    setCheckoutLoading(true);
    const res = await fetch("/api/checkout", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setCheckoutLoading(false);
  }

  // --- RENDER ---

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-background text-foreground px-4 py-12 relative overflow-hidden">
      
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* Header */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
          CHESS<span className="text-primary">QUANT</span>
          {isPro && !cancelAtPeriodEnd && <ProBadge />}
        </h1>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 bg-card/50 border border-border rounded-full px-4 py-1.5 backdrop-blur-sm shadow-sm">
              <div className={`w-2 h-2 rounded-full ${isAnalyzing ? "bg-blue-500 animate-ping" : "bg-primary"}`} />
              <p className="text-xs font-mono text-muted-foreground">
                OPERATOR: <strong className="text-foreground">{user.lichessUsername}</strong>
              </p>
              <div className="h-4 w-px bg-border mx-1" />
              <ThemeToggle />
              <div className="h-4 w-px bg-border mx-1" />
              <button onClick={logout} className="text-xs font-bold text-muted-foreground hover:text-destructive transition-colors">
                LOGOUT
              </button>
            </div>
          ) : (
            <button onClick={loginWithLichess} className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all">
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
            title="Deep Pro Analytics"
            description="Unlock advanced training plans." 
            cta={isPro ? "Manage Subscription" : "Upgrade"}
            onClick={isPro ? manageBilling : startCheckout}
            pro 
          />
        </ProGate>
      </div>

      {/* Error Message */}
      {error && (
        <div className="relative z-10 mt-4 p-3 rounded border border-destructive/50 bg-destructive/10 text-destructive text-sm font-mono">
          Error: {error}
        </div>
      )}

      {/* Tilt Score Display */}
      {tiltScore !== null && !error && (
        <div className="relative z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            Current Tilt Index
          </div>
          <div className={`text-6xl font-mono font-bold tracking-tighter ${tiltScore > 0.5 ? 'text-destructive' : 'text-foreground'}`}>
            {tiltScore.toFixed(2)}
          </div>
        </div>
      )}

      {/* Analysis Queue Visualization */}
      {user && (
        <section className="relative z-10 mt-6 w-full max-w-md border border-border rounded-xl bg-card/50 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/30 flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isAnalyzing ? "bg-blue-500 animate-pulse" : "bg-primary"}`} />
                Recent Scans
              </h2>
              <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
                LIVE DATA
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground">
              <span>Last Game Synced:</span>
              <span className="text-foreground font-semibold">
                {analyzedGames.length > 0 
                  ? new Date(analyzedGames[analyzedGames.length - 1].createdAt).toLocaleString()
                  : "WAITING..."}
              </span>
            </div>
          </div>

          {/* List of Analyzed Games */}
          <div className="divide-y divide-border max-h-60 overflow-y-auto">
             {analyzedGames.length === 0 && (
                 <div className="p-6 text-center text-xs text-muted-foreground">
                    {rawGames.length === 0 ? "Waiting for Lichess..." : "Starting Engine..."}
                 </div>
             )}
             
             {[...analyzedGames].reverse().map((game) => (
                <div key={game.id} className="flex justify-between items-center px-4 py-2 hover:bg-secondary/50 transition-colors">
                   <div className="flex flex-col">
                       <span className="text-xs font-mono text-foreground">{new Date(game.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                       <span className="text-[10px] text-muted-foreground">ACPL: {game.my_acpl} | Blunders: {game.my_blunder_count}</span>
                   </div>
                   <span className={`text-xs font-bold ${game.result === 1 ? 'text-green-500' : game.result === 0 ? 'text-red-500' : 'text-gray-500'}`}>
                       {game.result === 1 ? 'WIN' : game.result === 0 ? 'LOSS' : 'DRAW'}
                   </span>
                </div>
             ))}
          </div>
        </section>
      )}
    </main>
  );
}