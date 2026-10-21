type ComparisonProps = {
  median: number | null;
  isAbove: boolean | null;
  sampleCount: number;
  isCurrency?: boolean;
  suffix?: string;
};

export function MedianIndicator({ median, isAbove, sampleCount, isCurrency, suffix }: ComparisonProps) {
  if (median == null || !Number.isFinite(median) || isAbove == null) {
    return <div className="text-xs text-gray-500">Insufficient data<span className="block">{sampleCount} reports · 5 needed</span></div>;
  }
  const formatted = isCurrency ? `$${median.toLocaleString()}` : `${median.toLocaleString()}${suffix || ''}`;
  return (
    <div className="flex flex-col items-center text-xs">
      <span className={isAbove ? 'text-green-700' : 'text-red-700'}>{isAbove ? 'At or above' : 'Below'} median</span>
      <span className="text-gray-500">{formatted} · {sampleCount} reports</span>
    </div>
  );
}

export function MobileIndicator({ label, median, isAbove, sampleCount, isCurrency, suffix }: ComparisonProps & { label: string }) {
  if (median == null || !Number.isFinite(median) || isAbove == null) {
    return <span className="text-gray-500">{label}: insufficient data ({sampleCount} reports)</span>;
  }
  const formatted = isCurrency ? `$${median.toLocaleString()}` : `${median}${suffix || ''}`;
  return <span className={isAbove ? 'text-green-700' : 'text-red-700'}>{label}: {isAbove ? '≥' : '<'} {formatted} ({sampleCount} reports)</span>;
}
