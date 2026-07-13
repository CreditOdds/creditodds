'use client';

import { Fragment, useMemo, useState } from "react";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import CardImage from "@/components/ui/CardImage";
import type { Card } from "@/lib/api";

export interface PickedCard {
  card_id: number;
  card_name: string;
  card_image_link?: string;
  bank: string;
}

interface SubmitRecordCardPickerProps {
  show: boolean;
  onClose: () => void;
  // Full card catalog (entries missing a numeric db_card_id are skipped).
  cards: Card[];
  // Cards the user already has a record for — shown with a hint, NOT filtered
  // out. The backend allows up to 5 records per card so users can submit
  // separate data points for a reapplication (e.g., denied then approved).
  recordedCardNames: Set<string>;
  // Optional: card names already in the user's wallet are surfaced first so
  // common picks stay near the top while denied/never-held cards remain
  // selectable below.
  walletCardNames?: Set<string>;
  onSelectCard: (card: PickedCard) => void;
}

export default function SubmitRecordCardPicker({
  show,
  onClose,
  cards,
  recordedCardNames,
  walletCardNames,
  onSelectCard,
}: SubmitRecordCardPickerProps) {
  const [search, setSearch] = useState("");

  // Reset the search box when the picker closes, using the adjust-state-during-
  // render pattern (https://react.dev/learn/you-might-not-need-an-effect) instead
  // of an effect, so the cleared state is visible on the very next render.
  const [prevShow, setPrevShow] = useState(show);
  if (prevShow !== show) {
    setPrevShow(show);
    if (!show) setSearch("");
  }

  const eligible = useMemo(() => {
    const inWallet = walletCardNames ?? new Set<string>();
    return cards
      .filter((c) => c.db_card_id != null)
      .sort((a, b) => {
        const aWallet = inWallet.has(a.card_name) ? 0 : 1;
        const bWallet = inWallet.has(b.card_name) ? 0 : 1;
        if (aWallet !== bWallet) return aWallet - bWallet;
        return a.card_name.localeCompare(b.card_name);
      });
  }, [cards, walletCardNames]);

  const filtered = useMemo(() => {
    if (!search) return eligible;
    const s = search.toLowerCase();
    return eligible.filter(
      (c) => c.card_name.toLowerCase().includes(s) || c.bank.toLowerCase().includes(s)
    );
  }, [eligible, search]);

  return (
    <Transition show={show} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Submit a record
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Pick any card you applied for, approved or denied.
                  </p>

                  <div className="relative mb-3">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search by card name or issuer…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>

                  {filtered.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filtered.slice(0, 25).map((card) => {
                        const inWallet = walletCardNames?.has(card.card_name);
                        const hasRecord = recordedCardNames.has(card.card_name);
                        const meta = [card.bank, inWallet && 'in your wallet', hasRecord && 'record submitted']
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <button
                            key={card.card_id}
                            onClick={() => {
                              onSelectCard({
                                card_id: card.db_card_id as number,
                                card_name: card.card_name,
                                card_image_link: card.card_image_link,
                                bank: card.bank,
                              });
                              onClose();
                            }}
                            className="w-full flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                          >
                            <div className="flex-shrink-0 h-10 w-16 relative">
                              <CardImage
                                cardImageLink={card.card_image_link}
                                alt={card.card_name}
                                fill
                                className="object-contain"
                                sizes="64px"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {card.card_name}
                              </p>
                              <p className="text-xs text-gray-500">{meta}</p>
                            </div>
                          </button>
                        );
                      })}
                      {filtered.length > 25 && (
                        <p className="text-xs text-gray-400 text-center pt-2">
                          showing first 25 — refine your search to see more
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4 text-sm">
                      {search ? 'No cards match your search.' : 'No cards available.'}
                    </p>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
