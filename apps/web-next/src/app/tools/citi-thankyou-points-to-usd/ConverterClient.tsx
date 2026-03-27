import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.0}
      inputLabel="Citi ThankYou Points"
      unitLabel="point"
      valuationSlug="citi-thankyou"
    />
  );
}
