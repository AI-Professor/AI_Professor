from elevenlabs.client import ElevenLabs
import os
from dotenv import load_dotenv
from pathlib import Path
import time
import requests

#Get API key from our .env file for API calls to D-ID(video) and ELEVENLABS(audio) model
load_dotenv()
api_key = os.getenv("DID_API_KEY")
client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

#This function convert text to speech and store in our assets/audio folder.
#Then it also uploade the audio to D-ID to get ready for synthesizing with the video.
#This function will return two strings. The audio path for where it is stored and the audio url on D-ID
def text_to_speech(text: str):
    """Convert text to speech using ElevenLabs"""
    audio_dir = Path(__file__).parent.parent.parent / "data" / "processed" / "audio"

    filename = f"lecture_{int(time.time())}.mp3"
    audio_path = audio_dir / filename
    
    # Generate and save audio
    audio_stream = client.generate(
        text=text,
        voice="Brian",
        model="eleven_monolingual_v1",
        stream=True
    )
    
    # Stream the audio chunks to file
    with open(audio_path, "wb") as f:
        for chunk in audio_stream:
            if chunk:
                f.write(chunk)

    upload_audio_response = requests.post(
            "https://api.d-id.com/audios",
            headers={
                "accept": "application/json",
                "authorization": f"Basic {api_key}"
            },
            files={
                "audio": (f"{filename}", open(f"{audio_path}", "rb"), "audio/mpeg")
            },
            timeout=30
        )
    if upload_audio_response.status_code != 201:
            raise Exception(f"Audio upload failed: {upload_audio_response.text}")
    audio_url = upload_audio_response.json()["url"]

    
    return str(audio_path), str(audio_url)