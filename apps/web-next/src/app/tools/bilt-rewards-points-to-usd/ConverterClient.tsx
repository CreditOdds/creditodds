import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.5}
      inputLabel="Bilt Rewards Points"
      unitLabel="point"
      valuationSlug="bilt-rewards"
    />
  );
}
