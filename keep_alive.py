from time import sleep
from os import environ
import requests
import logging

logging.basicConfig(level=logging.INFO)

BASE_URL = environ.get("BASE_URL")
PORT = environ.get("PORT")  # optional, but useful on some platforms

if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")

def ping():
    try:
        r = requests.get(BASE_URL, timeout=10)
        logging.info(f"Keep-alive ping: {r.status_code}")
    except Exception as e:
        logging.error(f"Keep-alive error: {e}")

if BASE_URL and PORT:
    while True:
        ping()
        sleep(600)  # 10 minutes
else:
    logging.warning("BASE_URL or PORT not set — keep-alive disabled")
