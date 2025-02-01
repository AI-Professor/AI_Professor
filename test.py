import requests
from dotenv import load_dotenv
import os

load_dotenv()

api_key = os.getenv("DID_API_KEY")

url = "https://api.d-id.com/talks"

headers = {
    "accept": "application/json",
    "authorization": f"Basic {api_key}"
}

response = requests.get(url, headers=headers)

print(len(response.json()["talks"]))
print(response.json()["talks"][0]["id"])
