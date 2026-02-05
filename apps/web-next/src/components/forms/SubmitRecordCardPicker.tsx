'use client';

import { Fragment } from "react";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import Image from "next/image";

interface WalletCard {
  id: number;
  card_id: number;
  card_name: string;
  card_image_link?: string;
  bank: string;
  acquired_month?: number;
  acquired_year?: number;
  created_at: string;
}

interface SubmitRecordCardPickerProps {
  show: boolean;
  onClose: () => void;
  cards: WalletCard[];
  onSelectCard: (card: WalletCard) => void;
}

export default function SubmitRecordCardPicker({ show, onClose, cards, onSelectCard }: SubmitRecordCardPickerProps) {
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
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Select a card to submit a data point
                  </h3>

                  {cards.length > 0 ? (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {cards.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => {
                            onSelectCard(card);
                            onClose();
                          }}
                          className="w-full flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
                        >
                          <div className="flex-shrink-0 h-10 w-16 relative">
                            <Image
                              src={card.card_image_link
                                ? `https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`
                                : '/assets/generic-card.svg'}
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
                            <p className="text-xs text-gray-500">{card.bank}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      No cards available for submission.
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
