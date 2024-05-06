let currentLayer;

$(function () {
  loadMap("map", ol.proj.transform([54.0000, 24.0000], 'EPSG:4326', 'EPSG:3857'), 7);

  const defaultGas = $('#gas-select').val();
  test(defaultGas);
  timeSeriesIndex(defaultGas)

  $('#gas-select').change(function() {
    var selectedGas = $(this).val();
    test(selectedGas);
  });
});

const gasVizParams = {
  "SO2": {'bands': ['SO2_column_number_density'], 'min': 0, 'max': 0.0005,
                'palette': ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']},
        "NO2": {'bands': ['NO2_column_number_density'], 'min': 0, 'max': 0.0002,
                'palette': ['purple', 'blue', 'green', 'yellow', 'red']},
        "CO": {'bands': ['CO_column_number_density'], 'min': 0, 'max': 0.05,
               'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "HCHO": {'bands': ['tropospheric_HCHO_column_number_density'], 'min': 0, 'max': 0.0001,
                 'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "O3": {'bands': ['O3_column_number_density'], 'min': 0, 'max': 0.0003,
               'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "CH4": {'bands': ['CH4_column_volume_mixing_ratio_dry_air'], 'min': 1750, 'max': 1900,
                'palette': ['black', 'blue', 'green', 'yellow', 'red']},
};

function test(selectedGas) {
   const startDate = $('#start-date').val();
   const endDate = $('#end-date').val();

  $.ajax({
    url: api_url + "test",
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({ gas: selectedGas, startDate: startDate, endDate: endDate }),
    success: function(data) {
      if (currentLayer) {
        map.removeLayer(currentLayer);
      }
      currentLayer = addMapLayer(data.url);
      const vizParams = gasVizParams[selectedGas];
      updateLegend(vizParams.min, vizParams.max, vizParams.palette);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error('Error fetching data:', textStatus, errorThrown);
    }
  });
}

$('#gas-select').change(function() {
    updateDatePickerRange($(this).val());
    test($(this).val());
    timeSeriesIndex($(this).val());
});

function addMapLayer(url) {
  const newLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: url
    }),
    opacity: 0.6
  });
  map.addLayer(newLayer);
  return newLayer;
}

function updateLegend(minValue, maxValue, palette) {
  var legendCanvas = document.getElementById('legend-canvas');
  var ctx = legendCanvas.getContext('2d');
  ctx.clearRect(0, 0, legendCanvas.width, legendCanvas.height);

  var numColors = palette.length;
  var bandWidth = legendCanvas.width / numColors;

  for (var i = 0; i < numColors; i++) {
    ctx.fillStyle = palette[i];
    ctx.fillRect(i * bandWidth, 0, bandWidth, legendCanvas.height);
  }

  document.getElementById('legend-min').textContent = minValue;
  document.getElementById('legend-max').textContent = maxValue;
}

$(document).ready(function() {
    $("#start-date, #end-date").datepicker({
        dateFormat: "yy-mm-dd",
        onSelect: function() {
            let selectedGas = $('#gas-select').val();
            test(selectedGas);
            timeSeriesIndex(selectedGas);
        }
    });

    $('#gas-select').change(function() {
        updateDatePickerRange($(this).val());
        test($(this).val());
        timeSeriesIndex($(this).val());
    });
});

function updateDatePickerRange(selectedGas) {
    var minDate, maxDate = new Date();
    switch(selectedGas) {
        case "SO2":
            minDate = new Date(2018, 6, 10);
            break;
        case "NO2":
        case "CO":
            minDate = new Date(2018, 5, 28);
            break;
        case "HCHO":
            minDate = new Date(2018, 9, 2);
            break;
        case "O3":
            minDate = new Date(2018, 6, 10);
            break;
        case "CH4":
            minDate = new Date(2019, 1, 8);
            break;
        default:
            minDate = new Date(2018, 5, 28);
    }

    $("#start-date, #end-date").datepicker('option', 'minDate', minDate);
    $("#start-date, #end-date").datepicker('option', 'maxDate', maxDate);
}

var iconStyle = new ol.style.Style({
    image: new ol.style.Icon({
        anchor: [0.5, 46],
        anchorXUnits: 'fraction',
        anchorYUnits: 'pixels',
        src: '/static/imgs/dot.svg',
        scale: 0.03
    })
});

var vectorSource = new ol.source.Vector({});
var vectorLayer = new ol.layer.Vector({
    source: vectorSource,
    style: iconStyle
});

function loadStationsAndMarkers() {
    $.ajax({
        url: "https://api.openaq.org/v1/locations?country=AE",
        type: "GET",
        success: function(response) {
            response.results.forEach(station => {
                addMarker(station.coordinates.latitude, station.coordinates.longitude, station.location);
            });
            map.addLayer(vectorLayer);
        },
        error: function() {
            console.error('Failed to fetch station data');
        }
    });
}

function addMarker(lat, lon, title) {
    var iconFeature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
        name: title
    });

    iconFeature.setStyle(iconStyle);
    vectorSource.addFeature(iconFeature);

    iconFeature.setId(title);
}

document.addEventListener("DOMContentLoaded", function() {
    loadStationsAndMarkers();
});

function timeSeriesIndex(selectedGas) {
  const startDate = $('#start-date').val();
  const endDate = $('#end-date').val();

  $.ajax({
    url: api_url + 'timeSeriesIndex',
    type: "POST",
    async: true,
    crossDomain: true,
    contentType: "application/json",
    data: JSON.stringify({ gas: selectedGas, startDate: startDate, endDate: endDate }),
    success: function(data) {
      if (data.timeseries) {
          const ChartData = prepareChartData(data.timeseries);
          console.log("Timeseries data:", ChartData);
        createChart(selectedGas, ChartData);
      } else {
        console.error('Expected timeseries data not found.');
        console.log(data.errMsg || 'No error message provided');
      }
    },
    error: function(jqXHR, textStatus, errorThrown) {
      console.error('Error fetching time series data:', textStatus, errorThrown);
    }
  });
}

function prepareChartData(rawData) {
  return rawData.map(item => {
      const timestamp = item[0];
      let parsedDate;

      if (typeof timestamp === 'string') {
        parsedDate = Date.parse(timestamp);
      } else if (typeof timestamp === 'number') {
        parsedDate = new Date(timestamp).getTime();
      } else {
        console.error('Unexpected timestamp format:', timestamp);
        parsedDate = NaN;
      }

      const value = parseFloat(item[1]);
      return [parsedDate, value];
    }).filter(item => !isNaN(item[0]) && !isNaN(item[1]));
}
