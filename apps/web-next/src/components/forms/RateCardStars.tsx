"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import CardImage from "@/components/ui/CardImage";
import { useAuth } from "@/auth/AuthProvider";
import {
  CardRatingAggregates,
  getUserCardRating,
  submitPublicCardRating,
} from "@/lib/api";

// Same fractional-fill star as the read-only rail display it replaces.
function StarIcon({ fill = 1, size = 14 }: { fill?: number; size?: number }) {
  const gradientId = useId();
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  const path =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset={`${pct}%`} stopColor="currentColor" stopOpacity={1} />
          <stop offset={`${pct}%`} stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill={`url(#${gradientId})`}
        stroke="currentColor"
        strokeWidth={1.2}
      />
    </svg>
  );
}

interface RateCardStarsProps {
  cardName: string;
  slug: string;
  cardImageLink?: string;
  bank?: string;
  ratings: CardRatingAggregates;
}

// Remembers an anonymous visitor's submitted rating so the widget can show it
// on return visits. The server independently enforces one vote per IP.
const storageKey = (slug: string) => `co_card_rating_${slug}`;

export default function RateCardStars({
  cardName,
  slug,
  cardImageLink,
  bank,
  ratings,
}: RateCardStarsProps) {
  const { authState, getToken } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalRating, setModalRating] = useState(5);
  const [modalHover, setModalHover] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(storageKey(slug));
      const parsed = saved ? parseInt(saved, 10) : NaN;
      if (parsed >= 1 && parsed <= 5) setMyRating(parsed);
    } catch {
      // Ignore storage errors
    }
  }, [slug]);

  // Signed-in users: prefer their account rating over any anonymous
  // localStorage leftover.
  useEffect(() => {
    if (!authState.isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const rating = await getUserCardRating(cardName, token).catch(() => null);
      if (!cancelled && rating && rating >= 1 && rating <= 5) setMyRating(rating);
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.isAuthenticated, cardName, getToken]);

  // Lock body scroll while the modal is open. Plain overflow:hidden (NOT
  // position:fixed) to avoid the iOS touch-freeze bug.
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const openModal = (value: number) => {
    setModalRating(value);
    setModalHover(null);
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = authState.isAuthenticated ? await getToken() : null;
      await submitPublicCardRating(cardName, modalRating, comment, token);
      setMyRating(modalRating);
      setJustSubmitted(true);
      if (!token) {
        try {
          localStorage.setItem(storageKey(slug), String(modalRating));
        } catch {
          // Ignore storage errors
        }
      }
      setModalOpen(false);
      setComment("");
    } catch {
      setError("Could not submit your rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAggregate = ratings.count > 0 && ratings.average !== null;

  // Star fill priority: live hover preview > community average > the
  // visitor's own rating (only shown when there is no aggregate yet).
  const starFill = (s: number): number => {
    if (hoverValue !== null) return s <= hoverValue ? 1 : 0;
    if (hasAggregate) return (ratings.average ?? 0) - (s - 1);
    if (myRating) return s <= myRating ? 1 : 0;
    return 0;
  };

  const hint = justSubmitted
    ? "Thanks, your rating is in"
    : myRating
      ? `Your rating: ${myRating}/5`
      : "Tap a star to rate";

  return (
    <>
      <div className="cj-rating">
        <div>
          {hasAggregate ? (
            <div className="cj-rating-v">
              {(ratings.average ?? 0).toFixed(1)} <small>/ 5</small>
            </div>
          ) : (
            <div className="cj-rating-v" style={{ fontSize: 14 }}>
              Rate this card
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              marginTop: 2,
            }}
          >
            {ratings.count > 0
              ? `${ratings.count} ${ratings.count === 1 ? "rating" : "ratings"}`
              : "No ratings yet"}
          </div>
        </div>
        <div className="cj-rating-side">
          <div
            className="cj-rating-stars cj-rating-stars-interactive"
            onMouseLeave={() => setHoverValue(null)}
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                className="cj-rating-star-btn"
                aria-label={`Rate ${s} star${s === 1 ? "" : "s"}`}
                onMouseEnter={() => setHoverValue(s)}
                onFocus={() => setHoverValue(s)}
                onBlur={() => setHoverValue(null)}
                onClick={() => openModal(s)}
              >
                <StarIcon fill={starFill(s)} />
              </button>
            ))}
          </div>
          <div className="cj-rating-mine">{hint}</div>
        </div>
      </div>

      {modalOpen &&
        mounted &&
        createPortal(
          <div className="landing-v2 profile-v2">
            <div className="cj-modal-root" role="dialog" aria-modal="true">
              <div className="cj-modal-backdrop" onClick={closeModal} />
              <div className="cj-modal-shell">
                <div className="cj-modal-card cj-modal-card-bounded">
                  <div className="cj-modal-head">
                    <span className="cj-status-dot" />
                    <span className="cj-modal-title">rate this card</span>
                    <button
                      type="button"
                      className="cj-modal-close"
                      onClick={closeModal}
                      aria-label="Close"
                    >
                      <XMarkIcon style={{ width: 16, height: 16 }} />
                    </button>
                  </div>

                  <div className="cj-modal-body">
                    <div className="cj-modal-section">
                      <div className="cj-modal-card-row">
                        <span className="cj-modal-thumb">
                          <CardImage
                            cardImageLink={cardImageLink}
                            alt={cardName}
                            fill
                            className="object-contain"
                            sizes="56px"
                          />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="cj-modal-card-name">{cardName}</div>
                          {bank && <div className="cj-modal-card-meta">{bank}</div>}
                        </div>
                      </div>
                    </div>

                    <div className="cj-modal-section">
                      <label className="cj-modal-label">Your rating</label>
                      <div
                        className="cj-rate-stars"
                        onMouseLeave={() => setModalHover(null)}
                      >
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="cj-rate-star-btn"
                            aria-label={`${s} star${s === 1 ? "" : "s"}`}
                            aria-pressed={modalRating === s}
                            onMouseEnter={() => setModalHover(s)}
                            onClick={() => setModalRating(s)}
                          >
                            <StarIcon
                              fill={s <= (modalHover ?? modalRating) ? 1 : 0}
                              size={28}
                            />
                          </button>
                        ))}
                      </div>
                      <p
                        style={{
                          textAlign: "center",
                          fontSize: 11.5,
                          color: "var(--muted)",
                          marginTop: 2,
                        }}
                      >
                        {(modalHover ?? modalRating)}/5
                      </p>
                    </div>

                    <div className="cj-modal-section">
                      <label htmlFor="rate-card-comment" className="cj-modal-label">
                        Comment <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
                      </label>
                      <textarea
                        id="rate-card-comment"
                        className="cj-modal-input"
                        style={{ minHeight: 84, resize: "vertical" }}
                        placeholder="What should other people know about this card?"
                        maxLength={2000}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>

                    {error && <div className="cj-modal-error">{error}</div>}
                  </div>

                  <div className="cj-modal-footer">
                    <div className="cj-modal-actions" style={{ marginLeft: "auto" }}>
                      <button
                        type="button"
                        className="cj-modal-btn"
                        onClick={closeModal}
                        disabled={submitting}
                      >
                        cancel
                      </button>
                      <button
                        type="button"
                        className="cj-modal-btn cj-modal-btn-primary"
                        onClick={handleSubmit}
                        disabled={submitting}
                      >
                        {submitting ? "submitting…" : "submit rating"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
