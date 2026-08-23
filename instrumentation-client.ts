import posthog from "posthog-js";

// Shares the doranalytics PostHog project; every event is tagged
// site:"articulate" so it can be filtered (or later migrated to its own
// project by swapping this key). phc_ tokens are public client keys.
posthog.init("phc_B7kjZQygSGvhtNK3fsFzP3B6mvxWTwLssFpCfxiCxrHZ", {
  api_host: "https://us.i.posthog.com",
  defaults: "2025-05-24",
  capture_pageview: true,
  before_send: (event) => {
    if (event) event.properties = { ...event.properties, site: "articulate" };
    return event;
  },
});
