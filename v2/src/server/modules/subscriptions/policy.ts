import "server-only";
import { getConfig } from "@/server/config";

export function getSubscriptionPolicy() {
  const config = getConfig();
  const savings = config.SUBSCRIPTION_ORIGINAL_PRICE_VND - config.SUBSCRIPTION_PRICE_VND;
  return {
    trialDays: config.SUBSCRIPTION_TRIAL_DAYS,
    periodDays: config.SUBSCRIPTION_PERIOD_DAYS,
    price: config.SUBSCRIPTION_PRICE_VND,
    originalPrice: config.SUBSCRIPTION_ORIGINAL_PRICE_VND,
    savings,
    discountPercent: Math.round(savings / config.SUBSCRIPTION_ORIGINAL_PRICE_VND * 100),
  };
}
