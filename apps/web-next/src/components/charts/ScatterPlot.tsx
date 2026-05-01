'use client';

import { useMemo, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface SeriesData {
  name: string;
  color: string;
  data: [number, number][];
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
            'Inter Tight, Inter, ui-sans-serif, system-ui, sans-serif',
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
        pointFormat: `<div>${xPrefix}{point.x:,.0f}${xSuffix} · ${yPrefix}{point.y:,.0f}${ySuffix}</div>`,
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
      series: series,
    }),
    [title, xAxis, yAxis, series, xPrefix, xSuffix, yPrefix, ySuffix],
  );

  return (
    <div>
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
}
