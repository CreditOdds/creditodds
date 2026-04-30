'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CardImage from "@/components/ui/CardImage";
import { useAuth } from "@/auth/AuthProvider";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import {
  getAdminStats,
  getAdminRecords,
  getAdminReferrals,
  getAdminAuditLog,
  getAdminSearches,
  getAdminUser,
  getAdminGraphs,
  getCardApplyClicksBreakdown,
  deleteAdminRecord,
  deleteAdminReferral,
  updateReferralApproval,
  createAdminRecord,
  updateAdminRecord,
  AdminStats,
  AdminRecord,
  AdminRecordDetail,
  AdminReferral,
  AdminSearch,
  AdminUserData,
  AuditLogEntry,
  AdminGraphsData,
  CardApplyClickBreakdown,
  Card
} from "@/lib/api";
import dynamic from "next/dynamic";
import { filterCardCatalog, useCardCatalog } from "@/hooks/useCardCatalog";

const TimeSeriesChart = dynamic(() => import("@/components/charts/TimeSeriesChart"), { ssr: false });
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
  PlusCircleIcon,
  MagnifyingGlassIcon,
  UserIcon,
  CreditCardIcon,
  CursorArrowRaysIcon
} from "@heroicons/react/24/outline";

// Master admin user ID (Firebase UID)
const ADMIN_USER_IDS = ['zXOyHmGl7HStyAqEdLsgXLA5inS2'];

// Visible tabs after the Apr 2026 condensation:
//   - 'submit' merged into 'records' (toggle button)
//   - 'searches' + 'audit' merged into 'activity' (sub-tab toggle)
//   - 'applyclicks' merged into 'stats' (rendered as a section)
type TabType = 'stats' | 'records' | 'referrals' | 'activity' | 'user' | 'carddata';
type ActivitySection = 'searches' | 'audit';

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
  const [searches, setSearches] = useState<AdminSearch[]>([]);
  const [searchesTotal, setSearchesTotal] = useState(0);
  const [graphData, setGraphData] = useState<AdminGraphsData | null>(null);
  const [graphDays, setGraphDays] = useState(30);
  const [userLookupId, setUserLookupId] = useState('');

  // UI states for condensed tabs
  const [showSubmitPanel, setShowSubmitPanel] = useState(false);
  const [activitySection, setActivitySection] = useState<ActivitySection>('searches');

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

  const loadGraphs = async (days: number) => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getAdminGraphs(token, days).catch(() => null);
      setGraphData(data);
    } catch (err) {
      console.error("Error loading graphs:", err);
    }
  };

  const handleGraphDaysChange = (days: number) => {
    setGraphDays(days);
    loadGraphs(days);
  };

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
      const [statsData, recordsData, referralsData, auditData, searchesData, graphsData] = await Promise.all([
        getAdminStats(token),
        getAdminRecords(token),
        getAdminReferrals(token),
        getAdminAuditLog(token),
        getAdminSearches(token),
        getAdminGraphs(token, graphDays).catch(() => null)
      ]);

      setStats(statsData);
      setRecords(recordsData.records);
      setRecordsTotal(recordsData.total);
      setReferrals(referralsData.referrals);
      setReferralsTotal(referralsData.total);
      setAuditLogs(auditData.logs);
      setAuditTotal(auditData.total);
      setSearches(searchesData.searches);
      setSearchesTotal(searchesData.total);
      setGraphData(graphsData);
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

  const handleUserLookup = (userId: string) => {
    setUserLookupId(userId);
    setActiveTab('user');
  };

  if (authState.isLoading || loading) {
    return (
      <div className="landing-v2 admin-v2" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
          Loading admin dashboard…
        </div>
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
    { id: 'activity' as TabType, name: 'Activity', icon: ClipboardDocumentListIcon },
    { id: 'user' as TabType, name: 'User Lookup', icon: UserIcon },
    { id: 'carddata' as TabType, name: 'Card Data', icon: CreditCardIcon },
  ];

  return (
    <div className="landing-v2 admin-v2">
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
        {activeTab === 'stats' && stats && (
          <div className="space-y-8">
            <StatsTab
              stats={stats}
              graphData={graphData}
              graphDays={graphDays}
              onGraphDaysChange={handleGraphDaysChange}
            />
            <ApplyClicksTab />
          </div>
        )}
        {activeTab === 'records' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={() => setShowSubmitPanel((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50"
              >
                <PlusCircleIcon className="h-5 w-5" />
                {showSubmitPanel ? 'Hide submit form' : 'Submit Record'}
              </button>
            </div>
            {showSubmitPanel && (
              <SubmitRecordTab
                getToken={getToken}
                onSuccess={() => {
                  setShowSubmitPanel(false);
                  loadData();
                }}
              />
            )}
            <RecordsTab
              records={records}
              total={recordsTotal}
              processingId={processingId}
              onDelete={handleDeleteRecord}
            />
          </div>
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
        {activeTab === 'activity' && (
          <div className="space-y-4">
            <div className="inline-flex rounded-md shadow-sm border border-gray-200 bg-white p-1">
              <button
                onClick={() => setActivitySection('searches')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded ${
                  activitySection === 'searches'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                Searches
                <span className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                  activitySection === 'searches' ? 'bg-indigo-500/30 text-white' : 'bg-gray-100 text-gray-700'
                }`}>{searchesTotal}</span>
              </button>
              <button
                onClick={() => setActivitySection('audit')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded ${
                  activitySection === 'audit'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <ClipboardDocumentListIcon className="h-4 w-4" />
                Audit Log
                <span className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                  activitySection === 'audit' ? 'bg-indigo-500/30 text-white' : 'bg-gray-100 text-gray-700'
                }`}>{auditTotal}</span>
              </button>
            </div>
            {activitySection === 'searches' ? (
              <SearchesTab
                searches={searches}
                total={searchesTotal}
                onUserClick={handleUserLookup}
              />
            ) : (
              <AuditTab logs={auditLogs} total={auditTotal} />
            )}
          </div>
        )}
        {activeTab === 'user' && (
          <UserLookupTab
            getToken={getToken}
            initialUserId={userLookupId}
          />
        )}
        {activeTab === 'carddata' && (
          <CardDataTab getToken={getToken} />
        )}
      </div>
      <V2Footer />
    </div>
  );
}

// ============ STATS TAB ============
function toTimeSeries(data: { date: string; count: number }[]): [number, number][] {
  return data.map(d => [new Date(d.date).getTime(), d.count]);
}

const GRAPH_RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: '1y', days: 365 },
];

function StatsTab({ stats, graphData, graphDays, onGraphDaysChange }: {
  stats: AdminStats;
  graphData: AdminGraphsData | null;
  graphDays: number;
  onGraphDaysChange: (days: number) => void;
}) {
  const rangeLabel = GRAPH_RANGES.find(r => r.days === graphDays)?.label || `${graphDays}d`;

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

      {/* Time Range Picker + Charts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Activity Charts</h3>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {GRAPH_RANGES.map(range => (
              <button
                key={range.days}
                onClick={() => onGraphDaysChange(range.days)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  graphDays === range.days
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {graphData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimeSeriesChart
              title={`Records per Day (Last ${rangeLabel})`}
              series={[{
                name: "Records",
                color: "#6366f1",
                data: toTimeSeries(graphData.records_daily),
              }]}
              yAxisTitle="Records"
            />
            <TimeSeriesChart
              title={`Searches per Day (Last ${rangeLabel})`}
              series={[{
                name: "Searches",
                color: "#8b5cf6",
                data: toTimeSeries(graphData.searches_daily),
              }]}
              yAxisTitle="Searches"
            />
          </div>
        )}
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

// ============ APPLY CLICKS TAB ============
const APPLY_CLICK_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
  { label: 'All', days: 0 },
];

type ApplyClickSortKey = 'total' | 'direct' | 'referral';

interface ApplyClickRow {
  cardId: number;
  cardName: string;
  cardImageLink?: string;
  direct: number;
  referral: number;
  total: number;
}

function ApplyClicksTab() {
  const { cards } = useCardCatalog();
  const [periodDays, setPeriodDays] = useState(30);
  const [breakdown, setBreakdown] = useState<Record<number, CardApplyClickBreakdown>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ApplyClickSortKey>('total');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setLoadError(null);
    getCardApplyClicksBreakdown(periodDays)
      .then((data) => {
        if (!isMounted) return;
        setBreakdown(data);
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadError('Failed to load apply click data');
        setBreakdown({});
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [periodDays]);

  const cardsByDbId = new Map<number, Card>();
  for (const card of cards) {
    if (typeof card.db_card_id === 'number') {
      cardsByDbId.set(card.db_card_id, card);
    }
  }

  const rows: ApplyClickRow[] = Object.entries(breakdown).map(([id, counts]) => {
    const dbId = Number(id);
    const card = cardsByDbId.get(dbId);
    return {
      cardId: dbId,
      cardName: card?.card_name ?? `Card #${dbId}`,
      cardImageLink: card?.card_image_link,
      direct: counts.direct,
      referral: counts.referral,
      total: counts.total,
    };
  });

  rows.sort((a, b) => b[sortKey] - a[sortKey] || b.total - a.total);

  const totals = rows.reduce(
    (acc, row) => {
      acc.direct += row.direct;
      acc.referral += row.referral;
      acc.total += row.total;
      return acc;
    },
    { direct: 0, referral: 0, total: 0 }
  );

  const rangeLabel =
    APPLY_CLICK_RANGES.find((r) => r.days === periodDays)?.label ?? `${periodDays}d`;

  return (
    <div className="space-y-6">
      {/* Header + Range Picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <CursorArrowRaysIcon className="h-5 w-5 text-indigo-500" />
            Apply Clicks
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Outbound clicks on card apply buttons, broken down by direct vs referral.
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {APPLY_CLICK_RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setPeriodDays(range.days)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                periodDays === range.days
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={`Total Clicks (${rangeLabel})`} value={totals.total} />
        <StatCard title="Direct Apply" value={totals.direct} />
        <StatCard title="Referral Apply" value={totals.referral} />
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Per-card table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Top Cards by Apply Clicks ({rangeLabel})
          </h3>
          <span className="text-xs text-gray-500">{rows.length} cards</span>
        </div>
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No apply clicks recorded in this window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                    Card
                  </th>
                  <SortableHeader
                    label="Direct"
                    active={sortKey === 'direct'}
                    onClick={() => setSortKey('direct')}
                  />
                  <SortableHeader
                    label="Referral"
                    active={sortKey === 'referral'}
                    onClick={() => setSortKey('referral')}
                  />
                  <SortableHeader
                    label="Total"
                    active={sortKey === 'total'}
                    onClick={() => setSortKey('total')}
                  />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, index) => (
                  <tr key={row.cardId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                          <CardImage
                            cardImageLink={row.cardImageLink}
                            alt={row.cardName}
                            width={48}
                            height={32}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {row.cardName}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 tabular-nums">
                      {row.direct.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 tabular-nums">
                      {row.referral.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 tabular-nums">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${
          active ? 'text-indigo-600' : 'hover:text-gray-700'
        }`}
      >
        {label}
        {active && <span aria-hidden>↓</span>}
      </button>
    </th>
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Income</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Result</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Submitter</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.map((record) => (
              <tr key={record.record_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                      <CardImage
                        cardImageLink={record.card_image_link}
                        alt={record.card_name}
                        fill
                        className="object-contain"
                        sizes="48px"
                      />
                    </div>
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Referral Link</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Stats</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Submitter</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
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
                    <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                      <CardImage
                        cardImageLink={referral.card_image_link}
                        alt={referral.card_name}
                        fill
                        className="object-contain"
                        sizes="48px"
                      />
                    </div>
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
                  <div className="flex flex-col gap-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full inline-block w-fit ${
                      referral.admin_approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {referral.admin_approved ? 'Approved' : 'Pending'}
                    </span>
                    {referral.archived_at && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 inline-block w-fit">
                        Archived
                      </span>
                    )}
                  </div>
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

// ============ SEARCHES TAB ============
function SearchesTab({
  searches,
  total,
  onUserClick
}: {
  searches: AdminSearch[];
  total: number;
  onUserClick: (userId: string) => void;
}) {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Approval Searches ({total})</h3>
      </div>
      {searches.length === 0 ? (
        <div className="px-4 py-12 text-center text-gray-500">
          No approval searches yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">User ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credit Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Income</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credit Length</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {searches.map((search) => (
                <tr key={search.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => onUserClick(search.user_id)}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-mono"
                    >
                      {search.user_id}
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{search.credit_score}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    ${search.income?.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {search.length_credit} years
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(search.created_at).toLocaleString()}
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

// ============ USER LOOKUP TAB ============
function UserLookupTab({
  getToken,
  initialUserId
}: {
  getToken: () => Promise<string | null>;
  initialUserId: string;
}) {
  const [userId, setUserId] = useState(initialUserId);
  const [userData, setUserData] = useState<AdminUserData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => {
    if (initialUserId) {
      setUserId(initialUserId);
      doLookup(initialUserId);
    }
  }, [initialUserId]);

  const doLookup = async (uid?: string) => {
    const lookupId = uid || userId;
    if (!lookupId.trim()) return;

    setLookupLoading(true);
    setLookupError('');
    setUserData(null);

    try {
      const token = await getToken();
      if (!token) {
        setLookupError('No auth token');
        return;
      }
      const data = await getAdminUser(lookupId.trim(), token);
      setUserData(data);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Failed to look up user');
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Look Up User by Firebase UID</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLookup()}
            placeholder="Enter Firebase UID..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={() => doLookup()}
            disabled={lookupLoading || !userId.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {lookupLoading ? 'Loading...' : 'Look Up'}
          </button>
        </div>
        {lookupError && (
          <p className="mt-2 text-sm text-red-600">{lookupError}</p>
        )}
      </div>

      {userData && (
        <>
          {/* Wallet */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-4 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-medium text-gray-900">Wallet ({userData.wallet.length})</h3>
            </div>
            {userData.wallet.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No cards in wallet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Bank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Acquired</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Added</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userData.wallet.map((card) => (
                      <tr key={card.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                              <CardImage
                                cardImageLink={card.card_image_link}
                                alt={card.card_name}
                                fill
                                className="object-contain"
                                sizes="48px"
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900">{card.card_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{card.bank}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {card.acquired_month && card.acquired_year
                            ? `${card.acquired_month}/${card.acquired_year}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(card.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Records */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-4 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-medium text-gray-900">Records ({userData.records.length})</h3>
            </div>
            {userData.records.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No records.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Income</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Result</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userData.records.map((record) => (
                      <tr key={record.record_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                              <CardImage
                                cardImageLink={record.card_image_link}
                                alt={record.card_name}
                                fill
                                className="object-contain"
                                sizes="48px"
                              />
                            </div>
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
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(record.submit_datetime).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Searches */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-4 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-medium text-gray-900">Approval Searches ({userData.searches.length})</h3>
            </div>
            {userData.searches.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No searches.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credit Score</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Income</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credit Length</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userData.searches.map((search) => (
                      <tr key={search.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{search.credit_score}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          ${search.income?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {search.length_credit} years
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(search.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Referrals */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-4 sm:px-6 border-b border-gray-200">
              <h3 className="text-base font-medium text-gray-900">Referrals ({userData.referrals.length})</h3>
            </div>
            {userData.referrals.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">No referrals.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Card</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Link</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Stats</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {userData.referrals.map((referral) => (
                      <tr key={referral.referral_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-12 relative mr-3">
                              <CardImage
                                cardImageLink={referral.card_image_link}
                                alt={referral.card_name}
                                fill
                                className="object-contain"
                                sizes="48px"
                              />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                                {referral.card_name}
                              </div>
                              <div className="text-xs text-gray-500">{referral.bank}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={referral.referral_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-600 hover:text-indigo-800 break-all max-w-[200px] block truncate"
                          >
                            {referral.referral_link}
                          </a>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full inline-block w-fit ${
                              referral.admin_approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {referral.admin_approved ? 'Approved' : 'Pending'}
                            </span>
                            {referral.archived_at && (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 inline-block w-fit">
                                Archived
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          <div>{referral.impressions} views</div>
                          <div>{referral.clicks} clicks</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(referral.submit_datetime).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============ CARD DATA TAB ============
const CREDIT_SCORE_SOURCES = ['FICO: *', 'FICO: Experian', 'FICO: TransUnion', 'FICO: Equifax', 'VantageScore'];

function CardDataTab({ getToken }: { getToken: () => Promise<string | null> }) {
  const { cards } = useCardCatalog();
  const [cardSearch, setCardSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [cardRecords, setCardRecords] = useState<AdminRecordDetail[]>([]);
  const [cardRecordsTotal, setCardRecordsTotal] = useState(0);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [editingRecord, setEditingRecord] = useState<AdminRecordDetail | null>(null);

  const filteredCards = filterCardCatalog(cards, cardSearch);

  const loadCardRecords = async (card: Card) => {
    setLoadingRecords(true);
    try {
      const token = await getToken();
      if (!token) return;
      const dbCardId = card.db_card_id || card.card_id;
      const data = await getAdminRecords(token, 500, 0, typeof dbCardId === 'number' ? dbCardId : parseInt(String(dbCardId)));
      setCardRecords(data.records as AdminRecordDetail[]);
      setCardRecordsTotal(data.total);
    } catch (err) {
      console.error("Error loading card records:", err);
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleSelectCard = (card: Card) => {
    setSelectedCard(card);
    setCardSearch(card.card_name);
    setShowDropdown(false);
    setEditingRecord(null);
    loadCardRecords(card);
  };

  const handleDeleteRecord = async (recordId: number) => {
    if (!confirm("Are you sure you want to delete this data point?")) return;
    setProcessingId(recordId);
    try {
      const token = await getToken();
      if (!token) return;
      await deleteAdminRecord(recordId, token);
      setCardRecords(prev => prev.filter(r => r.record_id !== recordId));
      setCardRecordsTotal(prev => prev - 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete record");
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateRecord = async (data: { record_id: number; [key: string]: unknown }) => {
    setProcessingId(data.record_id);
    try {
      const token = await getToken();
      if (!token) return;
      await updateAdminRecord(data, token);
      // Reload records to get fresh data
      if (selectedCard) await loadCardRecords(selectedCard);
      setEditingRecord(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update record");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Card Selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select a Card</h3>
        <div className="relative max-w-lg">
          {selectedCard ? (
            <div className="flex items-center justify-between border border-gray-300 rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 h-6 w-10 relative">
                  <CardImage
                    cardImageLink={selectedCard.card_image_link}
                    alt={selectedCard.card_name}
                    fill
                    className="object-contain"
                    sizes="40px"
                  />
                </div>
                <span className="text-sm text-gray-900">{selectedCard.card_name}</span>
                <span className="text-xs text-gray-500">({selectedCard.bank})</span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCard(null); setCardSearch(''); setCardRecords([]); setCardRecordsTotal(0); }}
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
                      onClick={() => handleSelectCard(card)}
                      className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm flex items-center gap-2"
                    >
                      <div className="flex-shrink-0 h-5 w-8 relative">
                        <CardImage
                          cardImageLink={card.card_image_link}
                          alt={card.card_name}
                          fill
                          className="object-contain"
                          sizes="32px"
                        />
                      </div>
                      <span>{card.card_name}</span>
                      <span className="text-gray-400 text-xs">({card.bank})</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* Records for Selected Card */}
      {selectedCard && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Data Points ({cardRecordsTotal})
            </h3>
          </div>

          {loadingRecords ? (
            <div className="px-4 py-12 text-center text-gray-500">Loading data points...</div>
          ) : cardRecords.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-500">No data points for this card.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">ID</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Score</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Source</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Income</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Credit Age</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Result</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Limit</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Bank Cust.</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Inquiries</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Applied</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">Submitter</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cardRecords.map((record) => (
                    <tr key={record.record_id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                        {record.record_id}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.credit_score}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                        {record.credit_score_source !== undefined ? CREDIT_SCORE_SOURCES[record.credit_score_source] || '-' : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        ${record.listed_income?.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.length_credit != null ? `${record.length_credit}y` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          record.result ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {record.result ? 'Approved' : 'Denied'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.starting_credit_limit != null ? `$${record.starting_credit_limit.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.bank_customer !== undefined ? (record.bank_customer ? 'Yes' : 'No') : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                        {record.inquiries_3 != null || record.inquiries_12 != null || record.inquiries_24 != null
                          ? `${record.inquiries_3 ?? '-'}/${record.inquiries_12 ?? '-'}/${record.inquiries_24 ?? '-'}`
                          : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {record.date_applied ? new Date(record.date_applied).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-400 font-mono max-w-[100px] truncate">
                        {record.submitter_id || '-'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditingRecord(record)}
                            className="text-indigo-600 hover:text-indigo-800"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(record.record_id)}
                            disabled={processingId === record.record_id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          processing={processingId === editingRecord.record_id}
          onSave={handleUpdateRecord}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </div>
  );
}

function EditRecordModal({
  record,
  processing,
  onSave,
  onClose
}: {
  record: AdminRecordDetail;
  processing: boolean;
  onSave: (data: { record_id: number; [key: string]: unknown }) => void;
  onClose: () => void;
}) {
  const [creditScore, setCreditScore] = useState(record.credit_score);
  const [creditScoreSource, setCreditScoreSource] = useState(record.credit_score_source ?? 0);
  const [income, setIncome] = useState(record.listed_income);
  const [lengthCredit, setLengthCredit] = useState<number | null>(record.length_credit ?? null);
  const [result, setResult] = useState(!!record.result);
  const [startingCreditLimit, setStartingCreditLimit] = useState<number | null>(record.starting_credit_limit ?? null);
  const [bankCustomer, setBankCustomer] = useState(!!record.bank_customer);
  const [inquiries3, setInquiries3] = useState<number | null>(record.inquiries_3 ?? null);
  const [inquiries12, setInquiries12] = useState<number | null>(record.inquiries_12 ?? null);
  const [inquiries24, setInquiries24] = useState<number | null>(record.inquiries_24 ?? null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      record_id: record.record_id,
      credit_score: creditScore,
      credit_score_source: creditScoreSource,
      listed_income: income,
      length_credit: lengthCredit,
      result,
      starting_credit_limit: result ? startingCreditLimit : null,
      bank_customer: bankCustomer,
      inquiries_3: inquiries3,
      inquiries_12: inquiries12,
      inquiries_24: inquiries24,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Edit Record #{record.record_id}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              />
              <select
                value={creditScoreSource}
                onChange={(e) => setCreditScoreSource(parseInt(e.target.value))}
                className="border border-l-0 border-gray-300 rounded-r-md px-3 py-2 text-sm bg-gray-50 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {CREDIT_SCORE_SOURCES.map((src, i) => (
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

          {/* Age of Oldest Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Age of Oldest Account (Years)</label>
            <input
              type="number"
              value={lengthCredit ?? ''}
              onChange={(e) => setLengthCredit(e.target.value === '' ? null : parseInt(e.target.value))}
              min={0}
              max={100}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Bank Customer */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Existing bank customer?</label>
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
                <label className="block text-xs text-gray-500 mb-1">Last 3 mo</label>
                <input
                  type="number"
                  value={inquiries3 ?? ''}
                  onChange={(e) => setInquiries3(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last 12 mo</label>
                <input
                  type="number"
                  value={inquiries12 ?? ''}
                  onChange={(e) => setInquiries12(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last 24 mo</label>
                <input
                  type="number"
                  value={inquiries24 ?? ''}
                  onChange={(e) => setInquiries24(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
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
                value={startingCreditLimit ?? ''}
                onValueChange={(values) => setStartingCreditLimit(values.floatValue ?? null)}
                thousandSeparator
                prefix="$"
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={processing}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {processing ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============ SUBMIT RECORD TAB ============

function SubmitRecordTab({ getToken, onSuccess }: { getToken: () => Promise<string | null>; onSuccess: () => void }) {
  const { cards, error: cardCatalogError } = useCardCatalog({ activeOnly: true });
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
  const [lengthCredit, setLengthCredit] = useState<number | null>(null);
  const [bankCustomer, setBankCustomer] = useState(false);
  const [inquiries3, setInquiries3] = useState<number | null>(null);
  const [inquiries12, setInquiries12] = useState<number | null>(null);
  const [inquiries24, setInquiries24] = useState<number | null>(null);
  const [result, setResult] = useState(true);
  const [startingCreditLimit, setStartingCreditLimit] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (cardCatalogError) {
      setErrorMessage(cardCatalogError);
    }
  }, [cardCatalogError]);

  const filteredCards = filterCardCatalog(cards, cardSearch);

  const resetForm = () => {
    setSelectedCard(null);
    setCardSearch('');
    setSubmitterName('');
    setCreditScore(700);
    setCreditScoreSource(0);
    setIncome(50000);
    const now = new Date();
    setDateApplied(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setLengthCredit(null);
    setBankCustomer(false);
    setInquiries3(null);
    setInquiries12(null);
    setInquiries24(null);
    setResult(true);
    setStartingCreditLimit(null);
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
        length_credit: lengthCredit ?? undefined,
        starting_credit_limit: result && startingCreditLimit != null ? startingCreditLimit : undefined,
        date_applied: dateAppliedValue,
        bank_customer: bankCustomer,
        inquiries_3: inquiries3 ?? undefined,
        inquiries_12: inquiries12 ?? undefined,
        inquiries_24: inquiries24 ?? undefined,
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
                <div className="flex-shrink-0 h-6 w-10 relative">
                  <CardImage
                    cardImageLink={selectedCard.card_image_link}
                    alt={selectedCard.card_name}
                    fill
                    className="object-contain"
                    sizes="40px"
                  />
                </div>
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
                      <div className="flex-shrink-0 h-5 w-8 relative">
                        <CardImage
                          cardImageLink={card.card_image_link}
                          alt={card.card_name}
                          fill
                          className="object-contain"
                          sizes="32px"
                        />
                      </div>
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
            value={lengthCredit ?? ''}
            onChange={(e) => setLengthCredit(e.target.value === '' ? null : parseInt(e.target.value))}
            min={0}
            max={100}
            placeholder="Optional"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
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
                value={inquiries3 ?? ''}
                onChange={(e) => setInquiries3(e.target.value === '' ? null : parseInt(e.target.value))}
                min={0}
                max={50}
                placeholder="-"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last 12 months</label>
              <input
                type="number"
                value={inquiries12 ?? ''}
                onChange={(e) => setInquiries12(e.target.value === '' ? null : parseInt(e.target.value))}
                min={0}
                max={50}
                placeholder="-"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Last 24 months</label>
              <input
                type="number"
                value={inquiries24 ?? ''}
                onChange={(e) => setInquiries24(e.target.value === '' ? null : parseInt(e.target.value))}
                min={0}
                max={50}
                placeholder="-"
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
              value={startingCreditLimit ?? ''}
              onValueChange={(values) => setStartingCreditLimit(values.floatValue ?? null)}
              thousandSeparator
              prefix="$"
              placeholder="Optional"
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Details</th>
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
