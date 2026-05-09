'use client';

import Image from 'next/image';
import { RuleResult } from '@/lib/applicationRules';

interface RuleProgressChartProps {
  rule: RuleResult;
}

const RULE_LOGO: Record<string, { src: string; issuer: string }> = {
  'Chase 5/24': { src: '/logos/chase.jpg', issuer: 'Chase' },
  'Amex 2/90': { src: '/logos/amex.jpg', issuer: 'American Express' },
  'Capital One 1/6': { src: '/logos/capital-one.jpg', issuer: 'Capital One' },
};

export default function RuleProgressChart({ rule }: RuleProgressChartProps) {
  const { ruleName, current, limit, periodDescription } = rule;
  const logo = RULE_LOGO[ruleName];

  const status: 'ok' | 'at' | 'over' =
    current > limit ? 'over' : current === limit ? 'at' : 'ok';

  // Render `limit` segments. Filled in when index < current. If overflow
  // (current > limit), append the overflow as warn-colored segments after.
  const filledCount = Math.min(current, limit);
  const overflowCount = Math.max(0, current - limit);
  const totalSegs = limit + overflowCount;

  return (
    <div className="cj-rule">
      <div className="cj-rule-head">
        <div className="cj-rule-name">
          {logo && (
            <Image
              src={logo.src}
              alt={`${logo.issuer} logo`}
              width={18}
              height={18}
              className="cj-rule-logo"
            />
          )}
          <span>{ruleName}</span>
        </div>
        <div className="cj-rule-period">{periodDescription}</div>
      </div>

      <div className="cj-rule-num">
        <span className={`cj-rule-num-current is-${status}`}>{current}</span>
        <span className="cj-rule-num-limit">/ {limit}</span>
      </div>

      <div className="cj-rule-bar" aria-hidden="true">
        {Array.from({ length: totalSegs }).map((_, i) => {
          const isOverflow = i >= limit;
          const isFilled = i < filledCount;
          const cls = isOverflow
            ? 'cj-rule-seg is-fill-over'
            : isFilled
            ? status === 'at'
              ? 'cj-rule-seg is-fill-at'
              : 'cj-rule-seg is-fill'
            : 'cj-rule-seg';
          return <span key={i} className={cls} />;
        })}
      </div>

      <div className="cj-rule-foot">
        <span
          className={
            'cj-pill cj-rule-status ' +
            (status === 'over' ? 'cj-pill-den' : status === 'at' ? '' : 'cj-pill-app')
          }
          style={status === 'at' ? { background: '#fef9e8', color: 'var(--gold)' } : undefined}
        >
          {status === 'over' ? 'over limit' : status === 'at' ? 'at limit' : 'safe'}
        </span>
      </div>
    </div>
  );
}
