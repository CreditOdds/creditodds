import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={0.7}
      inputLabel="Marriott Bonvoy Points"
      unitLabel="point"
      valuationSlug="marriott-bonvoy"
    />
  );
}
