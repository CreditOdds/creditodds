/**
 * Skeleton loading components (#6)
 */

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={classNames(
        "animate-pulse bg-gray-200 rounded",
        className || ""
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white shadow rounded-lg p-6 animate-pulse">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-16 w-24 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Skeleton className="h-10 w-16 rounded" />
          <div className="ml-4 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-4 w-12" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-4 w-16" />
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <Skeleton className="h-6 w-20 rounded-full" />
      </td>
    </tr>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Profile Header - Compact */}
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-6 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <Skeleton className="h-7 w-40 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            {/* Stats pills - 4 columns on mobile */}
            <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-3">
              <Skeleton className="h-14 w-full sm:w-20 rounded-lg" />
              <Skeleton className="h-14 w-full sm:w-20 rounded-lg" />
              <Skeleton className="h-14 w-full sm:w-20 rounded-lg" />
              <Skeleton className="h-14 w-full sm:w-20 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
            <Skeleton className="h-10 w-20 sm:w-24" />
            <Skeleton className="h-10 w-20 sm:w-24" />
            <Skeleton className="h-10 w-20 sm:w-24" />
          </nav>
        </div>

        {/* Main Content Grid - Single column on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Tab Content (full width on mobile, 2/3 on desktop) */}
          <div className="col-span-1 lg:col-span-2">
            <div className="bg-white shadow rounded-lg p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
              {/* Wallet cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-lg p-3 bg-gray-50">
                    <Skeleton className="aspect-[1.586/1] w-full mb-2 rounded" />
                    <Skeleton className="h-3 w-3/4 mb-1" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - News Sidebar (1/3 on desktop, below on mobile) */}
          <div className="col-span-1">
            <div className="bg-white shadow rounded-lg overflow-hidden animate-pulse">
              <div className="px-4 py-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="h-5 w-32" />
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-4 w-16 rounded" />
                    </div>
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CardPageSkeleton() {
  return (
    <div className="bg-gray-50">
      {/* Breadcrumbs */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4 py-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </nav>

      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Card Header */}
          <div className="text-center pt-6 pb-6 sm:pt-14 sm:pb-10">
            <Skeleton className="h-10 w-80 mx-auto mb-4" />
            <Skeleton className="h-4 w-24 mx-auto" />
          </div>

          {/* Card Info Section */}
          <div className="sm:flex pb-6 animate-pulse">
            <Skeleton className="h-56 w-96 mb-4 sm:mb-0 sm:mr-4 mx-auto" />
            <div className="w-full px-12">
              <Skeleton className="h-6 w-full max-w-md mx-auto mb-6" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="py-5 bg-white shadow rounded-lg">
                  <Skeleton className="h-4 w-20 mx-auto mb-2" />
                  <Skeleton className="h-10 w-16 mx-auto" />
                </div>
                <div className="py-5 bg-white shadow rounded-lg">
                  <Skeleton className="h-4 w-16 mx-auto mb-2" />
                  <Skeleton className="h-10 w-20 mx-auto" />
                </div>
                <div className="py-5 bg-white shadow rounded-lg">
                  <Skeleton className="h-4 w-28 mx-auto mb-2" />
                  <Skeleton className="h-10 w-12 mx-auto" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
