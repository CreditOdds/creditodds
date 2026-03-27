import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={2.0}
      inputLabel="World of Hyatt Points"
      unitLabel="point"
      valuationSlug="world-of-hyatt"
    />
  );
}
