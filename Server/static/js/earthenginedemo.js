let currentLayer;
let currentChart;
let bandCollector;

$(function () {
  // Initial map load
  loadMap("map", ol.proj.transform([54.0000, 24.0000], 'EPSG:4326', 'EPSG:3857'), 7);

  // Call test function with the default selected gas when the page loads
  const defaultGas = $('#gas-select').val();
  test(defaultGas); // Note: Ensure this is the correct usage as per your application's logic

  // Dropdown selection change handler
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
    url: api_url + "test", // Make sure api_url is correctly defined
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({ gas: selectedGas, startDate: startDate, endDate: endDate }),
    success: function(data) {
      if (currentLayer) {
        map.removeLayer(currentLayer); // Remove the existing layer
      }
      currentLayer = addMapLayer(data.url); // Add the new layer and keep track of it
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
    test($(this).val()); // Ensure test is called with the current gas as parameter
    timeSeriesIndex($(this).val()) // ---> ?
});

function addMapLayer(url) {
  const newLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: url
    }),
    opacity: 0.6
  });
  map.addLayer(newLayer);
  return newLayer; // Return the new layer for tracking
}

function updateLegend(minValue, maxValue, palette) {
  // Clear the existing legend content
  var legendCanvas = document.getElementById('legend-canvas');
  var ctx = legendCanvas.getContext('2d');
  ctx.clearRect(0, 0, legendCanvas.width, legendCanvas.height);

  // Calculate the width of each color band
  var numColors = palette.length;
  var bandWidth = legendCanvas.width / numColors;

  // Draw the color gradient
  for (var i = 0; i < numColors; i++) {
    ctx.fillStyle = palette[i];
    ctx.fillRect(i * bandWidth, 0, bandWidth, legendCanvas.height);
  }

  // Update the legend min and max values
  document.getElementById('legend-min').textContent = minValue;
  document.getElementById('legend-max').textContent = maxValue;

  document.getElementById('legend-min').textContent = minValue;
  document.getElementById('legend-max').textContent = maxValue;
}

$(document).ready(function() {
    // Initializers for date pickers with added triggers for time series index updates
    $("#start-date, #end-date").datepicker({
        dateFormat: "yy-mm-dd",
        onSelect: function() {
            let selectedGas = $('#gas-select').val();
            test(selectedGas);
            timeSeriesIndex(selectedGas); // Ensure this function is called with the correct gas
        }
    });

    // Ensuring time series index is updated on gas selection changes
    $('#gas-select').change(function() {
        updateDatePickerRange($(this).val());
        test($(this).val());
        timeSeriesIndex($(this).val());
    });
});

function updateDatePickerRange(selectedGas) {
    var minDate, maxDate = new Date(); // maxDate is today for all gases.
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
            minDate = new Date(2018, 5, 28); // Default min date if gas is unselected or unknown.
    }

    $("#start-date, #end-date").datepicker('option', 'minDate', minDate);
    $("#start-date, #end-date").datepicker('option', 'maxDate', maxDate);
}

// Function to update the chart based on date selection
// Initial chart creation
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
        // Now correctly passing the 'timeseries' data and a title for the chart
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
  return rawData
    .map(item => {
      // Check if the timestamp is in the expected format, if not, handle accordingly
      const timestamp = item[0]; // assuming this is where the timestamp is in your data
      let parsedDate;

      // Handle different possible formats for the timestamp
      if (typeof timestamp === 'string') {
          console.log(timestamp);
        // If the timestamp is a string, attempt to parse it
        parsedDate = Date.parse(timestamp);
      } else if (typeof timestamp === 'number') {
        // If the timestamp is a number, it might already be in milliseconds
        parsedDate = new Date(timestamp).getTime();
      } else {
        // If the timestamp is in an unexpected format, log an error or handle it as needed
        console.error('Unexpected timestamp format:', timestamp);
        parsedDate = NaN; // This will filter out the invalid data point later
      }

      const value = parseFloat(item[1]); // convert the value to a float
      return [parsedDate, value];
    })
    .filter(item => !isNaN(item[0]) && !isNaN(item[1])); // filter out invalid data points
}
// Initialize the vector source and layer for markers
var vectorSource = new ol.source.Vector({});
var vectorLayer = new ol.layer.Vector({
    source: vectorSource,
    style: new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 1],
            anchorXUnits: 'fraction',
            anchorYUnits: 'pixels',
            src: 'imgs/dot.svg' // Ensure this is a valid path to a marker image
        })
    })
});

// Function to load station markers from OpenAQ API and add them to the map
function loadStationsAndMarkers() {
    $.ajax({
        url: "https://api.openaq.org/v1/locations?country=AE",
        type: "GET",
        success: function(response) {
            response.results.forEach(station => {
                addMarker(station.coordinates.latitude, station.coordinates.longitude, station.location);
            });
            // Add the vector layer to the map only after all markers are added
            map.addLayer(vectorLayer);
        },
        error: function() {
            console.error('Failed to fetch station data');
        }
    });
}

// Function to add markers to the vector source
function addMarker(lat, lon, title) {
    var iconFeature = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
        name: title
    });

    vectorSource.addFeature(iconFeature);

    // Add click event listener to the feature
    iconFeature.on('singleclick', function(evt) {
        fetchStationData(lat, lon, title);
    });
}

// Function to fetch and display data from OpenAQ when a marker is clicked
function fetchStationData(lat, lon, stationName) {
    const url = `https://api.openaq.org/v1/latest?coordinates=${lat},${lon}&radius=1000`;
    $.ajax({
        url: url,
        type: "GET",
        success: function(response) {
            if (response.results.length > 0) {
                const measurements = response.results[0].measurements;
                displayStationData(stationName, lat, lon, measurements);
            }
        },
        error: function() {
            console.error('Error fetching station data');
        }
    });
}

// Function to display data in the offcanvas
function displayStationData(stationName, lat, lon, measurements) {
    const gasInfoElement = document.getElementById('gasEmissionsInfo');
    gasInfoElement.innerHTML = `<p><strong>Station:</strong> ${stationName}</p><p><strong>Latitude:</strong> ${lat.toFixed(3)}, <strong>Longitude:</strong> ${lon.toFixed(3)}</p>`;

    measurements.forEach(m => {
        gasInfoElement.innerHTML += `<p><strong>${m.parameter}:</strong> ${m.value} ${m.unit}</p>`;
    });

    new bootstrap.Offcanvas(document.getElementById('gasInfoOffcanvas')).show();
}

// Ensuring the stations and markers are loaded after the map is fully initialized
document.addEventListener("DOMContentLoaded", function() {
    loadStationsAndMarkers(); // Make sure this is called after the map is ready
});







