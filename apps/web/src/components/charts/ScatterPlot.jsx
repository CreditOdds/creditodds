import React, { useMemo, useEffect } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

const ScatterPlot = ({ children }) => {
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
      text: children.title,
    },
    xAxis: {
      title: {
        enabled: true,
        text: children.Xaxis,
      },
      startOnTick: true,
      endOnTick: true,
      showLastLabel: true,
    },
    yAxis: {
      title: {
        text: children.Yaxis,
      },
    },
    legend: {
      align: "center",
      verticalAlign: "bottom",
      x: 0,
      y: 0,
      backgroundColor: Highcharts.defaultOptions.chart.backgroundColor,
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
          pointFormat: "{point.x:,.0f}, {point.y}",
        },
      },
    },
    series: children.series,
  }), [children.title, children.Xaxis, children.Yaxis, children.series]);

  return (
    <div>
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
};

export default ScatterPlot;
