"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export function PosthogBoot() {
  useEffect(() => {
    // Ensure we are on the client and PostHog isn't loaded yet
    if (typeof window !== "undefined" && !posthog.__loaded) {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

      if (key) {
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
          // --- GDPR CONFIGURATION ---
          // 1. Use cookies/localstorage to remember the user
          persistence: 'localStorage+cookie', 
          // 2. IMPORTANT: Start in "Opt-Out" mode. 
          // Tracking will NOT happen until CookieConsent calls posthog.opt_in_capturing()
          opt_out_capturing_by_default: true, 
          // 3. Prevent automatic pageview capture until we are sure
          capture_pageview: false, 
        });
      }
    }
  }, []);

  return null;
}