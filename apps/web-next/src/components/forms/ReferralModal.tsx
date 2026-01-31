'use client';

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Listbox, ListboxButton, ListboxOption, ListboxOptions, Label } from "@headlessui/react";
import { LinkIcon, CheckIcon, ChevronUpDownIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "react-toastify";

interface OpenReferral {
  card_id: string;
  card_name: string;
  card_image_link?: string;
  card_referral_link?: string;
}

interface ReferralModalProps {
  show: boolean;
  handleClose: () => void;
  openReferrals: OpenReferral[];
  onSuccess: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://c301gwdbok.execute-api.us-east-2.amazonaws.com/Prod';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function ReferralModal({ show, handleClose, openReferrals, onSuccess }: ReferralModalProps) {
  const { getToken } = useAuth();

  const defaultCard: OpenReferral = {
    card_id: "",
    card_name: "Select a card...",
    card_image_link: "",
  };

  const [selected, setSelected] = useState<OpenReferral>(defaultCard);
  const [submitting, setSubmitting] = useState(false);
  const [showFullBaseLink, setShowFullBaseLink] = useState(false);

  const formik = useFormik({
    initialValues: {
      referral_link: "",
    },
    validationSchema: Yup.object({
      referral_link: Yup.string()
        .min(3, "Referral link must be at least 3 characters")
        .max(250, "Referral link cannot be more than 250 characters")
        .required("Required"),
    }),
    onSubmit: async (values) => {
      if (!selected.card_id) {
        toast.error("Please select a card");
        return;
      }

      setSubmitting(true);
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const response = await fetch(`${API_BASE}/referrals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            card_id: selected.card_id,
            referral_link: values.referral_link,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to submit referral');
        }

        toast.success("Your referral was submitted!", {
          position: "top-right",
          autoClose: 5000,
        });

        formik.resetForm();
        setSelected(defaultCard);
        onSuccess();
        handleClose();
      } catch (error) {
        console.error("Error submitting referral:", error);
        toast.error(error instanceof Error ? error.message : "Failed to submit referral");
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleModalClose = () => {
    formik.resetForm();
    setSelected(defaultCard);
    setShowFullBaseLink(false);
    handleClose();
  };

  return (
    <Dialog open={show} onClose={handleModalClose} className="relative z-10">
      <DialogBackdrop className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />

      <div className="fixed inset-0 z-10 overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl sm:p-6">
            <div>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                <LinkIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:mt-5">
                <DialogTitle as="h3" className="text-lg font-medium leading-6 text-gray-900">
                  Submit a referral
                </DialogTitle>
                <div className="mt-4">
                  <Listbox value={selected} onChange={setSelected}>
                    <Label className="block text-sm font-medium text-gray-700 text-left">
                      Select card
                    </Label>
                    <div className="relative mt-1">
                      <ListboxButton className="relative w-full cursor-default rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-left shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm">
                        <span className="flex items-center">
                          {selected.card_image_link && (
                            <div className="h-8 w-12 flex-shrink-0 relative">
                              <Image
                                src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${selected.card_image_link}`}
                                alt=""
                                fill
                                className="object-contain"
                                sizes="48px"
                              />
                            </div>
                          )}
                          <span className="ml-3 block truncate">{selected.card_name}</span>
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2">
                          <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                        </span>
                      </ListboxButton>

                      <ListboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                        {openReferrals.map((card) => (
                          <ListboxOption
                            key={card.card_id}
                            className={({ active }) =>
                              classNames(
                                active ? "bg-indigo-600 text-white" : "text-gray-900",
                                "relative cursor-default select-none py-2 pl-3 pr-9"
                              )
                            }
                            value={card}
                          >
                            {({ selected: isSelected, active }) => (
                              <>
                                <div className="flex items-center">
                                  {card.card_image_link && (
                                    <div className="h-8 w-12 flex-shrink-0 relative">
                                      <Image
                                        src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                                        alt=""
                                        fill
                                        className="object-contain"
                                        sizes="48px"
                                      />
                                    </div>
                                  )}
                                  <span
                                    className={classNames(
                                      isSelected ? "font-semibold" : "font-normal",
                                      "ml-3 block truncate"
                                    )}
                                  >
                                    {card.card_name}
                                  </span>
                                </div>
                                {isSelected && (
                                  <span
                                    className={classNames(
                                      active ? "text-white" : "text-indigo-600",
                                      "absolute inset-y-0 right-0 flex items-center pr-4"
                                    )}
                                  >
                                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                  </span>
                                )}
                              </>
                            )}
                          </ListboxOption>
                        ))}
                      </ListboxOptions>
                    </div>
                  </Listbox>
                </div>
              </div>
            </div>

            <form onSubmit={formik.handleSubmit} className="mt-4">
              <label htmlFor="referral_link" className="block text-sm font-medium text-gray-700 text-left">
                Referral Link
              </label>
              <div className="mt-1">
                {selected.card_referral_link ? (
                  <div className="space-y-2">
                    {/* Collapsible base link display */}
                    <div className="rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowFullBaseLink(!showFullBaseLink)}
                        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-2">
                          <span className="text-xs text-gray-500 block">Base URL</span>
                          <span className={`text-sm text-gray-600 block ${showFullBaseLink ? 'break-all' : 'truncate'}`}>
                            {selected.card_referral_link}
                          </span>
                        </div>
                        {showFullBaseLink ? (
                          <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    </div>
                    {/* Input for unique code */}
                    <input
                      type="text"
                      name="referral_link"
                      id="referral_link"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Your unique referral code"
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      value={formik.values.referral_link}
                    />
                    <p className="text-xs text-gray-500">
                      Enter only the unique part of your referral link (the code that comes after the base URL)
                    </p>
                  </div>
                ) : (
                  <input
                    type="text"
                    name="referral_link"
                    id="referral_link"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder={selected.card_id ? "Paste your referral code" : "Select a card first"}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    value={formik.values.referral_link}
                    disabled={!selected.card_id}
                  />
                )}
              </div>
              {formik.touched.referral_link && formik.errors.referral_link && (
                <p className="mt-2 text-sm text-red-600">{formik.errors.referral_link}</p>
              )}

              <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 sm:col-start-2 sm:text-sm"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
                  onClick={handleModalClose}
                >
                  Cancel
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
