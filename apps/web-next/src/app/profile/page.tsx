'use client';

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/AuthProvider";
import { getProfile, getRecords, getReferrals } from "@/lib/api";
import ReferralModal from "@/components/forms/ReferralModal";

interface Record {
  record_id: number;
  card_name: string;
  card_image_link?: string;
  credit_score: number;
  listed_income: number;
  length_credit: number;
  result: boolean;
  submit_datetime: string;
}

interface Referral {
  referral_id: number;
  card_id: string;
  card_name: string;
  card_image_link?: string;
  referral_link: string;
  admin_approved: boolean;
}

interface OpenReferral {
  card_id: string;
  card_name: string;
  card_image_link?: string;
}

interface Profile {
  username: string;
  email: string;
  records_count: number;
  referrals_count: number;
}

export default function ProfilePage() {
  const { authState, getSession } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [openReferrals, setOpenReferrals] = useState<OpenReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReferralModal, setShowReferralModal] = useState(false);

  // Only allow referrals for cards where user has submitted a record
  const eligibleReferralCards = useMemo(() => {
    const recordCardNames = new Set(records.map(r => r.card_name));
    return openReferrals.filter(card => recordCardNames.has(card.card_name));
  }, [records, openReferrals]);

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
      const session = await getSession();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = (session as any).idToken?.jwtToken || session.getIdToken().getJwtToken();

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
    } catch (error) {
      console.error("Error loading profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
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
          {profile && (
            <div className="mt-4">
              <p className="text-gray-600">Username: {profile.username}</p>
              <p className="text-gray-600">Email: {profile.email}</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 mb-6">
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

        {/* Records Table */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Records</h2>
          {records.length > 0 ? (
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {records.map((record, index) => (
                    <tr key={record.record_id || index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {record.card_image_link && (
                            <div className="flex-shrink-0 h-10 w-16">
                              <img
                                className="h-10 w-16"
                                src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                                alt=""
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No records submitted yet.</p>
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
                      <th className="relative px-6 py-3">
                        <span className="sr-only">Edit</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {referrals.map((referral, index) => (
                      <tr key={referral.referral_id || index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {referral.card_image_link && (
                              <div className="flex-shrink-0 h-10 w-16">
                                <img
                                  className="h-10 w-16"
                                  src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${referral.card_image_link}`}
                                  alt=""
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
                              href={referral.referral_link}
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
                          Coming soon...
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <a href="#" className="text-indigo-600 hover:text-indigo-900">
                            Edit
                          </a>
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
                Submit a data point for a card to add your referral link
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
      </div>
    </div>
  );
}
