'use client';

import dynamic from 'next/dynamic';
import type { ValuationDataPoint } from '@/lib/valuationData';

const ValuationChartInner = dynamic(() => import('./ValuationChartInner'), {
  ssr: false,
  loading: () => (
    <div className="mt-6 bg-white rounded-lg shadow p-6 min-h-[480px]">
      <div className="h-5 w-2/3 bg-gray-100 rounded animate-pulse" />
      <div className="mt-3 h-4 w-full bg-gray-50 rounded animate-pulse" />
      <div className="mt-6 h-[380px] w-full bg-gray-50 rounded animate-pulse" />
    </div>
  ),
});

interface ValuationChartProps {
  programName: string;
  unit: 'mile' | 'point';
  dataPoints: ValuationDataPoint[];
}

export default function ValuationChart(props: ValuationChartProps) {
  return <ValuationChartInner {...props} />;
}
