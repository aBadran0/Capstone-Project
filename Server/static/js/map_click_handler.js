// Ensure this code runs after the map object has been initialized
document.addEventListener("DOMContentLoaded", function() {
    window.onload = function() {
        if (window.map && window.map.on) {
            window.map.on('singleclick', function(evt) {
                const coordinate = ol.proj.toLonLat(evt.coordinate);
                const lon = coordinate[0];
                const lat = coordinate[1];

                // Fetch gas emissions information and display coordinates
                fetchGasInfo(lat, lon);
            });
        } else {
            console.error("Map or OpenLayers library not properly initialized.");
        }
    };

function fetchGasInfo(lat, lon) {
    $.ajax({
        url: "/gas-info",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify({ latitude: lat, longitude: lon }),
        success: function(data) {
            displayGasInfo(data, lat, lon);
        },
        error: function(error) {
            console.error('Error fetching gas information:', error);
        }
    });
}
function displayGasInfo(data, lat, lon) {
    const gasInfoElement = document.getElementById('gasEmissionsInfo');
    gasInfoElement.innerHTML = `<p><strong>Location:</strong> Latitude: ${lat.toFixed(3)}, Longitude: ${lon.toFixed(3)}</p>`;

    // Display Gas Concentrations
    gasInfoElement.innerHTML += `<h5>Concentrations:</h5>`;
    Object.keys(data.concentrations).forEach(gas => {
        gasInfoElement.innerHTML += `<p><strong>${gas}:</strong> ${data.concentrations[gas]}</p>`;
    });

    // Display AQI Values
    gasInfoElement.innerHTML += `<h5>AQI Values:</h5>`;
    Object.keys(data.aqi).forEach(gas => {
        if (gas !== 'max_aqi') {  // Exclude the 'max_aqi' from this loop
            gasInfoElement.innerHTML += `<p><strong>${gas} AQI:</strong> ${data.aqi[gas]}</p>`;
        }
    });

    // Display the Highest AQI
    if (data.aqi.max_aqi !== "Data not available") {
        gasInfoElement.innerHTML += `<h5>Highest AQI:</h5>`;
        gasInfoElement.innerHTML += `<p><strong>Highest AQI:</strong> ${data.aqi.max_aqi}</p>`;
    }

    // Show the offcanvas
    new bootstrap.Offcanvas(document.getElementById('gasInfoOffcanvas')).show();
}
});