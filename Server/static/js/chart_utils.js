function createChart(wText,wTimeSeriesData)
    {
        Highcharts.setOptions({
          global: {
            useUTC: true,
          },
        });
        Highcharts.chart("graphcontainer", {
          chart: {
            zoomType: "x",
          },
          title: {
            text: "",
          },
          subtitle: {
            text:
              document.ontouchstart === undefined
                ? "Click and drag in the plot area to zoom in"
                : "Pinch the chart to zoom in",
          },
          xAxis: {
            type: "datetime",
          },
          yAxis: {
            title: {
              text: wText,
            },
          },
          legend: {
            enabled: false,
          },
          plotOptions: {
            series: {
              marker: {
                radius: 2,
              },
              lineWidth: 1,
              states: {
                hover: {
                  lineWidth: 1,
                },
              },
              threshold: null,
            },
          },
          tooltip: {
            pointFormat: "Value: {point.y} mm",
          },
          series: [
            {
              type: "line",
              name: wText,
              data: wTimeSeriesData,
              color: "#31bab0",
            },
          ],
        });
      }jk
