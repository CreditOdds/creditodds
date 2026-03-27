import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.25}
      inputLabel="Chase Ultimate Rewards Points"
      unitLabel="point"
      valuationSlug="chase-ultimate-rewards"
    />
  );
}
