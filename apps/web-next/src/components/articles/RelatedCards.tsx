import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import { CreditCardIcon } from "@heroicons/react/24/outline";
import { RelatedCardInfo } from "@/lib/articles";

interface RelatedCardsProps {
  cards: RelatedCardInfo[];
}

export function RelatedCards({ cards }: RelatedCardsProps) {
  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div className="mt-12 pt-8 border-t border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <CreditCardIcon className="h-6 w-6 text-indigo-600" />
        Related Cards
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.slug}
            href={`/card/${card.slug}`}
            className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            <CardImage
              cardImageLink={card.image}
              alt={card.name}
              width={64}
              height={40}
              className="rounded object-contain flex-shrink-0"
              sizes="64px"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{card.name}</p>
              <p className="text-xs text-gray-500">{card.bank}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
