# This code is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.
# For more details, visit: https://creativecommons.org/licenses/by-nc/4.0/
import time
import numpy as np
import soundfile as sf
from scipy.io.wavfile import write

def convert_to_wav(audio_path):
    """Convert any audio file to WAV format if it's not already WAV."""
    data, samplerate = sf.read(audio_path)
    data = (data * 32767).astype(np.int16)  # Ensure 16-bit PCM
    write(audio_path, samplerate, data)
    return audio_path

def send_osc_audio(audio_path, start_event, osc_sender):
    try:
        start_event.wait()

        osc_sender.send_message("/audio", audio_path)
        time.sleep(1)
    except KeyboardInterrupt:
        pass


