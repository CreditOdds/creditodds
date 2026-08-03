'use client';

import Link from "next/link";
import CardImage from "@/components/ui/CardImage";

// A left-to-right flow diagram of the product-change graph around one card:
// sources on the left, this card in the middle, destinations on the right, with
// each connector's thickness set by that edge's share of its direction's total.
//
// Geometry is computed, not measured. Every node row is exactly ROW_H tall with
// ROW_GAP between rows, so the connector y-coordinates follow from the row index
// alone. That keeps the SVG in sync with the DOM without refs, a ResizeObserver,
// or a post-hydration reflow. The CSS enforces the same row height the math
// assumes, so the two must be changed together.
const ROW_H = 62;
const ROW_GAP = 10;
const PITCH = ROW_H + ROW_GAP;
const GUTTER_W = 96;
// Floor for the diagram height so a single edge on each side still leaves the
// centre card room to breathe.
const MIN_H = 172;

// Connector thickness, in px, at 0% and 100% share. The floor keeps a 1-of-40
// edge visible rather than hairline-thin.
const STROKE_MIN = 2.5;
const STROKE_MAX = 13;

export interface ProductChangeNode {
  cardId: number;
  cardName: string;
  // Missing when the card is no longer in cards.json, in which case the node
  // renders as plain text instead of a link.
  slug?: string;
  cardImageLink?: string | null;
  count: number;
  share: number;
  forced: number;
}

interface ProductChangeFlowProps {
  cardName: string;
  cardImageLink?: string | null;
  inbound: ProductChangeNode[];
  outbound: ProductChangeNode[];
  inboundTotal: number;
  outboundTotal: number;
}

function strokeFor(share: number): number {
  const clamped = Math.max(0, Math.min(100, share));
  return STROKE_MIN + (clamped / 100) * (STROKE_MAX - STROKE_MIN);
}

function columnHeight(count: number): number {
  return count > 0 ? count * PITCH - ROW_GAP : 0;
}

// Centre of row `i` within a column of `count` rows, in diagram coordinates.
// The column itself is centred vertically, matching `justify-content: center`.
function rowCenterY(i: number, count: number, height: number): number {
  const top = (height - columnHeight(count)) / 2;
  return top + i * PITCH + ROW_H / 2;
}

function NodeCard({ node }: { node: ProductChangeNode }) {
  const inner = (
    <>
      <span className="pcf-node-img">
        <CardImage
          cardImageLink={node.cardImageLink}
          alt={node.cardName}
          width={56}
          height={35}
          style={{ width: "100%", height: "auto", objectFit: "contain" }}
        />
      </span>
      <span className="pcf-node-text">
        <span className="pcf-node-name">{node.cardName}</span>
        <span className="pcf-node-meta">
          {node.share}% · {node.count} {node.count === 1 ? "report" : "reports"}
          {node.forced > 0 && (
            <span className="pcf-node-forced" title={`${node.forced} of these were issuer-initiated`}>
              {node.forced === node.count ? "issuer-initiated" : `${node.forced} issuer-initiated`}
            </span>
          )}
        </span>
      </span>
    </>
  );

  return node.slug ? (
    <Link href={`/card/${node.slug}`} className="pcf-node pcf-node-link">
      {inner}
    </Link>
  ) : (
    <span className="pcf-node">{inner}</span>
  );
}

// One gutter's worth of connectors. `direction` flips which end carries the
// arrowhead: inbound flows point at the centre card, outbound flows point away.
function Connectors({
  nodes,
  height,
  direction,
}: {
  nodes: ProductChangeNode[];
  height: number;
  direction: "in" | "out";
}) {
  const centerY = height / 2;
  // Inset so the arrowhead lands just clear of the node it points at rather
  // than tucking under the card border.
  const INSET = 6;

  return (
    <svg
      className="pcf-connectors"
      width={GUTTER_W}
      height={height}
      viewBox={`0 0 ${GUTTER_W} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* userSpaceOnUse (not strokeWidth) so a 13px-thick flow and a 2.5px
            one get the same size arrowhead. Scaling with the stroke would make
            the heaviest edge's head wider than the gutter. */}
        <marker
          id={`pcf-arrow-${direction}`}
          markerUnits="userSpaceOnUse"
          markerWidth="11"
          markerHeight="11"
          refX="9"
          refY="5.5"
          orient="auto"
        >
          <path d="M0,0 L11,5.5 L0,11 z" fill="var(--accent)" />
        </marker>
      </defs>
      {nodes.map((node, i) => {
        const y = rowCenterY(i, nodes.length, height);
        const [x1, y1, x2, y2] =
          direction === "in"
            ? [0, y, GUTTER_W - INSET, centerY]
            : [INSET, centerY, GUTTER_W - INSET, y];
        // Horizontal control points give an S-curve that leaves and arrives
        // flat, so connectors read as flows rather than straight-line joins.
        const cx = (x1 + x2) / 2;
        return (
          <path
            key={node.cardId}
            d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={strokeFor(node.share)}
            strokeLinecap="butt"
            // Heavier flows read as more solid; the lightest still stay legible.
            opacity={0.42 + (Math.max(0, Math.min(100, node.share)) / 100) * 0.48}
            markerEnd={`url(#pcf-arrow-${direction})`}
          />
        );
      })}
    </svg>
  );
}

// Mobile fallback for one side: the connector becomes a weight bar inside each
// row, since there is no room for a centre column flanked by two gutters.
function StackedSide({
  nodes,
  label,
}: {
  nodes: ProductChangeNode[];
  label: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="pcf-stack-side">
      <div className="pcf-stack-label">{label}</div>
      {nodes.map((node) => (
        <div key={node.cardId} className="pcf-stack-row">
          <NodeCard node={node} />
          {/* Stands in for the connector. Thickness matches the desktop scale,
              but width carries the share too: at phone size a 4px vs 9px bar is
              hard to compare, whereas length is read at a glance. */}
          <span
            className="pcf-stack-bar"
            style={{
              height: `${strokeFor(node.share)}px`,
              width: `${Math.max(12, Math.min(100, node.share))}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function ProductChangeFlow({
  cardName,
  cardImageLink,
  inbound,
  outbound,
  inboundTotal,
  outboundTotal,
}: ProductChangeFlowProps) {
  const height = Math.max(
    columnHeight(inbound.length),
    columnHeight(outbound.length),
    MIN_H,
  );

  return (
    <div className="pcf">
      {/* Wide layout: sources | connectors | this card | connectors | destinations.
          The labels occupy their own grid row so they cannot shift the node
          columns out of alignment with the connector geometry. */}
      <div
        className="pcf-diagram"
        style={{ ["--pcf-h" as string]: `${height}px` }}
      >
        <div className="pcf-col-label pcf-label-in">
          {inbound.length > 0 && "Changed from"}
        </div>
        <div />
        <div />
        <div />
        <div className="pcf-col-label pcf-label-out">
          {outbound.length > 0 && "Changed into"}
        </div>

        <div className="pcf-col pcf-col-in">
          {inbound.map((node) => (
            <NodeCard key={node.cardId} node={node} />
          ))}
        </div>

        <div className="pcf-gutter">
          {inbound.length > 0 && (
            <Connectors nodes={inbound} height={height} direction="in" />
          )}
        </div>

        <div className="pcf-center">
          <span className="pcf-center-img">
            <CardImage
              cardImageLink={cardImageLink}
              alt={cardName}
              width={112}
              height={70}
              style={{ width: "100%", height: "auto", objectFit: "contain" }}
            />
          </span>
          <span className="pcf-center-name">{cardName}</span>
        </div>

        <div className="pcf-gutter">
          {outbound.length > 0 && (
            <Connectors nodes={outbound} height={height} direction="out" />
          )}
        </div>

        <div className="pcf-col pcf-col-out">
          {outbound.map((node) => (
            <NodeCard key={node.cardId} node={node} />
          ))}
        </div>
      </div>

      {/* Narrow layout: the same data as two stacked lists around the card. */}
      <div className="pcf-stacked">
        <StackedSide nodes={inbound} label="Changed from" />
        <div className="pcf-stack-center">
          <span className="pcf-center-img">
            <CardImage
              cardImageLink={cardImageLink}
              alt={cardName}
              width={112}
              height={70}
              style={{ width: "100%", height: "auto", objectFit: "contain" }}
            />
          </span>
          <span className="pcf-center-name">{cardName}</span>
        </div>
        <StackedSide nodes={outbound} label="Changed into" />
      </div>

      <p className="pcf-note">
        Based on {inboundTotal + outboundTotal}{" "}
        {inboundTotal + outboundTotal === 1 ? "product change" : "product changes"}{" "}
        logged by CreditOdds members in their wallets. Percentages are shares of
        each direction, not of all cardholders, and a small sample can swing a
        long way.
      </p>
    </div>
  );
}
