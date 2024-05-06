import json
import os
import logging

import requests
from celery import Celery
from flask import Flask, render_template
from flask import request, jsonify
from flask_cors import CORS
from google.oauth2 import service_account

from ee_utils import *
from flask import Flask, jsonify
import ee
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from celery.utils.log import get_task_logger
from celery.result import AsyncResult

app = Flask(__name__)
logger = get_task_logger(__name__)

CORS(app)


def setup_logging():
    handler = RotatingFileHandler('app.log', maxBytes=10000, backupCount=1)
    handler.setLevel(logging.INFO)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)


setup_logging()
app.logger.info('Logging setup complete')


# Initialize Celery
def make_celery(app):
    celery = Celery(
        app.import_name,
        backend=app.config['CELERY_RESULT_BACKEND'],
        broker=app.config['CELERY_BROKER_URL']
    )
    celery.conf.update(app.config)

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask
    return celery


# Configuration for Celery
app.config.update(
    CELERY_BROKER_URL='redis://localhost:6379/0',
    CELERY_RESULT_BACKEND='redis://localhost:6379/0'
)

celery = make_celery(app)


def initialize_earth_engine():
    print("Current FLASK_ENV:", os.getenv('FLASK_DEBUG'))
    if os.getenv('FLASK_DEBUG') == "1":
        print("Authenticating for local development...")
        ee.Authenticate()
        ee.Initialize()
    else:
        print("Attempting to use service account credentials...")
        ee_credentials_json = os.getenv('EE_CREDENTIALS_JSON')
        if ee_credentials_json:
            credentials_dict = json.loads(ee_credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict,
                scopes=['https://www.googleapis.com/auth/earthengine']
            )
            ee.Initialize(credentials)
        else:
            raise ValueError("Failed to get Earth Engine credentials from environment variable")


initialize_earth_engine()


def get_date_range():
    today = datetime.now()
    last_week = today - timedelta(days=7)
    return last_week.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d')


@app.route('/api/openaq', methods=['GET'])
def get_openaq_data():
    latitude = request.args.get('lat')
    longitude = request.args.get('lon')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    limit = request.args.get('limit', 10000)
    task = process_openaq_data.delay(latitude, longitude, date_from, date_to, limit)
    return jsonify({'status': 'Task queued', 'task_id': task.id}), 202

@celery.task
def process_openaq_data(latitude, longitude, date_from, date_to, limit):
    url = f"https://api.openaq.org/v2/measurements?coordinates={latitude},{longitude}&radius=1000&date_from={date_from}&date_to={date_to}&limit={limit}"
    headers = {"X-API-Key": "64b0bb7bcecc37a2b4bee22f281748852e3055e3062d0d6fde9fce62977ff12b"}
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"API error: {response.status_code} {response.text}")
    except Exception as e:
        logger.error(f'Error fetching data from OpenAQ: {str(e)}')
        return {"error": str(e)}


@app.route('/gas-info', methods=['POST'])
def gas_info():
    request_data = request.get_json()
    latitude = float(request_data['latitude'])
    longitude = float(request_data['longitude'])
    start_date, end_date = get_date_range()

    point = ee.Geometry.Point([longitude, latitude])
    gases = {
        "NO2": {"id": "COPERNICUS/S5P/NRTI/L3_NO2", "band": "NO2_column_number_density", "scale": 1e9,
                "unit": "µmol/m²"},
        "SO2": {"id": "COPERNICUS/S5P/NRTI/L3_SO2", "band": "SO2_column_number_density", "scale": 1e9,
                "unit": "µmol/m²"},
        "CO": {"id": "COPERNICUS/S5P/NRTI/L3_CO", "band": "CO_column_number_density", "scale": 1e9, "unit": "mol/m²"},
        "O3": {"id": "COPERNICUS/S5P/NRTI/L3_O3", "band": "O3_column_number_density", "scale": 1e9, "unit": "µmol/m²"},
        "CH4": {"id": "COPERNICUS/S5P/OFFL/L3_CH4", "band": "CH4_column_volume_mixing_ratio_dry_air", "scale": 1,
                "unit": "ppb"},
        "HCHO": {"id": "COPERNICUS/S5P/NRTI/L3_HCHO", "band": "tropospheric_HCHO_column_number_density", "scale": 1e9,
                 "unit": "mol/m²"}
    }

    response_data = {}
    for gas, info in gases.items():
        collection = ee.ImageCollection(info["id"]) \
            .select(info["band"]) \
            .filterDate(start_date, end_date)

        mean_img = collection.mean()
        value = mean_img.reduceRegion(ee.Reducer.mean(), point, scale=1000).get(info["band"]).getInfo()

        if value is not None:
            scaled_value = value * info["scale"]
            if scaled_value < 0:
                formatted_value = "Below Detection Limit"
            else:
                formatted_value = f"{scaled_value:.2e} {info['unit']}"  # Adjust formatting based on the scale
        else:
            formatted_value = "Data not available"

        response_data[gas] = formatted_value

    return jsonify(response_data)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/trends')
def trends():
    return render_template('trends.html');


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


# Dictionary for gasses and their respective collections and bands
gas_mapping = {
    "SO2": {
        'collection_name': "COPERNICUS/S5P/NRTI/L3_SO2",
        'index_name': 'SO2_column_number_density'
    },
    "NO2": {
        'collection_name': "COPERNICUS/S5P/NRTI/L3_NO2",
        'index_name': 'NO2_column_number_density'
    },
    "CO": {
        'collection_name': "COPERNICUS/S5P/NRTI/L3_CO",
        'index_name': 'CO_column_number_density'
    },

    "HCHO": {
        'collection_name': "COPERNICUS/S5P/NRTI/L3_HCHO",
        'index_name': 'tropospheric_HCHO_column_number_density'
    },
    "O3": {
        'collection_name': "COPERNICUS/S5P/NRTI/L3_O3",
        'index_name': 'O3_column_number_density'
    },
    "CH4": {
        'collection_name': "COPERNICUS/S5P/OFFL/L3_CH4",
        'index_name': 'CH4_column_volume_mixing_ratio_dry_air'
    },
}

# collection to filter the data
countries = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017')
uae = countries.filter(ee.Filter.eq('country_na', 'United Arab Emirates'))
uae_boundaries = uae.first().geometry()

preset_reducer = 'mean'  # reducer for the data
preset_scale = 30


@app.route('/timeSeriesIndex', methods=['POST'])
def time_series_index():
    request_json = request.get_json()
    if request_json:
        gas_selection = request_json.get('gas', None)
        start_date = request_json.get('startDate', None)
        end_date = request_json.get('endDate', None)
        task = process_time_series_index.delay(gas_selection, start_date, end_date)
        return jsonify({'status': 'Task queued', 'task_id': task.id}), 202
    else:
        return jsonify({'status': 'error', 'message': 'Invalid request payload'}), 400


@celery.task(bind=True)
def process_time_series_index(self, gas_selection, start_date, end_date):
    try:
        # Assuming get_time_series_by_collection_and_index is properly defined elsewhere
        values = get_time_series_by_collection_and_index(gas_selection, start_date, end_date)
        return values
    except Exception as e:
        return {'errMsg': str(e)}


@app.route('/result/<task_id>')
def get_result(task_id):
    result = AsyncResult(task_id, app=celery)
    if result.ready():
        return jsonify(result.get()), 200
    else:
        return jsonify({'status': 'Processing'}), 202


if __name__ == '__main__':
    # Set the port to WEBSITES_PORT if it's set in the environment, otherwise default to 5000
    port = int(os.getenv('WEBSITES_PORT', 5000))
    app.run(host='0.0.0.0', port=port)
    print("Running on port:", port)
