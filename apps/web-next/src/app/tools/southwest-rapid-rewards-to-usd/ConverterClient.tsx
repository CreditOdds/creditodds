import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.4}
      inputLabel="Southwest Rapid Rewards Points"
      unitLabel="point"
      valuationSlug="southwest-rapid-rewards"
    />
  );
}
