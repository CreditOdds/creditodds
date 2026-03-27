import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.2}
      inputLabel="Amex Membership Rewards Points"
      unitLabel="point"
      valuationSlug="amex-membership-rewards"
    />
  );
}
