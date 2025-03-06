# utils/audio_workers.py
from utils.neurosync_api_connect import send_audio_to_neurosync, read_audio_file_as_bytes
from utils.local_tts import call_local_tts 
from utils.generated_utils import run_audio_animation_from_bytes
import os

def tts_worker(chunk_queue, audio_queue, audio_files_queue, pipeline):
    """
    Processes text chunks from chunk_queue by generating audio (using local TTS or ElevenLabs)
    and retrieving corresponding facial data, then enqueues the results into audio_queue.
    """
    while True:
        chunk = chunk_queue.get()
        if chunk is None:
            break

        wav_file, audio_id = call_local_tts(chunk, pipeline)
        audio_bytes = read_audio_file_as_bytes(wav_file)
        if audio_bytes is None:
            print(f"Failed to read {wav_file}")
            chunk_queue.task_done()
            return
        
        if audio_bytes:
            facial_data = send_audio_to_neurosync(audio_bytes)
            if facial_data:
                audio_queue.put((audio_bytes, facial_data, audio_id))
                audio_files_queue.put(audio_id)
            else:
                print("Failed to get facial data for chunk:", chunk)
        else:
            print("Failed to generate audio for chunk:", chunk)
        chunk_queue.task_done()
        audio_files_queue.task_done()

def audio_queue_worker(audio_queue, py_face, socket_connection, default_animation_thread, stop_default_animation):
    """
    Processes audio items from audio_queue sequentially.
    Each item is a tuple (audio_bytes, facial_data) that is played back,
    ensuring that the animations remain in sync.
    """
    while True:
        item = audio_queue.get()
        if item is None:
            break

        if len(item) == 3:
            audio_bytes, facial_data, audio_id = item
        else:
            audio_bytes, facial_data = item
            audio_id = None

        run_audio_animation_from_bytes(audio_bytes, facial_data, py_face, socket_connection, default_animation_thread, stop_default_animation)
        audio_queue.task_done()


