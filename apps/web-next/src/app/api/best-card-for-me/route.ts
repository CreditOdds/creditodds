import { NextResponse } from 'next/server';
import { getAllCards } from '@/lib/api';
import {
  rankNextCards,
  nextCardBlurb,
  isPortalCategory,
  SPEND_BUCKETS,
  type NextCardInput,
  type RewardTypePref,
  type WalletTier,
} from '@/lib/nextCardRanking';

// POST /api/best-card-for-me
// Body: { spend: Record<bucket, number>, walletSlugs: string[],
//         rewardType: 'cashback'|'points'|null, allegiance?: string|null }
// Returns the top-5 marginal-value recommendations for the given spend profile.

export const dynamic = 'force-dynamic'; // personalized; never cache the response

interface RequestBody {
  spend?: Record<string, unknown>;
  walletSlugs?: unknown;
  rewardType?: unknown;
  allegiances?: unknown;
}

const MAX_ANNUAL_SPEND = 1_000_000; // clamp absurd inputs

function sanitizeSpend(raw: Record<string, unknown> | undefined): Record<string, number> {
  const spend: Record<string, number> = {};
  if (!raw) return spend;
  for (const bucket of SPEND_BUCKETS) {
    const v = Number(raw[bucket]);
    if (Number.isFinite(v) && v > 0) {
      spend[bucket] = Math.min(v, MAX_ANNUAL_SPEND);
    }
  }
  return spend;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const spend = sanitizeSpend(body.spend);
  if (Object.keys(spend).length === 0) {
    return NextResponse.json(
      { error: 'Provide at least one positive spend category' },
      { status: 400 },
    );
  }

  const walletSlugs = Array.isArray(body.walletSlugs)
    ? body.walletSlugs.filter((s): s is string => typeof s === 'string')
    : [];

  const rewardType: RewardTypePref =
    body.rewardType === 'cashback' || body.rewardType === 'points'
      ? body.rewardType
      : null;

  const allegiances = Array.isArray(body.allegiances)
    ? body.allegiances.filter((s): s is string => typeof s === 'string')
    : [];

  try {
    const cards = await getAllCards();
    const input: NextCardInput = {
      spend,
      walletSlugs,
      prefs: { rewardType, allegiances },
      cards,
      limit: 5,
    };
    const { recommendations: results, walletAnalysis } = rankNextCards(input);

    // Trim each card to the fields the results UI needs (keeps payload lean and
    // avoids shipping internal stats).
    const recommendations = results.map((r) => ({
      rank: r.rank,
      blurb: nextCardBlurb(r),
      netAnnualValue: Math.round(r.netAnnualValue),
      rewardsValue: Math.round(r.rewardsValue),
      annualFee: r.annualFee,
      winningCategories: r.winningCategories.map((w) => ({
        category: w.category,
        annualValue: Math.round(w.annualValue),
      })),
      // Full per-category comparison (wallet with vs without this card) for the
      // "why it helps / why it won't" table.
      categories: r.categories.map((c) => ({
        category: c.category,
        spend: Math.round(c.spend),
        currentRate: Number(c.currentRate.toFixed(2)),
        currentCard: c.currentCard,
        currentCardImage: c.currentCardImage,
        newRate: Number(c.newRate.toFixed(2)),
        delta: Math.round(c.delta),
        helps: c.helps,
      })),
      card: {
        slug: r.card.slug,
        card_name: r.card.card_name,
        bank: r.card.bank,
        card_image_link: r.card.card_image_link,
        reward_type: r.card.reward_type,
        annual_fee: r.card.annual_fee,
        signup_bonus: r.card.signup_bonus,
        // The card's own earn categories for display. Portal-only rates
        // (travel_portal, hotels_portal, …) are dropped — they only apply when
        // booking through the issuer portal, not on general spend.
        rewards: (r.card.rewards ?? [])
          .filter((rw) => !isPortalCategory(rw.category))
          .map((rw) => ({ category: rw.category, value: rw.value, unit: rw.unit })),
      },
    }));

    const tier = (t: WalletTier | null) =>
      t
        ? {
            rate: Number(t.rate.toFixed(2)),
            card: t.card,
            cardImage: t.cardImage,
            spend: Math.round(t.spend),
          }
        : null;
    const wallet = walletAnalysis.map((w) => ({
      category: w.category,
      spend: Math.round(w.spend),
      earned: Math.round(w.earned),
      best: tier(w.best),
      next: tier(w.next),
    }));

    return NextResponse.json({ recommendations, walletAnalysis: wallet });
  } catch (error) {
    console.error('best-card-for-me ranking failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
