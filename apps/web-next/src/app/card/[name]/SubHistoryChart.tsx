"use client";

import { useState } from "react";

export interface SubChange {
  id: number;
  // ms since epoch
  t: number;
  from: number;
  to: number;
}

// Card wire tracking began in April 2026; the line starts there so a card
// whose first change came later still shows the offer it held before.
const TRACK_START = Date.UTC(2026, 3, 1);

const W = 100;
const H = 100;
// Vertical breathing room so the high and low steps don't touch the edges.
const PAD_Y = 14;

function fmtDate(t: number, opts: Intl.DateTimeFormatOptions): string {
  return new Date(t).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
const DAY = { month: "short", day: "numeric" } as const;
const FULL = { month: "short", day: "numeric", year: "numeric" } as const;
const MONTH = { month: "short", year: "numeric" } as const;

/**
 * Step chart of a card's signup-bonus history for the Card wire rail. Each
 * change is a dot (green up, red down); hovering one swaps the readout below
 * the chart to that change, which otherwise shows the latest.
 *
 * The SVG stretches to the rail width (preserveAspectRatio="none") with a
 * non-scaling stroke, and the dots are HTML so they stay round.
 */
export default function SubHistoryChart({
  changes,
  format,
}: {
  // Oldest first.
  changes: SubChange[];
  format: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (changes.length === 0) return null;

  const first = changes[0];
  const last = changes[changes.length - 1];
  // A short lead-in before the first change shows the offer it replaced, and
  // the flat tail after the last change reads as "still at this level". Both
  // are data-derived (no Date.now) so SSR and client markup match.
  const lead = Math.max((last.t - first.t) * 0.08, 7 * 864e5);
  const start = Math.min(TRACK_START, first.t - lead);
  const end = last.t + Math.max((last.t - start) * 0.12, 7 * 864e5);

  const values = [first.from, ...changes.map((c) => c.to)];
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  const x = (t: number) => ((t - start) / (end - start)) * W;
  const y = (v: number) =>
    hi === lo
      ? H / 2
      : PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - PAD_Y * 2);

  let d = `M0,${y(first.from)}`;
  for (const c of changes) d += ` H${x(c.t)} V${y(c.to)}`;
  d += ` H${W}`;

  const shown = changes[active ?? changes.length - 1];
  const shownDir = shown.to > shown.from ? "pos" : "neg";

  return (
    <div className="cj-sub-chart">
      <div className="cj-sub-chart-head">
        <span className="cj-sub-chart-title">Signup bonus history</span>
      </div>
      <div className="cj-sub-chart-plot" onMouseLeave={() => setActive(null)}>
        <span className="cj-sub-chart-y cj-sub-chart-y-hi">{format(hi)}</span>
        {hi !== lo && (
          <span className="cj-sub-chart-y cj-sub-chart-y-lo">{format(lo)}</span>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <line
            className="cj-sub-chart-grid"
            x1="0"
            x2={W}
            y1={y(hi)}
            y2={y(hi)}
            vectorEffect="non-scaling-stroke"
          />
          {hi !== lo && (
            <line
              className="cj-sub-chart-grid"
              x1="0"
              x2={W}
              y1={y(lo)}
              y2={y(lo)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            className="cj-sub-chart-line"
            d={d}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {changes.map((c, i) => {
          const dir = c.to > c.from ? "pos" : "neg";
          return (
            <button
              key={c.id}
              type="button"
              className={`cj-sub-chart-dot cj-wire-${dir}${
                (active ?? changes.length - 1) === i ? " is-active" : ""
              }`}
              style={{ left: `${x(c.t)}%`, top: `${y(c.to)}%` }}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${fmtDate(c.t, FULL)}: ${format(c.from)} to ${format(c.to)}`}
            />
          );
        })}
      </div>
      <div className="cj-sub-chart-x">
        <span>{fmtDate(start, MONTH)}</span>
        <span>Now</span>
      </div>
      <div className="cj-sub-chart-readout" aria-live="polite">
        <span className="cj-wire-rail-date">{fmtDate(shown.t, DAY)}</span>
        <span className="cj-wire-rail-change">
          <span className="cj-wire-rail-old">{format(shown.from)}</span>
          <span className={`cj-wire-rail-arrow cj-wire-${shownDir}`}>→</span>
          <span className={`cj-wire-rail-new cj-wire-${shownDir}`}>
            {format(shown.to)}
          </span>
        </span>
      </div>
    </div>
  );
}
