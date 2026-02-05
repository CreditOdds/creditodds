'use client';

import { useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { RuleResult } from '@/lib/applicationRules';

interface RuleProgressChartProps {
  rule: RuleResult;
}

export default function RuleProgressChart({ rule }: RuleProgressChartProps) {
  const { ruleName, current, limit, periodDescription, isSafe } = rule;

  // Determine color based on status
  const getBarColor = () => {
    if (current > limit) return '#ef4444'; // red-500 - over limit
    if (current === limit) return '#eab308'; // yellow-500 - at limit
    return '#22c55e'; // green-500 - safe
  };

  const chartOptions = useMemo(
    () => ({
      chart: {
        type: 'column',
        height: 200,
        backgroundColor: 'transparent',
      },
      title: {
        text: ruleName,
        style: {
          fontSize: '14px',
          fontWeight: '600',
        },
      },
      subtitle: {
        text: periodDescription,
        style: {
          fontSize: '12px',
          color: '#6b7280',
        },
      },
      xAxis: {
        categories: [''],
        visible: false,
      },
      yAxis: {
        min: 0,
        max: Math.max(limit + 1, current + 1),
        title: {
          text: null,
        },
        plotLines: [
          {
            value: limit,
            color: '#9ca3af',
            dashStyle: 'Dash' as const,
            width: 2,
            label: {
              text: `Limit: ${limit}`,
              align: 'right' as const,
              style: {
                fontSize: '11px',
                color: '#6b7280',
              },
            },
            zIndex: 5,
          },
        ],
        gridLineWidth: 0,
      },
      legend: {
        enabled: false,
      },
      tooltip: {
        formatter: function () {
          return `<b>${ruleName}</b><br/>Current: ${current} / ${limit}`;
        },
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          dataLabels: {
            enabled: true,
            format: '{y}',
            style: {
              fontSize: '14px',
              fontWeight: '600',
            },
          },
        },
      },
      series: [
        {
          name: 'Current',
          data: [current],
          color: getBarColor(),
        },
      ],
      credits: {
        enabled: false,
      },
    }),
    [ruleName, current, limit, periodDescription]
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
      <div className="mt-2 text-center">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            !isSafe
              ? current > limit
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {current > limit ? 'Over Limit' : current === limit ? 'At Limit' : 'Safe'}
        </span>
      </div>
    </div>
  );
}
