import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={0.5}
      inputLabel="IHG One Rewards Points"
      unitLabel="point"
      valuationSlug="ihg-one-rewards"
    />
  );
}
