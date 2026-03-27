import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.1}
      inputLabel="Delta SkyMiles"
      unitLabel="mile"
      valuationSlug="delta-skymiles"
    />
  );
}
