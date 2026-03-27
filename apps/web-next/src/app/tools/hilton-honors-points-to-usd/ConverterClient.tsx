import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={0.5}
      inputLabel="Hilton Honors Points"
      unitLabel="point"
      valuationSlug="hilton-honors"
    />
  );
}
