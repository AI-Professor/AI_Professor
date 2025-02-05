import whisper
from pytube import YouTube
import tempfile
import os

#This function will take any video input and transcribe information to text using Whisper model
def transcribe_video(video_path: str, is_youtube: bool = False) -> str:
    model = whisper.load_model("base")
    
    if is_youtube:
        yt = YouTube(video_path)
        stream = yt.streams.filter(only_audio=True).first()
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "audio.mp4")
            stream.download(output_path=tmpdir, filename="audio.mp4")
            result = model.transcribe(audio_path)
    else:
        result = model.transcribe(video_path)
    
    return result["text"]

#This function will extract all text content from the transcribed video text
def extract_text_from_video(video_path: str, is_youtube: bool = False) -> str:
    try:
        return transcribe_video(video_path, is_youtube)
    except Exception as e:
        print(f"Error processing video: {str(e)}")
        raise