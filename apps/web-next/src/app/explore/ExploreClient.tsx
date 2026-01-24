'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card } from "@/lib/api";

interface ExploreClientProps {
  cards: Card[];
  banks: string[];
}

export default function ExploreClient({ cards, banks }: ExploreClientProps) {
  const [search, setSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = search === "" ||
        card.card_name.toLowerCase().includes(search.toLowerCase()) ||
        card.bank.toLowerCase().includes(search.toLowerCase());
      const matchesBank = selectedBank === "" || card.bank === selectedBank;
      return matchesSearch && matchesBank;
    });
  }, [cards, search, selectedBank]);

  return (
    <>
      {/* Filters */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="search" className="sr-only">Search cards</label>
          <input
            type="text"
            id="search"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <div className="sm:w-48">
          <label htmlFor="bank" className="sr-only">Filter by bank</label>
          <select
            id="bank"
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All Banks</option>
            {banks.map(bank => (
              <option key={bank} value={bank}>{bank}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      <p className="mt-4 text-sm text-gray-500">
        Showing {filteredCards.length} of {cards.length} cards
      </p>

      {/* Cards Table */}
      <div className="mt-4 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Card
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden sm:table-cell">
                      Bank
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden md:table-cell">
                      Median Credit Score
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">
                      Median Income
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 hidden lg:table-cell">
                      Records
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredCards.map((card) => (
                    <tr key={card.card_id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                        <Link href={`/card/${encodeURIComponent(card.card_name)}`} className="flex items-center group">
                          <div className="h-10 w-16 flex-shrink-0 mr-4 hidden sm:block">
                            <Image
                              src={card.card_image_link
                                ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                                : '/assets/generic-card.svg'}
                              alt={card.card_name}
                              width={64}
                              height={40}
                              className="h-10 w-16 object-contain"
                            />
                          </div>
                          <div className="text-sm font-medium text-indigo-600 group-hover:text-indigo-900">
                            {card.card_name}
                          </div>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm hidden sm:table-cell">
                        <Link href={`/bank/${encodeURIComponent(card.bank)}`} className="text-gray-500 hover:text-indigo-600">
                          {card.bank}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden md:table-cell">
                        {card.approved_median_credit_score || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {card.approved_median_income ? `$${card.approved_median_income.toLocaleString()}` : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 hidden lg:table-cell">
                        {(card.approved_count || 0) + (card.rejected_count || 0)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        {card.accepting_applications ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-800">
                            Archived
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
