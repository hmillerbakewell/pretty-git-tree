import type { CaptureResult, PostHog } from "posthog-js";

const POSTHOG_KEY: string | undefined = import.meta.env?.VITE_POSTHOG_KEY;
const POSTHOG_HOST: string = import.meta.env?.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

const optedOut = () =>
  typeof navigator === "undefined" || navigator.doNotTrack === "1" || ("globalPrivacyControl" in navigator && navigator.globalPrivacyControl === true);

const SECONDS_PER_DAY = 86400;

const FULL_URL_PROPERTIES = [
  "$referrer",
  "$initial_referrer",
  "$initial_referring_domain",
  "$initial_current_url",
  "$initial_pathname",
  "$session_entry_referrer",
  "$session_entry_url",
];

let loadingClient: Promise<PostHog | null> | undefined;

function posthog(): Promise<PostHog | null> | null {
  if (!POSTHOG_KEY || optedOut()) return null;
  loadingClient ??= Promise.all([import("posthog-js"), import("posthog-js/dist/exception-autocapture.js")])
    .then(
      ([{ posthog: library }]) =>
        library.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          persistence: "memory",
          disable_persistence: true,
          person_profiles: "never",
          internal_or_test_user_hostname: null,
          advanced_disable_flags: true,
          disable_external_dependency_loading: true,
          autocapture: false,
          rageclick: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          capture_exceptions: true,
          capture_performance: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_product_tours: true,
          disable_conversations: true,
          disable_web_experiments: true,
          disable_capture_url_hashes: true,
          save_referrer: false,
          mask_personal_data_properties: true,
          disable_compression: true,
          before_send: (event: CaptureResult | null) => {
            if (!event) return null;
            const props = event.properties;
            for (const property of FULL_URL_PROPERTIES) delete props[property];
            props.$current_url = location.origin + location.pathname;
            props.$referring_domain = props.$session_entry_referring_domain = referringDomain(document.referrer, location.href);
            return event;
          },
        }) ?? null,
    )
    .catch(() => null);
  return loadingClient;
}

export type Props = Record<string, string | number | boolean>;

export function track(event: string, props: Props = {}): void {
  posthog()?.then((client) => client?.capture(event, props));
}

export function reportError(error: unknown, props: Props = {}): void {
  posthog()?.then((client) => client?.captureException(error, props));
}

export function referringDomain(referrer: string, here: string): string {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== new URL(here).hostname.replace(/^www\./, "") ? host : "$direct";
  } catch {
    return "$direct";
  }
}

export function bucket(count: number, upperBounds = [1, 5, 20, 100, 500, 2000]): string {
  if (count <= 0) return "0";
  let previousBound = 0;
  for (const bound of upperBounds) {
    if (count <= bound) return previousBound + 1 >= bound ? String(bound) : `${previousBound + 1}-${bound}`;
    previousBound = bound;
  }
  return `${previousBound + 1}+`;
}

export function shape(stats: { commits: number; branches: number; merges: number; first: number | null; last: number | null }): Props {
  const days = stats.first !== null && stats.last !== null ? (stats.last - stats.first) / SECONDS_PER_DAY : 0;
  return {
    commits: bucket(stats.commits),
    branches: bucket(stats.branches, [1, 2, 5, 10, 25, 50]),
    merges: bucket(stats.merges, [1, 5, 20, 100, 500]),
    span_days: days < 1 ? "<1" : bucket(Math.ceil(days), [1, 7, 31, 92, 366]),
  };
}
