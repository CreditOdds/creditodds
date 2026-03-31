import Link from 'next/link';

interface ApplyButtonsProps {
  slug: string;
}

export function ApplyButtons({ slug }: ApplyButtonsProps) {
  return (
    <Link
      href={`/card/${slug}`}
      className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
    >
      View Card Details
    </Link>
  );
}
