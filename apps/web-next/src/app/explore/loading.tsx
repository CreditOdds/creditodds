export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="text-center mb-8">
          <div className="h-10 bg-gray-200 rounded w-64 mx-auto mb-4 animate-pulse" />
          <div className="h-6 bg-gray-200 rounded w-96 mx-auto animate-pulse" />
        </div>

        {/* Search bar skeleton */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="h-12 bg-gray-200 rounded-lg animate-pulse" />
        </div>

        {/* Filter buttons skeleton */}
        <div className="flex justify-center gap-2 mb-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <div className="h-12 w-20 bg-gray-200 rounded animate-pulse" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-48 mb-2 animate-pulse" />
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
