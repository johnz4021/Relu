import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: false,
      maskTextSelector: '',
    },
  });
}

// Canonical analytics helper — no-op when PostHog is not configured.
const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export { posthog, POSTHOG_KEY, track };
