import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={0.7}
      inputLabel="Choice Privileges Points"
      unitLabel="point"
      valuationSlug="choice-privileges"
    />
  );
}
