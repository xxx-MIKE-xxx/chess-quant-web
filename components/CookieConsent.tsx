"use client";

import { useState, useEffect } from "react";
import { posthog } from "posthog-js";

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem("cookie-consent");
    
    if (consent === null) {
      // No choice made yet, show banner
      setShowBanner(true);
    } else if (consent === "granted") {
      // Already granted, ensure PostHog is opted in
      posthog.opt_in_capturing();
    } else {
      // Denied, ensure PostHog is opted out
      posthog.opt_out_capturing();
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "granted");
    posthog.opt_in_capturing();
    setShowBanner(false);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "denied");
    posthog.opt_out_capturing();
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 animate-in slide-in-from-bottom-10 duration-500">
      <div className="max-w-4xl mx-auto bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-lg p-4 md:flex items-center justify-between gap-4">
        
        {/* Text Content */}
        <div className="mb-4 md:mb-0">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            Data Privacy Protocol
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            We use cookies to analyze game patterns and improve system performance. 
            Stripe requires essential cookies for secure payments.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold px-4 py-2 rounded transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)]"
          >
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
}