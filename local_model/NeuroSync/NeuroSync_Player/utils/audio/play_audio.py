# This code is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.
# For more details, visit: https://creativecommons.org/licenses/by-nc/4.0/
import json
import os
import platform
import re
import subprocess
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

def convert_to_webm(audio_path):
    """Create a WebM file with parameters optimized for the input audio."""
    output_path = os.path.splitext(audio_path)[0] + '.webm'
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', audio_path,
            
            # Video Source (silent placeholder)
            '-f', 'lavfi',
            '-i', 'color=c=black:s=320x240:r=30',  # 30fps dummy video
            '-loop', '1',  # Loop single frame
            '-af', 'adelay=1000|1000',
            # Audio Encoding
            '-c:a', 'libopus',
            '-ar', '48000',
            '-ac', '1',  # Force stereo
            '-b:a', '32k',  # Optimal bitrate for voice
            '-vbr', 'on',  # Variable bitrate
            '-compression_level', '0',
            '-frame_duration', '10',  # 20ms frames
            
            # Video Encoding (minimal)
            '-c:v', 'libvpx',
            '-r', '30',
            '-g', '300',
            '-keyint_min', '150',
            '-deadline', 'realtime',
            
            # Synchronization
            '-shortest',
            '-fflags', '+shortest',
            output_path
        ]
        
        print(f"Creating WebM with optimized parameters: {' '.join(cmd)}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        
        if result.returncode != 0:
            error = result.stderr.decode() if result.stderr else "Unknown error"
            print(f"FFmpeg error: {error}")
            
            # Fall back to basic WebM with PCM audio as last resort
            print("Trying basic WebM with PCM audio...")
            basic_cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=15',
                '-i', audio_path,
                '-shortest',
                '-c:v', 'libvpx',
                '-c:a', 'pcm_s16le',
                output_path
            ]
            
            basic_result = subprocess.run(basic_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            if basic_result.returncode != 0:
                basic_error = basic_result.stderr.decode() if basic_result.stderr else "Unknown error"
                print(f"Basic WebM creation failed: {basic_error}")
                return None
        
        # Verify the output file
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            print(f"Successfully created WebM: {output_path}")
            return output_path
        else:
            print(f"WebM creation failed: File not created or empty")
            return None
            
    except Exception as e:
        print(f"Error creating WebM: {e}")
        return None

def send_osc_audio(audio_path, webm_path, start_event, osc_sender):
    try:
        start_event.wait()

        # Handle different OS platforms
        system = platform.system()
        if system == "Linux":
            # For Linux, convert to WebM before sending
            osc_sender.send_message("/audio", webm_path)
        else:
            # For Windows and other OS, use WAV directly
            osc_sender.send_message("/audio", audio_path)
            
        time.sleep(1)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Error sending audio via OSC: {e}")

