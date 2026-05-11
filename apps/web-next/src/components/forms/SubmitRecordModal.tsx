'use client';

import { Fragment, useState, useEffect, useCallback } from "react";
import { Dialog, DialogPanel, Switch, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { useFormik } from "formik";
import * as Yup from "yup";
import { NumericFormat } from "react-number-format";
import CardImage from '@/components/ui/CardImage';
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "react-toastify";
import { getRecords, getWallet, addToWallet, updateRecord } from "@/lib/api";
import confetti from "canvas-confetti";

// Form persistence key prefix (#7)
const FORM_STORAGE_KEY = 'creditodds_record_form_';

interface Card {
  card_id: string | number;
  card_name: string;
  card_image_link?: string;
  bank?: string;
}

export interface EditRecord {
  record_id: number;
  credit_score: number;
  credit_score_source?: number | string;
  listed_income: number | null;
  date_applied: string;
  length_credit?: number | null;
  bank_customer?: boolean | number;
  result: boolean | number;
  starting_credit_limit?: number | null;
  reason_denied?: string | null;
  reason_denied_code?: string | null;
  total_open_cards?: number | null;
  inquiries_3?: number | null;
  inquiries_12?: number | null;
  inquiries_24?: number | null;
}

// Keep in sync with REASON_DENIED_CODES in apps/api/src/handlers/user-records.js
const REASON_DENIED_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "not_specified", label: "Issuer didn't say" },
  { code: "too_many_inquiries", label: "Too many recent inquiries" },
  { code: "too_many_recent_accounts", label: "Too many recently opened accounts" },
  { code: "length_of_credit_too_short", label: "Credit history too short" },
  { code: "credit_score_too_low", label: "Credit score too low" },
  { code: "high_utilization", label: "High utilization / too much revolving debt" },
  { code: "too_much_credit_with_issuer", label: "Too much credit already with this issuer" },
  { code: "income_too_low", label: "Income too low" },
  { code: "recent_delinquency", label: "Recent delinquency or late payment" },
  { code: "bankruptcy_or_public_record", label: "Bankruptcy or public record" },
  { code: "other", label: "Other" },
];

interface SubmitRecordModalProps {
  show: boolean;
  handleClose: () => void;
  card: Card;
  onSuccess?: () => void;
  editRecord?: EditRecord;
}

// "2026-05-08T00:00:00.000Z" → "2026-05" for the month input.
function toMonthInput(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Last day of the current month, formatted as YYYY-MM for the <input type="month"> max attr.
function currentMonthInput(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://d2ojrhbh2dincr.cloudfront.net';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function SubmitRecordModal({ show, handleClose, card, onSuccess, editRecord }: SubmitRecordModalProps) {
  const { getToken } = useAuth();
  const isEditMode = !!editRecord;
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [checkingRecords, setCheckingRecords] = useState(!isEditMode);
  const [lastRecord, setLastRecord] = useState<{ credit_score?: number; listed_income?: number; length_credit?: number } | null>(null);
  // Count of cards in the user's wallet — surfaced below the "Total open cards" input
  // as a clickable suggestion. Authenticated, opt-in data, so it's an approximation
  // (closed cards may still be in wallet; not all open cards may be added).
  const [walletCount, setWalletCount] = useState<number | null>(null);

  // Get storage key for this card (#7)
  const storageKey = `${FORM_STORAGE_KEY}${card.card_id}`;

  // Load saved form data from localStorage (#7)
  const loadSavedForm = useCallback(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  // Save form data to localStorage (#7)
  const saveFormData = useCallback((values: typeof formik.values) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  // Clear saved form data (#7)
  const clearSavedForm = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  // Check if user has already submitted a record for this card, and grab
  // their wallet count for the "Total open cards" suggestion.
  useEffect(() => {
    const checkExistingRecords = async () => {
      if (!show || isEditMode) return;

      setCheckingRecords(true);
      try {
        const token = await getToken();
        if (!token) {
          setCheckingRecords(false);
          return;
        }
        const [records, wallet] = await Promise.all([
          getRecords(token),
          getWallet(token).catch(() => []),
        ]);

        setWalletCount(Array.isArray(wallet) ? wallet.length : 0);

        // Check if user has already submitted for this card
        const existingRecord = records.find((r: { card_name: string }) =>
          r.card_name === card.card_name ||
          r.card_name === card.card_name.replace(/ Card$/, '')
        );
        setHasExistingRecord(!!existingRecord);

        // Find most recent record to prepopulate fields
        if (records.length > 0) {
          const sorted = [...records].sort((a: { submit_datetime: string }, b: { submit_datetime: string }) =>
            new Date(b.submit_datetime).getTime() - new Date(a.submit_datetime).getTime()
          );
          const latest = sorted[0] as { credit_score?: number; listed_income?: number; length_credit?: number };
          setLastRecord({
            credit_score: latest.credit_score,
            listed_income: latest.listed_income,
            length_credit: latest.length_credit,
          });
        }
      } catch (error) {
        console.error("Error checking existing records:", error);
        setHasExistingRecord(false);
      } finally {
        setCheckingRecords(false);
      }
    };

    checkExistingRecords();
  }, [show, card.card_name, getToken, isEditMode]);

  // Default form values — no defaults for credit_score/income/length to avoid lazy submissions
  const defaultValues = editRecord
    ? {
        credit_score: editRecord.credit_score,
        credit_score_source: String(editRecord.credit_score_source ?? "0"),
        listed_income: editRecord.listed_income ?? ('' as number | ''),
        date_applied: toMonthInput(editRecord.date_applied),
        length_credit: editRecord.length_credit ?? ('' as number | ''),
        bank_customer: !!editRecord.bank_customer,
        result: !!editRecord.result,
        starting_credit_limit: editRecord.starting_credit_limit ?? undefined,
        reason_denied: editRecord.reason_denied ?? "",
        reason_denied_code: editRecord.reason_denied_code ?? "",
        total_open_cards: editRecord.total_open_cards ?? ('' as number | ''),
        inquiries_3: editRecord.inquiries_3 ?? ('' as number | ''),
        inquiries_12: editRecord.inquiries_12 ?? ('' as number | ''),
        inquiries_24: editRecord.inquiries_24 ?? ('' as number | ''),
      }
    : {
        credit_score: lastRecord?.credit_score ?? ('' as number | ''),
        credit_score_source: "0",
        listed_income: lastRecord?.listed_income ?? ('' as number | ''),
        date_applied: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        length_credit: lastRecord?.length_credit ?? ('' as number | ''),
        bank_customer: false,
        result: true,
        starting_credit_limit: undefined as number | undefined,
        reason_denied: "",
        reason_denied_code: "",
        total_open_cards: '' as number | '',
        inquiries_3: '' as number | '',
        inquiries_12: '' as number | '',
        inquiries_24: '' as number | '',
      };

  const formik = useFormik({
    initialValues: isEditMode ? defaultValues : (loadSavedForm() || defaultValues),
    enableReinitialize: true,
    validationSchema: Yup.object({
      credit_score: Yup.number()
        .integer("Credit Score must be a whole number")
        .min(300, "Credit Score must be at least 300")
        .max(850, "Credit Score cannot be more than 850")
        .required("Required"),
      listed_income: Yup.number()
        .integer("Income must be a whole number")
        .min(0, "Income must be a positive number")
        .max(1000000, "Income cannot be higher than $1 MIL")
        .nullable(),
      starting_credit_limit: Yup.number()
        .integer("Starting credit limit must be a whole number")
        .min(0, "Starting credit limit must be a positive number")
        .max(1000000, "Starting credit limit cannot be higher than $1 MIL"),
      length_credit: Yup.number()
        .integer("Length of credit must be a whole number")
        .min(0, "Length of credit must be a positive number")
        .max(50, "Length of credit cannot be greater than 50 years"),
      total_open_cards: Yup.number()
        .integer("Total open cards must be a whole number")
        .min(0, "Total open cards must be 0 or greater")
        .max(500, "Total open cards cannot exceed 500"),
      inquiries_3: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be 0 or greater")
        .max(50, "Inquiries cannot exceed 50"),
      inquiries_12: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be 0 or greater")
        .max(50, "Inquiries cannot exceed 50"),
      inquiries_24: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be 0 or greater")
        .max(50, "Inquiries cannot exceed 50"),
      date_applied: Yup.string()
        .required("Required")
        .test('not-future', 'Application date cannot be in the future', (value) => {
          if (!value) return false;
          // value is "YYYY-MM"; compare lexicographically against current month.
          return value <= currentMonthInput();
        }),
    }),
    onSubmit: async (values) => {
      setSubmitting(true);
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Normalize empty strings to null so the API's yup .oneOf() / number coercion
        // doesn't reject blank optional fields.
        const payload = {
          ...values,
          reason_denied_code: values.reason_denied_code === "" ? null : values.reason_denied_code,
        };

        if (isEditMode && editRecord) {
          await updateRecord(editRecord.record_id, payload, token);
          toast.success("Your record was updated.", { position: "top-right", autoClose: 4000 });
          onSuccess?.();
          handleClose();
          return;
        }

        const response = await fetch(`${API_BASE}/records`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...payload,
            card_id: card.card_id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to submit record');
        }

        // Auto-add card to wallet if not already there (silent — don't block on failure)
        try {
          const wallet = await getWallet(token);
          const alreadyInWallet = wallet.some((w) => w.card_id === card.card_id);
          if (!alreadyInWallet) {
            const [year, month] = values.date_applied.split('-').map(Number);
            await addToWallet(card.card_id as number, month, year, token);
          }
        } catch (walletError) {
          console.warn("Auto-add to wallet failed (non-blocking):", walletError);
        }

        toast.success("Your record was submitted successfully!", {
          position: "top-right",
          autoClose: 5000,
        });

        // Fire confetti celebration
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });

        clearSavedForm(); // Clear saved form data on success (#7)
        formik.resetForm();
        onSuccess?.(); // Refresh card page data (#8)
        handleClose();
      } catch (error) {
        console.error("Error submitting record:", error);
        toast.error(error instanceof Error ? error.message : (isEditMode ? "Failed to update record" : "Failed to submit record"));
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Auto-save form data when values change (#7)
  useEffect(() => {
    if (show && !hasExistingRecord && !isEditMode && formik.dirty) {
      saveFormData(formik.values);
    }
  }, [show, hasExistingRecord, isEditMode, formik.values, formik.dirty, saveFormData]);

  const handleModalClose = () => {
    formik.resetForm();
    handleClose();
  };

  return (
    <Transition show={show} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleModalClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-in-out duration-500"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-500"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <TransitionChild
                as={Fragment}
                enter="transform transition ease-in-out duration-500"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <DialogPanel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                    {/* Close button */}
                    <div className="absolute left-0 top-0 -ml-8 flex pr-2 pt-4 sm:-ml-10 sm:pr-4">
                      <button
                        type="button"
                        className="rounded-md text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                        onClick={handleModalClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="p-8">
                      {/* Card image and name */}
                      <div className="mb-6">
                        <div className="block w-full rounded-lg overflow-hidden mb-4 relative h-48">
                          <CardImage
                            cardImageLink={card.card_image_link}
                            alt={card.card_name}
                            fill
                            className="object-contain"
                            sizes="(max-width: 448px) 100vw, 448px"
                          />
                        </div>
                        <h2 className="text-lg font-medium text-gray-900">{card.card_name}</h2>
                        {isEditMode && (
                          <p className="text-sm text-gray-500 mt-1">Editing your existing record.</p>
                        )}
                      </div>

                      {/* Check if already submitted */}
                      {checkingRecords ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500">Checking submission status...</p>
                        </div>
                      ) : hasExistingRecord && !isEditMode ? (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                          <div className="flex">
                            <div className="ml-3">
                              <p className="text-sm text-yellow-700">
                                You have already submitted a record for this card. You can only submit one record per card.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <form className="space-y-6" onSubmit={formik.handleSubmit}>
                          {/* Credit Score */}
                          <div>
                            <label htmlFor="credit_score" className="block text-sm font-medium text-gray-700">
                              Credit Score
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <input
                                id="credit_score"
                                name="credit_score"
                                type="number"
                                placeholder="300-850"
                                className={
                                  formik.errors.credit_score && formik.touched.credit_score
                                    ? "block w-full pr-10 border-red-300 text-red-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                    : "block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                }
                                autoComplete="off"
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.credit_score}
                              />
                              {formik.errors.credit_score && formik.touched.credit_score ? (
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <ExclamationCircleIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
                                </div>
                              ) : (
                                <div className="absolute inset-y-0 right-0 flex items-center">
                                  <select
                                    id="credit_score_source"
                                    name="credit_score_source"
                                    className="h-full py-0 pl-2 pr-7 border-transparent bg-transparent text-gray-500 sm:text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    value={formik.values.credit_score_source}
                                    onChange={formik.handleChange}
                                  >
                                    <option value="0">FICO: *</option>
                                    <option value="1">FICO: Experian</option>
                                    <option value="2">FICO: Transunion</option>
                                    <option value="3">FICO: Equifax</option>
                                  </select>
                                </div>
                              )}
                            </div>
                            {formik.errors.credit_score && formik.touched.credit_score ? (
                              <p className="mt-2 text-sm text-red-600">{String(formik.errors.credit_score)}</p>
                            ) : (
                              <p className="mt-2 text-sm text-gray-500">FICO credit score at the time of application.</p>
                            )}
                          </div>

                          {/* Income */}
                          <div>
                            <label htmlFor="listed_income" className="block text-sm font-medium text-gray-700">
                              Income <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">$</span>
                              </div>
                              <NumericFormat
                                thousandSeparator={true}
                                id="listed_income"
                                placeholder="Income on application"
                                autoComplete="off"
                                className={
                                  formik.errors.listed_income && formik.touched.listed_income
                                    ? "block w-full pl-7 pr-12 border-red-300 text-red-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                    : "block w-full pl-7 pr-12 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                }
                                onBlur={formik.handleBlur}
                                value={formik.values.listed_income}
                                onValueChange={(val) => formik.setFieldValue("listed_income", val.floatValue)}
                              />
                              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">USD</span>
                              </div>
                            </div>
                            {formik.errors.listed_income && formik.touched.listed_income ? (
                              <p className="mt-2 text-sm text-red-600">{String(formik.errors.listed_income)}</p>
                            ) : (
                              <p className="mt-2 text-sm text-gray-500">Income you listed on your application.</p>
                            )}
                          </div>

                          {/* Application Time */}
                          <div>
                            <label htmlFor="date_applied" className="block text-sm font-medium text-gray-700">
                              Application Time
                            </label>
                            <div className="mt-1">
                              <input
                                id="date_applied"
                                name="date_applied"
                                type="month"
                                required
                                min="2019-01"
                                max={currentMonthInput()}
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.date_applied}
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              />
                            </div>
                          </div>

                          {/* Length of Credit */}
                          <div>
                            <label htmlFor="length_credit" className="block text-sm font-medium text-gray-700">
                              Age of Oldest Account <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <input
                                name="length_credit"
                                id="length_credit"
                                type="number"
                                placeholder="Years"
                                className={
                                  formik.errors.length_credit && formik.touched.length_credit
                                    ? "block w-full pr-16 border-red-300 text-red-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                    : "block w-full pr-16 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                }
                                autoComplete="off"
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.length_credit}
                              />
                              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">Years</span>
                              </div>
                            </div>
                            {formik.errors.length_credit && formik.touched.length_credit && (
                              <p className="mt-2 text-sm text-red-600">{String(formik.errors.length_credit)}</p>
                            )}
                          </div>

                          {/* Total Open Cards */}
                          <div>
                            <label htmlFor="total_open_cards" className="block text-sm font-medium text-gray-700">
                              Total open cards <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <input
                                id="total_open_cards"
                                name="total_open_cards"
                                type="number"
                                min={0}
                                max={500}
                                placeholder="Across all issuers"
                                className={
                                  formik.errors.total_open_cards && formik.touched.total_open_cards
                                    ? "block w-full pr-10 border-red-300 text-red-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md"
                                    : "block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                }
                                autoComplete="off"
                                onChange={formik.handleChange}
                                onBlur={formik.handleBlur}
                                value={formik.values.total_open_cards}
                              />
                            </div>
                            {formik.errors.total_open_cards && formik.touched.total_open_cards ? (
                              <p className="mt-2 text-sm text-red-600">{String(formik.errors.total_open_cards)}</p>
                            ) : walletCount && walletCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => formik.setFieldValue("total_open_cards", walletCount)}
                                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                              >
                                You have {walletCount} {walletCount === 1 ? 'card' : 'cards'} in your wallet. Use this?
                              </button>
                            ) : null}
                          </div>

                          {/* Hard Inquiries */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700">
                              Hard inquiries <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <div className="mt-1 grid grid-cols-3 gap-2">
                              <div>
                                <input
                                  id="inquiries_3"
                                  name="inquiries_3"
                                  type="number"
                                  min={0}
                                  max={50}
                                  placeholder="6 mo"
                                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  autoComplete="off"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_3}
                                />
                                <p className="mt-1 text-xs text-gray-500 text-center">6 mo</p>
                              </div>
                              <div>
                                <input
                                  id="inquiries_12"
                                  name="inquiries_12"
                                  type="number"
                                  min={0}
                                  max={50}
                                  placeholder="12 mo"
                                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  autoComplete="off"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_12}
                                />
                                <p className="mt-1 text-xs text-gray-500 text-center">12 mo</p>
                              </div>
                              <div>
                                <input
                                  id="inquiries_24"
                                  name="inquiries_24"
                                  type="number"
                                  min={0}
                                  max={50}
                                  placeholder="24 mo"
                                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  autoComplete="off"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_24}
                                />
                                <p className="mt-1 text-xs text-gray-500 text-center">24 mo</p>
                              </div>
                            </div>
                            {(formik.errors.inquiries_3 || formik.errors.inquiries_12 || formik.errors.inquiries_24) && (
                              <p className="mt-2 text-sm text-red-600">
                                {String(formik.errors.inquiries_3 || formik.errors.inquiries_12 || formik.errors.inquiries_24)}
                              </p>
                            )}
                          </div>

                          {/* Bank Customer Toggle */}
                          <div className="flex items-center justify-between">
                            <label className="block text-sm font-medium text-gray-700 pr-4">
                              Did you already have an account with <strong>{card.bank}</strong>?
                            </label>
                            <Switch
                              checked={formik.values.bank_customer}
                              onChange={() => formik.setFieldValue("bank_customer", !formik.values.bank_customer)}
                              className={classNames(
                                formik.values.bank_customer ? "bg-indigo-600" : "bg-gray-200",
                                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                              )}
                            >
                              <span
                                className={classNames(
                                  formik.values.bank_customer ? "translate-x-5" : "translate-x-0",
                                  "pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                                )}
                              />
                            </Switch>
                          </div>

                          {/* Approved/Rejected Toggle */}
                          <div className="flex space-x-3">
                            <button
                              type="button"
                              onClick={() => formik.setFieldValue("result", true)}
                              className={classNames(
                                formik.values.result
                                  ? "bg-green-500 text-white hover:bg-green-600"
                                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                                "flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none"
                              )}
                            >
                              Approved
                            </button>
                            <button
                              type="button"
                              onClick={() => formik.setFieldValue("result", false)}
                              className={classNames(
                                !formik.values.result
                                  ? "bg-red-600 text-white hover:bg-red-700"
                                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                                "flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium focus:outline-none"
                              )}
                            >
                              Rejected
                            </button>
                          </div>

                          {/* Starting Credit Limit (if approved) */}
                          {formik.values.result && (
                            <div>
                              <label htmlFor="starting_credit_limit" className="block text-sm font-medium text-gray-700">
                                Starting Credit Limit
                              </label>
                              <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <span className="text-gray-500 sm:text-sm">$</span>
                                </div>
                                <NumericFormat
                                  thousandSeparator={true}
                                  id="starting_credit_limit"
                                  autoComplete="off"
                                  className="block w-full pl-7 pr-12 border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  onBlur={formik.handleBlur}
                                  value={formik.values.starting_credit_limit ?? ""}
                                  onValueChange={(val) => formik.setFieldValue("starting_credit_limit", val.floatValue)}
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                  <span className="text-gray-500 sm:text-sm">USD</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Denial Reason (if denied) */}
                          {!formik.values.result && (
                            <div>
                              <label htmlFor="reason_denied_code" className="block text-sm font-medium text-gray-700">
                                Reason for denial <span className="text-gray-400 font-normal">(optional)</span>
                              </label>
                              <div className="mt-1">
                                <select
                                  id="reason_denied_code"
                                  name="reason_denied_code"
                                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.reason_denied_code}
                                >
                                  <option value="">Select a reason…</option>
                                  {REASON_DENIED_OPTIONS.map(opt => (
                                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="mt-2 text-xs text-gray-500">If the issuer gave a specific reason, pick the closest match.</p>
                            </div>
                          )}

                          {/* Submit Button */}
                          <div>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                              {submitting
                                ? (isEditMode ? "Saving..." : "Submitting...")
                                : (isEditMode ? "Save Changes" : "Submit Record")}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
