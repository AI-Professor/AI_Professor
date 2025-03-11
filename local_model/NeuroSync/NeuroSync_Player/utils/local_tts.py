# utils/local_tts.py
import os
from pathlib import Path
import time
import numpy as np
import soundfile as sf
import uuid

def call_local_tts(text, pipeline):
    """
    Calls the local TTS Flask endpoint to generate speech for the given text.
    Returns the audio bytes if successful, otherwise returns None.
    """
    AUDIO_DIR = "local_model/NeuroSync/NeuroSync_Player/data/audio"
    os.makedirs(AUDIO_DIR, exist_ok=True)
    audio_dir = Path(__file__).parent.parent / "data" / "audio"

    sync_id = str(uuid.uuid4())
    filename = f"{sync_id}.wav"
    audio_path = audio_dir / filename
    try:
        generator = pipeline(
        text, voice='am_adam', # <= change voice here
        speed=1, split_pattern=None
        )
        audio_data=[]
        for i, (gs, ps, audio) in enumerate(generator):
            audio_data.append(audio)  # Collect all generated audio
        
        # Combine all audio data into one NumPy array
        audio_stream = np.concatenate(audio_data)

        sf.write(audio_path, audio_stream, 24000)

        return str(audio_path), sync_id
    except Exception as e:
        print(f"Error calling local TTS: {e}")
        return None
