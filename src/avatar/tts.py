from elevenlabs.client import ElevenLabs
import os
from dotenv import load_dotenv
from pathlib import Path
import time

load_dotenv()

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

#This function convert text to speech and store in our assets/audio folder
def text_to_speech(text: str):
    """Convert text to speech using ElevenLabs"""
    audio_dir = Path(__file__).parent.parent.parent / "assets" / "audio"

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
    
    return str(audio_path)