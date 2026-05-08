'use client';

import { useMemo } from 'react';
import Highcharts from 'highcharts';
import 'highcharts/highcharts-more';
import HighchartsReact from 'highcharts-react-official';
import type { ValuationDataPoint } from '@/lib/valuationData';

interface ValuationChartProps {
  programName: string;
  unit: 'mile' | 'point';
  dataPoints: ValuationDataPoint[];
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export default function ValuationChart({ programName, unit, dataPoints }: ValuationChartProps) {
  const { rangeData, medianData, scatterSeries, summaryRows, yMin, yMax } = useMemo(() => {
    const byYear = new Map<number, ValuationDataPoint[]>();
    for (const p of dataPoints) {
      if (!byYear.has(p.year)) byYear.set(p.year, []);
      byYear.get(p.year)!.push(p);
    }

    const years = Array.from(byYear.keys()).sort((a, b) => a - b);

    const range: [number, number, number][] = [];
    const med: [number, number][] = [];
    const summary: { year: number; high: number; low: number; median: number; n: number }[] = [];

    for (const year of years) {
      const points = byYear.get(year)!;
      const nums = points.map(p => p.cpp);
      const x = Date.UTC(year, 5, 30);
      const high = Math.max(...nums);
      const low = Math.min(...nums);
      const m = median(nums);
      range.push([x, low, high]);
      med.push([x, m]);
      summary.push({ year, high, low, median: m, n: nums.length });
    }

    const sourcesByYear = new Map<string, [number, number, string?][]>();
    for (const p of dataPoints) {
      if (!sourcesByYear.has(p.source)) sourcesByYear.set(p.source, []);
      sourcesByYear.get(p.source)!.push([Date.UTC(p.year, 5, 30), p.cpp, p.url]);
    }

    const series = Array.from(sourcesByYear.entries()).map(([source, data]) => ({
      name: source,
      type: 'scatter' as const,
      color: '#9CA3AF',
      marker: { radius: 4, symbol: 'circle' },
      data: data.map(([x, y, url]) => ({ x, y, url })),
      tooltip: {
        pointFormat: `<b>{series.name}</b>: {point.y}¢<br/>`,
      },
    }));

    const allValues = dataPoints.map(p => p.cpp);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max(0.2, (max - min) * 0.5);

    return {
      rangeData: range,
      medianData: med,
      scatterSeries: series,
      summaryRows: summary,
      yMin: Math.max(0, Math.floor((min - padding) * 10) / 10),
      yMax: Math.ceil((max + padding) * 10) / 10,
    };
  }, [dataPoints]);

  const chartOptions = useMemo<Highcharts.Options>(() => ({
    chart: {
      height: 380,
      backgroundColor: 'transparent',
    },
    title: { text: undefined },
    xAxis: {
      type: 'datetime',
      labels: { format: '{value:%Y}' },
      tickInterval: 365 * 24 * 3600 * 1000,
    },
    yAxis: {
      title: { text: `Cents per ${unit}` },
      min: yMin,
      max: yMax,
      tickInterval: 0.1,
      labels: { format: '{value}¢' },
      gridLineColor: '#E5E7EB',
    },
    tooltip: {
      shared: true,
      useHTML: true,
      xDateFormat: '%Y',
      headerFormat: '<b>{point.key}</b><br/>',
    },
    plotOptions: {
      arearange: {
        fillOpacity: 0.18,
        lineWidth: 0,
        marker: { enabled: false },
        enableMouseTracking: true,
      },
      line: {
        marker: { enabled: true, radius: 4 },
        lineWidth: 2.5,
      },
      scatter: {
        jitter: { x: 6 * 24 * 3600 * 1000, y: 0 },
        cursor: 'pointer',
        events: {
          click: function (e) {
            const point = e.point as Highcharts.Point & { url?: string };
            if (point.url) window.open(point.url, '_blank', 'noopener,noreferrer');
          },
        },
      },
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: { fontSize: '12px' },
    },
    credits: { enabled: false },
    series: [
      {
        name: 'High–Low range',
        type: 'arearange',
        color: '#7C3AED',
        data: rangeData,
        zIndex: 0,
        tooltip: {
          pointFormat: '<span style="color:{series.color}">●</span> Range: {point.low}¢–{point.high}¢<br/>',
        },
      },
      {
        name: 'Median',
        type: 'line',
        color: '#7C3AED',
        data: medianData,
        zIndex: 2,
        tooltip: {
          pointFormat: '<span style="color:{series.color}">●</span> <b>Median: {point.y}¢</b><br/>',
        },
      },
      ...scatterSeries.map(s => ({ ...s, zIndex: 1, showInLegend: false })),
    ],
  }), [rangeData, medianData, scatterSeries, unit, yMin, yMax]);

  const sourceCount = new Set(dataPoints.map(p => p.source)).size;
  const sourceList = Array.from(new Set(dataPoints.map(p => p.source))).join(', ');

  return (
    <div className="mt-6 bg-white rounded-lg shadow p-6">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{programName} valuation, by year</h2>
        <p className="text-sm text-gray-600">
          High, low, and median cents-per-{unit} across major published valuations. Each gray dot is one source's published number for that year — click a dot to view the source.
        </p>
      </div>

      <HighchartsReact highcharts={Highcharts} options={chartOptions} />

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">Year</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">Median</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">High</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">Low</th>
              <th className="px-3 py-2 text-right font-medium text-gray-700">Sources</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(row => (
              <tr key={row.year} className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-900 font-medium">{row.year}</td>
                <td className="px-3 py-2 text-right text-gray-900">{row.median.toFixed(2)}¢</td>
                <td className="px-3 py-2 text-right text-gray-700">{row.high.toFixed(2)}¢</td>
                <td className="px-3 py-2 text-right text-gray-700">{row.low.toFixed(2)}¢</td>
                <td className="px-3 py-2 text-right text-gray-500">{row.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        {sourceCount > 0 ? `Sources: ${sourceList}.` : ''} Only directly cited values from each source's published page or article are included.
      </p>
    </div>
  );
}
