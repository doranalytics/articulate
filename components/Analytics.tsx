"use client";

// Mount-once analytics bootstrap + SPA-aware pageviews.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { initAnalytics, pageview } from "@/lib/analytics";

export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    initAnalytics();
  }, []);
  useEffect(() => {
    if (pathname) pageview(pathname);
  }, [pathname]);
  return null;
}
