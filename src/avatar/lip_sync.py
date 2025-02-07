import os
import requests
from dotenv import load_dotenv
import time
import uuid
from pathlib import Path

load_dotenv()

#This function will use the audio we created from tts and combine with our avatar image to create an avatar video and store in the path. It will return the video path where the video is stored in our backend.
def create_talking_avatar(audio_url: str) -> str:
    """Robust D-ID API integration with proper error handling"""
    api_key = os.getenv("DID_API_KEY")
    if not api_key:
        raise ValueError("DID_API_KEY missing from .env")
    
    video_dir = Path(__file__).parent.parent.parent / "assets" / "videos"

    try:
        response = requests.post(
            "https://api.d-id.com/talks",
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": f"Basic {api_key}"
            }, 
            json={
                "source_url": "s3://d-id-images-prod/google-oauth2|104334720993388125263/img_dA-Rhe522l1ZtWP8BO3HH/avatar.jpg",
                "script": {
                    "type": "audio",
                    "audio_url" : f"{audio_url}"
                }
            }, 
            timeout=30)

        if response.status_code != 201:
            raise Exception(f"Video creation failed: {response.text}")

        talk_id = response.json()["id"]
        print(f"Video processing started. Talk ID: {talk_id}")

        # Poll for completion status
        max_attempts = 20  # Allow up to 40 seconds (20 attempts * 2 seconds)
        for attempt in range(max_attempts):
            status_response = requests.get(
                f"https://api.d-id.com/talks/{talk_id}",
                headers = {
                    "accept": "application/json",
                    "authorization": f"Basic {api_key}"
                }
            )
            status_data = status_response.json()
            
            if status_data["status"] == "done":
                video_url = status_data["result_url"]
                break
            elif status_data["status"] in ["created", "started", "processing"]:
                print(f"Status: {status_data['status']} - Retrying in 2 seconds...")
                time.sleep(2)
            else:
                raise Exception(f"Unexpected status: {status_data['status']}")
        else:
            raise Exception("Video processing timed out")

        # Download the video
        video_response = requests.get(video_url)
        video_filename = f"video_{uuid.uuid4().hex[:8]}.mp4"
        video_path = video_dir / video_filename
        
        with open(video_path, "wb") as f:
            f.write(video_response.content)
        
        print(str(video_path))

        return str(video_path)

    except requests.exceptions.RequestException as e:
        raise Exception(f"API request failed: {str(e)}")

    