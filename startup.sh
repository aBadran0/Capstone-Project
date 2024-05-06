#!/bin/bash

# Start Gunicorn
gunicorn --workers=4 --threads=4 --worker-class=gthread --bind 0.0.0.0:8000 app:app
apikey1234&

# Start Celery worker
celery -A app.celery worker --loglevel=info --concurrency=4 &

# Keep script running
wait