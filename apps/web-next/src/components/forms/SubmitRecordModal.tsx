'use client';

import { Fragment, useState, useEffect, useCallback } from "react";
import { Dialog, DialogPanel, Switch, Transition, TransitionChild } from "@headlessui/react";
import { XMarkIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { useFormik } from "formik";
import * as Yup from "yup";
import { NumericFormat } from "react-number-format";
import Image from "next/image";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "react-toastify";
import { getRecords } from "@/lib/api";

// Form persistence key prefix (#7)
const FORM_STORAGE_KEY = 'creditodds_record_form_';

interface Card {
  card_id: string | number;
  card_name: string;
  card_image_link?: string;
  bank?: string;
}

interface SubmitRecordModalProps {
  show: boolean;
  handleClose: () => void;
  card: Card;
  onSuccess?: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://c301gwdbok.execute-api.us-east-2.amazonaws.com/Prod';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function SubmitRecordModal({ show, handleClose, card, onSuccess }: SubmitRecordModalProps) {
  const { getSession } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [hasExistingRecord, setHasExistingRecord] = useState(false);
  const [checkingRecords, setCheckingRecords] = useState(true);

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

  // Check if user has already submitted a record for this card
  useEffect(() => {
    const checkExistingRecords = async () => {
      if (!show) return;

      setCheckingRecords(true);
      try {
        const session = await getSession();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = (session as any).idToken?.jwtToken || session.getIdToken().getJwtToken();
        const records = await getRecords(token);

        // Check if user has already submitted for this card
        const existingRecord = records.find((r: { card_name: string }) =>
          r.card_name === card.card_name ||
          r.card_name === card.card_name.replace(/ Card$/, '')
        );
        setHasExistingRecord(!!existingRecord);
      } catch (error) {
        console.error("Error checking existing records:", error);
        setHasExistingRecord(false);
      } finally {
        setCheckingRecords(false);
      }
    };

    checkExistingRecords();
  }, [show, card.card_name, getSession]);

  // Auto-save form data when values change (#7)
  useEffect(() => {
    if (show && !hasExistingRecord && formik.dirty) {
      saveFormData(formik.values);
    }
  }, [show, hasExistingRecord, formik.values, formik.dirty, saveFormData]);

  // Default form values
  const defaultValues = {
    credit_score: 700,
    credit_score_source: "0",
    listed_income: 50000,
    date_applied: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    length_credit: 5,
    bank_customer: false,
    result: true,
    starting_credit_limit: undefined as number | undefined,
    reason_denied: "",
    inquiries_3: undefined as number | undefined,
    inquiries_12: undefined as number | undefined,
    inquiries_24: undefined as number | undefined,
  };

  const formik = useFormik({
    initialValues: loadSavedForm() || defaultValues,
    enableReinitialize: true,
    validationSchema: Yup.object({
      credit_score: Yup.number()
        .integer("Credit Score must be a whole number")
        .min(300, "Credit Score must be at least 300")
        .max(850, "Credit Score cannot be more than 850")
        .required("Required"),
      listed_income: Yup.number()
        .integer("Listed Income must be a whole number")
        .min(0, "Listed Income must be a positive number")
        .max(1000000, "Listed Income cannot be higher than $1 MIL")
        .required("Required"),
      starting_credit_limit: Yup.number()
        .integer("Starting credit limit must be a whole number")
        .min(0, "Starting credit limit must be a positive number")
        .max(1000000, "Starting credit limit cannot be higher than $1 MIL"),
      length_credit: Yup.number()
        .integer("Length of credit must be a whole number")
        .min(0, "Length of credit must be a positive number")
        .max(50, "Length of credit cannot be greater than 50 years")
        .required("Required"),
      inquiries_3: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
      inquiries_12: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
      inquiries_24: Yup.number()
        .integer("Inquiries must be a whole number")
        .min(0, "Inquiries must be a positive number")
        .max(50, "Inquiries cannot be higher than 50"),
    }),
    onSubmit: async (values) => {
      setSubmitting(true);
      try {
        const session = await getSession();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = (session as any).idToken?.jwtToken || session.getIdToken().getJwtToken();

        const response = await fetch(`${API_BASE}/records`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...values,
            card_id: card.card_id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to submit record');
        }

        toast.success("Your record was submitted successfully!", {
          position: "top-right",
          autoClose: 5000,
        });

        clearSavedForm(); // Clear saved form data on success (#7)
        formik.resetForm();
        onSuccess?.(); // Refresh card page data (#8)
        handleClose();
      } catch (error) {
        console.error("Error submitting record:", error);
        toast.error(error instanceof Error ? error.message : "Failed to submit record");
      } finally {
        setSubmitting(false);
      }
    },
  });

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
                        {card.card_image_link && (
                          <div className="block w-full rounded-lg overflow-hidden mb-4 relative h-48">
                            <Image
                              src={`https://d3ay3etzd1512y.cloudfront.net/card_images/${card.card_image_link}`}
                              alt={card.card_name}
                              fill
                              className="object-contain"
                              sizes="(max-width: 448px) 100vw, 448px"
                            />
                          </div>
                        )}
                        <h2 className="text-lg font-medium text-gray-900">{card.card_name}</h2>
                      </div>

                      {/* Check if already submitted */}
                      {checkingRecords ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500">Checking submission status...</p>
                        </div>
                      ) : hasExistingRecord ? (
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
                              <p className="mt-2 text-sm text-red-600">{formik.errors.credit_score}</p>
                            ) : (
                              <p className="mt-2 text-sm text-gray-500">FICO credit score at the time of application.</p>
                            )}
                          </div>

                          {/* Income */}
                          <div>
                            <label htmlFor="listed_income" className="block text-sm font-medium text-gray-700">
                              Income
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 sm:text-sm">$</span>
                              </div>
                              <NumericFormat
                                thousandSeparator={true}
                                id="listed_income"
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
                              <p className="mt-2 text-sm text-red-600">{formik.errors.listed_income}</p>
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
                              Age of Oldest Account
                            </label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                              <input
                                name="length_credit"
                                id="length_credit"
                                type="number"
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
                              <p className="mt-2 text-sm text-red-600">{formik.errors.length_credit}</p>
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

                          {/* Inquiries */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Number of Credit Inquiries in the last
                            </label>
                            <div className="space-y-2">
                              <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex w-28 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                  3 months
                                </span>
                                <input
                                  name="inquiries_3"
                                  id="inquiries_3"
                                  type="number"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_3 ?? ""}
                                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                              </div>
                              <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex w-28 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                  12 months
                                </span>
                                <input
                                  name="inquiries_12"
                                  id="inquiries_12"
                                  type="number"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_12 ?? ""}
                                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                              </div>
                              <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex w-28 items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                  24 months
                                </span>
                                <input
                                  name="inquiries_24"
                                  id="inquiries_24"
                                  type="number"
                                  onChange={formik.handleChange}
                                  onBlur={formik.handleBlur}
                                  value={formik.values.inquiries_24 ?? ""}
                                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                              </div>
                            </div>
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

                          {/* Submit Button */}
                          <div>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                              {submitting ? "Submitting..." : "Submit Record"}
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
