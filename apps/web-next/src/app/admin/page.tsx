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
      <div className="landing-v2 admin-v2">
        <div className="av-terminal">
          <nav className="av-crumbs" aria-label="Breadcrumb">
            <span className="av-crumb-current">Admin</span>
          </nav>
          <span className="av-spacer" />
          <span className="av-term-status">
            <span className="av-status-dot" />
            loading…
          </span>
        </div>
        <div className="av-loading">Loading admin dashboard…</div>
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
    <div className="landing-v2 admin-v2" data-tab={activeTab}>
      <div className="av-terminal">
        <nav className="av-crumbs" aria-label="Breadcrumb">
          <span className="av-crumb-current">Admin</span>
          <span className="av-crumb-sep">/</span>
          <span>{tabs.find(t => t.id === activeTab)?.name.toLowerCase()}</span>
        </nav>
        <span className="av-spacer" />
        <span className="av-term-status">
          <span className="av-status-dot" />
          authenticated{authState.user?.email ? ` · ${authState.user.email}` : ''}
        </span>
      </div>

      <main className="av-main">
        <div className="av-wrap">
          <div className="av-snapshot">
            <div className="av-snapshot-row">
              <h1 className="av-snapshot-h1">
                Admin <em>console.</em>
              </h1>
              <div className="av-snapshot-meta">
                records · referrals · users · activity
              </div>
            </div>
          </div>

          {error && (
            <div className="av-banner av-banner-err" role="alert">
              <span>{error}</span>
              <button onClick={loadData}>retry</button>
            </div>
          )}

          <div className="av-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={'av-tab' + (activeTab === tab.id ? ' active' : '')}
              >
                <tab.icon className="av-tab-icon" />
                {tab.name}
                {tab.count !== undefined && (
                  <span className="av-tab-count">· {tab.count.toLocaleString()}</span>
                )}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="av-tab-badge">{tab.badge} pending</span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'stats' && stats && (
            <>
              <StatsTab
                stats={stats}
                graphData={graphData}
                graphDays={graphDays}
                onGraphDaysChange={handleGraphDaysChange}
              />
              <ApplyClicksTab />
            </>
          )}
          {activeTab === 'records' && (
            <section className="av-section">
              <div className="av-section-head">
                <div>
                  <h2 className="av-section-h">
                    <DocumentTextIcon className="av-section-h-icon" />
                    All records
                  </h2>
                  <p className="av-section-sub">{recordsTotal.toLocaleString()} total · click submit to add on behalf of a user</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSubmitPanel((v) => !v)}
                  className="av-btn av-btn-outline"
                >
                  <PlusCircleIcon className="av-btn-icon" />
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
                processingId={processingId}
                onDelete={handleDeleteRecord}
              />
            </section>
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
            <section className="av-section">
              <div className="av-section-head">
                <h2 className="av-section-h">
                  <ClipboardDocumentListIcon className="av-section-h-icon" />
                  Activity
                </h2>
                <div className="av-pilltabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activitySection === 'searches'}
                    onClick={() => setActivitySection('searches')}
                    className={'av-pilltab' + (activitySection === 'searches' ? ' active' : '')}
                  >
                    <MagnifyingGlassIcon className="av-pilltab-icon" />
                    Searches
                    <span className="av-pilltab-count">{searchesTotal.toLocaleString()}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activitySection === 'audit'}
                    onClick={() => setActivitySection('audit')}
                    className={'av-pilltab' + (activitySection === 'audit' ? ' active' : '')}
                  >
                    <ClipboardDocumentListIcon className="av-pilltab-icon" />
                    Audit Log
                    <span className="av-pilltab-count">{auditTotal.toLocaleString()}</span>
                  </button>
                </div>
              </div>
              {activitySection === 'searches' ? (
                <SearchesTab searches={searches} onUserClick={handleUserLookup} />
              ) : (
                <AuditTab logs={auditLogs} />
              )}
            </section>
          )}
          {activeTab === 'user' && (
            <UserLookupTab getToken={getToken} initialUserId={userLookupId} />
          )}
          {activeTab === 'carddata' && (
            <CardDataTab getToken={getToken} />
          )}
        </div>
      </main>
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
    <>
      <section className="av-section">
        <div className="av-section-head">
          <div>
            <h2 className="av-section-h">
              <ChartBarIcon className="av-section-h-icon" />
              Snapshot
            </h2>
            <p className="av-section-sub">live counts across records, referrals, and users.</p>
          </div>
        </div>
        <div className="av-readoff av-readoff-6">
          <div className="av-readoff-cell">
            <div className="av-readoff-k">Records</div>
            <div className="av-readoff-v">{stats.total_records.toLocaleString()}</div>
            <div className="av-readoff-foot">total submitted</div>
          </div>
          <div className="av-readoff-cell">
            <div className="av-readoff-k">Referrals</div>
            <div className="av-readoff-v">{stats.total_referrals.toLocaleString()}</div>
            <div className="av-readoff-foot">total tracked</div>
          </div>
          <div className="av-readoff-cell">
            <div className="av-readoff-k">Users</div>
            <div className="av-readoff-v">{stats.total_users.toLocaleString()}</div>
            <div className="av-readoff-foot">accounts</div>
          </div>
          <div className={"av-readoff-cell" + (stats.pending_referrals > 0 ? " av-hl" : "")}>
            <div className="av-readoff-k">Pending refs</div>
            <div className={"av-readoff-v" + (stats.pending_referrals > 0 ? " av-warn" : "")}>
              {stats.pending_referrals.toLocaleString()}
            </div>
            <div className="av-readoff-foot">awaiting review</div>
          </div>
          <div className="av-readoff-cell">
            <div className="av-readoff-k">Today</div>
            <div className="av-readoff-v">{stats.records_today.toLocaleString()}</div>
            <div className="av-readoff-foot">records last 24h</div>
          </div>
          <div className="av-readoff-cell">
            <div className="av-readoff-k">This week</div>
            <div className="av-readoff-v">{stats.records_this_week.toLocaleString()}</div>
            <div className="av-readoff-foot">records last 7d</div>
          </div>
        </div>
      </section>

      <section className="av-section">
        <div className="av-section-head">
          <div>
            <h2 className="av-section-h">Activity charts</h2>
            <p className="av-section-sub">daily records and approval searches over the selected window.</p>
          </div>
          <div className="av-range">
            {GRAPH_RANGES.map(range => (
              <button
                key={range.days}
                type="button"
                onClick={() => onGraphDaysChange(range.days)}
                className={'av-range-btn' + (graphDays === range.days ? ' active' : '')}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {graphData && (
          <div className="av-chart-grid">
            <div className="av-chart-panel">
              <TimeSeriesChart
                title={`Records per Day (Last ${rangeLabel})`}
                series={[{
                  name: "Records",
                  color: "#6d3fe8",
                  data: toTimeSeries(graphData.records_daily),
                }]}
                yAxisTitle="Records"
              />
            </div>
            <div className="av-chart-panel">
              <TimeSeriesChart
                title={`Searches per Day (Last ${rangeLabel})`}
                series={[{
                  name: "Searches",
                  color: "#4a25b5",
                  data: toTimeSeries(graphData.searches_daily),
                }]}
                yAxisTitle="Searches"
              />
            </div>
          </div>
        )}
      </section>

      <section className="av-section">
        <div className="av-section-head">
          <div>
            <h2 className="av-section-h">Top cards by records</h2>
            <p className="av-section-sub">most-submitted cards across the catalog.</p>
          </div>
        </div>
        <div className="av-list">
          {stats.top_cards.map((card, index) => (
            <div key={card.card_name} className="av-list-row">
              <span className="av-list-rank">{index + 1}</span>
              <span>{card.card_name}</span>
              <span className="av-list-num">{card.count.toLocaleString()} records</span>
            </div>
          ))}
        </div>
      </section>
    </>
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

type ApplyClickSortKey = 'total' | 'direct' | 'referral' | 'unique_total';

interface ApplyClickRow {
  cardId: number;
  cardName: string;
  cardImageLink?: string;
  direct: number;
  referral: number;
  total: number;
  unique_total: number;
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
      unique_total: counts.unique_total,
    };
  });

  rows.sort((a, b) => b[sortKey] - a[sortKey] || b.total - a.total);

  const totals = rows.reduce(
    (acc, row) => {
      acc.direct += row.direct;
      acc.referral += row.referral;
      acc.total += row.total;
      acc.unique_total += row.unique_total;
      return acc;
    },
    { direct: 0, referral: 0, total: 0, unique_total: 0 }
  );

  const rangeLabel =
    APPLY_CLICK_RANGES.find((r) => r.days === periodDays)?.label ?? `${periodDays}d`;

  return (
    <section className="av-section">
      <div className="av-section-head">
        <div>
          <h2 className="av-section-h">
            <CursorArrowRaysIcon className="av-section-h-icon" />
            Apply clicks
          </h2>
          <p className="av-section-sub">outbound clicks on card apply buttons, direct vs referral.</p>
        </div>
        <div className="av-range">
          {APPLY_CLICK_RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setPeriodDays(range.days)}
              className={'av-range-btn' + (periodDays === range.days ? ' active' : '')}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="av-readoff av-readoff-4">
        <div className="av-readoff-cell">
          <div className="av-readoff-k">Total clicks</div>
          <div className="av-readoff-v">{totals.total.toLocaleString()}</div>
          <div className="av-readoff-foot">last {rangeLabel}</div>
        </div>
        <div className="av-readoff-cell">
          <div className="av-readoff-k">Unique visitors</div>
          <div className="av-readoff-v">{totals.unique_total.toLocaleString()}</div>
          <div className="av-readoff-foot">deduplicated</div>
        </div>
        <div className="av-readoff-cell">
          <div className="av-readoff-k">Direct</div>
          <div className="av-readoff-v">{totals.direct.toLocaleString()}</div>
          <div className="av-readoff-foot">card apply link</div>
        </div>
        <div className="av-readoff-cell">
          <div className="av-readoff-k">Referral</div>
          <div className="av-readoff-v av-accent">{totals.referral.toLocaleString()}</div>
          <div className="av-readoff-foot">via user referral</div>
        </div>
      </div>

      {loadError && (
        <div className="av-banner av-banner-err" style={{ marginTop: 14 }}>
          {loadError}
        </div>
      )}

      <div className="av-section-head" style={{ marginTop: 24 }}>
        <h3 className="av-section-h" style={{ fontSize: 14 }}>Top cards by apply clicks ({rangeLabel})</h3>
        <span className="av-section-meta">{rows.length} cards</span>
      </div>

      {loading ? (
        <div className="av-tape av-tape-empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="av-tape av-tape-empty">No apply clicks recorded in this window.</div>
      ) : (
        <div className="av-tape av-tape-clicks">
          <div className="av-tape-scroll">
            <div className="av-tape-head" style={{ gridTemplateColumns: '32px minmax(220px, 1.6fr) 90px 90px 90px 90px' }}>
              <span>#</span>
              <span>Card</span>
              <button type="button" onClick={() => setSortKey('direct')} className={sortKey === 'direct' ? 'active' : ''}>Direct {sortKey === 'direct' && '↓'}</button>
              <button type="button" onClick={() => setSortKey('referral')} className={sortKey === 'referral' ? 'active' : ''}>Referral {sortKey === 'referral' && '↓'}</button>
              <button type="button" onClick={() => setSortKey('total')} className={sortKey === 'total' ? 'active' : ''}>Total {sortKey === 'total' && '↓'}</button>
              <button type="button" onClick={() => setSortKey('unique_total')} className={sortKey === 'unique_total' ? 'active' : ''}>Unique {sortKey === 'unique_total' && '↓'}</button>
            </div>
            {rows.map((row, index) => (
              <div key={row.cardId} className="av-tape-row" style={{ gridTemplateColumns: '32px minmax(220px, 1.6fr) 90px 90px 90px 90px' }}>
                <span className="av-list-num">{index + 1}</span>
                <div className="av-card-cell">
                  <div className="av-thumb">
                    <CardImage
                      cardImageLink={row.cardImageLink}
                      alt={row.cardName}
                      width={36}
                      height={22}
                    />
                  </div>
                  <div className="av-card-meta">
                    <div className="av-card-name">{row.cardName}</div>
                  </div>
                </div>
                <span>{row.direct.toLocaleString()}</span>
                <span>{row.referral.toLocaleString()}</span>
                <span style={{ fontWeight: 600 }}>{row.total.toLocaleString()}</span>
                <span className="av-mono" style={{ color: 'var(--ink-2)' }}>{row.unique_total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ============ RECORDS TAB ============
function RecordsTab({
  records,
  processingId,
  onDelete
}: {
  records: AdminRecord[];
  processingId: number | null;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="av-tape">
      <div className="av-tape-scroll">
        <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(220px, 1.6fr) 70px 110px 90px minmax(180px, 1.4fr) 90px 36px' }}>
          <span>Card</span>
          <span>Score</span>
          <span>Income</span>
          <span>Result</span>
          <span>Submitter</span>
          <span>Date</span>
          <span />
        </div>
        {records.length === 0 ? (
          <div className="av-tape-empty">No records yet.</div>
        ) : records.map((record) => (
          <div key={record.record_id} className="av-tape-row" style={{ gridTemplateColumns: 'minmax(220px, 1.6fr) 70px 110px 90px minmax(180px, 1.4fr) 90px 36px' }}>
            <div className="av-card-cell">
              <div className="av-thumb">
                <CardImage cardImageLink={record.card_image_link} alt={record.card_name} fill className="object-contain" sizes="48px" />
              </div>
              <div className="av-card-meta">
                <div className="av-card-name">{record.card_name}</div>
                <div className="av-card-issuer">{record.bank}</div>
              </div>
            </div>
            <span>{record.credit_score}</span>
            <span>${record.listed_income?.toLocaleString()}</span>
            <span>
              <span className={'av-pill ' + (record.result ? 'av-pill-app' : 'av-pill-den')}>
                {record.result ? 'Approved' : 'Denied'}
              </span>
            </span>
            <div>
              <div className="av-mono" style={{ color: 'var(--ink)' }}>{record.submitter_id || 'Unknown'}</div>
              {record.submitter_ip_address && <div className="av-mono">{record.submitter_ip_address}</div>}
            </div>
            <span className="av-mono">{new Date(record.submit_datetime).toLocaleDateString()}</span>
            <div className="av-row-actions">
              <button
                type="button"
                onClick={() => onDelete(record.record_id)}
                disabled={processingId === record.record_id}
                className="av-row-action-btn av-action-danger"
                title="Delete"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
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
    <section className="av-section">
      <div className="av-section-head">
        <div>
          <h2 className="av-section-h">
            <LinkIcon className="av-section-h-icon" />
            All referrals
          </h2>
          <p className="av-section-sub">{total.toLocaleString()} total · pending rows highlighted.</p>
        </div>
      </div>
      <div className="av-tape">
        <div className="av-tape-scroll">
          <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 1.6fr) 100px 110px 140px 90px 70px' }}>
            <span>Card</span>
            <span>Referral link</span>
            <span>Status</span>
            <span>Stats</span>
            <span>Submitter</span>
            <span>Date</span>
            <span />
          </div>
          {referrals.length === 0 ? (
            <div className="av-tape-empty">No referrals.</div>
          ) : referrals.map((referral) => (
            <div
              key={referral.referral_id}
              className={'av-tape-row' + (!referral.admin_approved ? ' av-tape-pending' : '')}
              style={{ gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 1.6fr) 100px 110px 140px 90px 70px' }}
            >
              <div className="av-card-cell">
                <div className="av-thumb">
                  <CardImage cardImageLink={referral.card_image_link} alt={referral.card_name} fill className="object-contain" sizes="48px" />
                </div>
                <div className="av-card-meta">
                  <div className="av-card-name">{referral.card_name}</div>
                  <div className="av-card-issuer">{referral.bank}</div>
                </div>
              </div>
              <div>
                {editingId === referral.referral_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                      className="av-input"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onEdit(referral.referral_id, editValue);
                        setEditingId(null);
                      }}
                      className="av-row-action-btn av-action-approve"
                      title="Save"
                    >
                      <CheckIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="av-row-action-btn"
                      title="Cancel"
                    >
                      <XMarkIcon />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <a
                      href={referral.referral_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="av-link"
                      style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}
                    >
                      {referral.referral_link}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(referral.referral_id);
                        setEditValue(referral.referral_link);
                      }}
                      className="av-row-action-btn av-action-edit"
                      title="Edit referral link"
                    >
                      <PencilIcon />
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className={'av-pill ' + (referral.admin_approved ? 'av-pill-app' : 'av-pill-pen')}>
                  {referral.admin_approved ? 'Approved' : 'Pending'}
                </span>
                {referral.archived_at && (
                  <span className="av-pill av-pill-arch">Archived</span>
                )}
              </div>
              <div className="av-mono" style={{ color: 'var(--ink-2)' }}>
                <div>{referral.impressions} views</div>
                <div>{referral.clicks} clicks{typeof referral.unique_clicks === 'number' ? ` (${referral.unique_clicks} uniq)` : ''}</div>
              </div>
              <div className="av-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {referral.submitter_id || 'Unknown'}
              </div>
              <span className="av-mono">{new Date(referral.submit_datetime).toLocaleDateString()}</span>
              <div className="av-row-actions">
                {!referral.admin_approved ? (
                  <button
                    type="button"
                    onClick={() => onApprove(referral.referral_id, true)}
                    disabled={processingId === referral.referral_id}
                    className="av-row-action-btn av-action-approve"
                    title="Approve"
                  >
                    <CheckIcon />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onApprove(referral.referral_id, false)}
                    disabled={processingId === referral.referral_id}
                    className="av-row-action-btn"
                    title="Unapprove"
                  >
                    <XMarkIcon />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(referral.referral_id)}
                  disabled={processingId === referral.referral_id}
                  className="av-row-action-btn av-action-danger"
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ SEARCHES TAB ============
function SearchesTab({
  searches,
  onUserClick
}: {
  searches: AdminSearch[];
  onUserClick: (userId: string) => void;
}) {
  return (
    <div className="av-tape">
      <div className="av-tape-scroll">
        <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(180px, 1.4fr) 110px 110px 110px 160px' }}>
          <span>User ID</span>
          <span>Credit Score</span>
          <span>Income</span>
          <span>Credit Length</span>
          <span>Date</span>
        </div>
        {searches.length === 0 ? (
          <div className="av-tape-empty">No approval searches yet.</div>
        ) : searches.map((search) => (
          <div key={search.id} className="av-tape-row" style={{ gridTemplateColumns: 'minmax(180px, 1.4fr) 110px 110px 110px 160px' }}>
            <button type="button" onClick={() => onUserClick(search.user_id)} className="av-link av-mono" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {search.user_id}
            </button>
            <span>{search.credit_score}</span>
            <span>${search.income?.toLocaleString()}</span>
            <span>{search.length_credit} years</span>
            <span className="av-mono">{new Date(search.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
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
    <>
      <section className="av-section">
        <div className="av-section-head">
          <div>
            <h2 className="av-section-h">
              <UserIcon className="av-section-h-icon" />
              User lookup
            </h2>
            <p className="av-section-sub">Find a user by Firebase UID. Returns wallet, records, searches, and referrals.</p>
          </div>
        </div>
        <div className="av-panel">
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLookup()}
              placeholder="Firebase UID…"
              className="av-input av-input-mono"
            />
            <button
              type="button"
              onClick={() => doLookup()}
              disabled={lookupLoading || !userId.trim()}
              className="av-btn av-btn-primary"
            >
              {lookupLoading ? 'Loading…' : 'Look up'}
            </button>
          </div>
          {lookupError && (
            <div className="av-banner av-banner-err" style={{ marginTop: 10 }}>
              {lookupError}
            </div>
          )}
        </div>
      </section>

      {userData && (
        <>
          <section className="av-section">
            <div className="av-section-head">
              <h3 className="av-section-h" style={{ fontSize: 14 }}>Wallet</h3>
              <span className="av-section-meta">{userData.wallet.length} cards</span>
            </div>
            <div className="av-tape">
              <div className="av-tape-scroll">
                <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(220px, 2fr) 1fr 100px 110px' }}>
                  <span>Card</span>
                  <span>Bank</span>
                  <span>Acquired</span>
                  <span>Added</span>
                </div>
                {userData.wallet.length === 0 ? (
                  <div className="av-tape-empty">No cards in wallet.</div>
                ) : userData.wallet.map((card) => (
                  <div key={card.id} className="av-tape-row" style={{ gridTemplateColumns: 'minmax(220px, 2fr) 1fr 100px 110px' }}>
                    <div className="av-card-cell">
                      <div className="av-thumb">
                        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="48px" />
                      </div>
                      <div className="av-card-name">{card.card_name}</div>
                    </div>
                    <span className="av-mono">{card.bank}</span>
                    <span className="av-mono">
                      {card.acquired_month && card.acquired_year ? `${card.acquired_month}/${card.acquired_year}` : '—'}
                    </span>
                    <span className="av-mono">{new Date(card.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="av-section">
            <div className="av-section-head">
              <h3 className="av-section-h" style={{ fontSize: 14 }}>Records</h3>
              <span className="av-section-meta">{userData.records.length} entries</span>
            </div>
            <div className="av-tape">
              <div className="av-tape-scroll">
                <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(220px, 1.6fr) 70px 110px 90px 110px' }}>
                  <span>Card</span>
                  <span>Score</span>
                  <span>Income</span>
                  <span>Result</span>
                  <span>Date</span>
                </div>
                {userData.records.length === 0 ? (
                  <div className="av-tape-empty">No records.</div>
                ) : userData.records.map((record) => (
                  <div key={record.record_id} className="av-tape-row" style={{ gridTemplateColumns: 'minmax(220px, 1.6fr) 70px 110px 90px 110px' }}>
                    <div className="av-card-cell">
                      <div className="av-thumb">
                        <CardImage cardImageLink={record.card_image_link} alt={record.card_name} fill className="object-contain" sizes="48px" />
                      </div>
                      <div className="av-card-meta">
                        <div className="av-card-name">{record.card_name}</div>
                        <div className="av-card-issuer">{record.bank}</div>
                      </div>
                    </div>
                    <span>{record.credit_score}</span>
                    <span>${record.listed_income?.toLocaleString()}</span>
                    <span>
                      <span className={'av-pill ' + (record.result ? 'av-pill-app' : 'av-pill-den')}>
                        {record.result ? 'Approved' : 'Denied'}
                      </span>
                    </span>
                    <span className="av-mono">{new Date(record.submit_datetime).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="av-section">
            <div className="av-section-head">
              <h3 className="av-section-h" style={{ fontSize: 14 }}>Approval searches</h3>
              <span className="av-section-meta">{userData.searches.length} entries</span>
            </div>
            <div className="av-tape">
              <div className="av-tape-scroll">
                <div className="av-tape-head" style={{ gridTemplateColumns: '110px 110px 130px 1fr' }}>
                  <span>Credit Score</span>
                  <span>Income</span>
                  <span>Credit Length</span>
                  <span>Date</span>
                </div>
                {userData.searches.length === 0 ? (
                  <div className="av-tape-empty">No searches.</div>
                ) : userData.searches.map((search) => (
                  <div key={search.id} className="av-tape-row" style={{ gridTemplateColumns: '110px 110px 130px 1fr' }}>
                    <span>{search.credit_score}</span>
                    <span>${search.income?.toLocaleString()}</span>
                    <span>{search.length_credit} years</span>
                    <span className="av-mono">{new Date(search.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="av-section">
            <div className="av-section-head">
              <h3 className="av-section-h" style={{ fontSize: 14 }}>Referrals</h3>
              <span className="av-section-meta">{userData.referrals.length} entries</span>
            </div>
            <div className="av-tape">
              <div className="av-tape-scroll">
                <div className="av-tape-head" style={{ gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 1.4fr) 110px 110px 110px' }}>
                  <span>Card</span>
                  <span>Link</span>
                  <span>Status</span>
                  <span>Stats</span>
                  <span>Date</span>
                </div>
                {userData.referrals.length === 0 ? (
                  <div className="av-tape-empty">No referrals.</div>
                ) : userData.referrals.map((referral) => (
                  <div key={referral.referral_id} className="av-tape-row" style={{ gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 1.4fr) 110px 110px 110px' }}>
                    <div className="av-card-cell">
                      <div className="av-thumb">
                        <CardImage cardImageLink={referral.card_image_link} alt={referral.card_name} fill className="object-contain" sizes="48px" />
                      </div>
                      <div className="av-card-meta">
                        <div className="av-card-name">{referral.card_name}</div>
                        <div className="av-card-issuer">{referral.bank}</div>
                      </div>
                    </div>
                    <a
                      href={referral.referral_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="av-link"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}
                    >
                      {referral.referral_link}
                    </a>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className={'av-pill ' + (referral.admin_approved ? 'av-pill-app' : 'av-pill-pen')}>
                        {referral.admin_approved ? 'Approved' : 'Pending'}
                      </span>
                      {referral.archived_at && <span className="av-pill av-pill-arch">Archived</span>}
                    </div>
                    <div className="av-mono" style={{ color: 'var(--ink-2)' }}>
                      <div>{referral.impressions} views</div>
                      <div>{referral.clicks} clicks{typeof referral.unique_clicks === 'number' ? ` (${referral.unique_clicks} uniq)` : ''}</div>
                    </div>
                    <span className="av-mono">{new Date(referral.submit_datetime).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </>
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
    <>
      <section className="av-section">
        <div className="av-section-head">
          <div>
            <h2 className="av-section-h">
              <CreditCardIcon className="av-section-h-icon" />
              Card data
            </h2>
            <p className="av-section-sub">Inspect and edit individual data points by card.</p>
          </div>
        </div>
        <div className="av-cardselect">
          {selectedCard ? (
            <div className="av-cardselect-chip">
              <div className="av-thumb av-thumb-sm">
                <CardImage cardImageLink={selectedCard.card_image_link} alt={selectedCard.card_name} fill className="object-contain" sizes="40px" />
              </div>
              <div className="av-card-meta" style={{ flex: 1 }}>
                <div className="av-card-name">{selectedCard.card_name}</div>
                <div className="av-card-issuer">{selectedCard.bank}</div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCard(null); setCardSearch(''); setCardRecords([]); setCardRecordsTotal(0); }}
                className="av-row-action-btn"
                title="Clear"
              >
                <XMarkIcon />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={cardSearch}
                onChange={(e) => { setCardSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search cards…"
                className="av-input"
              />
              {showDropdown && filteredCards.length > 0 && (
                <ul className="av-cardselect-dd">
                  {filteredCards.slice(0, 50).map((card) => (
                    <li key={card.card_id} onClick={() => handleSelectCard(card)}>
                      <div className="av-thumb av-thumb-sm">
                        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="32px" />
                      </div>
                      <span>{card.card_name}</span>
                      <span className="av-card-issuer">({card.bank})</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      {selectedCard && (
        <section className="av-section">
          <div className="av-section-head">
            <h3 className="av-section-h" style={{ fontSize: 14 }}>Data points</h3>
            <span className="av-section-meta">{cardRecordsTotal.toLocaleString()} for {selectedCard.card_name}</span>
          </div>

          {loadingRecords ? (
            <div className="av-tape av-tape-empty">Loading data points…</div>
          ) : cardRecords.length === 0 ? (
            <div className="av-tape av-tape-empty">No data points for this card.</div>
          ) : (
            <div className="av-tape">
              <div className="av-tape-scroll">
                <div className="av-tape-head" style={{ gridTemplateColumns: '60px 70px 130px 90px 80px 90px 90px 80px 90px 90px minmax(120px, 1fr) 60px' }}>
                  <span>ID</span>
                  <span>Score</span>
                  <span>Source</span>
                  <span>Income</span>
                  <span>Credit Age</span>
                  <span>Result</span>
                  <span>Limit</span>
                  <span>Bank cust.</span>
                  <span>Inquiries</span>
                  <span>Applied</span>
                  <span>Submitter</span>
                  <span />
                </div>
                {cardRecords.map((record) => (
                  <div key={record.record_id} className="av-tape-row" style={{ gridTemplateColumns: '60px 70px 130px 90px 80px 90px 90px 80px 90px 90px minmax(120px, 1fr) 60px' }}>
                    <span className="av-mono">{record.record_id}</span>
                    <span>{record.credit_score}</span>
                    <span className="av-mono">{record.credit_score_source !== undefined ? CREDIT_SCORE_SOURCES[record.credit_score_source] || '-' : '-'}</span>
                    <span>${record.listed_income?.toLocaleString()}</span>
                    <span>{record.length_credit != null ? `${record.length_credit}y` : '-'}</span>
                    <span>
                      <span className={'av-pill ' + (record.result ? 'av-pill-app' : 'av-pill-den')}>
                        {record.result ? 'Approved' : 'Denied'}
                      </span>
                    </span>
                    <span>{record.starting_credit_limit != null ? `$${record.starting_credit_limit.toLocaleString()}` : '-'}</span>
                    <span>{record.bank_customer !== undefined ? (record.bank_customer ? 'Yes' : 'No') : '-'}</span>
                    <span className="av-mono">
                      {record.inquiries_3 != null || record.inquiries_12 != null || record.inquiries_24 != null
                        ? `${record.inquiries_3 ?? '-'}/${record.inquiries_12 ?? '-'}/${record.inquiries_24 ?? '-'}`
                        : '-'}
                    </span>
                    <span className="av-mono">
                      {record.date_applied ? new Date(record.date_applied).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '-'}
                    </span>
                    <span className="av-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.submitter_id || '-'}
                    </span>
                    <div className="av-row-actions">
                      <button
                        type="button"
                        onClick={() => setEditingRecord(record)}
                        className="av-row-action-btn av-action-edit"
                        title="Edit"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(record.record_id)}
                        disabled={processingId === record.record_id}
                        className="av-row-action-btn av-action-danger"
                        title="Delete"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          processing={processingId === editingRecord.record_id}
          onSave={handleUpdateRecord}
          onClose={() => setEditingRecord(null)}
        />
      )}
    </>
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
    <div className="landing-v2 admin-v2">
      <div className="av-modal-overlay" onClick={onClose}>
        <div className="av-modal" onClick={(e) => e.stopPropagation()}>
          <div className="av-modal-head">
            <h3 className="av-modal-h">Edit record #{record.record_id}</h3>
            <button type="button" onClick={onClose} className="av-modal-close" title="Close">
              <XMarkIcon style={{ width: 18, height: 18 }} />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="av-modal-body">
              <div className="av-field">
                <label className="av-field-label">Credit Score</label>
                <div className="av-inputgroup">
                  <input
                    type="number"
                    value={creditScore}
                    onChange={(e) => setCreditScore(parseInt(e.target.value) || 300)}
                    min={300}
                    max={850}
                    className="av-input"
                  />
                  <select
                    value={creditScoreSource}
                    onChange={(e) => setCreditScoreSource(parseInt(e.target.value))}
                    className="av-select"
                  >
                    {CREDIT_SCORE_SOURCES.map((src, i) => (
                      <option key={i} value={i}>{src}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="av-field">
                <label className="av-field-label">Annual Income</label>
                <NumericFormat
                  value={income}
                  onValueChange={(values) => setIncome(values.floatValue || 0)}
                  thousandSeparator
                  prefix="$"
                  className="av-input"
                />
              </div>

              <div className="av-field">
                <label className="av-field-label">Age of Oldest Account (years)</label>
                <input
                  type="number"
                  value={lengthCredit ?? ''}
                  onChange={(e) => setLengthCredit(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0}
                  max={100}
                  placeholder="Optional"
                  className="av-input"
                />
              </div>

              <div className="av-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="av-field-label" style={{ margin: 0 }}>Existing bank customer?</label>
                <button
                  type="button"
                  onClick={() => setBankCustomer(!bankCustomer)}
                  className={'av-switch' + (bankCustomer ? ' on' : '')}
                  aria-pressed={bankCustomer}
                >
                  <span className="av-switch-thumb" />
                </button>
              </div>

              <div className="av-field">
                <label className="av-field-label">Hard Inquiries</label>
                <div className="av-grid-3">
                  <div className="av-field">
                    <span className="av-field-sub">Last 3 mo</span>
                    <input
                      type="number"
                      value={inquiries3 ?? ''}
                      onChange={(e) => setInquiries3(e.target.value === '' ? null : parseInt(e.target.value))}
                      min={0} max={50} placeholder="-"
                      className="av-input"
                    />
                  </div>
                  <div className="av-field">
                    <span className="av-field-sub">Last 12 mo</span>
                    <input
                      type="number"
                      value={inquiries12 ?? ''}
                      onChange={(e) => setInquiries12(e.target.value === '' ? null : parseInt(e.target.value))}
                      min={0} max={50} placeholder="-"
                      className="av-input"
                    />
                  </div>
                  <div className="av-field">
                    <span className="av-field-sub">Last 24 mo</span>
                    <input
                      type="number"
                      value={inquiries24 ?? ''}
                      onChange={(e) => setInquiries24(e.target.value === '' ? null : parseInt(e.target.value))}
                      min={0} max={50} placeholder="-"
                      className="av-input"
                    />
                  </div>
                </div>
              </div>

              <div className="av-field">
                <label className="av-field-label">Result</label>
                <div className="av-result-toggle">
                  <button
                    type="button"
                    onClick={() => setResult(true)}
                    className={'av-result-btn av-result-approved' + (result ? ' active' : '')}
                  >
                    Approved
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(false)}
                    className={'av-result-btn av-result-denied' + (!result ? ' active' : '')}
                  >
                    Denied
                  </button>
                </div>
              </div>

              {result && (
                <div className="av-field">
                  <label className="av-field-label">Starting Credit Limit</label>
                  <NumericFormat
                    value={startingCreditLimit ?? ''}
                    onValueChange={(values) => setStartingCreditLimit(values.floatValue ?? null)}
                    thousandSeparator
                    prefix="$"
                    placeholder="Optional"
                    className="av-input"
                  />
                </div>
              )}
            </div>
            <div className="av-modal-foot">
              <button type="submit" disabled={processing} className="av-btn av-btn-primary">
                {processing ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={onClose} className="av-btn av-btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </div>
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
    <div className="av-panel" style={{ maxWidth: 720, padding: 0 }}>
      <div className="av-panel-head">
        <h3 className="av-panel-h">Submit record on behalf of user</h3>
        <span className="av-panel-meta">manual entry — bypasses signup</span>
      </div>
      <div style={{ padding: '18px' }}>
        {successMessage && (
          <div className="av-banner av-banner-ok" style={{ marginTop: 0, marginBottom: 14 }}>
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="av-banner av-banner-err" style={{ marginTop: 0, marginBottom: 14 }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="av-field">
            <label className="av-field-label">Card</label>
            <div className="av-cardselect" style={{ maxWidth: 'none' }}>
              {selectedCard ? (
                <div className="av-cardselect-chip">
                  <div className="av-thumb av-thumb-sm">
                    <CardImage cardImageLink={selectedCard.card_image_link} alt={selectedCard.card_name} fill className="object-contain" sizes="40px" />
                  </div>
                  <div className="av-card-meta" style={{ flex: 1 }}>
                    <div className="av-card-name">{selectedCard.card_name}</div>
                    <div className="av-card-issuer">{selectedCard.bank}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedCard(null); setCardSearch(''); }}
                    className="av-row-action-btn"
                    title="Clear"
                  >
                    <XMarkIcon />
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={(e) => { setCardSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Search cards…"
                    className="av-input"
                  />
                  {showDropdown && filteredCards.length > 0 && (
                    <ul className="av-cardselect-dd">
                      {filteredCards.slice(0, 50).map((card) => (
                        <li
                          key={card.card_id}
                          onClick={() => {
                            setSelectedCard(card);
                            setCardSearch(card.card_name);
                            setShowDropdown(false);
                          }}
                        >
                          <div className="av-thumb av-thumb-sm">
                            <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="32px" />
                          </div>
                          <span>{card.card_name}</span>
                          <span className="av-card-issuer">({card.bank})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="av-field">
            <label className="av-field-label">Submitter name</label>
            <input
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="e.g. Reddit user, email, forum handle…"
              className="av-input"
              required
            />
          </div>

          <div className="av-field">
            <label className="av-field-label">Credit score</label>
            <div className="av-inputgroup">
              <input
                type="number"
                value={creditScore}
                onChange={(e) => setCreditScore(parseInt(e.target.value) || 300)}
                min={300}
                max={850}
                className="av-input"
                required
              />
              <select
                value={creditScoreSource}
                onChange={(e) => setCreditScoreSource(parseInt(e.target.value))}
                className="av-select"
              >
                {creditScoreSources.map((src, i) => (
                  <option key={i} value={i}>{src}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="av-grid-2">
            <div className="av-field">
              <label className="av-field-label">Annual income</label>
              <NumericFormat
                value={income}
                onValueChange={(values) => setIncome(values.floatValue || 0)}
                thousandSeparator
                prefix="$"
                className="av-input"
              />
            </div>
            <div className="av-field">
              <label className="av-field-label">Application date</label>
              <input
                type="month"
                value={dateApplied}
                onChange={(e) => setDateApplied(e.target.value)}
                min="2019-01"
                className="av-input"
                required
              />
            </div>
          </div>

          <div className="av-field">
            <label className="av-field-label">Age of oldest account (years)</label>
            <input
              type="number"
              value={lengthCredit ?? ''}
              onChange={(e) => setLengthCredit(e.target.value === '' ? null : parseInt(e.target.value))}
              min={0}
              max={100}
              placeholder="Optional"
              className="av-input"
            />
          </div>

          <div className="av-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="av-field-label" style={{ margin: 0 }}>Existing bank customer?</label>
            <button
              type="button"
              onClick={() => setBankCustomer(!bankCustomer)}
              className={'av-switch' + (bankCustomer ? ' on' : '')}
              aria-pressed={bankCustomer}
            >
              <span className="av-switch-thumb" />
            </button>
          </div>

          <div className="av-field">
            <label className="av-field-label">Hard inquiries</label>
            <div className="av-grid-3">
              <div className="av-field">
                <span className="av-field-sub">Last 3 months</span>
                <input
                  type="number"
                  value={inquiries3 ?? ''}
                  onChange={(e) => setInquiries3(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
                  className="av-input"
                />
              </div>
              <div className="av-field">
                <span className="av-field-sub">Last 12 months</span>
                <input
                  type="number"
                  value={inquiries12 ?? ''}
                  onChange={(e) => setInquiries12(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
                  className="av-input"
                />
              </div>
              <div className="av-field">
                <span className="av-field-sub">Last 24 months</span>
                <input
                  type="number"
                  value={inquiries24 ?? ''}
                  onChange={(e) => setInquiries24(e.target.value === '' ? null : parseInt(e.target.value))}
                  min={0} max={50} placeholder="-"
                  className="av-input"
                />
              </div>
            </div>
          </div>

          <div className="av-field">
            <label className="av-field-label">Result</label>
            <div className="av-result-toggle">
              <button
                type="button"
                onClick={() => setResult(true)}
                className={'av-result-btn av-result-approved' + (result ? ' active' : '')}
              >
                Approved
              </button>
              <button
                type="button"
                onClick={() => setResult(false)}
                className={'av-result-btn av-result-denied' + (!result ? ' active' : '')}
              >
                Denied
              </button>
            </div>
          </div>

          {result && (
            <div className="av-field">
              <label className="av-field-label">Starting credit limit</label>
              <NumericFormat
                value={startingCreditLimit ?? ''}
                onValueChange={(values) => setStartingCreditLimit(values.floatValue ?? null)}
                thousandSeparator
                prefix="$"
                placeholder="Optional"
                className="av-input"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedCard}
            className="av-btn av-btn-primary"
            style={{ alignSelf: 'flex-start', padding: '9px 20px' }}
          >
            {submitting ? 'Submitting…' : 'Submit record'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============ AUDIT TAB ============
function AuditTab({ logs }: { logs: AuditLogEntry[] }) {
  const pillForAction = (a: string) =>
    a === 'DELETE' ? 'av-pill-den'
    : a === 'APPROVE' ? 'av-pill-app'
    : a === 'ADMIN_CREATE' ? 'av-pill-info'
    : 'av-pill';

  return (
    <div className="av-tape">
      <div className="av-tape-scroll">
        <div className="av-tape-head" style={{ gridTemplateColumns: '100px 140px minmax(140px, 1fr) 160px minmax(140px, 1.4fr)' }}>
          <span>Action</span>
          <span>Entity</span>
          <span>Admin</span>
          <span>Date</span>
          <span>Details</span>
        </div>
        {logs.length === 0 ? (
          <div className="av-tape-empty">No audit log entries yet.</div>
        ) : logs.map((log) => (
          <div key={log.id} className="av-tape-row" style={{ gridTemplateColumns: '100px 140px minmax(140px, 1fr) 160px minmax(140px, 1.4fr)' }}>
            <span>
              <span className={'av-pill ' + pillForAction(log.action)}>{log.action}</span>
            </span>
            <span>{log.entity_type} #{log.entity_id}</span>
            <span className="av-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.admin_email || log.admin_id}</span>
            <span className="av-mono">{new Date(log.created_at).toLocaleString()}</span>
            <span className="av-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {log.details ? JSON.stringify(JSON.parse(log.details), null, 0).slice(0, 80) + '…' : '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
