from elevenlabs.client import ElevenLabs
import os
from dotenv import load_dotenv

load_dotenv()

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

#This function convert text to speech and store in our assets/audio folder
def text_to_speech(text: str, output_file: str = "assets/audio/response.mp3"):
    """Convert text to speech using ElevenLabs"""
    # Create directory if needed
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Generate and save audio
    audio_stream = client.generate(
        text=text,
        voice="Rachel",
        model="eleven_monolingual_v1"
    )
    
    # Stream the audio chunks to file
    with open(output_file, "wb") as f:
        for chunk in audio_stream:
            if chunk:
                f.write(chunk)
    
    return output_file