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
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Profile Header Skeleton */}
        <div className="bg-white shadow rounded-lg p-6 mb-6 animate-pulse">
          <Skeleton className="h-8 w-32 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>

        {/* Stats Skeleton */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg animate-pulse">
            <div className="px-4 py-5 sm:p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-16" />
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg animate-pulse">
            <div className="px-4 py-5 sm:p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 w-16" />
            </div>
          </div>
        </div>

        {/* Records Table Skeleton */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3"><Skeleton className="h-3 w-12" /></th>
                  <th className="px-6 py-3"><Skeleton className="h-3 w-20" /></th>
                  <th className="px-6 py-3"><Skeleton className="h-3 w-16" /></th>
                  <th className="px-6 py-3"><Skeleton className="h-3 w-14" /></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <TableRowSkeleton />
                <TableRowSkeleton />
                <TableRowSkeleton />
              </tbody>
            </table>
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
