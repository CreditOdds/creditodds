'use client';

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
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

// Helper for the small "(optional)" suffix on uppercase cj-modal-labels —
// resets the casing/spacing/weight that the parent label applies.
const optionalSuffixStyle: React.CSSProperties = {
  textTransform: 'none',
  letterSpacing: 0,
  fontWeight: 400,
  color: 'var(--muted-2)',
};

const hintStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 11.5,
  color: 'var(--muted)',
};

// Outcome buttons keep their semantic colors instead of the v2 purple primary.
// Green (#15803d) is the same shade used by .cc-odds .odds-green elsewhere
// in the v2 stylesheet; red is the standard --warn token.
const approvedActiveStyle: React.CSSProperties = {
  background: '#15803d',
  borderColor: '#15803d',
  color: '#fff',
  fontWeight: 600,
};

const deniedActiveStyle: React.CSSProperties = {
  background: 'var(--warn)',
  borderColor: 'var(--warn)',
  color: '#fff',
  fontWeight: 600,
};

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
  // Portal mount guard — same SSR-safety pattern as EditWalletCardModal.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while the modal is open. Plain overflow:hidden (NOT
  // position:fixed) to avoid the iOS touch-freeze bug.
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

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

  if (!show || !mounted) return null;

  return createPortal(
    <div className="landing-v2 profile-v2">
      <div className="cj-modal-root" role="dialog" aria-modal="true">
        <div className="cj-modal-backdrop" onClick={handleModalClose} />
        <div className="cj-modal-shell">
          <div className="cj-modal-card cj-modal-card-bounded">
            <div className="cj-modal-head">
              <span className="cj-status-dot" />
              <span className="cj-modal-title">{isEditMode ? 'edit record' : 'submit record'}</span>
              <button type="button" className="cj-modal-close" onClick={handleModalClose} aria-label="Close">
                <XMarkIcon style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {checkingRecords ? (
              <div className="cj-modal-body">
                <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Checking submission status…</p>
              </div>
            ) : hasExistingRecord && !isEditMode ? (
              <div className="cj-modal-body">
                <div className="cj-modal-error">
                  You have already submitted a record for this card. You can only submit one record per card.
                </div>
                <div className="cj-modal-section">
                  <div className="cj-modal-card-row">
                    <span className="cj-modal-thumb">
                      <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="56px" />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="cj-modal-card-name">{card.card_name}</div>
                      {card.bank && <div className="cj-modal-card-meta">{card.bank}</div>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={formik.handleSubmit}>
                <div className="cj-modal-body">
                  {/* Card header */}
                  <div className="cj-modal-section">
                    <div className="cj-modal-card-row">
                      <span className="cj-modal-thumb">
                        <CardImage cardImageLink={card.card_image_link} alt={card.card_name} fill className="object-contain" sizes="56px" />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="cj-modal-card-name">{card.card_name}</div>
                        {card.bank && <div className="cj-modal-card-meta">{card.bank}</div>}
                      </div>
                    </div>
                    {isEditMode && (
                      <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Editing your existing record.</p>
                    )}
                  </div>

                  {/* Credit Score + Source */}
                  <div className="cj-modal-section">
                    <label htmlFor="credit_score" className="cj-modal-label">Credit Score</label>
                    <div className="cj-modal-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                      <input
                        id="credit_score"
                        name="credit_score"
                        type="number"
                        placeholder="300–850"
                        className="cj-modal-input"
                        autoComplete="off"
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        value={formik.values.credit_score}
                      />
                      <select
                        id="credit_score_source"
                        name="credit_score_source"
                        className="cj-modal-select"
                        value={formik.values.credit_score_source}
                        onChange={formik.handleChange}
                      >
                        <option value="0">FICO: *</option>
                        <option value="1">FICO: Experian</option>
                        <option value="2">FICO: TransUnion</option>
                        <option value="3">FICO: Equifax</option>
                      </select>
                    </div>
                    {formik.errors.credit_score && formik.touched.credit_score ? (
                      <div className="cj-modal-error" style={{ marginTop: 8 }}>{String(formik.errors.credit_score)}</div>
                    ) : (
                      <p style={hintStyle}>FICO credit score at the time of application.</p>
                    )}
                  </div>

                  {/* Income */}
                  <div className="cj-modal-section">
                    <label htmlFor="listed_income" className="cj-modal-label">
                      Income <span style={optionalSuffixStyle}>(optional)</span>
                    </label>
                    <NumericFormat
                      thousandSeparator={true}
                      id="listed_income"
                      placeholder="Income on application"
                      autoComplete="off"
                      className="cj-modal-input"
                      onBlur={formik.handleBlur}
                      value={formik.values.listed_income}
                      onValueChange={(val) => formik.setFieldValue("listed_income", val.floatValue)}
                      prefix="$ "
                    />
                    {formik.errors.listed_income && formik.touched.listed_income ? (
                      <div className="cj-modal-error" style={{ marginTop: 8 }}>{String(formik.errors.listed_income)}</div>
                    ) : (
                      <p style={hintStyle}>Income you listed on your application.</p>
                    )}
                  </div>

                  {/* Application Time */}
                  <div className="cj-modal-section">
                    <label htmlFor="date_applied" className="cj-modal-label">Application Time</label>
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
                      className="cj-modal-input"
                    />
                  </div>

                  {/* Age of Oldest Account */}
                  <div className="cj-modal-section">
                    <label htmlFor="length_credit" className="cj-modal-label">
                      Age of Oldest Account <span style={optionalSuffixStyle}>(optional)</span>
                    </label>
                    <input
                      name="length_credit"
                      id="length_credit"
                      type="number"
                      placeholder="Years"
                      className="cj-modal-input"
                      autoComplete="off"
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      value={formik.values.length_credit}
                    />
                    {formik.errors.length_credit && formik.touched.length_credit && (
                      <div className="cj-modal-error" style={{ marginTop: 8 }}>{String(formik.errors.length_credit)}</div>
                    )}
                  </div>

                  {/* Total Open Cards (with wallet prefill suggestion) */}
                  <div className="cj-modal-section">
                    <label htmlFor="total_open_cards" className="cj-modal-label">
                      Total Open Cards <span style={optionalSuffixStyle}>(optional)</span>
                    </label>
                    <input
                      id="total_open_cards"
                      name="total_open_cards"
                      type="number"
                      min={0}
                      max={500}
                      placeholder="Across all issuers"
                      className="cj-modal-input"
                      autoComplete="off"
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      value={formik.values.total_open_cards}
                    />
                    {formik.errors.total_open_cards && formik.touched.total_open_cards ? (
                      <div className="cj-modal-error" style={{ marginTop: 8 }}>{String(formik.errors.total_open_cards)}</div>
                    ) : walletCount && walletCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => formik.setFieldValue("total_open_cards", walletCount)}
                        className="cj-modal-link"
                        style={{ marginTop: 6, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
                      >
                        You have {walletCount} {walletCount === 1 ? 'card' : 'cards'} in your wallet. Use this?
                      </button>
                    ) : null}
                  </div>

                  {/* Hard Inquiries */}
                  <div className="cj-modal-section">
                    <label className="cj-modal-label">
                      Hard Inquiries <span style={optionalSuffixStyle}>(optional)</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <input id="inquiries_3" name="inquiries_3" type="number" min={0} max={50} placeholder="6 mo" className="cj-modal-input"
                          autoComplete="off" onChange={formik.handleChange} onBlur={formik.handleBlur} value={formik.values.inquiries_3} />
                        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>6 mo</p>
                      </div>
                      <div>
                        <input id="inquiries_12" name="inquiries_12" type="number" min={0} max={50} placeholder="12 mo" className="cj-modal-input"
                          autoComplete="off" onChange={formik.handleChange} onBlur={formik.handleBlur} value={formik.values.inquiries_12} />
                        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>12 mo</p>
                      </div>
                      <div>
                        <input id="inquiries_24" name="inquiries_24" type="number" min={0} max={50} placeholder="24 mo" className="cj-modal-input"
                          autoComplete="off" onChange={formik.handleChange} onBlur={formik.handleBlur} value={formik.values.inquiries_24} />
                        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>24 mo</p>
                      </div>
                    </div>
                    {(formik.errors.inquiries_3 || formik.errors.inquiries_12 || formik.errors.inquiries_24) && (
                      <div className="cj-modal-error" style={{ marginTop: 8 }}>
                        {String(formik.errors.inquiries_3 || formik.errors.inquiries_12 || formik.errors.inquiries_24)}
                      </div>
                    )}
                  </div>

                  {/* Bank Customer */}
                  <div className="cj-modal-section">
                    <label className="cj-modal-label">
                      Existing customer with {card.bank ? card.bank : 'this issuer'}?
                    </label>
                    <div className="cj-modal-grid">
                      <button
                        type="button"
                        onClick={() => formik.setFieldValue("bank_customer", true)}
                        className={"cj-modal-btn" + (formik.values.bank_customer ? " cj-modal-btn-primary" : "")}
                      >Yes</button>
                      <button
                        type="button"
                        onClick={() => formik.setFieldValue("bank_customer", false)}
                        className={"cj-modal-btn" + (!formik.values.bank_customer ? " cj-modal-btn-primary" : "")}
                      >No</button>
                    </div>
                  </div>

                  {/* Outcome */}
                  <div className="cj-modal-section">
                    <label className="cj-modal-label">Outcome</label>
                    <div className="cj-modal-grid">
                      <button
                        type="button"
                        onClick={() => formik.setFieldValue("result", true)}
                        className="cj-modal-btn"
                        style={formik.values.result ? approvedActiveStyle : undefined}
                      >Approved</button>
                      <button
                        type="button"
                        onClick={() => formik.setFieldValue("result", false)}
                        className="cj-modal-btn"
                        style={!formik.values.result ? deniedActiveStyle : undefined}
                      >Denied</button>
                    </div>
                  </div>

                  {/* Starting Credit Limit (if approved) */}
                  {formik.values.result && (
                    <div className="cj-modal-section">
                      <label htmlFor="starting_credit_limit" className="cj-modal-label">Starting Credit Limit</label>
                      <NumericFormat
                        thousandSeparator={true}
                        id="starting_credit_limit"
                        autoComplete="off"
                        className="cj-modal-input"
                        placeholder="0"
                        onBlur={formik.handleBlur}
                        value={formik.values.starting_credit_limit ?? ""}
                        onValueChange={(val) => formik.setFieldValue("starting_credit_limit", val.floatValue)}
                        prefix="$ "
                      />
                    </div>
                  )}

                  {/* Denial Reason (if denied) */}
                  {!formik.values.result && (
                    <div className="cj-modal-section">
                      <label htmlFor="reason_denied_code" className="cj-modal-label">
                        Reason for Denial <span style={optionalSuffixStyle}>(optional)</span>
                      </label>
                      <select
                        id="reason_denied_code"
                        name="reason_denied_code"
                        className="cj-modal-select"
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        value={formik.values.reason_denied_code}
                      >
                        <option value="">Select a reason…</option>
                        {REASON_DENIED_OPTIONS.map(opt => (
                          <option key={opt.code} value={opt.code}>{opt.label}</option>
                        ))}
                      </select>
                      <p style={hintStyle}>If the issuer gave a specific reason, pick the closest match.</p>
                    </div>
                  )}
                </div>

                <div className="cj-modal-footer">
                  <div className="cj-modal-actions" style={{ marginLeft: 'auto' }}>
                    <button type="button" className="cj-modal-btn" onClick={handleModalClose}>
                      cancel
                    </button>
                    <button
                      type="submit"
                      className="cj-modal-btn cj-modal-btn-primary"
                      disabled={submitting}
                    >
                      {submitting
                        ? (isEditMode ? 'saving…' : 'submitting…')
                        : (isEditMode ? 'save changes' : 'submit')}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

