import requests
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("DID_API_KEY")

url = "https://api.d-id.com/talks/tlk_3r7UniKwJTGjJKlW_mkO1"

headers = {
    "accept": "application/json",
    "authorization": f"Basic {api_key}"
}

response = requests.delete(url, headers=headers)

print(response.status_code)