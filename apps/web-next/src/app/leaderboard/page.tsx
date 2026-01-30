import { Metadata } from "next";
import { getLeaderboard } from "@/lib/api";
import { TrophyIcon, ChartBarIcon, UserGroupIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export const metadata: Metadata = {
  title: "Leaderboard - Top Contributors",
  description: "See the top contributors who have submitted credit card application data points to help others make informed decisions.",
  openGraph: {
    title: "CreditOdds Leaderboard - Top Contributors",
    description: "See the top contributors who have submitted credit card application data points.",
    url: "https://creditodds.com/leaderboard",
  },
  alternates: {
    canonical: "https://creditodds.com/leaderboard",
  },
};

export const revalidate = 300; // Revalidate every 5 minutes

export default async function LeaderboardPage() {
  const { leaderboard, stats } = await getLeaderboard(50);

  const approvalRate = stats.total_records > 0
    ? ((stats.total_approved / stats.total_records) * 100).toFixed(1)
    : "0";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <TrophyIcon className="mx-auto h-16 w-16 text-yellow-500" />
          <h1 className="mt-4 text-4xl font-bold text-gray-900">Leaderboard</h1>
          <p className="mt-2 text-lg text-gray-600">
            Top contributors helping others make informed credit card decisions
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard
            icon={<ChartBarIcon className="h-6 w-6 text-indigo-600" />}
            label="Total Data Points"
            value={stats.total_records.toLocaleString()}
          />
          <StatCard
            icon={<UserGroupIcon className="h-6 w-6 text-indigo-600" />}
            label="Contributors"
            value={stats.total_contributors.toLocaleString()}
          />
          <StatCard
            icon={<CheckCircleIcon className="h-6 w-6 text-green-600" />}
            label="Approvals"
            value={stats.total_approved.toLocaleString()}
          />
          <StatCard
            icon={<XCircleIcon className="h-6 w-6 text-red-600" />}
            label="Denials"
            value={stats.total_denied.toLocaleString()}
          />
        </div>

        {/* Overall Approval Rate */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg p-6 mb-12 text-center text-white">
          <p className="text-sm font-medium opacity-90">Community Approval Rate</p>
          <p className="text-5xl font-bold mt-2">{approvalRate}%</p>
          <p className="text-sm opacity-75 mt-2">
            Based on {stats.total_records.toLocaleString()} data points
          </p>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Top Contributors</h2>
            <p className="text-sm text-gray-500 mt-1">
              Anonymous contributors ranked by data points submitted
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contributor
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data Points
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approved
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Denied
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approval Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((entry, index) => {
                  const rank = index + 1;
                  const approvalRate = entry.records_count > 0
                    ? ((entry.approved_count / entry.records_count) * 100).toFixed(0)
                    : "0";

                  return (
                    <tr
                      key={entry.display_name}
                      className={rank <= 3 ? "bg-yellow-50" : "hover:bg-gray-50"}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {rank === 1 && <span className="text-2xl mr-2">🥇</span>}
                          {rank === 2 && <span className="text-2xl mr-2">🥈</span>}
                          {rank === 3 && <span className="text-2xl mr-2">🥉</span>}
                          {rank > 3 && (
                            <span className="text-gray-500 font-medium w-8">#{rank}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {entry.display_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-sm font-semibold text-gray-900">
                          {entry.records_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-sm text-green-600 font-medium">
                          {entry.approved_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-sm text-red-600 font-medium">
                          {entry.denied_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          parseInt(approvalRate) >= 70
                            ? "bg-green-100 text-green-800"
                            : parseInt(approvalRate) >= 40
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {approvalRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {leaderboard.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">
              No data points submitted yet. Be the first to contribute!
            </div>
          )}
        </div>

        {/* Call to Action */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            Want to see your name on the leaderboard?
          </p>
          <a
            href="/explore"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Submit Your Data Point
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
