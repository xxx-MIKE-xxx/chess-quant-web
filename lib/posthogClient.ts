"use client";

import posthog from "posthog-js";

let initialized = false;

export function initPosthog() {
  if (initialized) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    console.warn("PostHog key not set");
    return;
  }

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    capture_pageview: false, // we'll send pageviews ourselves if we want
  });

  initialized = true;
}

export { posthog };
