"""Flask server: serves the voice calculator page, the calculation API and Azure Speech tokens."""
import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

from web_calculator import WebCalculator

# Read SPEECH_KEY and SPEECH_REGION from the .env file in the repository root
load_dotenv()

SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION")

# Files in static/ are served from the root URL: /style.css, /script.js
app = Flask(__name__, static_folder="static", static_url_path="")
calculator = WebCalculator()


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.post("/api/calculate")
def calculate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Request body must be a JSON object"), 400

    try:
        result = calculator.calculate(data.get("a"), data.get("operator"), data.get("b"))
    except (ValueError, ZeroDivisionError) as error:
        return jsonify(error=str(error)), 400

    return jsonify(result=result)


@app.get("/api/speech-token")
def speech_token():
    """Exchange the secret key for a 10-minute token, so the key never reaches the browser."""
    if not SPEECH_KEY or not SPEECH_REGION:
        return jsonify(error="SPEECH_KEY or SPEECH_REGION is missing in the .env file"), 500

    try:
        response = requests.post(
            f"https://{SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken",
            headers={"Ocp-Apim-Subscription-Key": SPEECH_KEY},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException:
        return jsonify(error="Could not get a speech token from Azure"), 502

    return jsonify(token=response.text, region=SPEECH_REGION)


if __name__ == "__main__":
    app.run(debug=True)
