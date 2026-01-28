export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero section skeleton */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:justify-between">
            <div className="flex-1 min-w-0">
              <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse" />
              <div className="h-5 bg-gray-200 rounded w-32 animate-pulse" />
            </div>
            <div className="mt-5 flex lg:mt-0 lg:ml-4">
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-3 lg:gap-8">
          {/* Card image skeleton */}
          <div className="lg:col-span-1">
            <div className="aspect-[1.586/1] bg-gray-200 rounded-lg animate-pulse" />
          </div>

          {/* Stats skeleton */}
          <div className="mt-8 lg:mt-0 lg:col-span-2">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="grid grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="text-center">
                    <div className="h-4 bg-gray-200 rounded w-20 mx-auto mb-2 animate-pulse" />
                    <div className="h-8 bg-gray-200 rounded w-16 mx-auto animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Charts skeleton */}
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white shadow rounded-lg p-6">
              <div className="h-6 bg-gray-200 rounded w-48 mb-4 animate-pulse" />
              <div className="h-64 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
