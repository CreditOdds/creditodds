'use client';

/* eslint-disable react-hooks/unsupported-syntax --
   Highcharts axis/tooltip formatter callbacks receive their context as `this`
   (that's the Highcharts API), which the React Compiler can't analyze. The
   compiler simply skips this component; the chart itself is unaffected. */

import { useMemo, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

/** A bare [x, y] pair, or an object form carrying an optional tooltip note
 *  (e.g. the denial reason on rejected data points). */
export type ScatterPoint = [number, number] | { x: number; y: number; note?: string };

interface SeriesData {
  name: string;
  color: string;
  data: ScatterPoint[];
}

function toPair(p: ScatterPoint): [number, number] {
  return Array.isArray(p) ? p : [p.x, p.y];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ScatterPlotProps {
  title: string;
  xAxis: string;
  yAxis: string;
  series: SeriesData[];
  xPrefix?: string;
  xSuffix?: string;
  yPrefix?: string;
  ySuffix?: string;
  /** Fit a least-squares line to the first series and draw it dashed. */
  trendline?: boolean;
}

function fitTrendline(points: [number, number][]): [number, number][] | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const xs = points.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [
    [minX, slope * minX + intercept],
    [maxX, slope * maxX + intercept],
  ];
}

// v2 editorial palette tokens. Highcharts can't read CSS custom props, so the
// hex values are duplicated here from landing.css :root.
const T = {
  ink: "#1a1330",
  ink2: "#3a2f55",
  muted: "#6b6384",
  muted2: "#a49fb8",
  line: "#ece8f5",
  line2: "#ddd7ec",
  paper: "#ffffff",
};

export default function ScatterPlot({
  title,
  xAxis,
  yAxis,
  series,
  xPrefix = "",
  xSuffix = "",
  yPrefix = "",
  ySuffix = "",
  trendline = false,
}: ScatterPlotProps) {
  useEffect(() => {
    Highcharts.setOptions({ lang: { thousandsSep: "," } });
  }, []);

  const chartOptions = useMemo(
    () => ({
      chart: {
        type: "scatter",
        zoomType: "xy",
        backgroundColor: "transparent",
        spacing: [16, 8, 12, 8],
        style: {
          fontFamily:
            'Inter, ui-sans-serif, system-ui, sans-serif',
        },
      },
      credits: { enabled: false },
      title: {
        text: title,
        align: "left",
        x: 4,
        margin: 16,
        style: {
          fontFamily:
            'var(--font-inter-tight), var(--font-inter), ui-sans-serif, system-ui, sans-serif',
          fontSize: "14px",
          fontWeight: "500",
          letterSpacing: "-0.01em",
          color: T.ink,
        },
      },
      xAxis: {
        title: {
          text: xAxis,
          style: {
            fontSize: "10.5px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            color: T.muted,
          },
        },
        labels: {
          formatter: function (this: { value: number }) {
            return (
              xPrefix +
              Highcharts.numberFormat(this.value, 0, ".", ",") +
              xSuffix
            );
          },
          style: { fontSize: "11px", color: T.muted },
        },
        lineColor: T.line2,
        tickColor: T.line2,
        gridLineColor: T.line,
        gridLineDashStyle: "Dot",
        gridLineWidth: 1,
        startOnTick: true,
        endOnTick: true,
        showLastLabel: true,
      },
      yAxis: {
        title: {
          text: yAxis,
          style: {
            fontSize: "10.5px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            color: T.muted,
          },
        },
        labels: {
          formatter: function (this: { value: number }) {
            return (
              yPrefix +
              Highcharts.numberFormat(this.value, 0, ".", ",") +
              ySuffix
            );
          },
          style: { fontSize: "11px", color: T.muted },
        },
        lineColor: T.line2,
        tickColor: T.line2,
        gridLineColor: T.line,
        gridLineDashStyle: "Dot",
        gridLineWidth: 1,
      },
      legend: {
        align: "right",
        verticalAlign: "top",
        layout: "horizontal",
        symbolRadius: 6,
        symbolHeight: 10,
        symbolWidth: 10,
        margin: 8,
        itemDistance: 18,
        itemStyle: {
          fontSize: "11.5px",
          fontWeight: "500",
          color: T.ink2,
        },
        itemHoverStyle: { color: T.ink },
      },
      tooltip: {
        useHTML: true,
        backgroundColor: T.ink,
        borderColor: T.ink,
        borderRadius: 6,
        borderWidth: 0,
        shadow: false,
        padding: 8,
        style: {
          color: "#ffffff",
          fontSize: "11.5px",
        },
        headerFormat:
          `<div style="font-weight:600;letter-spacing:0.04em;text-transform:uppercase;font-size:10.5px;opacity:0.7;margin-bottom:2px">{series.name}</div>`,
        pointFormatter: function (this: { x: number; y: number; note?: string }) {
          const base =
            `<div>${xPrefix}${Highcharts.numberFormat(this.x, 0, ".", ",")}${xSuffix}` +
            ` · ${yPrefix}${Highcharts.numberFormat(this.y, 0, ".", ",")}${ySuffix}</div>`;
          if (!this.note) return base;
          return (
            base +
            `<div style="margin-top:3px;max-width:220px;white-space:normal;opacity:0.75;font-size:11px">` +
            escapeHtml(this.note) +
            `</div>`
          );
        },
      },
      plotOptions: {
        scatter: {
          marker: {
            radius: 4,
            symbol: "circle",
            fillOpacity: 0.65,
            lineWidth: 0,
            states: {
              hover: {
                enabled: true,
                radiusPlus: 2,
                lineWidth: 2,
                lineColor: T.paper,
              },
            },
          },
          states: {
            hover: { marker: { enabled: false } },
          },
        },
      },
      series: (() => {
        if (!trendline) return series;
        const fit = fitTrendline((series[0]?.data ?? []).map(toPair));
        if (!fit) return series;
        return [
          ...series,
          {
            type: "line",
            name: "Trend",
            color: series[0].color,
            dashStyle: "Dash",
            lineWidth: 1.5,
            opacity: 0.6,
            data: fit,
            marker: { enabled: false },
            enableMouseTracking: false,
            showInLegend: false,
            states: { hover: { enabled: false } },
          },
        ];
      })(),
    }),
    [title, xAxis, yAxis, series, xPrefix, xSuffix, yPrefix, ySuffix, trendline],
  );

  return (
    <div>
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
}
