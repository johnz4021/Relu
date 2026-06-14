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
