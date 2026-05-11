'use client';

import { useEffect, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import CardImage from "@/components/ui/CardImage";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/auth/AuthProvider";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { getAllCards, getRecords, getReferrals, deleteRecord, archiveReferral, getWallet, deleteAccount, reorderWallet, getUserSettings, getPlaidSpendSummary, WalletCard, Card, PlaidSpendSummary } from "@/lib/api";
import { capStateForWalletCard, worstCapState } from "@/lib/walletCaps";
import "../landing.css";
import { getNews, NewsItem, NewsTag, tagLabels } from "@/lib/news";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import ProfileLoader from "./ProfileLoader";
import { amortizedAnnualValue, categoryLabels } from "@/lib/cardDisplayUtils";
import { TrashIcon, DocumentTextIcon, LinkIcon, ExclamationTriangleIcon, PencilIcon } from "@heroicons/react/24/outline";
import { calculateApplicationRules, countCardsMissingDates } from "@/lib/applicationRules";
import {
  createCardLookups,
  dedupeWalletByCardName,
  getEligibleRecordCards,
  getEligibleReferralCards,
  getRelevantNews,
  getTotalAnnualFees,
  getWalletDisplayNames,
  getWalletVisibility,
  isCardInactive,
} from "./profileSelectors";

const ReferralModal = dynamic(() => import("@/components/forms/ReferralModal"), { ssr: false, loading: () => null });
const AddToWalletModal = dynamic(() => import("@/components/wallet/AddToWalletModal"), { ssr: false, loading: () => null });
const EditWalletCardModal = dynamic(() => import("@/components/wallet/EditWalletCardModal"), { ssr: false, loading: () => null });
const SelectCategoriesModal = dynamic(() => import("@/components/wallet/SelectCategoriesModal"), { ssr: false, loading: () => null });
const BestCardByCategory = dynamic(() => import("@/components/wallet/BestCardByCategory"), { ssr: false, loading: () => null });
const BestCardHere = dynamic(() => import("@/components/wallet/BestCardHere"), { ssr: false, loading: () => null });
const WalletBenefits = dynamic(() => import("@/components/wallet/WalletBenefits"), { ssr: false, loading: () => null });
const PlaidConnect = dynamic(() => import("@/components/wallet/PlaidConnect"), { ssr: false, loading: () => null });
const SubmitRecordModal = dynamic(() => import("@/components/forms/SubmitRecordModal"), { ssr: false, loading: () => null });
const SubmitRecordCardPicker = dynamic(() => import("@/components/forms/SubmitRecordCardPicker"), { ssr: false, loading: () => null });
const RuleProgressChart = dynamic(() => import("@/components/charts/RuleProgressChart"), {
  ssr: false,
  loading: () => <div className="cj-rule" style={{ opacity: 0.4 }} />,
});

interface RecordItem {
  record_id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  credit_score: number;
  credit_score_source?: number;
  listed_income: number;
  length_credit: number;
  result: boolean;
  starting_credit_limit?: number | null;
  reason_denied?: string | null;
  bank_customer?: boolean | number;
  inquiries_3?: number | null;
  inquiries_12?: number | null;
  inquiries_24?: number | null;
  submit_datetime: string;
  date_applied: string;
}

interface Referral {
  referral_id: number;
  card_id: string;
  card_name: string;
  card_image_link?: string;
  referral_link: string;
  card_referral_link?: string;
  admin_approved: boolean;
  archived_at?: string | null;
  archived_reason?: string | null;
  impressions?: number;
  clicks?: number;
  unique_clicks?: number;
}

type TabKey = 'cards' | 'rewards' | 'benefits' | 'applications' | 'referrals' | 'settings' | 'news' | 'more';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRenewal(month?: number, year?: number): { display: string; sortKey: number } | null {
  if (!month || !year) return null;
  const renewalYear = year + 1;
  const date = new Date(renewalYear, month - 1, 1);
  return { display: `${MONTHS_SHORT[month - 1]} ${renewalYear}`, sortKey: date.getTime() };
}

function daysUntil(timestamp: number): number {
  return Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
}

// Wallet display order: rows the user has explicitly dragged (sort_order set)
// come first in their persisted order; the rest fall back to acquired date desc
// (newest first), with `created_at` as the final tiebreaker.
function sortWalletForDisplay(rows: WalletCard[]): WalletCard[] {
  return rows.slice().sort((a, b) => {
    const aHas = a.sort_order != null;
    const bHas = b.sort_order != null;
    if (aHas && bHas) return (a.sort_order as number) - (b.sort_order as number);
    if (aHas) return -1;
    if (bHas) return 1;
    const aYear = a.acquired_year ?? -Infinity;
    const bYear = b.acquired_year ?? -Infinity;
    if (aYear !== bYear) return bYear - aYear;
    const aMonth = a.acquired_month ?? -Infinity;
    const bMonth = b.acquired_month ?? -Infinity;
    if (aMonth !== bMonth) return bMonth - aMonth;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function ProfileClient() {
  const { authState, getToken, logout } = useAuth();
  const router = useRouter();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [referralsLoaded, setReferralsLoaded] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const [archivingReferralId, setArchivingReferralId] = useState<number | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [openWalletId, setOpenWalletId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('cards');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editingCard, setEditingCard] = useState<WalletCard | null>(null);
  const [submitRecordCard, setSubmitRecordCard] = useState<WalletCard | null>(null);
  const [showRecordCardPicker, setShowRecordCardPicker] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [pickingCategoriesFor, setPickingCategoriesFor] = useState<WalletCard | null>(null);
  const [plaidBetaEnabled, setPlaidBetaEnabled] = useState(false);
  const [plaidSummaries, setPlaidSummaries] = useState<PlaidSpendSummary[]>([]);
  const cardLookups = useMemo(() => createCardLookups(allCards), [allCards]);

  // Cards whose YAML defines a `user_choice` or `auto_top_spend` reward block —
  // these are the cards that can show a "pick categories" affordance.
  const cardsWithSelectableRewards = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCards) {
      if ((c.rewards || []).some((r) => r.mode === 'user_choice' || r.mode === 'auto_top_spend' || r.category === 'top_category')) {
        set.add(c.card_name);
      }
    }
    return set;
  }, [allCards]);

  const eligibleReferralCards = useMemo(
    () => getEligibleReferralCards(records, walletCards, referrals.filter((r) => !r.archived_at), cardLookups),
    [records, walletCards, referrals, cardLookups]
  );

  const totalAnnualFees = useMemo(
    () => getTotalAnnualFees(walletCards, cardLookups),
    [walletCards, cardLookups]
  );

  // Apply the display sort once here so every consumer (Cards tab, drag-and-drop,
  // archived toggle) sees the same row order.
  const orderedWalletCards = useMemo(() => sortWalletForDisplay(walletCards), [walletCards]);

  // Drag-to-reorder: rebuild the wallet array with the source row moved to the
  // target row's position, write sort_order on every row so the new order
  // sticks, and persist optimistically. Revert if the server rejects.
  const handleReorderWallet = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;
    const previous = walletCards;
    const ordered = sortWalletForDisplay(walletCards);
    const sourceIdx = ordered.findIndex((r) => r.id === sourceId);
    const targetIdx = ordered.findIndex((r) => r.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;
    const next = ordered.slice();
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    const renumbered = next.map((row, i) => ({ ...row, sort_order: i }));
    setWalletCards(renumbered);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      await reorderWallet(renumbered.map((r) => r.id), token);
    } catch (err) {
      console.error('Reorder error:', err);
      setWalletCards(previous);
    }
  };

  const { activeWalletCards, inactiveCount } = useMemo(
    () => getWalletVisibility(orderedWalletCards, cardLookups, showArchived),
    [orderedWalletCards, cardLookups, showArchived]
  );

  const isInactiveCard = (cardName: string) => isCardInactive(cardName, cardLookups);

  const cardsWithRecords = useMemo(() => new Set(records.map(r => r.card_name)), [records]);
  const cardsWithActiveReferrals = useMemo(
    () => new Set(referrals.filter(r => !r.archived_at).map(r => r.card_name)),
    [referrals]
  );

  const eligibleRecordCards = useMemo(
    () => getEligibleRecordCards(walletCards, records),
    [walletCards, records]
  );

  const applicationRules = useMemo(() => calculateApplicationRules(walletCards), [walletCards]);
  const cardsMissingDates = useMemo(() => countCardsMissingDates(walletCards), [walletCards]);

  const relevantNews = useMemo(
    () => getRelevantNews(walletCards, newsItems, cardLookups),
    [walletCards, newsItems, cardLookups]
  );

  // Total annual credits from wallet card benefits (for the snapshot stat)
  const walletDisplayNames = useMemo(() => getWalletDisplayNames(walletCards), [walletCards]);

  const annualCreditsTotals = useMemo(() => {
    // Dedupe by card_name — duplicates of the same card don't double its credits.
    const uniqueWalletCards = dedupeWalletByCardName(walletCards);
    let total = 0;
    let cardsWithCredits = 0;
    for (const wc of uniqueWalletCards) {
      const card = cardLookups.byName.get(wc.card_name);
      if (!card?.benefits?.length) continue;
      let cardTotal = 0;
      for (const b of card.benefits) {
        if (b.value > 0) cardTotal += amortizedAnnualValue(b);
      }
      if (cardTotal > 0) {
        total += cardTotal;
        cardsWithCredits += 1;
      }
    }
    return { total: Math.round(total), cardsWithCredits };
  }, [walletCards, cardLookups]);

  // Upcoming renewals — top 3 by date
  const upcomingRenewals = useMemo(() => {
    const list: { name: string; renewal: string; fee: number; sortKey: number; daysOut: number }[] = [];
    for (const wc of walletCards) {
      if (isInactiveCard(wc.card_name)) continue;
      const card = cardLookups.byName.get(wc.card_name);
      const fee = card?.annual_fee ?? 0;
      if (fee <= 0) continue;
      const renewal = formatRenewal(wc.acquired_month, wc.acquired_year);
      if (!renewal) continue;
      const days = daysUntil(renewal.sortKey);
      if (days < 0) continue;
      list.push({
        name: walletDisplayNames.get(wc.id) ?? wc.card_name,
        renewal: renewal.display,
        fee,
        sortKey: renewal.sortKey,
        daysOut: days,
      });
    }
    list.sort((a, b) => a.sortKey - b.sortKey);
    return list.slice(0, 3);
    // Intentionally re-uses isInactiveCard via cardLookups — eslint disable not needed
  }, [walletCards, cardLookups, walletDisplayNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextRenewal = upcomingRenewals[0];

  // Reminders — rotating category cards: surface this quarter's bonus categories
  const reminders = useMemo(() => {
    type Reminder = {
      key: string;
      cardName: string;
      rate: number;
      unit: string;
      period: string;
      categories: string[];
    };
    const list: Reminder[] = [];
    for (const wc of walletCards) {
      if (isInactiveCard(wc.card_name)) continue;
      const card = cardLookups.byName.get(wc.card_name);
      if (!card?.rewards) continue;
      for (const r of card.rewards) {
        if (r.mode !== 'quarterly_rotating') continue;
        if (!r.current_categories?.length) continue;
        const cats = r.current_categories.map((c) => {
          const id = typeof c === 'string' ? c : c.category;
          const slotNote = typeof c === 'string' ? undefined : c.note;
          return slotNote ?? categoryLabels[id] ?? id;
        });
        list.push({
          key: `${wc.id}-${r.category}`,
          cardName: walletDisplayNames.get(wc.id) ?? wc.card_name,
          rate: r.value,
          unit: r.unit,
          period: r.current_period ?? '',
          categories: cats,
        });
      }
    }
    return list;
  }, [walletCards, cardLookups, walletDisplayNames]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([getAllCards(), getNews()])
      .then(([cards, news]) => { setAllCards(cards); setNewsItems(news); })
      .catch(err => console.error("Error loading public data:", err));
  }, []);

  useEffect(() => {
    if (!authState.isLoading && !authState.isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (authState.isAuthenticated) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.isAuthenticated, authState.isLoading, router]);

  const loadData = async () => {
    const token = await getToken();
    if (!token) {
      console.error("No auth token available");
      return;
    }

    const loadWallet = async () => {
      try { setWalletCards(await getWallet(token) || []); } catch (e) { console.error("Wallet error:", e); setWalletCards([]); }
      setWalletLoaded(true);
    };
    const loadRecords = async () => {
      try { setRecords(await getRecords(token) || []); } catch (e) { console.error("Records error:", e); setRecords([]); }
      setRecordsLoaded(true);
    };
    const loadReferrals = async () => {
      try {
        const r = await getReferrals(token);
        setReferrals(Array.isArray(r) && r.length >= 1 ? (r[0] || []) : []);
      } catch (e) { console.error("Referrals error:", e); setReferrals([]); }
      setReferralsLoaded(true);
    };

    const loadSettings = async () => {
      try {
        const s = await getUserSettings(token);
        setPlaidBetaEnabled(Boolean(s.plaid_beta_enabled));
        if (s.plaid_beta_enabled) {
          // Only fetch spend summary for beta users — saves a request for everyone else.
          // Failures are silent so the wallet still renders if the endpoint is down.
          try {
            const summary = await getPlaidSpendSummary(token);
            setPlaidSummaries(summary.summaries || []);
          } catch (e) { console.error("Plaid spend summary error:", e); }
        }
      } catch (e) { console.error("User settings error:", e); }
    };

    loadWallet(); loadRecords(); loadReferrals(); loadSettings();
  };

  const handleEditRecord = (recordId: number) => {
    const rec = records.find((r) => r.record_id === recordId);
    if (rec) setEditingRecord(rec);
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm("Delete this record?")) return;
    setDeletingRecordId(recordId);
    try {
      const token = await getToken();
      if (!token) return;
      await deleteRecord(recordId, token);
      setRecords(records.filter(r => r.record_id !== recordId));
    } catch (e) {
      console.error("Error deleting record:", e);
      alert("Failed to delete record. Please try again.");
    } finally { setDeletingRecordId(null); }
  };

  const handleArchiveReferral = async (referralId: number) => {
    if (!confirm("Archive this referral?")) return;
    setArchivingReferralId(referralId);
    try {
      const token = await getToken();
      if (!token) return;
      await archiveReferral(referralId, token);
      setReferrals(referrals.filter(r => r.referral_id !== referralId));
    } catch (e) {
      console.error("Error archiving referral:", e);
      alert("Failed to archive referral. Please try again.");
    } finally { setArchivingReferralId(null); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const token = await getToken();
      if (!token) { alert("No auth token available"); return; }
      await deleteAccount(token);
      alert("Your account has been deleted. Thank you for contributing to CreditOdds.");
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(error instanceof Error ? error.message : "Failed to delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
      setConfirmingDelete(false);
      setDeleteConfirmText('');
    }
  };

  if (authState.isLoading) return <ProfileSkeleton />;
  if (!authState.isAuthenticated) return null;

  const displayName = authState.user?.displayName || authState.user?.email?.split('@')[0] || 'there';
  const handle = authState.user?.email?.split('@')[0] || '';
  const activeReferralsCount = referrals.filter(r => !r.archived_at).length;
  const visibleWalletCards = activeWalletCards;

  const tabs: { key: TabKey; num: string; label: string; count: string }[] = [
    { key: 'cards', num: '01', label: 'Cards', count: walletCards.length ? `${walletCards.length} cards` : '' },
    { key: 'rewards', num: '02', label: 'Earn', count: '' },
    { key: 'benefits', num: '03', label: 'Benefits', count: '' },
    { key: 'applications', num: '04', label: 'Applications', count: records.length ? `${records.length} records` : '' },
    { key: 'referrals', num: '05', label: 'Referrals', count: activeReferralsCount ? `${activeReferralsCount} links` : '' },
    { key: 'settings', num: '06', label: 'Settings', count: '' },
  ];

  return (
    <div className="landing-v2 profile-v2" data-tab={activeTab}>
      {/* Terminal strip — dark bar with breadcrumb + status */}
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">Profile</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span>
            <span className="cj-status-dot" />
            verified{authState.user?.email ? ` · ${authState.user.email}` : ''}
          </span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main">
          {/* Snapshot — welcome row + 5-cell stat readoff. Desktop: visible on
              every tab. Mobile: hidden via CSS — the Cards-tab dark Wallet hero
              below replaces it on mobile. */}
          <div className="cj-snapshot">
            <div className="cj-snapshot-row">
              <h1 className="cj-snapshot-h1">
                Welcome back, <em>{displayName}.</em>
              </h1>
              {handle && (
                <div className="cj-snapshot-meta">@{handle}</div>
              )}
            </div>

            <div className="cj-readoff">
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Active cards</div>
                <div className="cj-readoff-v">{walletCards.length - inactiveCount}</div>
                <div className="cj-readoff-foot">
                  {inactiveCount > 0 ? `+${inactiveCount} archived` : 'in wallet'}
                </div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Annual fees</div>
                <div className={"cj-readoff-v " + (totalAnnualFees > 0 ? "cj-warn" : "")}>
                  ${totalAnnualFees.toLocaleString()}
                </div>
                <div className="cj-readoff-foot">per year</div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Annual credits</div>
                <div className="cj-readoff-v cj-accent">
                  ${annualCreditsTotals.total.toLocaleString()}
                </div>
                <div className="cj-readoff-foot">
                  {annualCreditsTotals.cardsWithCredits > 0
                    ? `across ${annualCreditsTotals.cardsWithCredits} card${annualCreditsTotals.cardsWithCredits === 1 ? '' : 's'}`
                    : 'no credits yet'}
                </div>
              </div>
              <div className="cj-readoff-cell cj-readoff-bonus">
                <div className="cj-readoff-k">Next renewal</div>
                <div className="cj-readoff-v">
                  {nextRenewal ? `${nextRenewal.renewal.split(' ')[0]} '${nextRenewal.renewal.split(' ')[1].slice(2)}` : '—'}
                </div>
                <div className="cj-readoff-foot">
                  {nextRenewal ? `${nextRenewal.name.replace(/ Card$/, '')} · $${nextRenewal.fee}` : 'no fee renewals'}
                </div>
              </div>
              <div className="cj-readoff-cell">
                <div className="cj-readoff-k">Records</div>
                <div className="cj-readoff-v">{records.length}</div>
                <div className="cj-readoff-foot">
                  {(() => {
                    const approved = records.filter(r => r.result).length;
                    const denied = records.length - approved;
                    return records.length ? `${approved} approved · ${denied} denied` : 'submit a record';
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile-only (Variant B · App Tabs) Cards-tab hero — dark Wallet card +
              3-cell snap pills. Hidden ≥641px; the editorial cj-snapshot above takes over. */}
          {activeTab === 'cards' && (
            <div className="cj-mob-cards-hero">
              <div className="cj-mob-wallet">
                <div className="cj-mob-wallet-k">Wallet</div>
                <div className="cj-mob-wallet-actions">
                  <button type="button" className="cj-mob-wallet-btn" onClick={() => setShowWalletModal(true)}>
                    + add a card
                  </button>
                  <button
                    type="button"
                    className="cj-mob-wallet-btn outline"
                    onClick={() => setShowRecordCardPicker(true)}
                    disabled={eligibleRecordCards.length === 0}
                  >
                    submit a record
                  </button>
                </div>
              </div>
              <div className="cj-mob-snap">
                <div className="cj-mob-snap-cell">
                  <div className="cj-mob-snap-k">Active</div>
                  <div className="cj-mob-snap-v">{walletCards.length - inactiveCount}</div>
                </div>
                <div className="cj-mob-snap-cell">
                  <div className="cj-mob-snap-k">Annual fees</div>
                  <div className={'cj-mob-snap-v' + (totalAnnualFees > 0 ? ' warn' : '')}>
                    ${totalAnnualFees.toLocaleString()}
                  </div>
                </div>
                <div className="cj-mob-snap-cell">
                  <div className="cj-mob-snap-k">Credits</div>
                  <div className="cj-mob-snap-v accent">
                    {annualCreditsTotals.total >= 1000
                      ? `$${(annualCreditsTotals.total / 1000).toFixed(1)}k`
                      : `$${annualCreditsTotals.total}`}
                  </div>
                </div>
              </div>
              <div className="cj-mob-section-h">
                <h2>Cards held</h2>
              </div>
            </div>
          )}

          {/* Tab row */}
          <div className="cj-main-tabs">
            {tabs.map((it) => (
              <button
                key={it.key}
                type="button"
                className={'cj-main-tab' + (activeTab === it.key ? ' active' : '')}
                onClick={() => setActiveTab(it.key)}
              >
                <span className="cj-main-tab-num">{it.num}</span>
                {it.label}
                {it.count && <span className="cj-main-tab-count">· {it.count}</span>}
              </button>
            ))}
          </div>

          <div className="cj-main-content">
            {activeTab === 'cards' && (
              <CardsTab
                walletLoaded={walletLoaded}
                walletCards={walletCards}
                visibleWalletCards={visibleWalletCards}
                walletDisplayNames={walletDisplayNames}
                inactiveCount={inactiveCount}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
                openWalletId={openWalletId}
                setOpenWalletId={setOpenWalletId}
                cardLookups={cardLookups}
                cardsWithRecords={cardsWithRecords}
                cardsWithActiveReferrals={cardsWithActiveReferrals}
                cardsWithSelectableRewards={cardsWithSelectableRewards}
                totalAnnualFees={totalAnnualFees}
                onAdd={() => setShowWalletModal(true)}
                onEdit={(c) => setEditingCard(c)}
                onPickCategories={(c) => setPickingCategoriesFor(c)}
                onSubmitRecord={(c) => setSubmitRecordCard(c)}
                onAddReferral={() => setShowReferralModal(true)}
                onReorder={handleReorderWallet}
              />
            )}

            {activeTab === 'rewards' && (
              !walletLoaded ? <LoadingPanel /> : (
                <section className="cj-section">
                  {/* Best Card Here is mobile-only — relies on geolocation
                      and the merchant-card layout doesn't fit a desktop column.
                      Desktop sees a banner pointing them to mobile. */}
                  <BestCardHere
                    walletCards={walletCards}
                    allCards={allCards}
                    plaidSummaries={plaidSummaries}
                    onWalletRefresh={async () => {
                      const token = await getToken();
                      if (!token) return;
                      try {
                        setWalletCards((await getWallet(token)) || []);
                      } catch (e) {
                        console.error('Wallet refresh error:', e);
                      }
                    }}
                  />
                  <div className="cj-bch-desktop-banner" aria-hidden="false">
                    <span className="cj-bch-desktop-banner-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s7-7 7-13a7 7 0 0 0-14 0c0 6 7 13 7 13z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                    </span>
                    <div className="cj-bch-desktop-banner-text">
                      <div className="cj-bch-desktop-banner-title">
                        Best card <em>here.</em> <span className="cj-bch-desktop-banner-pill">Beta · mobile</span>
                      </div>
                      <div className="cj-bch-desktop-banner-sub">
                        Wallet-aware merchant lookup. Open this page on your phone to see the best card to swipe at the businesses around you.
                      </div>
                    </div>
                  </div>
                  <div className="cj-walletwide-divider" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    margin: '36px 0 18px',
                  }}>
                    <span className="cj-walletwide-label" style={{
                      fontSize: 10.5,
                      color: 'var(--muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                    }}>
                      Wallet-wide
                    </span>
                    <span className="cj-walletwide-rule" style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                  </div>
                  <BestCardByCategory walletCards={walletCards} allCards={allCards} />
                  {plaidBetaEnabled && <PlaidConnect walletCards={walletCards} allCards={allCards} />}
                </section>
              )
            )}

            {activeTab === 'benefits' && (
              !walletLoaded ? <LoadingPanel /> :
              <WalletBenefits walletCards={walletCards} allCards={allCards} />
            )}

            {activeTab === 'applications' && (
              <ApplicationsTab
                recordsLoaded={recordsLoaded}
                walletLoaded={walletLoaded}
                records={records}
                walletCards={walletCards}
                applicationRules={applicationRules}
                cardsMissingDates={cardsMissingDates}
                onPickCard={() => setShowRecordCardPicker(true)}
                onDeleteRecord={handleDeleteRecord}
                onEditRecord={handleEditRecord}
                deletingRecordId={deletingRecordId}
                eligibleRecordCards={eligibleRecordCards}
              />
            )}

            {activeTab === 'referrals' && (
              <ReferralsTab
                referralsLoaded={referralsLoaded}
                referrals={referrals}
                eligibleReferralCards={eligibleReferralCards}
                onAddReferral={() => setShowReferralModal(true)}
                onArchive={handleArchiveReferral}
                archivingReferralId={archivingReferralId}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsTab
                email={authState.user?.email}
                handle={handle}
                confirmingDelete={confirmingDelete}
                setConfirmingDelete={setConfirmingDelete}
                deleteConfirmText={deleteConfirmText}
                setDeleteConfirmText={setDeleteConfirmText}
                deletingAccount={deletingAccount}
                onDeleteAccount={handleDeleteAccount}
                onLogout={() => { logout().then(() => router.push("/")); }}
              />
            )}

            {/* Mobile-only: News tab (Variant B) — wallet-filtered news with chip filters */}
            {activeTab === 'news' && (
              <MobileNewsView
                relevantNews={relevantNews}
                walletCardsCount={walletCards.length}
              />
            )}

            {/* Mobile-only: More tab (Variant B) — stacks Applications + Referrals + Settings */}
            {activeTab === 'more' && (
              <section className="cj-section cj-mob-more">
                <div className="cj-mob-more-h">Applications</div>
                <ApplicationsTab
                  recordsLoaded={recordsLoaded}
                  walletLoaded={walletLoaded}
                  records={records}
                  walletCards={walletCards}
                  applicationRules={applicationRules}
                  cardsMissingDates={cardsMissingDates}
                  onPickCard={() => setShowRecordCardPicker(true)}
                  onDeleteRecord={handleDeleteRecord}
                  onEditRecord={handleEditRecord}
                  deletingRecordId={deletingRecordId}
                  eligibleRecordCards={eligibleRecordCards}
                />
                <div className="cj-mob-more-h">Referrals</div>
                <ReferralsTab
                  referralsLoaded={referralsLoaded}
                  referrals={referrals}
                  eligibleReferralCards={eligibleReferralCards}
                  onAddReferral={() => setShowReferralModal(true)}
                  onArchive={handleArchiveReferral}
                  archivingReferralId={archivingReferralId}
                />
                <div className="cj-mob-more-h">Account</div>
                <SettingsTab
                  email={authState.user?.email}
                  handle={handle}
                  confirmingDelete={confirmingDelete}
                  setConfirmingDelete={setConfirmingDelete}
                  deleteConfirmText={deleteConfirmText}
                  setDeleteConfirmText={setDeleteConfirmText}
                  deletingAccount={deletingAccount}
                  onDeleteAccount={handleDeleteAccount}
                  onLogout={() => { logout().then(() => router.push("/")); }}
                />
              </section>
            )}
          </div>
        </main>

        <aside className="cj-rail">
          <div className="cj-apply">
            <div className="cj-apply-k">Wallet</div>
            <button type="button" className="cj-apply-btn" onClick={() => setShowWalletModal(true)}>
              + add a card
            </button>
            {eligibleRecordCards.length > 0 && (
              <button
                type="button"
                className="cj-apply-btn-outline"
                onClick={() => setShowRecordCardPicker(true)}
              >
                submit a record
              </button>
            )}
          </div>

          {reminders.length > 0 && (
            <div className="cj-rail-block cj-rail-block-reminders">
              <div className="cj-rail-label">Reminders</div>
              <ul className="cj-rail-list">
                {reminders.map((r) => (
                  <li key={r.key} className="cj-rail-row">
                    <div className="cj-rail-row-meta">
                      {r.period && <span className="cj-rail-row-date">{r.period}</span>}
                      <span className="cj-rail-row-field">{r.cardName.replace(/ Card$/, '')}</span>
                    </div>
                    <div className="cj-rail-row-detail">
                      {r.rate}{r.unit === 'percent' ? '%' : 'x'} on {r.categories.join(' & ')}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {upcomingRenewals.length > 0 && (
            <div className="cj-rail-block cj-rail-block-renewals">
              <div className="cj-rail-label">Upcoming renewals</div>
              <ul className="cj-rail-list">
                {upcomingRenewals.map((r) => (
                  <li key={r.name} className="cj-rail-row">
                    <div className="cj-rail-row-meta">
                      <span className="cj-rail-row-date">{r.renewal.split(' ')[0]} '{r.renewal.split(' ')[1].slice(2)}</span>
                      <span className="cj-rail-row-field">{r.name.replace(/ Card$/, '')}</span>
                    </div>
                    <div className="cj-rail-row-detail">
                      ${r.fee.toLocaleString()} · in {r.daysOut} day{r.daysOut === 1 ? '' : 's'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cj-rail-block cj-rail-block-news">
            <div className="cj-rail-label">News for you</div>
            {relevantNews.length > 0 ? (
              <ul className="cj-rail-list">
                {relevantNews.slice(0, 5).map((n) => (
                  <li key={n.id} className="cj-rail-row">
                    <div className="cj-rail-row-meta">
                      <span className="cj-rail-row-date">
                        {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {n.tags?.[0] && (
                        <span className={`cj-news-tag cj-news-tag--${n.tags[0]}`}>
                          {(tagLabels[n.tags[0]] || n.tags[0]).replace(/^[^\w]+\s*/, '').toLowerCase()}
                        </span>
                      )}
                    </div>
                    <Link href={`/news/${n.id}`} className="cj-rail-row-link">{n.title}</Link>
                    {n.card_names && n.card_names[0] && (
                      <div className="cj-rail-row-detail">{n.card_names[0]}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="cj-rail-row-detail" style={{ paddingTop: 6 }}>
                {walletCards.length === 0
                  ? 'add cards to see news for them'
                  : 'no recent news for your cards'}
              </div>
            )}
          </div>

          <Link href="/news" className="cj-rail-cta cj-rail-cta-news">view all news</Link>
        </aside>
      </div>

      {/* Mobile bottom tab bar — Variant B (App Tabs). Hidden ≥641px via CSS. */}
      <MobileTabBar activeTab={activeTab} onSelect={setActiveTab} />

      <V2Footer />

      {/* Modals */}
      <ReferralModal
        show={showReferralModal}
        handleClose={() => setShowReferralModal(false)}
        openReferrals={eligibleReferralCards}
        onSuccess={loadData}
      />
      <AddToWalletModal
        show={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSuccess={loadData}
        existingCardIds={walletCards.map(c => c.card_id)}
      />
      <EditWalletCardModal
        show={!!editingCard}
        card={editingCard}
        cardSlug={editingCard ? allCards.find(c => c.card_name === editingCard.card_name)?.slug : undefined}
        annualFee={editingCard ? (cardLookups.byName.get(editingCard.card_name)?.annual_fee ?? 0) : 0}
        displayName={editingCard ? walletDisplayNames.get(editingCard.id) : undefined}
        onClose={() => setEditingCard(null)}
        onSuccess={loadData}
      />
      <SelectCategoriesModal
        show={!!pickingCategoriesFor}
        walletCard={pickingCategoriesFor}
        card={pickingCategoriesFor ? cardLookups.byName.get(pickingCategoriesFor.card_name) ?? null : null}
        onClose={() => setPickingCategoriesFor(null)}
        onSuccess={loadData}
      />
      <SubmitRecordCardPicker
        show={showRecordCardPicker}
        onClose={() => setShowRecordCardPicker(false)}
        cards={eligibleRecordCards}
        onSelectCard={(card) => setSubmitRecordCard(card)}
      />
      {submitRecordCard && (
        <SubmitRecordModal
          show={!!submitRecordCard}
          handleClose={() => setSubmitRecordCard(null)}
          card={{
            card_id: submitRecordCard.card_id,
            card_name: submitRecordCard.card_name,
            card_image_link: submitRecordCard.card_image_link,
            bank: submitRecordCard.bank,
          }}
          onSuccess={loadData}
        />
      )}
      {editingRecord && (
        <SubmitRecordModal
          show={!!editingRecord}
          handleClose={() => setEditingRecord(null)}
          card={{
            card_id: editingRecord.card_id,
            card_name: editingRecord.card_name,
            card_image_link: editingRecord.card_image_link,
          }}
          editRecord={{
            record_id: editingRecord.record_id,
            credit_score: editingRecord.credit_score,
            credit_score_source: editingRecord.credit_score_source,
            listed_income: editingRecord.listed_income,
            date_applied: editingRecord.date_applied,
            length_credit: editingRecord.length_credit,
            bank_customer: editingRecord.bank_customer,
            result: editingRecord.result,
            starting_credit_limit: editingRecord.starting_credit_limit,
            reason_denied: editingRecord.reason_denied,
            inquiries_3: editingRecord.inquiries_3,
            inquiries_12: editingRecord.inquiries_12,
            inquiries_24: editingRecord.inquiries_24,
          }}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}

function LoadingPanel() {
  return <ProfileLoader />;
}

/* ========== Cards tab ========== */
interface CardsTabProps {
  walletLoaded: boolean;
  walletCards: WalletCard[];
  visibleWalletCards: WalletCard[];
  walletDisplayNames: Map<number, string>;
  inactiveCount: number;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  openWalletId: number | null;
  setOpenWalletId: (v: number | null) => void;
  cardLookups: ReturnType<typeof createCardLookups>;
  cardsWithRecords: Set<string>;
  cardsWithActiveReferrals: Set<string>;
  cardsWithSelectableRewards: Set<string>;
  totalAnnualFees: number;
  onAdd: () => void;
  onEdit: (c: WalletCard) => void;
  onPickCategories: (c: WalletCard) => void;
  onSubmitRecord: (c: WalletCard) => void;
  onAddReferral: () => void;
  onReorder: (sourceId: number, targetId: number) => void;
}

function CardsTab(props: CardsTabProps) {
  const {
    walletLoaded, walletCards, visibleWalletCards, walletDisplayNames, inactiveCount, showArchived, setShowArchived,
    openWalletId, setOpenWalletId, cardLookups, cardsWithRecords, cardsWithActiveReferrals, cardsWithSelectableRewards,
    totalAnnualFees, onAdd, onEdit, onPickCategories, onSubmitRecord, onAddReferral, onReorder,
  } = props;
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  if (!walletLoaded) return <LoadingPanel />;

  if (walletCards.length === 0) {
    return (
      <div className="cj-verdict">
        <b>No cards in your wallet yet.</b> Add the credit cards you own to track fees, renewals, and benefits.
        <div style={{ marginTop: 12 }}>
          <button type="button" className="cj-inline-cta" onClick={onAdd}>+ add a card</button>
        </div>
      </div>
    );
  }

  const activeCount = walletCards.length - inactiveCount;

  return (
    <section className="cj-section">
      <div className="cj-wallet-toolbar">
        <div className="cj-table-label">
          {activeCount} active{inactiveCount > 0 ? ` · ${inactiveCount} archived` : ''} · ${totalAnnualFees.toLocaleString()}/yr in fees
        </div>
        <span className="cj-wallet-toolbar-spacer" />
        {inactiveCount > 0 && (
          <button type="button" className="cj-archived-toggle" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'hide archived' : `show ${inactiveCount} archived`}
          </button>
        )}
        <button type="button" className="cj-inline-cta" onClick={onAdd}>+ add a card</button>
      </div>

      <div className="cj-wallet-tape">
        <div className="cj-wallet-head">
          <div></div>
          <div>Card</div>
          <div>Renewal</div>
          <div className="cj-tr">Fee</div>
          <div></div>
          <div></div>
        </div>
        {visibleWalletCards.map((c) => {
          const isOpen = openWalletId === c.id;
          const card = cardLookups.byName.get(c.card_name);
          const fee = card?.annual_fee ?? 0;
          const archived = card?.active === false;
          const renewal = formatRenewal(c.acquired_month, c.acquired_year);
          // No-fee cards don't renew — leave the cell blank (not even a dash)
          // so the column reads as "renewals only when there is one."
          const showRenewal = renewal && fee > 0;
          // Plaid-derived cap progress for this wallet row. Only the worst
          // (highest-percent) cap surfaces in the collapsed row; all of them
          // render in the expanded detail panel.
          const capStates = capStateForWalletCard(c, card, plaidSummaries);
          const worstCap = worstCapState(capStates);
          const showCapBadge = worstCap && worstCap.status !== 'ok';
          const renewalDisplay = showRenewal ? renewal.display : '';
          const acquiredLabel = (() => {
            if (!c.acquired_month && !c.acquired_year) return null;
            const m = c.acquired_month ? MONTHS_SHORT[c.acquired_month - 1] : '';
            return c.acquired_year ? `${m ? m + ' ' : ''}${c.acquired_year}` : m;
          })();
          const hasRecord = cardsWithRecords.has(c.card_name);
          const hasReferral = cardsWithActiveReferrals.has(c.card_name);
          const slug = card?.slug;

          const isDragging = dragId === c.id;
          const isDragTarget = dragOverId === c.id && dragId !== null && dragId !== c.id;
          return (
            <Fragment key={c.id}>
              <button
                type="button"
                className={
                  'cj-wallet-crow' +
                  (isOpen ? ' is-open' : '') +
                  (archived ? ' is-archived' : '') +
                  (isDragging ? ' is-dragging' : '') +
                  (isDragTarget ? ' is-drag-over' : '')
                }
                onClick={() => setOpenWalletId(isOpen ? null : c.id)}
                aria-expanded={isOpen}
                draggable
                onDragStart={(e) => {
                  setDragId(c.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox needs setData to start a drag.
                  try { e.dataTransfer.setData('text/plain', String(c.id)); } catch {}
                }}
                onDragOver={(e) => {
                  if (dragId === null || dragId === c.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverId !== c.id) setDragOverId(c.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === c.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId !== null && dragId !== c.id) onReorder(dragId, c.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
              >
                <span className="cj-cw-thumb">
                  <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill sizes="36px" className="object-contain" />
                </span>
                <div className="cj-cw-name">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{walletDisplayNames.get(c.id) ?? c.card_name}</span>
                  <span className="cj-cw-marks">
                    {hasRecord && (
                      <span className="cj-cw-mark" title="record submitted" aria-label="record submitted">
                        <DocumentTextIcon style={{ width: 11, height: 11 }} />
                      </span>
                    )}
                    {hasReferral && (
                      <span className="cj-cw-mark" title="referral active" aria-label="referral active">
                        <LinkIcon style={{ width: 11, height: 11 }} />
                      </span>
                    )}
                    {showCapBadge && worstCap && (
                      <span
                        className="cj-cw-mark"
                        title={`${Math.round(worstCap.percent)}% of ${worstCap.category} cap used this cycle`}
                        aria-label={`${Math.round(worstCap.percent)}% of ${worstCap.category} cap used`}
                        style={{
                          background: worstCap.status === 'red' ? '#fee2e2' : '#fef3c7',
                          color: worstCap.status === 'red' ? '#b91c1c' : '#92400e',
                          padding: '1px 6px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                        }}
                      >
                        {Math.round(worstCap.percent)}%
                      </span>
                    )}
                  </span>
                </div>
                <div className="cj-cw-renew">{renewalDisplay}</div>
                <div className={'cj-cw-fee' + (fee === 0 ? ' cj-cw-zero' : '')}>
                  {fee === 0 ? '$0' : '$' + fee.toLocaleString()}
                </div>
                <div className="cj-cw-issuer">{c.bank}</div>
                <div className="cj-cw-caret">›</div>
              </button>
              {isOpen && (
                <div className="cj-wallet-detail">
                  <div className="cj-wd-row">
                    <div className="cj-wd-meta">
                      <div>
                        <div className="cj-wd-k">Issuer</div>
                        <div className="cj-wd-v">{c.bank}</div>
                      </div>
                      <div>
                        <div className="cj-wd-k">Opened</div>
                        <div className="cj-wd-v">{acquiredLabel || '—'}</div>
                      </div>
                      {showRenewal && (
                        <div>
                          <div className="cj-wd-k">Renewal</div>
                          <div className="cj-wd-v">{renewalDisplay}</div>
                        </div>
                      )}
                      <div>
                        <div className="cj-wd-k">Annual fee</div>
                        <div className="cj-wd-v">{fee === 0 ? '$0 · no fee' : '$' + fee.toLocaleString()}</div>
                      </div>
                    </div>
                    {typeof c.user_rating === 'number' && c.user_rating > 0 && (
                      <div className="cj-wd-rating" aria-label={`Your rating: ${c.user_rating} of 5`}>
                        <div className="cj-wd-k">Your rating</div>
                        <div className="cj-wd-stars">
                          {[1, 2, 3, 4, 5].map((s) => {
                            const filled = s <= (c.user_rating || 0);
                            return (
                              <svg
                                key={s}
                                viewBox="0 0 20 20"
                                fill={filled ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth={filled ? '0' : '1.5'}
                                xmlns="http://www.w3.org/2000/svg"
                                className={'cj-wd-star' + (filled ? ' is-filled' : '')}
                                aria-hidden="true"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {capStates.length > 0 && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '12px 14px',
                        background: '#f9fafb',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--muted, #6b7280)',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          marginBottom: 8,
                          fontSize: 11,
                        }}
                      >
                        This cycle's caps
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {capStates
                          .sort((a, b) => b.percent - a.percent)
                          .map((s) => (
                            <li key={s.category} style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span>
                                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{s.category.replace(/_/g, ' ')}</span>
                                  <span style={{ marginLeft: 8, fontSize: 11, color: '#4338ca' }}>
                                    {s.rate}{s.unit === 'cash_back' ? '%' : 'x'} · cap ${s.cap.toLocaleString()}/{s.capPeriod}
                                  </span>
                                </span>
                                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                  ${s.spend.toFixed(2)} <span style={{ color: 'var(--muted, #6b7280)', fontWeight: 400 }}>({Math.round(s.percent)}%)</span>
                                </span>
                              </div>
                              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${s.percent}%`,
                                    height: '100%',
                                    background: s.status === 'red' ? '#dc2626' : s.status === 'amber' ? '#d97706' : '#059669',
                                    transition: 'width 200ms',
                                  }}
                                />
                              </div>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <div className="cj-wd-actions">
                    {slug && <Link href={`/card/${slug}`}>view card page →</Link>}
                    <button type="button" onClick={() => onEdit(c)}>edit</button>
                    {cardsWithSelectableRewards.has(c.card_name) && (
                      <button
                        type="button"
                        className={(c.selections && c.selections.length > 0) ? '' : 'cj-wd-cta'}
                        onClick={() => onPickCategories(c)}
                      >
                        {c.selections && c.selections.length > 0 ? 'edit picks' : '+ pick categories'}
                      </button>
                    )}
                    {!hasRecord && (
                      <button type="button" className="cj-wd-cta" onClick={() => onSubmitRecord(c)}>
                        + submit a record
                      </button>
                    )}
                    {hasRecord && <span className="cj-wd-done">✓ record submitted</span>}
                    {!hasReferral && (
                      <button type="button" className="cj-wd-cta" onClick={onAddReferral}>
                        + add referral link
                      </button>
                    )}
                    {hasReferral && <span className="cj-wd-done">✓ referral link active</span>}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
        {!showArchived && inactiveCount > 0 && (
          <div className="cj-wallet-arch-strip">
            <span>{inactiveCount} archived card{inactiveCount === 1 ? '' : 's'} hidden</span>
            <button type="button" className="cj-archived-toggle" onClick={() => setShowArchived(true)}>
              show archived →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ========== Applications tab ========== */
interface ApplicationsTabProps {
  recordsLoaded: boolean;
  walletLoaded: boolean;
  records: RecordItem[];
  walletCards: WalletCard[];
  applicationRules: ReturnType<typeof calculateApplicationRules>;
  cardsMissingDates: number;
  onPickCard: () => void;
  onDeleteRecord: (id: number) => void;
  onEditRecord: (id: number) => void;
  deletingRecordId: number | null;
  eligibleRecordCards: WalletCard[];
}

function ApplicationsTab(props: ApplicationsTabProps) {
  const { recordsLoaded, walletLoaded, records, walletCards, applicationRules, cardsMissingDates, onPickCard, onDeleteRecord, onEditRecord, deletingRecordId, eligibleRecordCards } = props;
  if (!recordsLoaded || !walletLoaded) return <LoadingPanel />;

  const approved = records.filter(r => r.result).length;
  const denied = records.length - approved;

  return (
    <section className="cj-section">
      {records.length > 0 ? (
        <>
          <div className="cj-table-label">Your applications, with the score and income at the time of each.</div>
          <div className="cj-tape cj-tape-records">
            <div className="cj-tape-head">
              <div>Applied</div>
              <div></div>
              <div>Card</div>
              <div className="cj-tape-res">Score</div>
              <div className="cj-tape-res">Income</div>
              <div className="cj-tape-res">Outcome</div>
              <div className="cj-tape-actions" aria-hidden="true"></div>
            </div>
            {records.map((r) => (
              <div key={r.record_id} className="cj-tape-row">
                <div className="cj-tape-when">
                  {new Date(r.date_applied || r.submit_datetime).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                </div>
                <div>
                  <span className="cj-tape-thumb">
                    <CardImage cardImageLink={r.card_image_link} alt={r.card_name} fill sizes="36px" className="object-contain" />
                  </span>
                </div>
                <div className="cj-tape-event">
                  <span className="cj-tape-field">{r.card_name}</span>
                  <div className="cj-tape-detail cj-mob-only">
                    {new Date(r.date_applied || r.submit_datetime).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    {' · '}score {r.credit_score}
                    {' · '}${(r.listed_income / 1000).toFixed(0)}k
                  </div>
                </div>
                <div className="cj-tape-res">{r.credit_score}</div>
                <div className="cj-tape-res">${(r.listed_income / 1000).toFixed(0)}k</div>
                <div className="cj-tape-res">
                  <span className={'cj-pill ' + (r.result ? 'cj-pill-app' : 'cj-pill-den')}>
                    {r.result ? 'approved' : 'denied'}
                  </span>
                </div>
                <div className="cj-tape-actions">
                  <button
                    type="button"
                    onClick={() => onEditRecord(r.record_id)}
                    className="cj-tape-action-btn"
                    aria-label="Edit record"
                    title="Edit record"
                  >
                    <PencilIcon className="cj-tape-action-icon" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(r.record_id)}
                    disabled={deletingRecordId === r.record_id}
                    className="cj-tape-action-btn cj-tape-action-btn-danger"
                    aria-label="Delete record"
                    title="Delete record"
                  >
                    {deletingRecordId === r.record_id ? (
                      <span className="cj-tape-action-spinner">…</span>
                    ) : (
                      <TrashIcon className="cj-tape-action-icon" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="cj-verdict">
            <b>{records.length} record{records.length === 1 ? '' : 's'}.</b> {approved} approved, {denied} denied.{' '}
            {eligibleRecordCards.length > 0 ? (
              <>Submit a new record from <button type="button" onClick={onPickCard} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>any card in your wallet</button>.</>
            ) : 'You’ve submitted records for every card in your wallet.'}
          </div>
        </>
      ) : (
        <div className="cj-verdict">
          {walletCards.length === 0
            ? <><b>No records yet.</b> Add a card to your wallet to submit a data point.</>
            : <><b>No records yet.</b>{' '}
                <button type="button" onClick={onPickCard} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                  Submit a record →
                </button>
              </>}
        </div>
      )}

      {walletCards.length > 0 && (
        <>
          <div className="cj-table-label" style={{ marginTop: 24 }}>Application rules</div>
          {cardsMissingDates > 0 && (
            <div className="cj-verdict" style={{ marginTop: 0, marginBottom: 16, background: '#fef9e8', borderLeftColor: '#a8792a', color: '#5c4318' }}>
              <ExclamationTriangleIcon style={{ width: 16, height: 16, display: 'inline', marginRight: 6, verticalAlign: '-3px' }} />
              <b style={{ color: '#a8792a' }}>{cardsMissingDates} card{cardsMissingDates === 1 ? '' : 's'} missing acquisition dates.</b>{' '}
              For accurate rule tracking, edit each card to add when you got it.
            </div>
          )}
          <div className="cj-rule-grid">
            {applicationRules.map((rule) => (
              <RuleProgressChart key={rule.ruleName} rule={rule} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ========== Referrals tab ========== */
interface ReferralsTabProps {
  referralsLoaded: boolean;
  referrals: Referral[];
  eligibleReferralCards: ReturnType<typeof getEligibleReferralCards>;
  onAddReferral: () => void;
  onArchive: (id: number) => void;
  archivingReferralId: number | null;
}

function ReferralsTab(props: ReferralsTabProps) {
  const { referralsLoaded, referrals, eligibleReferralCards, onAddReferral, onArchive, archivingReferralId } = props;
  if (!referralsLoaded) return <LoadingPanel />;

  const active = referrals.filter(r => !r.archived_at);
  const adminArchived = referrals.filter(r => r.archived_at && r.archived_reason);
  const totalImpressions = active.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = active.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0.0';

  return (
    <section className="cj-section">
      <div className="cj-readoff" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="cj-readoff-cell">
          <div className="cj-readoff-k">Active links</div>
          <div className="cj-readoff-v">{active.length}</div>
          <div className="cj-readoff-foot">
            {adminArchived.length > 0 ? `${adminArchived.length} removed` : 'submit more anytime'}
          </div>
        </div>
        <div className="cj-readoff-cell">
          <div className="cj-readoff-k">Impressions</div>
          <div className="cj-readoff-v">{totalImpressions.toLocaleString()}</div>
          <div className="cj-readoff-foot">all time</div>
        </div>
        <div className="cj-readoff-cell">
          <div className="cj-readoff-k">Clicks</div>
          <div className="cj-readoff-v">{totalClicks}</div>
          <div className="cj-readoff-foot">{ctr}% CTR</div>
        </div>
      </div>

      <div className="cj-wallet-toolbar" style={{ marginTop: 16 }}>
        <div className="cj-table-label">Your referral links</div>
        <span className="cj-wallet-toolbar-spacer" />
        {eligibleReferralCards.length > 0 && (
          <button type="button" className="cj-inline-cta" onClick={onAddReferral}>+ add a referral</button>
        )}
      </div>

      {active.length > 0 ? (
        <div className="cj-tape cj-tape-refs">
          <div className="cj-tape-head">
            <div></div>
            <div>Card</div>
            <div className="cj-tape-res">Impr.</div>
            <div className="cj-tape-res">Clicks</div>
            <div className="cj-tape-res">Status</div>
          </div>
          {active.map((r) => (
            <div key={r.referral_id} className="cj-tape-row">
              <div>
                <span className="cj-tape-thumb">
                  <CardImage cardImageLink={r.card_image_link} alt={r.card_name} fill sizes="36px" className="object-contain" />
                </span>
              </div>
              <div className="cj-tape-event">
                <span className="cj-tape-field">{r.card_name}</span>
                <div className="cj-tape-detail">
                  <a href={r.referral_link} target="_blank" rel="noreferrer" style={{ color: 'var(--muted)', textDecoration: 'underline', textDecorationColor: 'var(--line-2)' }}>
                    {r.referral_link.length > 40 ? r.referral_link.slice(0, 40) + '…' : r.referral_link}
                  </a>
                </div>
                <div className="cj-tape-detail cj-mob-only">
                  {(r.impressions ?? 0).toLocaleString()} impr · {r.clicks ?? 0} click{(r.clicks ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
              <div className="cj-tape-res">{(r.impressions ?? 0).toLocaleString()}</div>
              <div className="cj-tape-res">{r.clicks ?? 0}</div>
              <div className="cj-tape-res" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span className={'cj-pill ' + (r.admin_approved ? 'cj-pill-app' : 'cj-pill-pen')}>
                  {r.admin_approved ? 'active' : 'in review'}
                </span>
                <button
                  type="button"
                  onClick={() => onArchive(r.referral_id)}
                  disabled={archivingReferralId === r.referral_id}
                  style={{ fontSize: 10.5, color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}
                >
                  {archivingReferralId === r.referral_id ? 'archiving…' : 'archive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cj-verdict">
          {eligibleReferralCards.length > 0
            ? <><b>No referrals yet.</b>{' '}
                <button type="button" onClick={onAddReferral} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
                  Submit your first referral →
                </button>
              </>
            : <><b>No eligible cards yet.</b> Add a card to your wallet or submit a record to add a referral link.</>}
        </div>
      )}

      {adminArchived.length > 0 && (
        <div className="cj-verdict" style={{ marginTop: 16, background: '#fef9e8', borderLeftColor: '#a8792a', color: '#5c4318' }}>
          <b style={{ color: '#a8792a' }}>
            {adminArchived.length === 1
              ? `Your referral for ${adminArchived[0].card_name} was removed`
              : `${adminArchived.length} referrals were removed`}
          </b>{' '}
          because the link{adminArchived.length === 1 ? ' was' : 's were'} no longer working. You can submit new ones anytime.
        </div>
      )}
    </section>
  );
}

/* ========== Settings tab ========== */
interface SettingsTabProps {
  email?: string | null;
  handle: string;
  confirmingDelete: boolean;
  setConfirmingDelete: (v: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (v: string) => void;
  deletingAccount: boolean;
  onDeleteAccount: () => void;
  onLogout: () => void;
}

function SettingsTab(props: SettingsTabProps) {
  const { email, handle, confirmingDelete, setConfirmingDelete, deleteConfirmText, setDeleteConfirmText, deletingAccount, onDeleteAccount, onLogout } = props;

  const rows = [
    { k: 'Email', v: email || '—' },
    { k: 'Username', v: handle ? `@${handle}` : '—' },
  ];

  return (
    <section className="cj-section">
      <div>
        {rows.map((r, i) => (
          <div key={i} className="cj-settings-list">
            <div className="cj-settings-k">{r.k}</div>
            <div className="cj-settings-v">{r.v}</div>
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{/* read-only */}</span>
          </div>
        ))}
        <div className="cj-settings-list">
          <div className="cj-settings-k">Sign out</div>
          <div className="cj-settings-v">end this session</div>
          <button type="button" className="cj-settings-edit" onClick={onLogout}>sign out →</button>
        </div>
        <div className="cj-settings-list">
          <div className="cj-settings-k" style={{ color: 'var(--warn)' }}>Delete account</div>
          <div className="cj-settings-v" style={{ color: 'var(--warn)' }}>permanent · cannot be undone</div>
          {!confirmingDelete ? (
            <button
              type="button"
              className="cj-settings-edit"
              style={{ color: 'var(--warn)' }}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon style={{ width: 11, height: 11, display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              delete →
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="type DELETE"
                style={{ width: 110, padding: '4px 8px', fontSize: 12, border: '1px solid var(--warn)', borderRadius: 3, fontFamily: 'inherit' }}
                autoFocus
              />
              <button
                type="button"
                onClick={onDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                style={{
                  fontSize: 11.5,
                  background: 'var(--warn)',
                  color: '#fff',
                  border: 0,
                  borderRadius: 3,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  opacity: deleteConfirmText !== 'DELETE' || deletingAccount ? 0.5 : 1,
                }}
              >
                {deletingAccount ? 'deleting…' : 'confirm'}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmingDelete(false); setDeleteConfirmText(''); }}
                style={{ fontSize: 11.5, background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 3, padding: '5px 10px', cursor: 'pointer' }}
              >
                cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ========== Mobile-only: News view (Variant B) — wallet-filtered news with chip filters ========== */
type NewsFilter = 'all' | NewsTag;

function MobileNewsView({ relevantNews, walletCardsCount }: { relevantNews: NewsItem[]; walletCardsCount: number }) {
  const [filter, setFilter] = useState<NewsFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return relevantNews;
    return relevantNews.filter((n) => n.tags?.includes(filter));
  }, [relevantNews, filter]);

  const tagCount = (t: NewsTag) => relevantNews.filter((n) => n.tags?.includes(t)).length;
  const allChips: { key: NewsFilter; label: string }[] = [
    { key: 'all', label: `all · ${relevantNews.length}` },
    { key: 'fee-change', label: 'fee changes' },
    { key: 'benefit-change', label: 'benefit changes' },
    { key: 'bonus-change', label: 'bonus offers' },
    { key: 'new-card', label: 'new cards' },
    { key: 'limited-time', label: 'limited time' },
  ];
  const chips = allChips.filter((c) => c.key === 'all' || tagCount(c.key as NewsTag) > 0);

  return (
    <section className="cj-mob-news">
      <div className="cj-mob-news-hero">
        <div className="cj-mob-news-eyebrow">News · last 60 days</div>
        <h1 className="cj-mob-news-h">Filtered to <em>your wallet.</em></h1>
        <p className="cj-mob-news-sub">
          Devalues, benefit changes, and transfer-partner news for the {walletCardsCount} card{walletCardsCount === 1 ? '' : 's'} you carry —
          so you only see what matters.
        </p>
      </div>
      <div className="cj-mob-news-filter">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={'cj-mob-news-chip' + (filter === c.key ? ' active' : '')}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="cj-verdict" style={{ margin: '14px 18px' }}>
          {walletCardsCount === 0
            ? <><b>No cards in your wallet yet.</b> Add cards to see news for them.</>
            : <><b>No matching news.</b> Try a different filter.</>}
        </div>
      ) : (
        <div className="cj-mob-news-list">
          {filtered.map((n) => (
            <Link key={n.id} href={`/news/${n.id}`} className="cj-mob-news-row">
              <span className="cj-mob-news-thumb">
                <CardImage cardImageLink={n.card_image_link || n.card_image_links?.[0]} alt={n.card_names?.[0] || ''} fill sizes="48px" className="object-contain" />
              </span>
              <div>
                <div className="cj-mob-news-meta">
                  <span>{new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span style={{ color: 'var(--muted-2)' }}>·</span>
                  {n.tags?.[0] && (
                    <span className={`cj-mob-news-tag cj-mob-news-tag--${n.tags[0]}`}>
                      {(tagLabels[n.tags[0]] || n.tags[0]).replace(/^[^\w]+\s*/, '').toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="cj-mob-news-title">{n.title}</div>
                {n.card_names?.[0] && <div className="cj-mob-news-card">{n.card_names[0]}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* ========== Mobile-only: Bottom tab bar (Variant B · App Tabs) ========== */
function MobileTabBar({ activeTab, onSelect }: { activeTab: TabKey; onSelect: (k: TabKey) => void }) {
  // Map the desktop's 6 tabs to the 5 in-profile mobile tabs:
  //   cards → cards | rewards → rewards | news → news (wallet-filtered) |
  //   benefits → benefits | applications/referrals/settings → more
  const mobileSelected: TabKey =
    (['applications', 'referrals', 'settings'] as TabKey[]).includes(activeTab) ? 'more' : activeTab;

  return (
    <nav className="cj-mob-tabbar" aria-label="Mobile navigation">
      <button
        type="button"
        className={'cj-mob-tab' + (mobileSelected === 'cards' ? ' active' : '')}
        onClick={() => onSelect('cards')}
      >
        <span className="cj-mob-tab-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20" />
          </svg>
        </span>
        Cards
      </button>
      <button
        type="button"
        className={'cj-mob-tab' + (mobileSelected === 'rewards' ? ' active' : '')}
        onClick={() => onSelect('rewards')}
      >
        <span className="cj-mob-tab-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="5" x2="5" y2="19" />
            <circle cx="6.5" cy="6.5" r="2.5" />
            <circle cx="17.5" cy="17.5" r="2.5" />
          </svg>
        </span>
        Earn
        <span className="cj-mob-tab-beta" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={'cj-mob-tab' + (mobileSelected === 'news' ? ' active' : '')}
        onClick={() => onSelect('news')}
      >
        <span className="cj-mob-tab-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" />
          </svg>
        </span>
        News
      </button>
      <button
        type="button"
        className={'cj-mob-tab' + (mobileSelected === 'benefits' ? ' active' : '')}
        onClick={() => onSelect('benefits')}
      >
        <span className="cj-mob-tab-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="13" rx="1" /><path d="M3 12h18M12 8v13" />
          </svg>
        </span>
        Benefits
      </button>
      <button
        type="button"
        className={'cj-mob-tab' + (mobileSelected === 'more' ? ' active' : '')}
        onClick={() => onSelect('more')}
      >
        <span className="cj-mob-tab-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" />
          </svg>
        </span>
        More
      </button>
    </nav>
  );
}
