import numpy as np
from local_model.kokoro.kokoro.pipeline import KPipeline
import os
from dotenv import load_dotenv
from pathlib import Path
import time
import requests
import soundfile as sf

#Get API key from our .env file for API calls to D-ID(video)
load_dotenv()
api_key = os.getenv("DID_API_KEY")

#This function convert text to speech and store in our assets/audio folder.
#Then it also uploade the audio to D-ID to get ready for synthesizing with the video.
#This function will return two strings. The audio path for where it is stored and the audio url on D-ID
def text_to_speech(text: str):
    """Convert text to speech using Kokoro"""
    audio_dir = Path(__file__).parent.parent.parent / "data" / "processed" / "audio"

    filename = f"lecture_{int(time.time())}.mp3"
    audio_path = audio_dir / filename

    pipeline = KPipeline(lang_code='a')
    generator = pipeline(
    text, voice='af_heart', # <= change voice here
    speed=1, split_pattern=r'\n+'
    )   
    audio_data = []
    for i, (gs, ps, audio) in enumerate(generator):
        audio_data.append(audio)  # Collect all generated audio

    # Combine all audio data into one NumPy array
    audio_stream = np.concatenate(audio_data)

    sf.write(audio_path, audio_stream, 24000)

    """
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
    """
    
    return str(audio_path)#, str(audio_url)