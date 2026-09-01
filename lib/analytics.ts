"use client";

import * as amplitude from "@amplitude/analytics-browser";

export type ProductEventName =
  | "Demo Viewed"
  | "Evidence Ingested"
  | "Structural Analysis Started"
  | "Repair Pack Generated"
  | "Replay Started"
  | "Replay Completed"
  | "Human Approval Requested"
  | "Repair Pack Approved"
  | "Closure Verification Started"
  | "Verified Closure Reached"
  | "WebMCP Tool Invoked";

type EventProperties = Record<string, string | number | boolean | undefined>;

let initialized = false;

function ensureInitialized(): boolean {
  if (typeof window === "undefined") return false;
  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return false;

  if (!initialized) {
    amplitude.init(apiKey, {
      defaultTracking: {
        sessions: true,
        pageViews: true,
        formInteractions: false,
        fileDownloads: false,
      },
    });
    initialized = true;
  }

  return true;
}

export function trackProductEvent(
  eventName: ProductEventName,
  properties: EventProperties = {},
): void {
  const payload = {
    ...properties,
    product: "HTAB",
    demo_version: "0.1.0",
  };

  if (ensureInitialized()) {
    amplitude.track(eventName, payload);
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`[HTAB analytics] ${eventName}`, payload);
  }
}

export function isAmplitudeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY);
}


