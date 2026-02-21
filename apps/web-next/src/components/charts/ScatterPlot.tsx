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

export default function ScatterPlot({ title, xAxis, yAxis, series, xPrefix = '', xSuffix = '', yPrefix = '', ySuffix = '' }: ScatterPlotProps) {
  useEffect(() => {
    Highcharts.setOptions({
      lang: {
        thousandsSep: ','
      }
    });
  }, []);

  const chartOptions = useMemo(() => ({
    chart: {
      type: "scatter",
      zoomType: "xy",
      marginBottom: 100,
    },
    title: {
      text: title,
    },
    xAxis: {
      title: {
        enabled: true,
        text: xAxis,
      },
      labels: {
        formatter: function(this: { value: number }) {
          return xPrefix + Highcharts.numberFormat(this.value, 0, '.', ',') + xSuffix;
        },
      },
      startOnTick: true,
      endOnTick: true,
      showLastLabel: true,
    },
    yAxis: {
      title: {
        text: yAxis,
      },
      labels: {
        formatter: function(this: { value: number }) {
          return yPrefix + Highcharts.numberFormat(this.value, 0, '.', ',') + ySuffix;
        },
      },
    },
    legend: {
      align: "center",
      verticalAlign: "bottom",
      x: 0,
      y: 0,
      backgroundColor: Highcharts.defaultOptions.chart?.backgroundColor,
    },
    plotOptions: {
      scatter: {
        marker: {
          radius: 5,
          states: {
            hover: {
              enabled: true,
              lineColor: "rgb(100,100,100)",
            },
          },
        },
        states: {
          hover: {
            marker: {
              enabled: false,
            },
          },
        },
        tooltip: {
          headerFormat: "<b>{series.name}</b><br>",
          pointFormat: `${xPrefix}{point.x:,.0f}${xSuffix}, ${yPrefix}{point.y:,.0f}${ySuffix}`,
        },
      },
    },
    series: series,
  }), [title, xAxis, yAxis, series, xPrefix, xSuffix, yPrefix, ySuffix]);

  return (
    <div>
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
}
