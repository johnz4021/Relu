// Companion hint-chip copy (E-UX 2026-06-13). The model only emits an
// `offer_modality` enum ('highlight' | 'diagram') alongside `offer_made`; the
// button LABEL and the consent SENTENCE a tap sends both live HERE, in the
// client, never in model output. Consent stays in the model: tapping a chip
// sends an explicit consent sentence through the normal `guided_message`
// channel, which the tutor reads as consent via its own rules.
export const OFFER_CHIPS = {
  highlight: {
    label: 'Show me which part',
    consent: 'Yes, show me which part of the input matters.',
  },
  diagram: {
    label: 'Draw it for me',
    consent: 'Yes, please draw it out for me.',
  },
};

// "I'm stuck" is a standalone bid for help, which the companion doctrine treats
// as consent for the next offered rung — so it routes through the same channel
// as a typed message, with no special protocol.
export const STUCK_MESSAGE = "I'm stuck";

// Explicit give-up. Sent through the same guided_message channel as everything else;
// the tutor reads it as an explicit give-up → terminal reveal (the server/viz side
// handles what happens next).
export const GIVE_UP_MESSAGE = "I'd like to give up — show me the full solution.";

// Discoverable give-up softens the 2026-06-09 type-only decision (no visible button).
// Flag so it can be reverted if the beta shows students bailing straight to the
// solution — the exact risk that decision was protecting against.
export const GIVE_UP_AFFORDANCE_ENABLED = true;

// The "What can I ask?" expander (plan-design-review 2026-06-17). User-initiated
// versions of what the model otherwise offers on its own schedule — same
// consent-sentence-over-guided_message pattern as OFFER_CHIPS, so the tutor reads a
// tapped chip identically to accepting a model offer. The give-up chip is gated on a
// confirm (it's the only one that reveals the answer), not sent directly.
export const CAPABILITY_CHIPS = [
  { key: 'diagram', label: 'Draw it for me', message: OFFER_CHIPS.diagram.consent },
  { key: 'highlight', label: 'Highlight the relevant part', message: OFFER_CHIPS.highlight.consent },
  { key: 'giveup', label: 'Show the solution', confirm: true },
];

// First-session auto-expand marker (localStorage key). On the very first companion
// session we open the expander once so a new user sees the full capability set (the
// coachmark moment), then it returns to the collapsed default.
export const CAPS_SEEN_KEY = 'relu_caps_seen';
