'use client';

import { RuleResult } from '@/lib/applicationRules';

interface RuleProgressChartProps {
  rule: RuleResult;
}

export default function RuleProgressChart({ rule }: RuleProgressChartProps) {
  const { ruleName, current, limit, periodDescription } = rule;

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
        <div className="cj-rule-name">{ruleName}</div>
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
