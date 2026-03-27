import RewardValueConverter from '@/components/tools/RewardValueConverter';

export default function ConverterClient() {
  return (
    <RewardValueConverter
      fallbackCpp={1.2}
      inputLabel="United MileagePlus Miles"
      unitLabel="mile"
      valuationSlug="united-mileageplus"
    />
  );
}
