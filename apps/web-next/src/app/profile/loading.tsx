export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2 animate-pulse" />
          <div className="h-5 bg-gray-200 rounded w-64 animate-pulse" />
        </div>

        {/* Wallet section skeleton */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-100 rounded-lg p-4">
                  <div className="h-16 bg-gray-200 rounded mb-2 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Records section skeleton */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
          </div>
          <div className="divide-y divide-gray-200">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="h-10 w-16 bg-gray-200 rounded animate-pulse" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-40 mb-1 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                </div>
                <div className="h-6 w-20 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Referrals section skeleton */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-36 animate-pulse" />
          </div>
          <div className="divide-y divide-gray-200">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-48 mb-1 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded w-32 animate-pulse" />
                </div>
                <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
