#!/usr/bin/env node
/**
 * Zero-cost audit — Driftmap's build gate, not a preference.
 *
 * Fails when a paid or key-gated dependency appears in package.json:
 * no AI SDKs, no map/tile/geocoding SaaS, nothing that needs a key or
 * billing to run. Driftmap must build, run, and demo for ₹0.
 */
import { readFileSync } from "node:fs";

const DENY_PATTERNS = [
  // AI / LLM providers and clients
  /openai/i,
  /anthropic/i,
  /cohere/i,
  /mistral/i,
  /groq/i,
  /replicate/i,
  /stability-?ai/i,
  /elevenlabs/i,
  /deepgram/i,
  /assemblyai/i,
  /whisper/i,
  /langchain/i,
  /llamaindex/i,
  /huggingface/i,
  /@ai-sdk\//i,
  /genai/i,
  /bedrock/i,
  // Key-gated map / tile / geodata services
  /mapbox/i,
  /maptiler/i,
  /mapkit/i,
  /googlemaps/i,
  /google-map/i,
  /heremaps/i,
  /tomtom/i,
  /arcgis/i,
  /@esri\//i,
  /stadia/i,
  /thunderforest/i,
  /positionstack/i,
  /opencage/i,
  /geocod/i,
  /openrouteservice/i,
  /graphhopper/i,
  /traveltime/i,
  // Backend SaaS requiring accounts or keys
  /firebase/i,
  /supabase/i,
  /appwrite/i,
  /algolia/i,
  /pinecone/i,
  /@segment\//i,
  /posthog/i,
  // Payments and monitoring SaaS
  /stripe/i,
  /razorpay/i,
  /sentry/i,
  /datadog/i,
  /newrelic/i,
  /bugsnag/i,
];

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const deps = SECTIONS.flatMap((section) =>
  Object.keys(pkg[section] ?? {}).map((name) => ({ name, section })),
);

const offenders = deps.filter(({ name }) =>
  DENY_PATTERNS.some((pattern) => pattern.test(name)),
);

if (offenders.length > 0) {
  console.error(
    "FAIL: zero-cost audit — paid or key-gated dependencies found:",
  );
  for (const { name, section } of offenders) {
    console.error(`  - ${name} (${section})`);
  }
  console.error(
    "\nDriftmap must build, run, and demo for ₹0: no paid APIs, no required keys, no AI in the core loop.",
  );
  process.exit(1);
}

console.log(
  `PASS: zero-cost audit — ${deps.length} dependencies checked, no paid or key-gated packages.`,
);
