'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import CardImage from '@/components/ui/CardImage';
import CardyCharacter from '@/components/ui/CardyCharacter';
import Downshift from 'downshift';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/auth/AuthProvider';
import { getProfile, getWallet, addToWallet, Card } from '@/lib/api';
import { cardMatchesSearch } from '@/lib/searchAliases';
import { toast } from 'react-toastify';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';
const DISMISSED_KEY = 'clippy_prompt_dismissed';
const BANNER_LAST_SHOWN_KEY = 'clippy_banner_last_shown';
const SNOOZED_UNTIL_KEY = 'clippy_snoozed_until';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function CardPicker({
  cards,
  loadingCards,
  searchInputRef,
  onCardSelect,
  onDismiss,
  title,
  subtitle,
}: {
  cards: Card[];
  loadingCards: boolean;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onCardSelect: (card: Card | null) => void;
  onDismiss: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

      {loadingCards ? (
        <div className="py-8 text-sm text-gray-500">Loading cards...</div>
      ) : (
        <Downshift
          id="clippy-card-select"
          onChange={onCardSelect}
          itemToString={(item) => (item ? item.card_name : '')}
        >
          {({
            getInputProps,
            getItemProps,
            getMenuProps,
            isOpen,
            inputValue,
            highlightedIndex,
            getRootProps,
          }) => {
            const filtered = cards.filter((item) =>
              cardMatchesSearch(item.card_name, item.bank, inputValue || '')
            );

            return (
              <div className="relative text-left" {...getRootProps({}, { suppressRefError: true })}>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...getInputProps({ ref: searchInputRef as React.RefObject<HTMLInputElement> })}
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Search cards..."
                    type="search"
                    autoComplete="off"
                  />
                </div>

                <ul
                  {...getMenuProps()}
                  className={`mt-1 w-full bg-white border border-gray-200 max-h-56 rounded-lg py-1 text-sm overflow-auto focus:outline-none ${
                    isOpen && filtered.length > 0 ? '' : 'hidden'
                  }`}
                >
                  {filtered.map((item, index) => (
                    <li
                      key={item.slug}
                      className={`cursor-pointer select-none py-2.5 px-3 ${
                        highlightedIndex === index
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'text-gray-900'
                      }`}
                      {...getItemProps({ index, item })}
                    >
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-7 w-11 relative">
                          <CardImage
                            cardImageLink={item.card_image_link}
                            alt=""
                            fill
                            className="object-contain"
                            sizes="44px"
                          />
                        </div>
                        <div className="ml-2.5 min-w-0">
                          <p className="text-sm font-medium truncate">{item.card_name}</p>
                          <p className="text-xs text-gray-500 truncate">{item.bank}</p>
                        </div>
                      </div>
                    </li>
                  ))}

                  {isOpen && inputValue && filtered.length === 0 && (
                    <li className="px-3 py-4 text-sm text-gray-500 text-center">
                      No cards found matching &quot;{inputValue}&quot;
                    </li>
                  )}
                </ul>
              </div>
            );
          }}
        </Downshift>
      )}

      <button
        onClick={onDismiss}
        className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
      >
        Maybe later
      </button>
    </>
  );
}

export default function DataPointPrompt() {
  const { authState, getToken } = useAuth();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const [profile, wallet] = await Promise.all([
          getProfile(token),
          getWallet(token).catch(() => []),
        ]);

        if (profile.records_count === 0 && wallet.length === 0) {
          // Truly new user (no records and no wallet): show wallet-add modal
          if (localStorage.getItem(DISMISSED_KEY) !== 'true') {
            setShowModal(true);
          }
        } else {
          // Returning user: check snooze/timing for banner
          const snoozedUntil = localStorage.getItem(SNOOZED_UNTIL_KEY);
          if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) {
            return; // Snoozed — don't show
          }

          const lastShown = localStorage.getItem(BANNER_LAST_SHOWN_KEY);
          if (lastShown && Date.now() - new Date(lastShown).getTime() < THIRTY_DAYS_MS) {
            return; // Shown within last 30 days — don't show
          }

          setShowBanner(true);
        }
      } catch {
        // Silently fail — don't block the user
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [authState.isAuthenticated, getToken]);

  // Fetch cards when entering step 2 (modal) or banner picker
  useEffect(() => {
    if ((!showBannerPicker && step !== 2) || cards.length > 0) return;

    setLoadingCards(true);
    fetch(`${API_BASE}/cards`)
      .then(res => res.json())
      .then((data: Card[]) => {
        const active = data.filter(c => c.accepting_applications);
        active.sort((a, b) => {
          const aIsBusiness = /business/i.test(a.card_name);
          const bIsBusiness = /business/i.test(b.card_name);
          if (aIsBusiness !== bIsBusiness) return aIsBusiness ? 1 : -1;
          return 0;
        });
        setCards(active);
      })
      .catch(() => {})
      .finally(() => setLoadingCards(false));
  }, [step, showBannerPicker, cards.length]);

  // Focus search input when step 2 or banner picker appears
  useEffect(() => {
    if (step === 2 || showBannerPicker) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step, showBannerPicker]);

  // Modal dismiss (new user — permanent)
  const dismissModal = () => {
    setShowModal(false);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  // Banner dismiss (X button — sets last shown to now)
  const dismissBanner = () => {
    setShowBanner(false);
    setShowBannerPicker(false);
    localStorage.setItem(BANNER_LAST_SHOWN_KEY, new Date().toISOString());
  };

  // Banner snooze (3 months)
  const snoozeBanner = () => {
    setShowBanner(false);
    setShowBannerPicker(false);
    localStorage.setItem(SNOOZED_UNTIL_KEY, new Date(Date.now() + THREE_MONTHS_MS).toISOString());
  };

  const goToStep2 = () => {
    setStep(2);
  };

  // New user flow: add the picked card to their wallet directly.
  const handleWalletAdd = async (card: Card | null) => {
    if (!card) return;
    try {
      const token = await getToken();
      if (!token) return;
      const numericId = Number(card.db_card_id ?? card.card_id);
      if (!Number.isFinite(numericId)) return;
      await addToWallet(numericId, undefined, undefined, token);
      toast.success(`${card.card_name} added to your wallet`);
      setShowModal(false);
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      toast.error('Could not add card to your wallet. Please try again.');
    }
  };

  // Returning user flow (banner): collect a data point.
  const handleDataPointSubmit = (card: Card | null) => {
    if (!card) return;
    setShowBanner(false);
    setShowBannerPicker(false);
    localStorage.setItem(BANNER_LAST_SHOWN_KEY, new Date().toISOString());
    router.push(`/card/${card.slug}?submit=true`);
  };

  return (
    <>
      {/* Returning user banner */}
      {showBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-indigo-50 border-t border-indigo-200 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            {!showBannerPicker ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-indigo-800 flex-1">
                  Applied for any new cards lately? Share your result to help the community.
                </p>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setShowBannerPicker(true)}
                    className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Submit a data point
                  </button>
                  <button
                    onClick={snoozeBanner}
                    className="hidden sm:block text-sm text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                  >
                    Remind me in 3 months
                  </button>
                  <button
                    onClick={dismissBanner}
                    className="text-indigo-400 hover:text-indigo-600"
                    aria-label="Dismiss"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto">
                <CardPicker
                  cards={cards}
                  loadingCards={loadingCards}
                  searchInputRef={searchInputRef}
                  onCardSelect={handleDataPointSubmit}
                  onDismiss={dismissBanner}
                  title="Which card have you applied for?"
                  subtitle="Search and select your card to submit a data point."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* New user modal */}
      <Dialog open={showModal} onClose={dismissModal} className="relative z-10">
        <DialogBackdrop className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel className="relative transform overflow-hidden rounded-2xl bg-white px-6 pb-6 pt-8 text-center shadow-xl transition-all sm:max-w-sm w-full">

              {step === 1 && (
                <>
                  {/* Cardy character */}
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <CardyCharacter />
                      {/* Speech bubble */}
                      <div className="absolute -top-14 -right-4 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 text-xs text-indigo-700 font-medium whitespace-nowrap">
                        Hi there! 👋
                        <div className="absolute -bottom-1 right-8 w-2 h-2 bg-indigo-50 border-b border-r border-indigo-200 rotate-45" />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mt-2">
                    Add your first card!
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Add a card to your wallet to track benefits, fees, and time your next application. Takes a few seconds.
                  </p>

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      onClick={goToStep2}
                      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      Let&apos;s go!
                    </button>
                    <button
                      onClick={dismissModal}
                      className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                      Maybe later
                    </button>
                  </div>
                </>
              )}

              {step === 2 && (
                <CardPicker
                  cards={cards}
                  loadingCards={loadingCards}
                  searchInputRef={searchInputRef}
                  onCardSelect={handleWalletAdd}
                  onDismiss={dismissModal}
                  title="Which card do you have?"
                  subtitle="Add it to your wallet to track its benefits and fees."
                />
              )}

            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
}
