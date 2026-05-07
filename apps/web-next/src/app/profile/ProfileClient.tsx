'use client';

import { useEffect, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import CardImage from "@/components/ui/CardImage";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/auth/AuthProvider";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { getAllCards, getProfile, getRecords, getReferrals, deleteRecord, archiveReferral, getWallet, deleteAccount, WalletCard, Card } from "@/lib/api";
import "../landing.css";
import { getNews, NewsItem, tagLabels } from "@/lib/news";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import ProfileLoader from "./ProfileLoader";
import { amortizedAnnualValue } from "@/lib/cardDisplayUtils";
import { TrashIcon, DocumentTextIcon, LinkIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { calculateApplicationRules, countCardsMissingDates } from "@/lib/applicationRules";
import {
  createCardLookups,
  getEligibleRecordCards,
  getEligibleReferralCards,
  getRelevantNews,
  getTotalAnnualFees,
  getWalletVisibility,
  isCardInactive,
} from "./profileSelectors";

const ReferralModal = dynamic(() => import("@/components/forms/ReferralModal"), { ssr: false, loading: () => null });
const AddToWalletModal = dynamic(() => import("@/components/wallet/AddToWalletModal"), { ssr: false, loading: () => null });
const EditWalletCardModal = dynamic(() => import("@/components/wallet/EditWalletCardModal"), { ssr: false, loading: () => null });
const BestCardByCategory = dynamic(() => import("@/components/wallet/BestCardByCategory"), { ssr: false, loading: () => null });
const NearbyBestCard = dynamic(() => import("@/components/wallet/NearbyBestCard"), { ssr: false, loading: () => null });
const WalletBenefits = dynamic(() => import("@/components/wallet/WalletBenefits"), { ssr: false, loading: () => null });
const SubmitRecordModal = dynamic(() => import("@/components/forms/SubmitRecordModal"), { ssr: false, loading: () => null });
const SubmitRecordCardPicker = dynamic(() => import("@/components/forms/SubmitRecordCardPicker"), { ssr: false, loading: () => null });
const RuleProgressChart = dynamic(() => import("@/components/charts/RuleProgressChart"), {
  ssr: false,
  loading: () => <div className="cj-rule" style={{ opacity: 0.4 }} />,
});

interface RecordItem {
  record_id: number;
  card_name: string;
  card_image_link?: string;
  credit_score: number;
  listed_income: number;
  length_credit: number;
  result: boolean;
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
}

interface Profile {
  username: string;
  email: string;
  records_count: number;
  referrals_count: number;
}

type TabKey = 'cards' | 'rewards' | 'nearby' | 'benefits' | 'applications' | 'referrals' | 'settings';

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

export default function ProfileClient() {
  const { authState, getToken, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
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
  const cardLookups = useMemo(() => createCardLookups(allCards), [allCards]);

  const eligibleReferralCards = useMemo(
    () => getEligibleReferralCards(records, walletCards, referrals.filter((r) => !r.archived_at), cardLookups),
    [records, walletCards, referrals, cardLookups]
  );

  const totalAnnualFees = useMemo(
    () => getTotalAnnualFees(walletCards, cardLookups),
    [walletCards, cardLookups]
  );

  const { activeWalletCards, inactiveCount } = useMemo(
    () => getWalletVisibility(walletCards, cardLookups, showArchived),
    [walletCards, cardLookups, showArchived]
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
  const annualCreditsTotals = useMemo(() => {
    let total = 0;
    let cardsWithCredits = 0;
    for (const wc of walletCards) {
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
        name: wc.card_name,
        renewal: renewal.display,
        fee,
        sortKey: renewal.sortKey,
        daysOut: days,
      });
    }
    list.sort((a, b) => a.sortKey - b.sortKey);
    return list.slice(0, 3);
    // Intentionally re-uses isInactiveCard via cardLookups — eslint disable not needed
  }, [walletCards, cardLookups]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextRenewal = upcomingRenewals[0];

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

    const loadProfile = async () => {
      try { setProfile(await getProfile(token)); } catch (e) { console.error("Profile error:", e); }
    };
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

    loadProfile(); loadWallet(); loadRecords(); loadReferrals();
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
  const handle = profile?.username || authState.user?.email?.split('@')[0] || '';
  const activeReferralsCount = referrals.filter(r => !r.archived_at).length;
  const visibleWalletCards = activeWalletCards;

  const tabs: { key: TabKey; num: string; label: string; count: string }[] = [
    { key: 'cards', num: '01', label: 'Cards', count: walletCards.length ? `${walletCards.length} cards` : '' },
    { key: 'rewards', num: '02', label: 'Rewards', count: '' },
    { key: 'nearby', num: '03', label: 'Nearby', count: 'beta' },
    { key: 'benefits', num: '04', label: 'Benefits', count: '' },
    { key: 'applications', num: '05', label: 'Applications', count: records.length ? `${records.length} records` : '' },
    { key: 'referrals', num: '06', label: 'Referrals', count: activeReferralsCount ? `${activeReferralsCount} links` : '' },
    { key: 'settings', num: '07', label: 'Settings', count: '' },
  ];

  return (
    <div className="landing-v2 profile-v2">
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
          {/* Snapshot header — tight welcome row */}
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
                  {nextRenewal ? nextRenewal.renewal.split(' ')[0] + ' ' + nextRenewal.renewal.split(' ')[1].slice(2) : '—'}
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
                inactiveCount={inactiveCount}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
                openWalletId={openWalletId}
                setOpenWalletId={setOpenWalletId}
                cardLookups={cardLookups}
                cardsWithRecords={cardsWithRecords}
                cardsWithActiveReferrals={cardsWithActiveReferrals}
                totalAnnualFees={totalAnnualFees}
                onAdd={() => setShowWalletModal(true)}
                onEdit={(c) => setEditingCard(c)}
                onSubmitRecord={(c) => setSubmitRecordCard(c)}
                onAddReferral={() => setShowReferralModal(true)}
              />
            )}

            {activeTab === 'rewards' && (
              !walletLoaded ? <LoadingPanel /> :
              <BestCardByCategory walletCards={walletCards} allCards={allCards} />
            )}

            {activeTab === 'nearby' && (
              !walletLoaded ? <LoadingPanel /> :
              <NearbyBestCard walletCards={walletCards} allCards={allCards} />
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
                profile={profile}
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
          </div>
        </main>

        <aside className="cj-rail">
          <div className="cj-apply">
            <div className="cj-apply-k">Wallet</div>
            <div className="cj-apply-v">
              {walletCards.length} card{walletCards.length === 1 ? '' : 's'}
            </div>
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

          {upcomingRenewals.length > 0 && (
            <div className="cj-rail-block">
              <div className="cj-rail-label">Upcoming renewals</div>
              <ul className="cj-rail-list">
                {upcomingRenewals.map((r) => (
                  <li key={r.name} className="cj-rail-row">
                    <div className="cj-rail-row-meta">
                      <span className="cj-rail-row-date">{r.renewal.split(' ')[0]} {r.renewal.split(' ')[1].slice(2)}</span>
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

          <div className="cj-rail-block">
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

          <Link href="/news" className="cj-rail-cta">view all news</Link>
        </aside>
      </div>

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
        onClose={() => setEditingCard(null)}
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
  inactiveCount: number;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  openWalletId: number | null;
  setOpenWalletId: (v: number | null) => void;
  cardLookups: ReturnType<typeof createCardLookups>;
  cardsWithRecords: Set<string>;
  cardsWithActiveReferrals: Set<string>;
  totalAnnualFees: number;
  onAdd: () => void;
  onEdit: (c: WalletCard) => void;
  onSubmitRecord: (c: WalletCard) => void;
  onAddReferral: () => void;
}

function CardsTab(props: CardsTabProps) {
  const {
    walletLoaded, walletCards, visibleWalletCards, inactiveCount, showArchived, setShowArchived,
    openWalletId, setOpenWalletId, cardLookups, cardsWithRecords, cardsWithActiveReferrals,
    totalAnnualFees, onAdd, onEdit, onSubmitRecord, onAddReferral,
  } = props;

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
          const renewalDisplay = renewal ? renewal.display : '—';
          const acquiredLabel = (() => {
            if (!c.acquired_month && !c.acquired_year) return null;
            const m = c.acquired_month ? MONTHS_SHORT[c.acquired_month - 1] : '';
            return c.acquired_year ? `${m ? m + ' ' : ''}${c.acquired_year}` : m;
          })();
          const hasRecord = cardsWithRecords.has(c.card_name);
          const hasReferral = cardsWithActiveReferrals.has(c.card_name);
          const slug = card?.slug;

          return (
            <Fragment key={c.id}>
              <button
                type="button"
                className={'cj-wallet-crow' + (isOpen ? ' is-open' : '') + (archived ? ' is-archived' : '')}
                onClick={() => setOpenWalletId(isOpen ? null : c.id)}
                aria-expanded={isOpen}
              >
                <span className="cj-cw-thumb">
                  <CardImage cardImageLink={c.card_image_link} alt={c.card_name} fill sizes="36px" className="object-contain" />
                </span>
                <div className="cj-cw-name">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.card_name}</span>
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
                  <div className="cj-wd-meta">
                    <div>
                      <div className="cj-wd-k">Issuer</div>
                      <div className="cj-wd-v">{c.bank}</div>
                    </div>
                    <div>
                      <div className="cj-wd-k">Opened</div>
                      <div className="cj-wd-v">{acquiredLabel || '—'}</div>
                    </div>
                    <div>
                      <div className="cj-wd-k">Renewal</div>
                      <div className="cj-wd-v">{renewalDisplay}</div>
                    </div>
                    <div>
                      <div className="cj-wd-k">Annual fee</div>
                      <div className="cj-wd-v">{fee === 0 ? '$0 · no fee' : '$' + fee.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="cj-wd-actions">
                    {slug && <Link href={`/card/${slug}`}>view card page →</Link>}
                    <button type="button" onClick={() => onEdit(c)}>edit</button>
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
  deletingRecordId: number | null;
  eligibleRecordCards: WalletCard[];
}

function ApplicationsTab(props: ApplicationsTabProps) {
  const { recordsLoaded, walletLoaded, records, walletCards, applicationRules, cardsMissingDates, onPickCard, onDeleteRecord, deletingRecordId, eligibleRecordCards } = props;
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
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(r.record_id)}
                    disabled={deletingRecordId === r.record_id}
                    style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', background: 'transparent', border: 0, cursor: 'pointer' }}
                    aria-label="Delete record"
                  >
                    {deletingRecordId === r.record_id ? '…' : '×'}
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
  profile: Profile | null;
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
