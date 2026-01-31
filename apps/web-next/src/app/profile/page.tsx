'use client';

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/auth/AuthProvider";
import { getProfile, getRecords, getReferrals, deleteRecord, deleteReferral, getWallet, getAllCards, deleteAccount, WalletCard, Card } from "@/lib/api";
import { getNews, NewsItem, tagLabels, tagColors, NewsTag } from "@/lib/news";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { PlusIcon, WalletIcon, TrashIcon, DocumentTextIcon, LinkIcon, NewspaperIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";

// Lazy load modals - only loaded when user opens them
const ReferralModal = dynamic(() => import("@/components/forms/ReferralModal"), {
  ssr: false,
  loading: () => null,
});

const AddToWalletModal = dynamic(() => import("@/components/wallet/AddToWalletModal"), {
  ssr: false,
  loading: () => null,
});

const EditWalletCardModal = dynamic(() => import("@/components/wallet/EditWalletCardModal"), {
  ssr: false,
  loading: () => null,
});

interface Record {
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
  impressions?: number;
  clicks?: number;
}

interface OpenReferral {
  card_id: string;
  card_name: string;
  card_image_link?: string;
  card_referral_link?: string;
}

interface Profile {
  username: string;
  email: string;
  records_count: number;
  referrals_count: number;
}

export default function ProfilePage() {
  const { authState, getToken, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [openReferrals, setOpenReferrals] = useState<OpenReferral[]>([]);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const [deletingReferralId, setDeletingReferralId] = useState<number | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showInactiveCards, setShowInactiveCards] = useState(false);
  const [activeTab, setActiveTab] = useState<'wallet' | 'records' | 'referrals'>('wallet');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [editingCard, setEditingCard] = useState<WalletCard | null>(null);

  // Allow referrals for cards where user has submitted a record OR has in wallet
  const eligibleReferralCards = useMemo(() => {
    const recordCardNames = new Set(records.map(r => r.card_name));
    const walletCardNames = new Set(walletCards.map(w => w.card_name));
    return openReferrals.filter(card =>
      recordCardNames.has(card.card_name) || walletCardNames.has(card.card_name)
    );
  }, [records, openReferrals, walletCards]);

  // Calculate total annual fees for wallet cards
  const totalAnnualFees = useMemo(() => {
    if (walletCards.length === 0 || allCards.length === 0) return 0;
    return walletCards.reduce((total, walletCard) => {
      const cardData = allCards.find(c => c.card_name === walletCard.card_name);
      return total + (cardData?.annual_fee || 0);
    }, 0);
  }, [walletCards, allCards]);

  // Filter wallet cards based on active status
  const { activeWalletCards, inactiveCount } = useMemo(() => {
    if (allCards.length === 0) {
      return { activeWalletCards: walletCards, inactiveCount: 0 };
    }
    const active: WalletCard[] = [];
    let inactive = 0;
    for (const walletCard of walletCards) {
      const cardData = allCards.find(c => c.card_name === walletCard.card_name);
      if (cardData?.accepting_applications === false) {
        inactive++;
        if (showInactiveCards) {
          active.push(walletCard);
        }
      } else {
        active.push(walletCard);
      }
    }
    return { activeWalletCards: active, inactiveCount: inactive };
  }, [walletCards, allCards, showInactiveCards]);

  // Helper to check if a card is inactive
  const isCardInactive = (cardName: string) => {
    const cardData = allCards.find(c => c.card_name === cardName);
    return cardData?.accepting_applications === false;
  };

  // Track which cards have records or referrals
  const cardsWithRecords = useMemo(() =>
    new Set(records.map(r => r.card_name)), [records]);
  const cardsWithReferrals = useMemo(() =>
    new Set(referrals.map(r => r.card_name)), [referrals]);

  // Filter news to cards in user's wallet (only match by card slug, not bank)
  const relevantNews = useMemo(() => {
    if (walletCards.length === 0 || newsItems.length === 0) return [];

    // Build set of slugs from wallet cards (lookup by card_id first, then card_name)
    const walletCardSlugs = new Set<string>();
    walletCards.forEach(w => {
      // Try to find by card_id first (more reliable)
      let cardData = allCards.find(c =>
        Number(c.card_id) === w.card_id || c.db_card_id === w.card_id
      );
      // Fallback to card_name matching
      if (!cardData) {
        cardData = allCards.find(c => c.card_name === w.card_name);
      }
      if (cardData?.slug) {
        walletCardSlugs.add(cardData.slug);
      }
    });

    // Only show news for specific cards the user owns
    return newsItems.filter(news =>
      news.card_slug && walletCardSlugs.has(news.card_slug)
    );
  }, [walletCards, newsItems, allCards]);

  useEffect(() => {
    if (!authState.isLoading && !authState.isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (authState.isAuthenticated) {
      loadData();
    }
  }, [authState.isAuthenticated, authState.isLoading, router]);

  const loadData = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.error("No auth token available");
        return;
      }

      // Fetch all data in parallel for faster loading
      const [recordsResult, referralsResult, profileResult, walletResult, cardsResult, newsResult] = await Promise.allSettled([
        getRecords(token),
        getReferrals(token),
        getProfile(token),
        getWallet(token),
        getAllCards(),
        getNews(),
      ]);

      // Process records
      if (recordsResult.status === 'fulfilled') {
        setRecords(recordsResult.value || []);
      } else {
        console.error("Records error:", recordsResult.reason);
        setRecords([]);
      }

      // Process referrals - API returns [submitted, open] - two arrays
      if (referralsResult.status === 'fulfilled') {
        const referralsData = referralsResult.value;
        if (Array.isArray(referralsData) && referralsData.length >= 2) {
          setReferrals(referralsData[0] || []);
          setOpenReferrals(referralsData[1] || []);
        } else {
          setReferrals([]);
          setOpenReferrals([]);
        }
      } else {
        console.error("Referrals error:", referralsResult.reason);
        setReferrals([]);
        setOpenReferrals([]);
      }

      // Process profile
      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        console.error("Profile error:", profileResult.reason);
      }

      // Process wallet
      if (walletResult.status === 'fulfilled') {
        setWalletCards(walletResult.value || []);
      } else {
        console.error("Wallet error:", walletResult.reason);
        setWalletCards([]);
      }

      // Process all cards for annual fee calculation
      if (cardsResult.status === 'fulfilled') {
        setAllCards(cardsResult.value || []);
      } else {
        console.error("Cards error:", cardsResult.reason);
        setAllCards([]);
      }

      // Process news
      if (newsResult.status === 'fulfilled') {
        setNewsItems(newsResult.value || []);
      } else {
        console.error("News error:", newsResult.reason);
        setNewsItems([]);
      }
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatAcquiredDate = (month?: number, year?: number) => {
    if (!month && !year) return null;
    const monthName = month ? new Date(2000, month - 1).toLocaleString('default', { month: 'short' }) : '';
    if (month && year) return `${monthName} ${year}`;
    if (year) return `${year}`;
    return monthName;
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm("Are you sure you want to delete this record?")) {
      return;
    }

    setDeletingRecordId(recordId);
    try {
      const token = await getToken();
      if (!token) {
        console.error("No auth token available");
        return;
      }
      await deleteRecord(recordId, token);
      // Remove the record from local state
      setRecords(records.filter(r => r.record_id !== recordId));
    } catch (error) {
      console.error("Error deleting record:", error);
      alert("Failed to delete record. Please try again.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleDeleteReferral = async (referralId: number) => {
    if (!confirm("Are you sure you want to delete this referral?")) {
      return;
    }

    setDeletingReferralId(referralId);
    try {
      const token = await getToken();
      if (!token) {
        console.error("No auth token available");
        return;
      }
      await deleteReferral(referralId, token);
      // Remove the referral from local state
      setReferrals(referrals.filter(r => r.referral_id !== referralId));
    } catch (error) {
      console.error("Error deleting referral:", error);
      alert("Failed to delete referral. Please try again.");
    } finally {
      setDeletingReferralId(null);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmText = "DELETE";
    const userInput = prompt(
      `This will permanently delete your account, all your referrals, and your wallet.\n\nYour submitted data points will be kept anonymously to help others.\n\nType "${confirmText}" to confirm:`
    );

    if (userInput !== confirmText) {
      if (userInput !== null) {
        alert("Account deletion cancelled. Text did not match.");
      }
      return;
    }

    setDeletingAccount(true);
    try {
      const token = await getToken();
      if (!token) {
        alert("No auth token available");
        return;
      }

      await deleteAccount(token);
      alert("Your account has been deleted. Thank you for contributing to CreditOdds.");
      await logout();
      router.push("/");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(error instanceof Error ? error.message : "Failed to delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
    }
  };

  if (authState.isLoading || loading) {
    return <ProfileSkeleton />;
  }

  if (!authState.isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Profile Header - Compact */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {authState.user?.displayName || 'My Profile'}
                </h1>
                {authState.user?.email && (
                  <p className="text-sm text-gray-500">{authState.user.email}</p>
                )}
              </div>
              {/* Settings Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title="Account settings"
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </button>
                {showSettingsMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSettingsMenu(false)}
                    />
                    <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-20">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowSettingsMenu(false);
                            handleDeleteAccount();
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-3">
              <div className="flex items-center gap-1 sm:gap-2 bg-indigo-50 rounded-lg px-2 sm:px-3 py-2">
                <WalletIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                <div>
                  <p className="text-base sm:text-xl font-bold text-indigo-600">{walletCards.length}</p>
                  <p className="text-[10px] sm:text-xs text-indigo-600/70">Cards</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 bg-red-50 rounded-lg px-2 sm:px-3 py-2">
                <span className="text-red-500 font-medium text-xs sm:text-sm">$</span>
                <div>
                  <p className="text-base sm:text-xl font-bold text-red-600">{totalAnnualFees.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-red-600/70">Fees/yr</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 bg-green-50 rounded-lg px-2 sm:px-3 py-2">
                <DocumentTextIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                <div>
                  <p className="text-base sm:text-xl font-bold text-green-600">{records.length}</p>
                  <p className="text-[10px] sm:text-xs text-green-600/70">Records</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 bg-amber-50 rounded-lg px-2 sm:px-3 py-2">
                <LinkIcon className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                <div>
                  <p className="text-base sm:text-xl font-bold text-amber-600">{referrals.length}</p>
                  <p className="text-[10px] sm:text-xs text-amber-600/70">Referrals</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
            <button
              onClick={() => setActiveTab('wallet')}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'wallet'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <WalletIcon className="h-5 w-5" />
              Wallet
              <span className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                activeTab === 'wallet' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {walletCards.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'records'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <DocumentTextIcon className="h-5 w-5" />
              Records
              <span className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                activeTab === 'records' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {records.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('referrals')}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'referrals'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <LinkIcon className="h-5 w-5" />
              Referrals
              <span className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                activeTab === 'referrals' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {referrals.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tabs Content - Full width on mobile, 2/3 on desktop */}
          <div className="col-span-1 lg:col-span-2">
        {/* Tab Content */}
        {activeTab === 'wallet' && (
          <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">My Cards</h2>
              <button
                onClick={() => setShowWalletModal(true)}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Card
              </button>
            </div>

          {/* Show inactive cards toggle */}
          {inactiveCount > 0 && (
            <div className="mb-4">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactiveCards}
                  onChange={(e) => setShowInactiveCards(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ms-3 text-sm text-gray-500">
                  Show inactive cards ({inactiveCount})
                </span>
              </label>
            </div>
          )}

          {activeWalletCards.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {activeWalletCards.map((card) => {
                const inactive = isCardInactive(card.card_name);
                return (
                  <button
                    key={card.id}
                    onClick={() => setEditingCard(card)}
                    className={`relative text-left rounded-lg p-3 transition-colors cursor-pointer ${inactive ? 'bg-gray-100 opacity-60' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="aspect-[1.586/1] relative mb-2">
                      <Image
                        src={card.card_image_link
                          ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                          : '/assets/generic-card.svg'}
                        alt={card.card_name}
                        fill
                        className={`object-contain ${inactive ? 'grayscale' : ''}`}
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                      />
                      {inactive && (
                        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-500 px-1.5 py-0.5 rounded-full text-xs font-medium text-white shadow-sm">
                          Inactive
                        </span>
                      )}
                      {/* Record and Referral indicators */}
                      <div className="absolute top-0 left-0 flex gap-0.5">
                        {cardsWithRecords.has(card.card_name) && (
                          <span className="bg-green-500 p-0.5 rounded-full shadow-sm" title="Record submitted">
                            <DocumentTextIcon className="h-3 w-3 text-white" />
                          </span>
                        )}
                        {cardsWithReferrals.has(card.card_name) && (
                          <span className="bg-green-500 p-0.5 rounded-full shadow-sm" title="Referral submitted">
                            <LinkIcon className="h-3 w-3 text-white" />
                          </span>
                        )}
                      </div>
                      {(() => {
                        const cardData = allCards.find(c => c.card_name === card.card_name);
                        const annualFee = cardData?.annual_fee || 0;
                        return annualFee > 0 ? (
                          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white px-1.5 py-0.5 rounded-full text-xs font-medium text-red-600 shadow-sm">
                            ${annualFee}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <p className="text-xs font-medium text-gray-900 truncate">{card.card_name}</p>
                    <p className="text-xs text-gray-500">{card.bank}</p>
                    {formatAcquiredDate(card.acquired_month, card.acquired_year) && (
                      <p className="text-xs text-gray-400 mt-1">
                        Since {formatAcquiredDate(card.acquired_month, card.acquired_year)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : walletCards.length > 0 ? (
            <div className="text-center py-8">
              <WalletIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">All {walletCards.length} cards are inactive.</p>
              <p className="text-sm text-gray-400">Toggle &quot;Show inactive cards&quot; above to see them.</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <WalletIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No cards in your wallet yet.</p>
              <p className="text-sm text-gray-400">Add the credit cards you own to track your collection.</p>
            </div>
          )}
          </div>
        )}

        {/* Records Tab */}
        {activeTab === 'records' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900">Your Records</h2>
              <p className="mt-1 text-sm text-gray-500">Your submitted application data points</p>
            </div>
          {records.length > 0 ? (
            <div className="border-t border-gray-200">
              {/* Mobile: Card layout */}
              <div className="sm:hidden divide-y divide-gray-200">
                {records.map((record, index) => (
                  <div key={record.record_id || index} className="p-4">
                    <div className="flex items-start gap-3">
                      {record.card_image_link && (
                        <div className="flex-shrink-0 h-12 w-20 relative">
                          <Image
                            className="object-contain"
                            src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                            alt={record.card_name}
                            fill
                            sizes="80px"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">{record.card_name}</p>
                          <span
                            className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              record.result
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {record.result ? "Approved" : "Rejected"}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>Score: <span className="font-medium text-gray-700">{record.credit_score}</span></span>
                          <span>Income: <span className="font-medium text-gray-700">${record.listed_income?.toLocaleString()}</span></span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {new Date(record.submit_datetime).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => handleDeleteRecord(record.record_id)}
                            disabled={deletingRecordId === record.record_id}
                            className="text-xs text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingRecordId === record.record_id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: Table layout */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Card
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credit Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Income
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Result
                      </th>
                      <th className="relative px-6 py-3">
                        <span className="sr-only">Delete</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {records.map((record, index) => (
                      <tr key={record.record_id || index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {record.card_image_link && (
                              <div className="flex-shrink-0 h-10 w-16 relative">
                                <Image
                                  className="object-contain"
                                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                                  alt={record.card_name}
                                  fill
                                  sizes="64px"
                                />
                              </div>
                            )}
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {record.card_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                Submitted: {new Date(record.submit_datetime).toLocaleDateString()}
                              </div>
                              {record.date_applied && (
                                <div className="text-sm text-gray-500">
                                  Applied: {new Date(record.date_applied).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {record.credit_score}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${record.listed_income?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              record.result
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {record.result ? "Approved" : "Rejected"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteRecord(record.record_id)}
                            disabled={deletingRecordId === record.record_id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingRecordId === record.record_id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <p className="text-gray-500">No records submitted yet.</p>
            </div>
          )}
          </div>
        )}

        {/* Referrals Tab */}
        {activeTab === 'referrals' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6">
              <h2 className="text-lg font-semibold text-gray-900">Your Referrals</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Don&apos;t see your card as an option?{' '}
              <a href="https://github.com/CreditOdds/creditodds/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                Add the referral base URL on GitHub
              </a>{' '}
              or{' '}
              <a href="https://x.com/MaxwellMelcher" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-500">
                message me on X
              </a>.
            </p>
          </div>
          {referrals.length > 0 ? (
            <div className="border-t border-gray-200">
              {/* Mobile: Card layout */}
              <div className="sm:hidden divide-y divide-gray-200">
                {referrals.map((referral, index) => (
                  <div key={referral.referral_id || index} className="p-4">
                    <div className="flex items-start gap-3">
                      {referral.card_image_link && (
                        <div className="flex-shrink-0 h-12 w-20 relative">
                          <Image
                            className="object-contain"
                            src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${referral.card_image_link}`}
                            alt={referral.card_name}
                            fill
                            sizes="80px"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">{referral.card_name}</p>
                          {referral.admin_approved ? (
                            <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Approved
                            </span>
                          ) : (
                            <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </div>
                        <a
                          href={referral.card_referral_link ? `${referral.card_referral_link}${referral.referral_link}` : referral.referral_link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 text-xs text-indigo-600 hover:text-indigo-900 truncate block"
                        >
                          {referral.referral_link}
                        </a>
                        <div className="mt-1 flex items-center justify-between">
                          <div className="flex gap-3 text-xs text-gray-500">
                            <span>{referral.impressions ?? 0} views</span>
                            <span>{referral.clicks ?? 0} clicks</span>
                          </div>
                          <button
                            onClick={() => handleDeleteReferral(referral.referral_id)}
                            disabled={deletingReferralId === referral.referral_id}
                            className="text-xs text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingReferralId === referral.referral_id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: Table layout */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Card
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Referral Link
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Impressions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Clicks
                      </th>
                      <th className="relative px-6 py-3">
                        <span className="sr-only">Delete</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {referrals.map((referral, index) => (
                      <tr key={referral.referral_id || index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {referral.card_image_link && (
                              <div className="flex-shrink-0 h-10 w-16 relative">
                                <Image
                                  className="object-contain"
                                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${referral.card_image_link}`}
                                  alt={referral.card_name}
                                  fill
                                  sizes="64px"
                                />
                              </div>
                            )}
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {referral.card_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            <a
                              href={referral.card_referral_link ? `${referral.card_referral_link}${referral.referral_link}` : referral.referral_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              {referral.referral_link}
                            </a>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {referral.admin_approved ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Approved
                            </span>
                          ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Awaiting Approval
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {referral.impressions ?? 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {referral.clicks ?? 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteReferral(referral.referral_id)}
                            disabled={deletingReferralId === referral.referral_id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingReferralId === referral.referral_id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
              <p className="text-gray-500">No referrals submitted yet.</p>
            </div>
          )}
          <div className="border-t border-gray-200">
            {eligibleReferralCards.length > 0 ? (
              <button
                onClick={() => setShowReferralModal(true)}
                className="block w-full bg-gray-50 text-sm font-medium text-gray-500 text-center px-4 py-4 hover:text-gray-700 sm:rounded-b-lg cursor-pointer"
              >
                Submit a referral
              </button>
            ) : (
              <div className="bg-gray-50 text-sm text-gray-400 text-center px-4 py-4 sm:rounded-b-lg">
                Add a card to your wallet or submit a data point to add your referral link
              </div>
            )}
            </div>
          </div>
        )}
          </div>

          {/* News Sidebar - Below content on mobile, 1/3 on desktop */}
          <div className="col-span-1 lg:col-span-1">
            <div className="bg-white shadow rounded-lg overflow-hidden sticky top-4">
              <div className="px-4 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <NewspaperIcon className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-base font-semibold text-gray-900">Your Card News</h2>
                </div>
              </div>
              {relevantNews.length > 0 ? (
                <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                  {relevantNews.slice(0, 10).map((news) => (
                    <li key={news.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">
                          {new Date(news.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        {news.tags.slice(0, 1).map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${tagColors[tag]}`}
                          >
                            {tagLabels[tag]}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{news.title}</p>
                      {news.summary && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-3">{news.summary}</p>
                      )}
                      {news.card_slug && news.card_name && (
                        <Link
                          href={`/card/${news.card_slug}`}
                          className="mt-1 inline-block text-xs text-indigo-600 hover:text-indigo-900"
                        >
                          {news.card_name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center">
                  <NewspaperIcon className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">No news for your cards</p>
                  <Link
                    href="/news"
                    className="mt-2 inline-block text-xs text-indigo-600 hover:text-indigo-900"
                  >
                    View all news →
                  </Link>
                </div>
              )}
              {relevantNews.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <Link
                    href="/news"
                    className="text-sm text-indigo-600 hover:text-indigo-900"
                  >
                    View all card news →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Referral Modal */}
        <ReferralModal
          show={showReferralModal}
          handleClose={() => setShowReferralModal(false)}
          openReferrals={eligibleReferralCards}
          onSuccess={loadData}
        />

        {/* Add to Wallet Modal */}
        <AddToWalletModal
          show={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          onSuccess={loadData}
          existingCardIds={walletCards.map(c => c.card_id)}
        />

        {/* Edit Wallet Card Modal */}
        <EditWalletCardModal
          show={!!editingCard}
          card={editingCard}
          cardSlug={editingCard ? allCards.find(c => c.card_name === editingCard.card_name)?.slug : undefined}
          onClose={() => setEditingCard(null)}
          onSuccess={loadData}
        />

      </div>
    </div>
  );
}
