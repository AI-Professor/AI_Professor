# utils/audio_workers.py
import time
from utils.neurosync_api_connect import send_audio_to_neurosync, read_audio_file_as_bytes, validate_audio_bytes
from utils.local_tts import call_local_tts 
from utils.generated_utils import run_audio_animation_from_bytes
from livelink.connect.livelink_init import UDP_IP, LIVELINK_PORT, AUDIO_PORT
import os


def tts_worker(chunk_queue, audio_queue, pipeline):
    """
    Processes text chunks from chunk_queue by generating audio (using local TTS or ElevenLabs)
    and retrieving corresponding facial data, then enqueues the results into audio_queue.
    """
    try:
        while True:
            chunk = chunk_queue.get()
            if chunk is None:
                break

            audio_path, webm_path = call_local_tts(chunk, pipeline)
            audio_bytes = read_audio_file_as_bytes(audio_path)
            if audio_bytes is None:
                print(f"Failed to read {audio_path}")
                chunk_queue.task_done()
                return
            
            if validate_audio_bytes(audio_bytes):
                facial_data = send_audio_to_neurosync(audio_bytes)
                if facial_data:
                    audio_queue.put((audio_path, webm_path, facial_data))
                else:
                    print("Failed to get facial data for chunk:", chunk)
            else:
                print("Failed to generate audio for chunk:", chunk)
            chunk_queue.task_done()
    finally:
        return None


def audio_queue_worker(audio_queue, osc_sender, py_face, socket_connection, default_animation_thread, stop_default_animation):
    """
    Processes audio items from audio_queue sequentially.
    Each item is a tuple (audio_bytes, facial_data, audio_id, sync_id) that is played back via UE,
    ensuring that the animations remain in sync.
    """
    while True:
        item = audio_queue.get()
        if item is None:
            break
        audio_path, webm_path, facial_data = item

        run_audio_animation_from_bytes(audio_path, webm_path, osc_sender, facial_data, py_face, socket_connection, default_animation_thread, stop_default_animation)
        audio_queue.task_done()
