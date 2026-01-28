'use client';

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/auth/AuthProvider";
import { getProfile, getRecords, getReferrals, deleteRecord, deleteReferral, getWallet, removeFromWallet, getAllCards, WalletCard, Card } from "@/lib/api";
import { ProfileSkeleton } from "@/components/ui/Skeleton";
import { PlusIcon, WalletIcon, TrashIcon } from "@heroicons/react/24/outline";

// Lazy load modals - only loaded when user opens them
const ReferralModal = dynamic(() => import("@/components/forms/ReferralModal"), {
  ssr: false,
  loading: () => null,
});

const AddToWalletModal = dynamic(() => import("@/components/wallet/AddToWalletModal"), {
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
  const { authState, getToken } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [openReferrals, setOpenReferrals] = useState<OpenReferral[]>([]);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
  const [deletingReferralId, setDeletingReferralId] = useState<number | null>(null);
  const [removingCardId, setRemovingCardId] = useState<number | null>(null);

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

      // Fetch each independently to get better error handling
      try {
        const recordsData = await getRecords(token);
        setRecords(recordsData || []);
      } catch (e) {
        console.error("Records error:", e);
        setRecords([]);
      }

      try {
        const referralsData = await getReferrals(token);
        // API returns [submitted, open] - two arrays
        if (Array.isArray(referralsData) && referralsData.length >= 2) {
          setReferrals(referralsData[0] || []);
          setOpenReferrals(referralsData[1] || []);
        } else {
          setReferrals([]);
          setOpenReferrals([]);
        }
      } catch (e) {
        console.error("Referrals error:", e);
        setReferrals([]);
        setOpenReferrals([]);
      }

      try {
        const profileData = await getProfile(token);
        setProfile(profileData);
      } catch (e) {
        console.error("Profile error:", e);
      }

      try {
        const walletData = await getWallet(token);
        setWalletCards(walletData || []);
      } catch (e) {
        console.error("Wallet error:", e);
        setWalletCards([]);
      }

      // Fetch all cards for annual fee calculation
      try {
        const cardsData = await getAllCards();
        setAllCards(cardsData || []);
      } catch (e) {
        console.error("Cards error:", e);
        setAllCards([]);
      }
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromWallet = async (cardId: number) => {
    if (!confirm("Remove this card from your wallet?")) return;

    setRemovingCardId(cardId);
    try {
      const token = await getToken();
      if (!token) {
        console.error("No auth token available");
        return;
      }
      await removeFromWallet(cardId, token);
      setWalletCards(walletCards.filter(c => c.card_id !== cardId));
    } catch (error) {
      console.error("Error removing card from wallet:", error);
      alert("Failed to remove card. Please try again.");
    } finally {
      setRemovingCardId(null);
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

  if (authState.isLoading || loading) {
    return <ProfileSkeleton />;
  }

  if (!authState.isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          {authState.user && (
            <div className="mt-4">
              {authState.user.displayName && (
                <p className="text-gray-600">Name: {authState.user.displayName}</p>
              )}
              <p className="text-gray-600">Email: {authState.user.email}</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Cards in Wallet</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{walletCards.length}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Annual Fees</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">${totalAnnualFees.toLocaleString()}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Records</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{records.length}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Referrals</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{referrals.length}</dd>
            </div>
          </div>
        </div>

        {/* Wallet Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <WalletIcon className="h-6 w-6 text-indigo-600" />
              <h2 className="text-xl font-bold text-gray-900">My Wallet</h2>
            </div>
            <button
              onClick={() => setShowWalletModal(true)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Card
            </button>
          </div>

          {walletCards.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {walletCards.map((card) => (
                <div
                  key={card.id}
                  className="relative group bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                >
                  <Link href={`/card/${encodeURIComponent(card.card_name)}`}>
                    <div className="aspect-[1.586/1] relative mb-2">
                      <Image
                        src={card.card_image_link
                          ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                          : '/assets/generic-card.svg'}
                        alt={card.card_name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                      />
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
                  </Link>
                  <button
                    onClick={() => handleRemoveFromWallet(card.card_id)}
                    disabled={removingCardId === card.card_id}
                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                    title="Remove from wallet"
                  >
                    <TrashIcon className={`h-4 w-4 ${removingCardId === card.card_id ? 'text-gray-400' : 'text-red-500'}`} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <WalletIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No cards in your wallet yet.</p>
              <p className="text-sm text-gray-400">Add the credit cards you own to track your collection.</p>
            </div>
          )}
        </div>

        {/* Records Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">Your Records</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Your submitted application data points</p>
          </div>
          {records.length > 0 ? (
            <div className="border-t border-gray-200">
              <div className="overflow-x-auto">
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

        {/* Referrals Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">Your Referrals</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Your card referrals</p>
          </div>
          {referrals.length > 0 ? (
            <div className="border-t border-gray-200">
              <div className="overflow-x-auto">
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
      </div>
    </div>
  );
}
