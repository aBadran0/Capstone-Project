import traceback

from flask import Flask, render_template
from flask import request, jsonify
from flask_cors import CORS
from ee_utils import *
from flask import Flask, jsonify
import ee
from datetime import datetime, timedelta


app = Flask(__name__)
CORS(app)
ee.Initialize()


MOLAR_VOLUME_AT_STP = 22.414  # Molar volume of gas at STP in liters
MOLAR_MASSES = {  # Molar masses in g/mol
    "NO2": 46.0055,
    "SO2": 64.066,
    "O3": 48.00,
    "CO": 28.01,
}
STANDARD_PRESSURE = 1013.25  # in hPa
STANDARD_TEMPERATURE = 273.15  # in Kelvin

def umol_per_m2_to_ppb(umol_per_m2, gas):
    """Converts concentration from µmol/m² to ppb."""
    # Using molar mass to convert µmol/m² to µg/m², then to ppb
    micrograms_per_m2 = umol_per_m2 * MOLAR_MASSES[gas]
    ppb = micrograms_per_m2 / (MOLAR_VOLUME_AT_STP * 1e3)  # Convert µg/m³ to ppb
    return ppb

def mol_per_m2_to_ppm(mol_per_m2, gas):
    """Converts concentration from mol/m² to ppm."""
    # Using molar mass to convert mol/m² to g/m², then to ppm
    grams_per_m2 = mol_per_m2 * MOLAR_MASSES[gas]
    ppm = grams_per_m2 / (MOLAR_VOLUME_AT_STP * 1e6)  # Convert g/m³ to ppm
    return ppm
def get_date_range():
    today = datetime.now()
    last_week = today - timedelta(days=7)
    return last_week.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d')

def calculate_aqi(Cp, breakpoints):
    for breakpoint in breakpoints:
        C_low, C_high, AQI_low, AQI_high = breakpoint
        if C_low <= Cp <= C_high:
            return ((AQI_high - AQI_low) / (C_high - C_low)) * (Cp - C_low) + AQI_low
    return

breakpoints = { #(lower limit, upper limit, lower limit of quality, upper limit of quality). NO2, SO2 1 hour exposure in ppb, CO, O3 8hr exp ppm)
    "O3" : [(0, 0.054,0,50),(0.055, 0.070, 51, 100),(0.071, 0.085, 101, 150),(0.086, 0.105, 151, 200), (0.106, 0.200, 201, 300)],
    "NO2": [(0, 53, 0, 50), (54, 100, 51, 100), (101, 360, 101, 150), (361, 649, 151, 200),(650, 1249, 201, 300), (1250, 2049, 301, 500)],
    "SO2": [(0, 35, 0, 50), (36,75,51,100),(76, 185, 101, 150), (186, 304, 151, 200), (305, 604, 201, 300), (605, 1004, 301, 500)],
    "CO": [(0, 4.4, 0, 50), (4.5, 9.4, 51, 100), (9.5, 12.4, 101, 150), (12.5, 15.4, 151, 200), (15.5, 30.4, 201, 300), (30.5, 50.4, 301, 500)]

}



@app.route('/gas-info', methods=['POST'])
def gas_info():
    request_data = request.get_json()
    latitude = float(request_data['latitude'])
    longitude = float(request_data['longitude'])
    start_date, end_date = get_date_range()

    point = ee.Geometry.Point([longitude, latitude])
    gases = {
        "NO2": {"id": "COPERNICUS/S5P/NRTI/L3_NO2", "band": "NO2_column_number_density", "scale": 1e9, "unit": "µmol/m²"},
        "SO2": {"id": "COPERNICUS/S5P/NRTI/L3_SO2", "band": "SO2_column_number_density", "scale": 1e9, "unit": "µmol/m²"},
        "CO": {"id": "COPERNICUS/S5P/NRTI/L3_CO", "band": "CO_column_number_density", "scale": 1e9, "unit": "mol/m²"},
        "O3": {"id": "COPERNICUS/S5P/NRTI/L3_O3", "band": "O3_column_number_density", "scale": 1e9, "unit": "µmol/m²"},
        "CH4": {"id": "COPERNICUS/S5P/OFFL/L3_CH4", "band": "CH4_column_volume_mixing_ratio_dry_air", "scale": 1, "unit": "ppb"},  # Not included in AQI calculation
        "HCHO": {"id": "COPERNICUS/S5P/NRTI/L3_HCHO", "band": "tropospheric_HCHO_column_number_density", "scale": 1e9, "unit": "mol/m²"}  # Not included in AQI calculation
    }

    response_data = {'concentrations': {}, 'aqi': {}}
    for gas, info in gases.items():
        collection = ee.ImageCollection(info["id"]) \
            .select(info["band"]) \
            .filterDate(start_date, end_date)

        mean_img = collection.mean()
        value = mean_img.reduceRegion(ee.Reducer.mean(), point, scale=1000).get(info["band"]).getInfo()

        if value is not None:
            if gas in ['NO2', 'SO2', 'O3']:
                ppb = umol_per_m2_to_ppb(value, gas)
                response_data['concentrations'][gas] = f"{ppb:.2f} ppb"
                response_data['aqi'][gas] = calculate_aqi(ppb, breakpoints[gas])
            elif gas == 'CO':
                ppm = mol_per_m2_to_ppm(value, gas)
                response_data['concentrations'][gas] = f"{ppm:.2f} ppm"
                response_data['aqi'][gas] = calculate_aqi(ppm, breakpoints[gas])
            else:  # For CH4 and HCHO, just report the value without AQI calculation
                response_data['concentrations'][gas] = f"{value:.2f} {info['unit']}"
        else:
            response_data['concentrations'][gas] = "Data not available"
            response_data['aqi'][gas] = "Data not available"

    # Determine the max AQI value
    max_aqi_value = max((v for v in response_data['aqi'].values() if isinstance(v, (int, float))), default="Data not available")
    response_data['aqi']['max_aqi'] = max_aqi_value

    return jsonify(response_data)




@app.route('/')
def index():
    return render_template('index.html')


@app.route('/trends')
def trends():
    return render_template('trends.html');




ee.Initialize()


@app.route('/test', methods=['POST'])
def test():
    request_data = request.get_json()
    print(request_data);
    selected_gas = request_data['gas']
    start_date = request_data['startDate']
    end_date = request_data['endDate']

    # Dictionary to map gases to their corresponding image collection IDs
    gas_to_collection = {
        "SO2": "COPERNICUS/S5P/NRTI/L3_SO2",
        "NO2": "COPERNICUS/S5P/NRTI/L3_NO2",
        "CO": "COPERNICUS/S5P/NRTI/L3_CO",
        "HCHO": "COPERNICUS/S5P/NRTI/L3_HCHO",
        "O3": "COPERNICUS/S5P/NRTI/L3_O3",
        "CH4": "COPERNICUS/S5P/OFFL/L3_CH4",
    }

    # Visualization parameters for each gas
    # Note: These values are placeholders and should be fine-tuned for best results
    gas_viz_params = {
        "SO2": {'bands': ['SO2_column_number_density'], 'min': 0, 'max': 0.0005,
                'palette': ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']},
        "NO2": {'bands': ['NO2_column_number_density'], 'min': 0, 'max': 0.0002,
                'palette': ['purple', 'blue', 'green', 'yellow', 'red']},
        "CO": {'bands': ['CO_column_number_density'], 'min': 0, 'max': 0.05,
               'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "HCHO": {'bands': ['tropospheric_HCHO_column_number_density'], 'min': 0, 'max': 0.0003,
                 'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "O3": {'bands': ['O3_column_number_density'], 'min': 0.12, 'max': 0.15,
               'palette': ['black', 'blue', 'green', 'yellow', 'red']},
        "CH4": {'bands': ['CH4_column_volume_mixing_ratio_dry_air'], 'min': 1750, 'max': 1900,
                'palette': ['black', 'blue', 'green', 'yellow', 'red']},
    }

    # Get the image collection ID from the dictionary
    collection_id = gas_to_collection[selected_gas]
    band_viz = gas_viz_params[selected_gas]

    print("Start Date:", start_date, "End Date:", end_date)

    # Fetch the collection and filter for the UAE
    countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
    uae = countries.filter(ee.Filter.eq('country_na', 'United Arab Emirates'))
    uae_boundaries = uae.first().geometry()

    collection = ee.ImageCollection(collection_id) \
        .select(band_viz['bands']) \
        .filterDate(start_date, end_date) \
        .mean() \
        .clip(uae_boundaries)

    url = image_to_map_id(collection, band_viz)
    return jsonify(url), 200


if __name__ == '__main__':
    app.run()
