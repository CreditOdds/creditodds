import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.0}
      inputLabel="Capital One Miles"
      unitLabel="mile"
      valuationSlug="capital-one-miles"
    />
  );
}
