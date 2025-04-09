import atexit
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from datetime import timedelta
import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends, status, Form
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import glob
from jose import JWTError, jwt
import json , os, sys, shutil, warnings, argparse, uvicorn, logging
from langchain_community.vectorstores import FAISS  
from langchain_community.embeddings import OpenAIEmbeddings
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
import time
import torch
from typing import Dict, List, Optional
import base64

from app import models, schemas, crud, auth, captcha
from app.database import SessionLocal, engine

from src.data_ingestion.pdf_parser import extract_text_from_pdf 
from src.data_ingestion.epub_parser import extract_text_from_epub
from src.data_ingestion.video_parser import extract_text_from_video 
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system
from src.avatar.script_generator import generate_lesson_script
from src.nlp.quiz_system import BasicQuizEngine, get_quiz_engine

from local_model.NeuroSync.NeuroSync_Player.livelink.connect.livelink_init import create_socket_connection, initialize_py_face
from local_model.NeuroSync.NeuroSync_Player.livelink.animations.default_animation import default_animation_loop
from local_model.NeuroSync.NeuroSync_Player.utils.chat_utils import load_chat_history, save_chat_log, clear_chat_log
from local_model.NeuroSync.NeuroSync_Player.utils.audio_workers import tts_worker, audio_queue_worker
from local_model.NeuroSync.NeuroSync_Player.utils.llm_utils import stream_llm_chunks
from local_model.NeuroSync.NeuroSync_Local_API.utils.model.model import load_model
from local_model.NeuroSync.NeuroSync_Local_API.utils.generate_face_shapes import generate_facial_data_from_bytes
from local_model.NeuroSync.NeuroSync_Local_API.utils.config import config
from local_model.kokoro_model.kokoro.pipeline import KPipeline

from src.Multiuser.session_manager import SessionManager

warnings.filterwarnings("ignore")
load_dotenv()
local_host_name = os.getenv('LOCAL_HOST_NAME')
external_ip = os.getenv('EXTERNAL_IP')
udp_ip = os.getenv('UDP_IP')
front_port = os.getenv('FRONTEND_PORT')
back_port = os.getenv('BACKEND_PORT')
ue_port = os.getenv('UE_PORT')
local_front_url = f"http://{local_host_name}:{front_port}"
local_back_url = f"http://{local_host_name}:{back_port}"
local_ue_url = f"http://{local_host_name}:{ue_port}"
external_front_url = f"http://{external_ip}:{front_port}"
external_back_url = f"http://{external_ip}:{back_port}"
external_ue_url = f"http://{external_ip}:{ue_port}"
info_port = int(os.getenv('INFO_PORT'))
SECRET_KEY = os.environ["ENCRYPTION_KEY"]
ACCESS_TOKEN_EXPIRE_MINUTES = 30
openai_api_key = os.getenv("OPENAI_API_KEY")

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
session_manager = SessionManager(logger)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model_path = 'local_model/NeuroSync/NeuroSync_Local_API/utils/model/model.pth'
blendshape_model = load_model(model_path, config, device, use_half_precision=True)
gpu_executor = ThreadPoolExecutor(max_workers=1)


#FastAPI middleware handles any request before it is processed by any path or functions
#Our backend API will be running on localhost:5001, our frontend API will be running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[external_front_url, external_back_url, external_ue_url, local_front_url, local_back_url, local_ue_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    logger.info("Health check endpoint accessed.")
    return {"status": "ok", "initialized": "True"}#bool(global_db)


@app.on_event("startup")
async def startup_event():
    global  info_sender, pipeline
    info_sender = udp_client.SimpleUDPClient(udp_ip, info_port)
    pipeline = KPipeline(lang_code='a')



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

@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Cleaning up backend resource...")
    session_manager.cleanup()
    logger.info("Backend source cleaned successfully.")

    logger.info("Cleaning audio files...")
    cleanup_audio_files()
    logger.info("Audio files cleaned successfully.")

atexit.register(cleanup_audio_files)

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

@app.get("/api/captcha")
async def get_captcha_endpoint():
    logger.info("GET /api/captcha endpoint called")  # Added debug log
    cap = captcha.get_captcha()
    # Encode image bytes to base64
    encoded_image = base64.b64encode(cap["image"]).decode("utf-8")
    return {"captcha_id": cap["captcha_id"], "captcha_image": encoded_image}

@app.post("/api/register", response_model=schemas.UserResponse)
async def register_user(
    first_name: str = Form(...),
    last_name: str = Form(...),
    user_name: str = Form(...),
    university_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    captcha_id: str = Form(...),
    captcha_text: str = Form(...)
):
    # Validate captcha first
    if not captcha_id or not captcha_text or not captcha.verify_captcha(captcha_id, captcha_text):
        raise HTTPException(status_code=400, detail="Invalid captcha")

    db = SessionLocal()
    try:
        # Check if email already exists
        db_user = crud.get_user_by_email(db, email=email)
        if db_user:
            raise HTTPException(status_code=400, detail="Email already registered")

        # Create user schema
        user = schemas.UserCreate(
            first_name=first_name,
            last_name=last_name,
            user_name=user_name,
            university_name=university_name,
            email=email,
            password=password
        )
        return crud.create_user(db=db, user=user)
    finally:
        db.close()

@app.post("/api/token", response_model=schemas.Token)
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_userdb)):
    # Captcha verification
    form = await request.form()
    captcha_id = form.get("captcha_id")
    captcha_text = form.get("captcha_text")
    if not captcha_id or not captcha_text or not captcha.verify_captcha(captcha_id, captcha_text):
        raise HTTPException(status_code=400, detail="Invalid captcha")
    
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
async def connect(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try: 
        user_id = str(current_user.user_id)
        
        # Check if the user already has an active session
        existing_sessions = session_manager.get_user_sessions(user_id)
        if existing_sessions:
            # You can either return the existing session or terminate it and create a new one
            # For this implementation, we'll return the existing session
            session = existing_sessions[0]
            session.update_activity()
            
            # Return the session info for the frontend to connect
            return {
                "status": "Connected",
                "message": "Using existing connection",
                "session_id": session.session_id,
                "livelink_port": session.livelink_port,
                "py_face_name": session.py_face_name,
                "audio_port": session.audio_port,
                "streamer_id": session.ue_instance.streamer_id if session.ue_instance else None,
                "websocket_port": session.ue_instance.websocket_port if session.ue_instance else None,
                "signaling_port": session.ue_instance.signaling_port if session.ue_instance else None
            }
        
        # Create a new session for this user
        session = session_manager.create_session(user_id)
        logger.info(f"Waiting for UE instance to start for session {session.session_id}")
        
        # Wait up to 15 seconds for the UE instance to be ready
        max_attempts = 15
        for attempt in range(max_attempts):
            if session.ue_instance and session.ue_instance.is_running():
                logger.info(f"UE instance running successfully for session {session.session_id} after {attempt+1} attempts")
                break
            
            # Wait a second before checking again
            await asyncio.sleep(1)
            
            if attempt == max_attempts - 1:
                logger.warning(f"UE instance may not be fully started for session {session.session_id} after {max_attempts} attempts")

        await asyncio.sleep(15)

        info_sender.send_message(f'/Game/LivelinkPresets/Preset_{session.livelink_port}', (session.audio_port, session.py_face_name))

        await asyncio.sleep(10)

        # Initialize PyFace and connections
        py_face = initialize_py_face(name=session.py_face_name)
        socket_connection = create_socket_connection(session.livelink_port)
        audio_sender = udp_client.SimpleUDPClient(udp_ip, session.audio_port)
        
        # Load user-specific chat history for this session
        chat_history = load_chat_history(user_id=user_id, session_id=session.session_id)
        
        # Initialize default animation
        stop_default_animation = Event()
        default_animation_thread = Thread(
            target=default_animation_loop, 
            args=(py_face, stop_default_animation, session.livelink_port)
        )
        default_animation_thread.start()
        
        # Set up queues for the session
        chunk_queue = Queue()
        audio_queue = Queue()
        
        # Start worker threads
        tts_worker_thread = Thread(
            target=tts_worker, 
            args=(chunk_queue, audio_queue, pipeline)
        )
        tts_worker_thread.start()
        
        audio_worker_thread = Thread(
            target=audio_queue_worker, 
            args=(audio_queue,
                  session.livelink_port,
                  session.py_face_name, 
                  audio_sender, 
                  py_face, 
                  socket_connection, 
                  default_animation_thread, 
                  stop_default_animation)
        )
        audio_worker_thread.start()
        
        # Store all these resources in the session
        session.py_face = py_face
        session.socket_connection = socket_connection
        session.chat_history = chat_history
        session.stop_default_animation = stop_default_animation
        session.default_animation_thread = default_animation_thread
        session.chunk_queue = chunk_queue
        session.audio_queue = audio_queue
        session.tts_worker_thread = tts_worker_thread
        session.audio_worker_thread = audio_worker_thread
   
        return {
            "status": "Connected", 
            "message": "Model loaded and workers started",
            "session_id": session.session_id,
            "livelink_port": session.livelink_port,
            "py_face_name": session.py_face_name,
            "audio_port": session.audio_port,
            "streamer_id": session.ue_instance.streamer_id if session.ue_instance else None,
            "websocket_port": session.ue_instance.websocket_port if session.ue_instance else None,
            "signaling_port": session.ue_instance.signaling_port if session.ue_instance else None
        }
    
    except Exception as e:
        logger.error("Error in /api/connect: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/session-status")
async def check_session_status(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    """
    Check the status of a session, including whether it has an active UE instance,
    knowledge database, etc. This endpoint will return information about the session
    even if the UE instance is paused.
    """
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to access this session")
        
        # Check if the UE instance is running - but don't require it for quizzes
        ue_running = False
        if session.ue_instance:
            ue_running = session.ue_instance.is_running()
        
        # Return detailed session status that includes whether knowledge db exists
        return {
            "session_id": session.session_id,
            "py_face_name": session.py_face_name,
            "livelink_port": session.livelink_port,
            "audio_port": session.audio_port,
            "ue_instance_running": ue_running,
            "status": session.ue_instance.status if session.ue_instance else "no_instance",
            "has_knowledge_db": session.knowledge_db is not None,
            "has_quiz_engine": session.quiz_engine is not None,
            "has_lesson_path": session.lesson_path is not None
        }
        
    except Exception as e:
        logger.error(f"Error checking session status for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/user-sessions")
async def get_user_sessions(current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        user_id = str(current_user.user_id)
        sessions = session_manager.get_user_sessions(user_id)
        
        # Format the response
        return {
            "user_id": user_id,
            "sessions": [session.get_session_info() for session in sessions]
        }
    
    except Exception as e:
        logger.error("Error in /api/user-sessions: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/lecture")
async def lecture(request: Request, topic: dict, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id from request body
        session_id = topic.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Check if the user has uploaded content
        if not session.knowledge_db:
            raise HTTPException(status_code=400, detail="No knowledge database found. Please upload content first.")
        
        logger.info("Generating lesson scripts...")
        
        user_id = str(current_user.user_id)
        topic_value = topic['topic']
        topic_path = topic_value.lower().replace(" ", "_")
        
        # Generate lesson script with user-specific path
        lesson_script, lesson_script_path = generate_lesson_script(
            db=session.knowledge_db, 
            template="TEACHING", 
            length=1, 
            topic=topic_value, 
            topic_path=topic_path,
            user_id=user_id
        )
        
        # Check if the topic is relevant to the content
        if not lesson_script or not lesson_script_path:
            logger.warning(f"Topic '{topic_value}' is not relevant to the uploaded content.")
            return JSONResponse(
                status_code=400,
                content={
                    "status": "Failed", 
                    "message": f"The topic '{topic_value}' appears to be unrelated to the content you've uploaded. Please choose a topic that's relevant to your material."
                }
            )
        
        # Store the lesson path in the session
        session.lesson_path = lesson_script_path
        
        # Generate quiz questions for this topic
        try:
            session.quiz_engine.generate_quiz_from_script(session.lesson_path, topic_path)
            # Store the current topic
            session.last_topic = topic_path
        except Exception as quiz_error:
            logger.error(f"Error generating quiz: {str(quiz_error)}")
            # Continue even if quiz generation fails
            
        # Calculate approximate lecture duration (chars * avg ms per char)
        chars_count = len(lesson_script)
        estimated_duration_ms = chars_count * 60 + 10000  # 60ms per char + 10s base
        
        # Ensure session won't expire during playback by updating last_activity with future time
        # This guarantees the session won't be cleaned up as inactive during playback
        buffer_time = 300  # 5 additional minutes as buffer
        future_time = time.time() + (estimated_duration_ms / 1000) + buffer_time
        session.last_activity = future_time
        
        logger.info(f"Extended session {session_id} activity time to prevent timeout during lecture playback")
        
        # Stream the script to the frontend
        stream_llm_chunks(lesson_script, session.chat_history, session.chunk_queue, db=session.knowledge_db, is_lesson=True)
        return {"status": "Success", "message": "Lesson scripts generated successfully", "script": lesson_script}
    
    except Exception as e:
        logger.error(f"Error in /api/lecture for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/save-lecture-history")
async def save_lecture_history(request: Request, lecture_data: dict, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id from request body
        session_id = lecture_data.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Get lecture content
        lecture_content = lecture_data.get("content")
        if not lecture_content:
            raise HTTPException(status_code=400, detail="Lecture content is required")
        
        user_id = str(current_user.user_id)
        
        # Create lecture history directory if it doesn't exist
        lecture_history_dir = f"data/processed/lecture_history/{user_id}/{session_id}"
        os.makedirs(lecture_history_dir, exist_ok=True)
        
        # Save lecture history
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{lecture_history_dir}/lecture_{timestamp}.json"
        
        with open(filename, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": timestamp,
                "topic": lecture_data.get("topic", "Unknown Topic"),
                "content": lecture_content
            }, f, indent=4)
        
        return {"status": "success", "message": "Lecture history saved successfully"}
    
    except Exception as e:
        logger.error(f"Error saving lecture history for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/lecture-history")
async def get_lecture_history(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to access this lecture history")
        
        user_id = str(current_user.user_id)
        lecture_history_dir = f"data/processed/lecture_history/{user_id}/{session_id}"
        
        # If directory doesn't exist, return empty history
        if not os.path.exists(lecture_history_dir):
            return {"lecture_history": []}
        
        # Get all lecture history files
        lecture_files = [f for f in os.listdir(lecture_history_dir) if f.endswith('.json')]
        lecture_files.sort(reverse=True)  # Most recent first
        
        # Read lecture history
        lecture_history = []
        for file in lecture_files:
            with open(os.path.join(lecture_history_dir, file), "r", encoding="utf-8") as f:
                lecture_data = json.load(f)
                lecture_history.append(lecture_data)
        
        return {"lecture_history": lecture_history}
    
    except Exception as e:
        logger.error(f"Error retrieving lecture history for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/answer")
async def answer_endpoint(request: Request, question_data: dict, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id from request body
        session_id = question_data.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Check if the user has uploaded content
        if not session.knowledge_db:
            raise HTTPException(status_code=400, detail="No knowledge database found. Please upload content first.")
        
        user_id = str(current_user.user_id)
        logger.info(f"Received question from user {user_id}: {question_data['question']}")

        flush_queue(session.chunk_queue)
        flush_queue(session.audio_queue)

        # Use the session-specific knowledge database
        full_response = stream_llm_chunks(
            question_data["question"], 
            session.chat_history, 
            session.chunk_queue, 
            db=session.knowledge_db
        )
        
        session.chat_history.append({"input": question_data["question"], "response": full_response})
        save_chat_log(session.chat_history, user_id=user_id, session_id=session_id)
        
        return {"text": full_response}
        
    except Exception as e:
        logger.error(f"Error in /api/answer for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/chat-history")
async def get_chat_history(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to access this chat history")
        
        # Return the chat history from the session
        return {"chat_history": session.chat_history}
        
    except Exception as e:
        logger.error(f"Error retrieving chat history for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/upload")
async def upload_file(request: Request, files: List[UploadFile] = File(...), current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id from request
        form_data = await request.form()
        session_id = form_data.get("session_id")
        
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Create upload directory for this user
        user_id = str(current_user.user_id)
        user_upload_dir = f"data/raw/{user_id}"
        os.makedirs(user_upload_dir, exist_ok=True)
        
        logger.info(f"Uploading {len(files)} file/s for user {user_id}!")
        
        text = ""
        # Save file
        for file in files:
            file_path = os.path.join(user_upload_dir, file.filename)
            input_name, extension = os.path.splitext(file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Process file
            if file.filename.lower().endswith('.pdf'):
                text += extract_text_from_pdf(file_path)
            elif file.filename.lower().endswith('.epub'):
                text += extract_text_from_epub(file_path)
            elif file.filename.lower().split('.')[-1] in ['mp4', 'mov', 'avi']:
                text += extract_text_from_video(file_path)
        
        # Initialize QA system with new content, user-specific
        chunks = split_text(text)
        user_db = initialize_qa_system(chunks, user_id, input_name.lower())
        
        # Store the database in the session
        session.knowledge_db = user_db
        session.quiz_engine = get_quiz_engine(session.knowledge_db, user_id)
        
        logger.info(f"Files processed successfully for user {user_id}: {[f.filename for f in files]}")
        return {"status": "success", "message": f"Processed {len(files)} file(s) for user {user_id}"}
    
    except Exception as e:
        logger.error(f"File processing failed for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"File processing failed: {str(e)}"}
        )
    finally:
        for file in files:
            file.file.close()

@app.get("/api/session-files")
async def get_session_files(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to access this session")
        
        # Check if the knowledge database exists
        if not session.knowledge_db:
            return {"files": []}
        
        user_id = str(current_user.user_id)
        
        # Find uploaded files in the data/raw/{user_id} directory
        upload_dir = f"data/raw/{user_id}"
        if not os.path.exists(upload_dir):
            return {"files": []}
        
        # Get a list of all files in the directory
        files = []
        for filename in os.listdir(upload_dir):
            file_path = os.path.join(upload_dir, filename)
            if os.path.isfile(file_path):
                file_stats = os.stat(file_path)
                files.append({
                    "name": filename,
                    "size": file_stats.st_size,
                    "last_modified": file_stats.st_mtime
                })
        
        return {"files": files}
    
    except Exception as e:
        logger.error(f"Error retrieving session files for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/api/user-file-history")
async def get_user_file_history(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        user_id = str(current_user.user_id)
        
        # Check if files directory exists for user
        user_files_dir = f"data/raw/{user_id}"
        if not os.path.exists(user_files_dir):
            return {"files": []}
        
        # Check for knowledge graph directories
        knowledge_graph_dir = f"data/processed/knowledge_graph/{user_id}"
        if not os.path.exists(knowledge_graph_dir):
            return {"files": []}
        
        # Get all directories in knowledge_graph_dir, each representing a file or dataset
        knowledge_sets = []
        for dirname in os.listdir(knowledge_graph_dir):
            kg_path = os.path.join(knowledge_graph_dir, dirname)
            if os.path.isdir(kg_path) and os.path.exists(os.path.join(kg_path, "index.faiss")):
                # This is a valid knowledge graph directory
                
                # Try to find matching file in raw dir to get file details
                matching_files = []
                for filename in os.listdir(user_files_dir):
                    name_without_ext = os.path.splitext(filename)[0]
                    if name_without_ext.lower() == dirname.lower():
                        file_path = os.path.join(user_files_dir, filename)
                        if os.path.isfile(file_path):
                            file_stats = os.stat(file_path)
                            matching_files.append({
                                "name": filename,
                                "size": file_stats.st_size,
                                "last_modified": file_stats.st_mtime
                            })
                
                # Even if we don't find a matching file, still include the knowledge set
                knowledge_sets.append({
                    "id": dirname,
                    "name": dirname.replace("_", " ").title(),  # Friendly display name
                    "file": matching_files[0] if matching_files else None,
                    "has_knowledge_graph": True
                })
        
        # Sort by last_modified (most recent first) if available, otherwise by name
        knowledge_sets.sort(
            key=lambda x: (
                -x["file"]["last_modified"] if x["file"] and "last_modified" in x["file"] else 0, 
                x["name"]
            )
        )
        
        return {"files": knowledge_sets}
        
    except Exception as e:
        logger.error(f"Error retrieving file history for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/use-knowledge-graph")
async def use_knowledge_graph(request: Request, data: Dict[str, str], current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        user_id = str(current_user.user_id)
        session_id = data.get("session_id")
        knowledge_graph_id = data.get("knowledge_graph_id")
        
        if not session_id or not knowledge_graph_id:
            raise HTTPException(status_code=400, detail="session_id and knowledge_graph_id are required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Check if the knowledge graph exists
        knowledge_graph_path = f"data/processed/knowledge_graph/{user_id}/{knowledge_graph_id}"
        if not os.path.exists(knowledge_graph_path) or not os.path.exists(os.path.join(knowledge_graph_path, "index.faiss")):
            raise HTTPException(status_code=404, detail="Knowledge graph not found")
        
        # Load the knowledge graph
        try:
            from src.nlp.qa_system import get_user_qa_system
            from src.nlp.quiz_system import get_quiz_engine
            
            # Create embeddings and load the FAISS index
            embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
            knowledge_db = FAISS.load_local(knowledge_graph_path, embeddings=embeddings, allow_dangerous_deserialization=True)
            
            # Update the session with the loaded knowledge graph
            session.knowledge_db = knowledge_db
            
            # Create a new quiz engine for this knowledge graph
            session.quiz_engine = get_quiz_engine(session.knowledge_db, user_id)
            
            return {"status": "success", "message": f"Knowledge graph '{knowledge_graph_id}' loaded successfully"}
            
        except Exception as e:
            logger.error(f"Error loading knowledge graph: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error loading knowledge graph: {str(e)}")
        
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        logger.error(f"Error using knowledge graph: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
     
@app.post('/api/audio_to_blendshapes')
async def audio_to_blendshapes_route(request: Request):
    audio_bytes = await request.body()
    future = gpu_executor.submit(
        generate_facial_data_from_bytes, 
        audio_bytes, 
        blendshape_model, 
        device, 
        config
    )
    generated_facial_data = future.result()
    generated_facial_data_list = generated_facial_data.tolist() if isinstance(generated_facial_data, np.ndarray) else generated_facial_data

    return {'blendshapes': generated_facial_data_list}

@app.get("/api/generate-quiz")
async def generate_quiz(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get optional topic parameter
        topic = request.query_params.get("topic")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to use this session")
        
        # Check if the user has a lesson path
        if not session.lesson_path:
            raise HTTPException(status_code=400, detail="No lesson has been generated yet. Please generate a lesson first.")
        
        # Check if the user has a knowledge database
        if not session.knowledge_db:
            raise HTTPException(status_code=400, detail="No knowledge database found. Please upload content first.")
        
        if not session.quiz_engine:
            raise HTTPException(status_code=400, detail="No quiz engine found. Please take a lesson first.")
        
        user_id = str(current_user.user_id)
        logger.info(f"Generating quiz for user {user_id}.")
        
        # Retrieve questions based on topic (if specified) or last topic
        cursor = session.quiz_engine.conn.cursor()
        
        if topic:
            # Use the provided topic
            logger.info(f"Generating quiz for specific topic: {topic}")
            cursor.execute("SELECT * FROM questions WHERE topic = ? ORDER BY RANDOM() LIMIT 10", (topic,))
        else:
            # Use the last topic
            logger.info(f"Generating quiz for last topic: {session.last_topic}")
            cursor.execute("SELECT * FROM questions WHERE topic = ? ORDER BY RANDOM() LIMIT 10", (session.last_topic,))
            
        questions = cursor.fetchall()
        
        # If no questions found for the specified topic, try to generate some
        if not questions and topic and session.quiz_engine:
            logger.info(f"No existing questions found for topic {topic}, generating new ones...")
            
            # Find the lesson script for this topic
            lecture_history_dir = f"data/processed/lecture_history/{user_id}/{session_id}"
            if os.path.exists(lecture_history_dir):
                for filename in os.listdir(lecture_history_dir):
                    if filename.endswith('.json'):
                        try:
                            with open(os.path.join(lecture_history_dir, filename), "r", encoding="utf-8") as f:
                                lecture_data = json.load(f)
                                lecture_topic = lecture_data.get("topic", "").lower().replace(" ", "_")
                                
                                if lecture_topic == topic:
                                    # Found matching lecture, generate questions from its content
                                    logger.info(f"Found matching lecture for topic {topic}, generating questions...")
                                    
                                    # Create a temporary file with the lecture content
                                    temp_script_path = f"data/processed/temp_{user_id}_{topic}.txt"
                                    with open(temp_script_path, "w", encoding="utf-8") as temp_f:
                                        temp_f.write(lecture_data.get("content", ""))
                                    
                                    # Generate quiz questions
                                    session.quiz_engine.generate_quiz_from_script(temp_script_path, topic)
                                    
                                    # Cleanup temp file
                                    if os.path.exists(temp_script_path):
                                        os.remove(temp_script_path)
                                    
                                    # Fetch the newly generated questions
                                    cursor.execute("SELECT * FROM questions WHERE topic = ? ORDER BY RANDOM() LIMIT 10", (topic,))
                                    questions = cursor.fetchall()
                                    break
                        except Exception as e:
                            logger.error(f"Error processing lecture file {filename}: {str(e)}")
                            continue

        # If still no questions, return appropriate error
        if not questions:
            if topic:
                raise HTTPException(status_code=404, detail=f"No questions found for topic '{topic}'. Please generate a lecture on this topic first.")
            else:
                raise HTTPException(status_code=404, detail="No questions found. Please generate a lecture first.")

        return [
            {
                "id": q[0],
                "question": q[1],
                "options": json.loads(q[2]),
                "answer": q[3],
                "concept": q[4],
                "topic": q[5]
            } for q in questions
        ]
    
    except Exception as e:
        logger.error(f"Quiz generation failed for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Quiz generation failed: {str(e)}"}
        )

@app.get("/api/lesson-topics")
async def get_lesson_topics(request: Request, current_user: schemas.UserResponse = Depends(get_current_user)):
    try:
        # Get session_id as a query parameter
        session_id = request.query_params.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        
        # Get the session
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Check if the session belongs to the current user
        if str(session.user_id) != str(current_user.user_id):
            raise HTTPException(status_code=403, detail="Not authorized to access this session")
        
        user_id = str(current_user.user_id)
        
        # Check if lecture history directory exists
        lecture_history_dir = f"data/processed/lecture_history/{user_id}/{session_id}"
        if not os.path.exists(lecture_history_dir):
            return {"topics": []}
        
        # Get all lecture history files
        lecture_files = [f for f in os.listdir(lecture_history_dir) if f.endswith('.json')]
        
        # If no lecture files found, return empty list
        if not lecture_files:
            return {"topics": []}
        
        # Read lecture history to extract topics
        topics = []
        for file in lecture_files:
            try:
                with open(os.path.join(lecture_history_dir, file), "r", encoding="utf-8") as f:
                    lecture_data = json.load(f)
                    
                    # Create a topic object with file as ID and topic as display name
                    topic_obj = {
                        "id": os.path.splitext(file)[0],  # Remove .json extension
                        "topic": lecture_data.get("topic", "Unknown Topic"),
                        "timestamp": lecture_data.get("timestamp", "")
                    }
                    
                    # Add to topics list if not already present (avoid duplicates)
                    if not any(t["topic"] == topic_obj["topic"] for t in topics):
                        topics.append(topic_obj)
            except Exception as e:
                logger.error(f"Error reading lecture file {file}: {str(e)}")
                continue
        
        # Sort topics by timestamp (most recent first)
        topics.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return {"topics": topics}
        
    except Exception as e:
        logger.error(f"Error retrieving lesson topics for user {current_user.user_id}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/refresh-token", response_model=schemas.Token)
async def refresh_access_token(current_user: schemas.UserResponse = Depends(get_current_user)):
    """
    Refresh access token endpoint. 
    This creates a new token for an authenticated user without requiring re-authentication.
    """
    # Create new access token with updated expiration
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

#This is a backend complete testing function. Nothing will happen at the frontend, we can test our implementations and functions here. All of the output will be shown in your terminal for testing purposes. 
def main():  
    py_face_name = 'face1'
    info_sender = udp_client.SimpleUDPClient(local_host_name, info_port)
    info_sender.send_message("/Game/LivelinkPresets/Preset_11112", (11115, py_face_name))
    py_face = initialize_py_face(name=py_face_name)
    socket_connection = create_socket_connection(11112)
    audio_sender = udp_client.SimpleUDPClient(local_host_name, 11115)
    chat_history = load_chat_history()
    pipeline = KPipeline(lang_code='a')
    stop_default_animation = Event()

    default_animation_thread = Thread(target=default_animation_loop, args=(py_face,stop_default_animation, 11112))
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
    audio_worker_thread = Thread(target=audio_queue_worker, args=(audio_queue, 11112, py_face_name, audio_sender, py_face, socket_connection, default_animation_thread, stop_default_animation))
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
        db = initialize_qa_system(chunks, '1')
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
        logger.info(f"Starting API server on port {back_port}.")
        print(f"Allowed origins for CORS middleware: {[external_front_url, external_back_url, external_ue_url, local_front_url, local_back_url, local_ue_url]}")
        uvicorn.run(app, host=local_host_name, port=int(back_port))
