"use client";

import { useEffect } from "react";
import { initPosthog } from "@/lib/posthogClient";

export function PosthogBoot() {
  useEffect(() => {
    initPosthog();
  }, []);

  return null;
}
