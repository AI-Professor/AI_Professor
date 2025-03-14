import atexit
from dotenv import load_dotenv
from datetime import timedelta
import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import glob
from jose import JWTError, jwt
import json , os, sys, shutil, warnings, argparse, uvicorn, logging
from logging.handlers import RotatingFileHandler
import numpy as np
from pathlib import Path
import platform
import psutil
from pydantic import BaseModel
from pythonosc import udp_client
from queue import Queue, Empty
from sqlalchemy.orm import Session
from subprocess import Popen, PIPE
from threading import Event, Thread
import torch
from typing import Dict, List, Optional

from app import models, schemas, crud, auth
from app.database import SessionLocal, engine

from src.data_ingestion.pdf_parser import extract_text_from_pdf 
from src.data_ingestion.epub_parser import extract_text_from_epub
from src.data_ingestion.video_parser import extract_text_from_video 
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system
from src.avatar.script_generator import generate_lesson_script
from src.nlp.quiz_system import BasicQuizEngine

from local_model.NeuroSync.NeuroSync_Player.livelink.connect.livelink_init import create_socket_connection, initialize_py_face
from local_model.NeuroSync.NeuroSync_Player.livelink.animations.default_animation import default_animation_loop
from local_model.NeuroSync.NeuroSync_Player.utils.chat_utils import load_chat_history, save_chat_log
from local_model.NeuroSync.NeuroSync_Player.utils.audio_workers import tts_worker, audio_queue_worker
from local_model.NeuroSync.NeuroSync_Player.utils.llm_utils import stream_llm_chunks
from local_model.NeuroSync.NeuroSync_Local_API.utils.model.model import load_model
from local_model.NeuroSync.NeuroSync_Local_API.utils.generate_face_shapes import generate_facial_data_from_bytes
from local_model.NeuroSync.NeuroSync_Local_API.utils.config import config
from local_model.kokoro_model.kokoro.pipeline import KPipeline

warnings.filterwarnings("ignore")
load_dotenv()
server_host_name = os.getenv('SERVER_HOST_NAME')
server_front_port = os.getenv('SERVER_FRONTEND_PORT')
server_back_port = os.getenv('SERVER_BACKEND_PORT')
server_ue_port = os.getenv('SERVER_UE_PORT')
server_front_url = f"http://{server_host_name}:{server_front_port}"
server_back_url = f"http://{server_host_name}:{server_back_port}"
server_ue_url = f"http://{server_host_name}:{server_ue_port}"
local_host_name = os.getenv('LOCAL_HOST_NAME')
local_front_port = os.getenv('LOCAL_FRONTEND_PORT')
local_back_port = os.getenv('LOCAL_BACKEND_PORT')
local_ue_port = os.getenv('LOCAL_UE_PORT')
local_front_url = f"http://{local_host_name}:{local_front_port}"
local_back_url = f"http://{local_host_name}:{local_back_port}"
local_ue_url = f"http://{local_host_name}:{local_ue_port}"
audio_port = int(os.getenv('AUDIO_PORT'))
SECRET_KEY = os.environ["ENCRYPTION_KEY"]
ACCESS_TOKEN_EXPIRE_MINUTES = 30

#Initialize log functions to create system logs whenever APIs are called
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler(
            filename=os.path.join(LOG_DIR, 'app.log'),
            maxBytes=1024*1024*5,  # 5MB per log file
            backupCount=5
        ),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AI_Professor")

#Initialize backend APIs to connect with frontend calls
AUDIO_STORAGE_DIR = "local_model/NeuroSync/NeuroSync_Player/data/audio"
os.makedirs(AUDIO_STORAGE_DIR, exist_ok=True)

app = FastAPI()

#FastAPI middleware handles any request before it is processed by any path or functions
#Our backend API will be running on localhost:5001, our frontend API will be running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[server_front_url, server_back_url, server_ue_url, local_front_url, local_back_url, local_ue_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    logger.info("Health check endpoint accessed.")
    return {"status": "ok", "initialized": "True"}#bool(global_db)



# Start the program
def start_UE():
    global UE
    UE = True
    exe_path = os.path.join(os.path.dirname(__file__), 'Windows', 'AI_Professor.exe')
    args = [
        '-PixelStreamingURL=ws://127.0.0.1:8888',
        '-AllowPixelStreamingCommands',
        '-RenderOffscreen'
    ]

    # Start the game as a detached process
    game_process = Popen([exe_path] + args, shell=True)
    print(f"Game started with PID: {game_process.pid}")

def check_ffmpeg_installed():
    """Check if FFmpeg is installed on the system."""
    return shutil.which('ffmpeg') is not None

@app.on_event("startup")
async def startup_event():
    # Check platform and FFmpeg for Linux systems
    if platform.system() == "Linux" and not check_ffmpeg_installed():
        print("Running on Linux...")
        logger.warning("FFmpeg not found. Audio conversion to WebM will not work. Please install FFmpeg.")
    
    # Check if UE is running on Windows
    if platform.system() == "Windows":
        print("Running on Windows...")
        logger.info("Starting Unreal Engine...")
        #start_UE()

    # Check if UE is running on Mac
    if platform.system() == "Darwin":
        print("Running on macOS...")



# Terminate the program
def terminate_UE(name):
    UE = False
    for proc in psutil.process_iter(['pid', 'name']):
        # Check if the process name matches
        if proc.info['name'] == name:
            print(f"Terminating process {name} with PID {proc.info['pid']}")
            proc.terminate()
            try:
                proc.wait(timeout=5)
                print(f"Process {name} terminated successfully.")
            except psutil.TimeoutExpired:
                print("Process did not terminate in time. Forcing termination...")
                proc.kill()

def cleanup_audio_files():
    audio_dir = Path("local_model/NeuroSync/NeuroSync_Player/data/audio")

    # Find all .wav and .webm files separately and merge them
    files_to_delete = glob.glob(str(audio_dir / "*.wav")) + glob.glob(str(audio_dir / "*.webm"))

    for file_path in files_to_delete:
        try:
            os.remove(file_path)
            print(f"Deleted: {file_path}")
        except Exception as e:
            print(f"Error deleting {file_path}: {e}")

def clear_chatlog():
    chat_path = "local_model/NeuroSync/NeuroSync_Player/chat_logs/chat_history.json"
    with open(chat_path, 'w', encoding='utf-8') as f:
        json.dump([], f, indent=4)
    print(f"Chat log in {chat_path} has been cleared.")

@app.on_event("shutdown")
async def on_shutdown():

    if platform.system() == "Darwin":
        print("Shutting down on macOS...")
    elif platform.system() == "Linux":
        print("Shutting down on Linux...")
    elif platform.system() == "Windows":
        print("Shutting down on Windows...")
        logger.info("Shutting down Unreal Engine...")
        #terminate_UE('AI_Professor.exe')
        logger.info("Unreal Engine terminated successfully.")
    
    if 'quiz_engine' in globals():
        logger.info("Clearing quiz database...")
        quiz_engine.clear_all_questions()
        logger.info("Quiz database cleared successfully.")
    else:
        print("Quiz Engine is not initialized!")

    logger.info("Cleaning audio files...")
    cleanup_audio_files()
    logger.info("Audio files cleaned successfully.")

    logger.info("Clearing chat history...")
    clear_chatlog()
    logger.info("Chat history cleaned successfully.")



# Users
def get_userdb():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_userdb)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_email(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

@app.post("/api/register", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_userdb)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/api/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_userdb)):
    user = crud.get_user_by_email(db, email=form_data.username)

    if not user:
        raise HTTPException(status_code=400, detail="Email not registered. Please sign up first!")

    if not auth.verify_password(form_data.password, user.password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}
    
@app.get("/api/user-info", response_model=schemas.UserResponse)
async def read_user_info(current_user: schemas.UserResponse = Depends(get_current_user)):
    return current_user    

@app.patch("/api/user-info", response_model=schemas.UserResponse)
async def update_user_info(user_update: schemas.UserUpdate, db: Session = Depends(get_userdb), current_user: schemas.UserResponse = Depends(get_current_user)):
    db_user = crud.get_user_by_email(db, email=current_user.email)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    updated_user = crud.update_user(db=db, db_user=db_user, user_update=user_update)
    return updated_user


# Service
def flush_queue(q):
    try:
        while True:
            q.get_nowait()
    except Empty:
        pass

@app.post("/api/connect")
async def connect():
    try: 
        global device, model_path, blendshape_model
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model_path = 'local_model/NeuroSync/NeuroSync_Local_API/utils/model/model.pth'
        blendshape_model = load_model(model_path, config, device, use_half_precision=True)
        py_face = initialize_py_face()
        global socket_connection, osc_sender
        socket_connection = create_socket_connection()
        osc_sender = udp_client.SimpleUDPClient(local_host_name, audio_port)
        global chat_history
        chat_history = load_chat_history()
        pipeline = KPipeline(lang_code='a')
        global stop_default_animation, default_animation_thread
        stop_default_animation = Event()

        default_animation_thread = Thread(target=default_animation_loop, args=(py_face,stop_default_animation))
        default_animation_thread.start()

        # Create queues:
        # 1. chunk_queue for text chunks to be processed by TTS.
        # 2. audio_queue for the resulting audio/facial-data pairs.
        global chunk_queue, audio_queue
        chunk_queue = Queue()
        audio_queue = Queue()

        global tts_worker_thread, audio_worker_thread
        # Start the TTS worker (processes text chunks into audio)
        tts_worker_thread = Thread(target=tts_worker, args=(chunk_queue, audio_queue, pipeline))
        tts_worker_thread.start()

        # Start the audio worker (plays audio sequentially)
        audio_worker_thread = Thread(target=audio_queue_worker, args=(audio_queue, osc_sender, py_face, socket_connection, default_animation_thread, stop_default_animation))
        audio_worker_thread.start()

        return {"status": "Connected", "message": "Model loaded and workers started"}
    
    except Exception as e:
        logger.error("Error in /api/connect: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.delete("/api/disconnect")
async def disconnect():
    try:
        # Wait until all text chunks have been processed
        chunk_queue.join()
        # Signal the TTS worker to exit
        chunk_queue.put(None)
        tts_worker_thread.join()
        
        # Wait until all audio items have been played
        audio_queue.join()
        # Signal the audio worker to exit
        audio_queue.put(None)
        audio_worker_thread.join()
        
        stop_default_animation.set()
        default_animation_thread.join()
        socket_connection.close()

        return {"status": "Disonnected", "message": "Model and workers ended"}

    except Exception as e:
        logger.error("Error in /api/disconnect: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/lecture")
async def lecture(topic: dict):
    try:
        logger.info("Generating lesson scripts...")
        if not global_db:
            raise HTTPException(status_code=503, detail="System not initialized")

        flush_queue(chunk_queue)
        flush_queue(audio_queue)
        
        topic = topic['topic']
        topic_path = topic.lower().replace(" ", "_")
        
        global lesson_path
        lesson_path = f"data/processed/lesson_script/{topic_path}_lesson_script.txt"

        if os.path.exists(lesson_path):
            with open(lesson_path, "r") as file:
                lesson_script = file.read()
            print("Loaded lesson script successfully!")
        else:
            lesson_script = generate_lesson_script(global_db, "TEACHING", 1, topic, topic_path)
            print("Generated lesson script successfully!")
        
        stream_llm_chunks(lesson_script, chat_history, chunk_queue, db=global_db, is_lesson=True)
        return {"status": "Success", "message": "Lesson scripts generated successfully"}
    except Exception as e:
        logger.error("Error in /api/lecture: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/answer")
async def answer_endpoint(question_data: dict):
    try:
        logger.info("Received question: %s", question_data["question"])
        if not global_db:
            raise HTTPException(status_code=503, detail="System not initialized")

        flush_queue(chunk_queue)
        flush_queue(audio_queue)

        full_response = stream_llm_chunks(question_data["question"], chat_history, chunk_queue, db=global_db)
        chat_history.append({"input": question_data["question"], "response": full_response})
        save_chat_log(chat_history)
        return {"text": full_response}
        
    except Exception as e:
        logger.error("Error in /api/answer: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    
@app.post("/api/upload")
async def upload_file(files: List[UploadFile] = File(...)):
    try:
        # Create upload directory
        logger.info(f"Uploading {len(files)} file/s!")
        UPLOAD_DIR = "data/raw/"
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        
        text = ""
        # Save file
        for file in files:
            file_path = os.path.join(UPLOAD_DIR, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Process file
            if file.filename.lower().endswith('.pdf'):
                text += extract_text_from_pdf(file_path)
            elif file.filename.lower().endswith('.epub'):
                text += extract_text_from_epub(file_path)
            elif file.filename.lower().split('.')[-1] in ['mp4', 'mov', 'avi']:
                text += extract_text_from_video(file_path)
        
        # Initialize QA system with new content
        global global_db
        chunks = split_text(text)
        global_db = initialize_qa_system(chunks)
        
        logger.info("File processed successfully: %s", file.filename)
        return {"status": "success", "message": f"Processed {file.filename}"}
    
    except Exception as e:
        logger.error("File processing failed: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": f"File processing failed: {str(e)}"}
        )
    finally:
        if 'file' in locals():
            file.file.close()

@app.post('/api/audio_to_blendshapes')
async def audio_to_blendshapes_route(request: Request):
    audio_bytes = await request.body()
    generated_facial_data = generate_facial_data_from_bytes(audio_bytes, blendshape_model, device, config)
    generated_facial_data_list = generated_facial_data.tolist() if isinstance(generated_facial_data, np.ndarray) else generated_facial_data

    return {'blendshapes': generated_facial_data_list}



# Quiz
@app.get("/api/generate-quiz")
async def generate_quiz():
    try:
        logger.info("Generating quiz.")
        global quiz_engine
        quiz_engine = BasicQuizEngine(global_db)
        quiz_engine.generate_quiz_from_script(lesson_path)
        
        # Retrieve all questions
        cursor = quiz_engine.conn.cursor()
        cursor.execute("SELECT * FROM questions ORDER BY RANDOM() LIMIT 10")
        questions = cursor.fetchall()

        return [
            {
                "id": q[0],
                "question": q[1],
                "options": json.loads(q[2]),
                "answer": q[3],
                "concept": q[4]
            } for q in questions
        ]
    except Exception as e:
        logger.info("Quiz generation failed: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": f"Quiz generation failed: {str(e)}"}
        )

atexit.register(cleanup_audio_files)
atexit.register(clear_chatlog)

#This is a backend complete testing function. Nothing will happen at the frontend, we can test our implementations and functions here. All of the output will be shown in your terminal for testing purposes. 
def main():  
    py_face = initialize_py_face()
    socket_connection = create_socket_connection()
    osc_sender = udp_client.SimpleUDPClient(server_host_name, audio_port)
    chat_history = load_chat_history()
    pipeline = KPipeline(lang_code='a')
    stop_default_animation = Event()

    default_animation_thread = Thread(target=default_animation_loop, args=(py_face,stop_default_animation))
    default_animation_thread.start()

    # Create queues:
    # 1. chunk_queue for text chunks to be processed by TTS.
    # 2. audio_queue for the resulting audio/facial-data pairs.
    chunk_queue = Queue()
    audio_queue = Queue()

    # Start the TTS worker (processes text chunks into audio)
    tts_worker_thread = Thread(target=tts_worker, args=(chunk_queue, audio_queue, pipeline))
    tts_worker_thread.start()

    # Start the audio worker (plays audio sequentially)
    audio_worker_thread = Thread(target=audio_queue_worker, args=(audio_queue, osc_sender, py_face, socket_connection, default_animation_thread, stop_default_animation))
    audio_worker_thread.start()

    file = Path("data/raw/scrum.epub")
    text = ""
    try:
        #Ingest pdf textbook and build knowledge graph
        print("📖 Loading course material...") 
        if file.suffix.lower() == '.pdf':
            text += extract_text_from_pdf(str(file))
        elif file.suffix.lower() == '.epub':
            text += extract_text_from_epub(str(file))
        elif file.suffix.lower() in ['.mp4', '.mov', '.avi']:
            text += extract_text_from_video(str(file))

        chunks = split_text(text)
        db = initialize_qa_system(chunks)
        print("✅ Course material loaded successfully!\n")

        #Generate lesson script from knowledge graph
        #print("📝 Generating lesson script...")
        #generate_lesson_script(db, "TEACHING", 5)
        #print("✅ Lecture script prepared successfully!\n")

        #Generate lecture audio from lesson script
        #print("🔊 Rendering lecture audio...")
        #lecture_audio, audio_url = text_to_speech(text=lesson_script)
        #print(f"🔊 Full lecture audio ready: {lecture_audio}")
        #os.system(f'open {lecture_audio}')

        #Generate lecture video from lecture audio
        #print("🎥 Rendering lecture video...")
        #lecture_video = create_talking_avatar(audio_url=audio_url)
        #print(f"🎥 Full lecture video ready: {lecture_video}")
        #os.system(f'open {lecture_video}')  
            
    except Exception as e:
        print(f"❌ Failed to load course material: {str(e)}")
        return

    # Interactive Q&A loop  
    print("👩🏫 AI Professor is ready! Ask a question (type 'exit' to quit):")  
    try:
        while True:  
            user_input = input("\nYou: ")  
            if user_input.lower() == "exit":  
                break

            # Interrupt current playback:
            flush_queue(chunk_queue)
            flush_queue(audio_queue)
                
            print("\n💭 Thinking...", end="\r")
            
            # Get answer with avatar components
            full_response = stream_llm_chunks(user_input, chat_history, chunk_queue, db=db)
            print(f"\n👩🏫 AI Professor: {full_response}")
            chat_history.append({"input": user_input, "response": full_response})
            save_chat_log(chat_history)

    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        
    finally:
        # Wait until all text chunks have been processed
        chunk_queue.join()
        # Signal the TTS worker to exit
        chunk_queue.put(None)
        tts_worker_thread.join()
        
        # Wait until all audio items have been played
        audio_queue.join()
        # Signal the audio worker to exit
        audio_queue.put(None)
        audio_worker_thread.join()
        
        stop_default_animation.set()
        default_animation_thread.join()
        socket_connection.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['cli', 'api'], default='api')
    args = parser.parse_args()

    if args.mode == 'cli':
        #If you want to run main() function for backend testing, run this command in your terminal: python main.py --mode=cli
        logger.info("Starting CLI mode.")
        main()
    else:
        #This will start our backend API and connect with frontend functions. Run this command whenever you want to see backend API calls and frontend reactions: python main.py
        logger.info(f"Starting API server on port {local_back_port}.")
        print(f"Allowed origins for CORS middleware: {[server_front_url, server_back_url, server_ue_url, local_front_url, local_back_url, local_ue_url]}")
        uvicorn.run(app, host=local_host_name, port=int(local_back_port))
