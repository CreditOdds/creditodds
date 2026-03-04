'use client';

import { useMemo } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

interface TimeSeriesData {
  name: string;
  color: string;
  data: [number, number][];
}

interface TimeSeriesChartProps {
  title: string;
  series: TimeSeriesData[];
  yAxisTitle?: string;
}

export default function TimeSeriesChart({ title, series, yAxisTitle }: TimeSeriesChartProps) {
  const chartOptions = useMemo(() => ({
    chart: {
      type: "area",
      zoomType: "x",
      height: 300,
    },
    title: {
      text: title,
      style: { fontSize: '14px' },
    },
    xAxis: {
      type: "datetime",
      labels: {
        format: '{value:%b %d}',
      },
    },
    yAxis: {
      title: {
        text: yAxisTitle || null,
      },
      min: 0,
      allowDecimals: false,
    },
    tooltip: {
      shared: true,
      xDateFormat: '%b %d, %Y',
    },
    plotOptions: {
      area: {
        fillOpacity: 0.15,
        marker: {
          radius: 3,
          symbol: 'circle',
        },
        lineWidth: 2,
      },
    },
    legend: {
      align: "center" as const,
      verticalAlign: "bottom" as const,
    },
    credits: {
      enabled: false,
    },
    series: series,
  }), [title, series, yAxisTitle]);

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
}
