// Explicit allowlist. A new session never inherits dates, registrations,
// capabilities, attendance, recurrence, charges or money from its source.
export type SessionCopy = {
  clubId: number; title: string; venue: string; capacity: number;
  fixedFee: number; guestFee: number; fixedFeeMale: number | null; fixedFeeFemale: number | null; guestFeeMale: number | null; guestFeeFemale: number | null;
  capacityMale: number | null; capacityFemale: number | null; approvalMode: string; feeMode: string; noShowPolicy: string; monthlyPolicy: string;
  skillGuidance: string; venueInstructions: string; cancellationPolicy: string; participationConditions: string; mapsUrl: string;
};
export function sessionCopyOf(game: SessionCopy): SessionCopy {
  const { clubId, title, venue, capacity, fixedFee, guestFee, fixedFeeMale, fixedFeeFemale, guestFeeMale, guestFeeFemale,
    capacityMale, capacityFemale, approvalMode, feeMode, noShowPolicy, monthlyPolicy, skillGuidance, venueInstructions, cancellationPolicy, participationConditions, mapsUrl } = game;
  return { clubId, title, venue, capacity, fixedFee, guestFee, fixedFeeMale, fixedFeeFemale, guestFeeMale, guestFeeFemale,
    capacityMale, capacityFemale, approvalMode, feeMode, noShowPolicy, monthlyPolicy, skillGuidance, venueInstructions, cancellationPolicy, participationConditions, mapsUrl };
}
