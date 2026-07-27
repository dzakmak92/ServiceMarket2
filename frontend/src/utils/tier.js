// Plan-tier helpers.
// Explorer is the €1/month, 3-month intro plan that unlocks every toolkit and
// shows the Pro badge — so for badge/feature gating it counts as "premium".
export const PREMIUM_TIERS = ['pro', 'explorer'];

export const isPremiumTier = (tier) => PREMIUM_TIERS.includes(tier);

// Human-readable plan name for the current tier (translated).
export const planLabel = (tier, t) => {
  if (tier === 'explorer') return t('explorer_plan_name');
  if (tier === 'pro') return t('pro_plan_pro');
  return t('pro_plan_standard');
};
