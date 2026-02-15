'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/auth/AuthProvider";
import {
  getAdminStats,
  getAdminRecords,
  getAdminReferrals,
  getAdminAuditLog,
  deleteAdminRecord,
  deleteAdminReferral,
  updateReferralApproval,
  createAdminRecord,
  AdminStats,
  AdminRecord,
  AdminReferral,
  AuditLogEntry,
  Card
} from "@/lib/api";
import { NumericFormat } from "react-number-format";
import {
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  ChartBarIcon,
  DocumentTextIcon,
  LinkIcon,
  ClipboardDocumentListIcon,
  PencilIcon,
  PlusCircleIcon
} from "@heroicons/react/24/outline";

// Master admin user ID (Firebase UID)
const ADMIN_USER_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

type TabType = 'stats' | 'records' | 'referrals' | 'audit' | 'submit';

export default function AdminPage() {
  const { authState, getToken } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('stats');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [referralsTotal, setReferralsTotal] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);

  // Processing states
  const [processingId, setProcessingId] = useState<number | null>(null);

  const isAdmin = authState.user && ADMIN_USER_IDS.includes(authState.user.uid);

  useEffect(() => {
    if (!authState.isLoading && !authState.isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (authState.isAuthenticated && !isAdmin) {
      router.replace("/");
      return;
    }

    if (authState.isAuthenticated && isAdmin) {
      loadData();
    }
  }, [authState.isAuthenticated, authState.isLoading, isAdmin, router]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("No auth token available");
        return;
      }

      // Load all data in parallel
      const [statsData, recordsData, referralsData, auditData] = await Promise.all([
        getAdminStats(token),
        getAdminRecords(token),
        getAdminReferrals(token),
        getAdminAuditLog(token)
      ]);

      setStats(statsData);
      setRecords(recordsData.records);
      setRecordsTotal(recordsData.total);
      setReferrals(referralsData.referrals);
      setReferralsTotal(referralsData.total);
      setAuditLogs(auditData.logs);
      setAuditTotal(auditData.total);
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm("Are you sure you want to delete this record?")) return;

    setProcessingId(recordId);
    try {
      const token = await getToken();
      if (!token) return;

      await deleteAdminRecord(recordId, token);
      setRecords(prev => prev.filter(r => r.record_id !== recordId));
      setRecordsTotal(prev => prev - 1);
      if (stats) setStats({ ...stats, total_records: stats.total_records - 1 });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete record");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveReferral = async (referralId: number, approve: boolean) => {
    setProcessingId(referralId);
    try {
      const token = await getToken();
      if (!token) return;

      await updateReferralApproval(referralId, approve, token);
      setReferrals(prev =>
        prev.map(r =>
          r.referral_id === referralId ? { ...r, admin_approved: approve ? 1 : 0 } : r
        )
      );
      if (stats) {
        const pendingChange = approve ? -1 : 1;
        setStats({ ...stats, pending_referrals: stats.pending_referrals + pendingChange });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update referral");
    } finally {
      setProcessingId(null);
    }
  };

  const handleEditReferral = async (referralId: number, newLink: string) => {
    setProcessingId(referralId);
    try {
      const token = await getToken();
      if (!token) return;

      const referral = referrals.find(r => r.referral_id === referralId);
      if (!referral) return;

      await updateReferralApproval(referralId, !!referral.admin_approved, token, newLink);
      setReferrals(prev =>
        prev.map(r =>
          r.referral_id === referralId ? { ...r, referral_link: newLink } : r
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update referral link");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteReferral = async (referralId: number) => {
    if (!confirm("Are you sure you want to delete this referral?")) return;

    setProcessingId(referralId);
    try {
      const token = await getToken();
      if (!token) return;

      const referral = referrals.find(r => r.referral_id === referralId);
      await deleteAdminReferral(referralId, token);
      setReferrals(prev => prev.filter(r => r.referral_id !== referralId));
      setReferralsTotal(prev => prev - 1);
      if (stats) {
        const newStats = { ...stats, total_referrals: stats.total_referrals - 1 };
        if (referral && !referral.admin_approved) {
          newStats.pending_referrals = stats.pending_referrals - 1;
        }
        setStats(newStats);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete referral");
    } finally {
      setProcessingId(null);
    }
  };

  if (authState.isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!authState.isAuthenticated || !isAdmin) {
    return null;
  }

  const tabs = [
    { id: 'stats' as TabType, name: 'Overview', icon: ChartBarIcon },
    { id: 'records' as TabType, name: 'Records', icon: DocumentTextIcon, count: recordsTotal },
    { id: 'referrals' as TabType, name: 'Referrals', icon: LinkIcon, count: referralsTotal, badge: stats?.pending_referrals },
    { id: 'audit' as TabType, name: 'Audit Log', icon: ClipboardDocumentListIcon },
    { id: 'submit' as TabType, name: 'Submit Record', icon: PlusCircleIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage records, referrals, and view activity</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">{error}</p>
            <button onClick={loadData} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
              Retry
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.name}
                {tab.count !== undefined && (
                  <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-2 bg-yellow-100 text-yellow-800 py-0.5 px-2.5 rounded-full text-xs">
                    {tab.badge} pending
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'stats' && stats && <StatsTab stats={stats} />}
        {activeTab === 'records' && (
          <RecordsTab
            records={records}
            total={recordsTotal}
            processingId={processingId}
            onDelete={handleDeleteRecord}
          />
        )}
        {activeTab === 'referrals' && (
          <ReferralsTab
            referrals={referrals}
            total={referralsTotal}
            processingId={processingId}
            onApprove={handleApproveReferral}
            onDelete={handleDeleteReferral}
            onEdit={handleEditReferral}
          />
        )}
        {activeTab === 'audit' && <AuditTab logs={auditLogs} total={auditTotal} />}
        {activeTab === 'submit' && <SubmitRecordTab getToken={getToken} onSuccess={loadData} />}
      </div>
    </div>
  );
}

// ============ STATS TAB ============
function StatsTab({ stats }: { stats: AdminStats }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Records" value={stats.total_records} />
        <StatCard title="Total Referrals" value={stats.total_referrals} />
        <StatCard title="Total Users" value={stats.total_users} />
        <StatCard title="Pending Referrals" value={stats.pending_referrals} highlight={stats.pending_referrals > 0} />
        <StatCard title="Records Today" value={stats.records_today} />
        <StatCard title="Records This Week" value={stats.records_this_week} />
      </div>

      {/* Top Cards */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Top Cards by Records</h3>
        <div className="space-y-3">
          {stats.top_cards.map((card, index) => (
            <div key={card.card_name} className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-gray-400 w-6">{index + 1}.</span>
                <span className="text-gray-900">{card.card_name}</span>
              </div>
              <span className="text-gray-600 font-medium">{card.count} records</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, highlight = false }: { title: string; value: number; highlight?: boolean }) {
  return (
    <div className={`bg-white shadow rounded-lg p-4 ${highlight ? 'ring-2 ring-yellow-400' : ''}`}>
      <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
      <dd className={`mt-1 text-2xl font-semibold ${highlight ? 'text-yellow-600' : 'text-gray-900'}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

// ============ RECORDS TAB ============
function RecordsTab({
  records,
  total,
  processingId,
  onDelete
}: {
  records: AdminRecord[];
  total: number;
  processingId: number | null;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">All Records ({total})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Card</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Income</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitter</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.map((record) => (
              <tr key={record.record_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    {record.card_image_link && (
                      <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                        <Image
                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${record.card_image_link}`}
                          alt={record.card_name}
                          fill
                          className="object-contain"
                          sizes="48px"
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                        {record.card_name}
                      </div>
                      <div className="text-xs text-gray-500">{record.bank}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{record.credit_score}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  ${record.listed_income?.toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    record.result ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {record.result ? 'Approved' : 'Denied'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm text-gray-900 font-mono text-xs">{record.submitter_id || 'Unknown'}</div>
                  <div className="text-xs text-gray-400">{record.submitter_ip_address}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {new Date(record.submit_datetime).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    onClick={() => onDelete(record.record_id)}
                    disabled={processingId === record.record_id}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ REFERRALS TAB ============
function ReferralsTab({
  referrals,
  total,
  processingId,
  onApprove,
  onDelete,
  onEdit
}: {
  referrals: AdminReferral[];
  total: number;
  processingId: number | null;
  onApprove: (id: number, approve: boolean) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, newLink: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">All Referrals ({total})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Card</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referral Link</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitter</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {referrals.map((referral) => (
              <tr
                key={referral.referral_id}
                className={`hover:bg-gray-50 ${!referral.admin_approved ? 'bg-yellow-50' : ''}`}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    {referral.card_image_link && (
                      <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                        <Image
                          src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${referral.card_image_link}`}
                          alt={referral.card_name}
                          fill
                          className="object-contain"
                          sizes="48px"
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                        {referral.card_name}
                      </div>
                      <div className="text-xs text-gray-500">{referral.bank}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingId === referral.referral_id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onEdit(referral.referral_id, editValue);
                            setEditingId(null);
                          } else if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-full max-w-[250px]"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          onEdit(referral.referral_id, editValue);
                          setEditingId(null);
                        }}
                        className="text-green-600 hover:text-green-800"
                        title="Save"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Cancel"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <a
                        href={referral.referral_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-indigo-600 hover:text-indigo-800 break-all max-w-[200px] block truncate"
                      >
                        {referral.referral_link}
                      </a>
                      <button
                        onClick={() => {
                          setEditingId(referral.referral_id);
                          setEditValue(referral.referral_link);
                        }}
                        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                        title="Edit referral link"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    referral.admin_approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {referral.admin_approved ? 'Approved' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  <div>{referral.impressions} views</div>
                  <div>{referral.clicks} clicks</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-mono text-xs">
                  {referral.submitter_id || 'Unknown'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {new Date(referral.submit_datetime).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!referral.admin_approved ? (
                      <button
                        onClick={() => onApprove(referral.referral_id, true)}
                        disabled={processingId === referral.referral_id}
                        className="text-green-600 hover:text-green-800 disabled:opacity-50"
                        title="Approve"
                      >
                        <CheckIcon className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onApprove(referral.referral_id, false)}
                        disabled={processingId === referral.referral_id}
                        className="text-yellow-600 hover:text-yellow-800 disabled:opacity-50"
                        title="Unapprove"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(referral.referral_id)}
                      disabled={processingId === referral.referral_id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      title="Delete"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ SUBMIT RECORD TAB ============
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

function SubmitRecordTab({ getToken, onSuccess }: { getToken: () => Promise<string | null>; onSuccess: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [cardSearch, setCardSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [submitterName, setSubmitterName] = useState('');
  const [creditScore, setCreditScore] = useState(700);
  const [creditScoreSource, setCreditScoreSource] = useState(0);
  const [income, setIncome] = useState(50000);
  const [dateApplied, setDateApplied] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [lengthCredit, setLengthCredit] = useState(5);
  const [bankCustomer, setBankCustomer] = useState(false);
  const [inquiries3, setInquiries3] = useState(0);
  const [inquiries12, setInquiries12] = useState(0);
  const [inquiries24, setInquiries24] = useState(0);
  const [result, setResult] = useState(true);
  const [startingCreditLimit, setStartingCreditLimit] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/cards`)
      .then(res => res.json())
      .then((data: Card[]) => {
        const active = data.filter(c => c.accepting_applications !== false);
        active.sort((a, b) => a.card_name.localeCompare(b.card_name));
        setCards(active);
      })
      .catch(() => setErrorMessage('Failed to load cards'));
  }, []);

  const filteredCards = cardSearch.trim()
    ? cards.filter(c =>
        c.card_name.toLowerCase().includes(cardSearch.toLowerCase()) ||
        c.bank.toLowerCase().includes(cardSearch.toLowerCase())
      )
    : cards;

  const resetForm = () => {
    setSelectedCard(null);
    setCardSearch('');
    setSubmitterName('');
    setCreditScore(700);
    setCreditScoreSource(0);
    setIncome(50000);
    const now = new Date();
    setDateApplied(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setLengthCredit(5);
    setBankCustomer(false);
    setInquiries3(0);
    setInquiries12(0);
    setInquiries24(0);
    setResult(true);
    setStartingCreditLimit(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) {
      setErrorMessage('Please select a card');
      return;
    }
    if (!submitterName.trim()) {
      setErrorMessage('Please enter a submitter name');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const token = await getToken();
      if (!token) {
        setErrorMessage('No auth token');
        return;
      }

      const [year, month] = dateApplied.split('-');
      const dateAppliedValue = new Date(parseInt(year), parseInt(month) - 1, 15);

      await createAdminRecord({
        card_id: selectedCard.db_card_id || selectedCard.card_id,
        credit_score: creditScore,
        credit_score_source: creditScoreSource,
        result,
        listed_income: income,
        length_credit: lengthCredit,
        starting_credit_limit: result ? startingCreditLimit : undefined,
        date_applied: dateAppliedValue,
        bank_customer: bankCustomer,
        inquiries_3: inquiries3,
        inquiries_12: inquiries12,
        inquiries_24: inquiries24,
        submitter_name: submitterName.trim(),
      }, token);

      setSuccessMessage(`Record submitted for ${selectedCard.card_name}`);
      resetForm();
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit record');
    } finally {
      setSubmitting(false);
    }
  };

  const creditScoreSources = ['FICO: *', 'FICO: Experian', 'FICO: TransUnion', 'FICO: Equifax', 'VantageScore'];

  return (
    <div className="bg-white shadow rounded-lg p-6 max-w-2xl">
      <h3 className="text-lg font-medium text-gray-900 mb-6">Submit Record on Behalf of User</h3>

      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Card Selector */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Card</label>
          {selectedCard ? (
            <div className="flex items-center justify-between border border-gray-300 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                {selectedCard.card_image_link && (
                  <div className="flex-shrink-0 h-6 w-10 relative">
                    <Image
                      src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${selectedCard.card_image_link}`}
                      alt={selectedCard.card_name}
                      fill
                      className="object-contain"
                      sizes="40px"
                    />
                  </div>
                )}
                <span className="text-sm text-gray-900">{selectedCard.card_name}</span>
                <span className="text-xs text-gray-500">({selectedCard.bank})</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCard(null); setCardSearch(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={cardSearch}
                onChange={(e) => { setCardSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search cards..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
              {showDropdown && filteredCards.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredCards.slice(0, 50).map((card) => (
                    <li
                      key={card.card_id}
                      onClick={() => {
                        setSelectedCard(card);
                        setCardSearch(card.card_name);
                        setShowDropdown(false);
                      }}
                      className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm flex items-center gap-2"
                    >
                      {card.card_image_link && (
                        <div className="flex-shrink-0 h-5 w-8 relative">
                          <Image
                            src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                            alt={card.card_name}
                            fill
                            className="object-contain"
                            sizes="32px"
                          />
                        </div>
                      )}
                      <span>{card.card_name}</span>
                      <span className="text-gray-400 text-xs">({card.bank})</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Submitter Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Submitter Name</label>
          <input
            type="text"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder="e.g. Reddit user, email, forum handle..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        {/* Credit Score + Source */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Credit Score</label>
          <div className="flex">
            <input
              type="number"
              value={creditScore}
              onChange={(e) => setCreditScore(parseInt(e.target.value) || 300)}
              min={300}
              max={850}
              className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
            <select
              value={creditScoreSource}
              onChange={(e) => setCreditScoreSource(parseInt(e.target.value))}
              className="border border-l-0 border-gray-300 rounded-r-md px-3 py-2 text-sm bg-gray-50 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {creditScoreSources.map((src, i) => (
                <option key={i} value={i}>{src}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Income */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Annual Income</label>
          <NumericFormat
            value={income}
            onValueChange={(values) => setIncome(values.floatValue || 0)}
            thousandSeparator
            prefix="$"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Application Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Application Date</label>
          <input
            type="month"
            value={dateApplied}
            onChange={(e) => setDateApplied(e.target.value)}
            min="2019-01"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        {/* Age of Oldest Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age of Oldest Account (Years)</label>
          <input
            type="number"
            value={lengthCredit}
            onChange={(e) => setLengthCredit(parseInt(e.target.value) || 0)}
            min={0}
            max={100}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        {/* Bank Customer */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Existing bank customer?
          </label>
          <button
            type="button"
            onClick={() => setBankCustomer(!bankCustomer)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${bankCustomer ? 'bg-indigo-600' : 'bg-gray-200'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${bankCustomer ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Inquiries */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hard Inquiries</label>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last 3 months</label>
              <input
                type="number"
                value={inquiries3}
                onChange={(e) => setInquiries3(parseInt(e.target.value) || 0)}
                min={0}
                max={50}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last 12 months</label>
              <input
                type="number"
                value={inquiries12}
                onChange={(e) => setInquiries12(parseInt(e.target.value) || 0)}
                min={0}
                max={50}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last 24 months</label>
              <input
                type="number"
                value={inquiries24}
                onChange={(e) => setInquiries24(parseInt(e.target.value) || 0)}
                min={0}
                max={50}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Result */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Result</label>
          <div className="flex rounded-md overflow-hidden border border-gray-300">
            <button
              type="button"
              onClick={() => setResult(true)}
              className={`flex-1 py-2 text-sm font-medium ${result ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Approved
            </button>
            <button
              type="button"
              onClick={() => setResult(false)}
              className={`flex-1 py-2 text-sm font-medium ${!result ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              Denied
            </button>
          </div>
        </div>

        {/* Starting Credit Limit (if approved) */}
        {result && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starting Credit Limit</label>
            <NumericFormat
              value={startingCreditLimit}
              onValueChange={(values) => setStartingCreditLimit(values.floatValue || 0)}
              thousandSeparator
              prefix="$"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !selectedCard}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit Record'}
        </button>
      </form>
    </div>
  );
}

// ============ AUDIT TAB ============
function AuditTab({ logs, total }: { logs: AuditLogEntry[]; total: number }) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Audit Log ({total})</h3>
      </div>
      {logs.length === 0 ? (
        <div className="px-4 py-12 text-center text-gray-500">
          No audit log entries yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                      log.action === 'APPROVE' ? 'bg-green-100 text-green-800' :
                      log.action === 'ADMIN_CREATE' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {log.entity_type} #{log.entity_id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {log.admin_email || log.admin_id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                    {log.details ? JSON.stringify(JSON.parse(log.details), null, 0).slice(0, 50) + '...' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
