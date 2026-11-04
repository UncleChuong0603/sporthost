export const PRO_TRIAL_DAYS = 7;
export const PRO_PERIOD_DAYS = 30;
export const PRO_PRICE = 49_000;
export const PRO_ORIGINAL_PRICE = 99_000;
export const PRO_SAVING = PRO_ORIGINAL_PRICE - PRO_PRICE;
export const PRO_DISCOUNT_PERCENT = Math.round(PRO_SAVING / PRO_ORIGINAL_PRICE * 100);

export function subscriptionState(club: { trialEndsAt: string | null; proEndsAt: string | null }, now = new Date()) {
  const trial = Date.parse(club.trialEndsAt || "") || 0;
  const paid = Date.parse(club.proEndsAt || "") || 0;
  const ends = Math.max(trial, paid);
  return { active: ends > now.valueOf(), kind: paid > now.valueOf() ? "PRO" : trial > now.valueOf() ? "TRIAL" : "FREE",
    endsAt: ends ? new Date(ends).toISOString() : null, daysLeft: Math.max(0, Math.ceil((ends - now.valueOf()) / 86400000)) };
}

export function extendedProEnd(club: { trialEndsAt: string | null; proEndsAt: string | null }, days: number, now = new Date()) {
  return new Date(Math.max(now.valueOf(), Date.parse(club.trialEndsAt || "") || 0, Date.parse(club.proEndsAt || "") || 0) + days * 86400000).toISOString();
}
