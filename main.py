from dotenv import load_dotenv
import numpy as np
import pygame
import torch
import json , os, sys, shutil, warnings, argparse, uvicorn, logging
from typing import Dict, List
from fastapi.responses import JSONResponse
from logging.handlers import RotatingFileHandler
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from threading import Event, Thread
from queue import Queue, Empty
import atexit
import glob

from local_model.NeuroSync.NeuroSync_Local_API.utils.model.model import load_model
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
from local_model.NeuroSync.NeuroSync_Local_API.utils.generate_face_shapes import generate_facial_data_from_bytes
from local_model.NeuroSync.NeuroSync_Local_API.utils.config import config
from local_model.kokoro_model.kokoro.pipeline import KPipeline

warnings.filterwarnings("ignore")

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
AUDIO_DIR = "data/processed/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
app = FastAPI()
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

#FastAPI middleware handles any request before it is processed by any path or functions
#Our backend API will be running on localhost:5001, our frontend API will be running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#Check if our smart AI is initialized. global_db refers to the knowledge graph we generated from materials
@app.get("/health")
async def health_check():
    logger.info("Health check endpoint accessed.")
    return {"status": "ok", "initialized": "True"}#bool(global_db)

@app.post("/api/connect")
async def connect():
    try: 
        global device, model_path, blendshape_model
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model_path = 'C:/Users/Henry/Desktop/AI_Professor/local_model/NeuroSync/NeuroSync_Local_API/utils/model/model.pth'
        blendshape_model = load_model(model_path, config, device)
        py_face = initialize_py_face()
        global socket_connection
        socket_connection = create_socket_connection()
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
        audio_worker_thread = Thread(target=audio_queue_worker, args=(audio_queue, py_face, socket_connection, default_animation_thread, stop_default_animation))
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
        pygame.quit()
        socket_connection.close()
        cleanup_audio_files()

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
        # Stop any current audio playback. Adjust if you have a custom stop mechanism.
        if pygame.mixer.get_init():
            pygame.mixer.stop()
        
        topic = topic['topic']
        topic = topic.lower().replace(" ", "_")
        
        if os.path.exists(f"data/processed/lesson_script/{topic}_lesson_script.txt"):
            with open(f"data/processed/lesson_script/{topic}_lesson_script.txt", "r") as file:
                lesson_script = file.read()
            print("Loaded lesson script successfully!")
        else:
            lesson_script = generate_lesson_script(global_db, "TEACHING", 1, topic)
            print("Generated lesson script successfully!")
        
        stream_llm_chunks(lesson_script, chat_history, chunk_queue, db=global_db, is_lesson=True)
        return {"status": "Success", "message": "Lesson scripts generated successfully"}
    except Exception as e:
        logger.error("Error in /api/lecture: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


#This function will handle the question asked by a user in the frontend and send back the answer generated by our model. Check *answer_question* function in src/nlp/qa_system.py for detailed implementation
@app.post("/api/answer")
async def answer_endpoint(question_data: dict):
    try:
        logger.info("Received question: %s", question_data["question"])
        if not global_db:
            raise HTTPException(status_code=503, detail="System not initialized")

        flush_queue(chunk_queue)
        flush_queue(audio_queue)
        # Stop any current audio playback. Adjust if you have a custom stop mechanism.
        if pygame.mixer.get_init():
            pygame.mixer.stop()    
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

#This function will take in the answer we generated through last function and send back an audio url for avatar realtime streaming response. Check *text_to_speech* function in src/avatar/tts.py for detailed implementation
@app.post("/api/audio-answer")
async def audio_answer(text_data: dict):
    try:
        logger.info("Generating audio for text: %s", text_data["text"])
        #audio_path, audio_url = text_to_speech(text=text_data["text"])
        return {"audio_url": 1}
    
    except Exception as e:
        logger.error("Error in /api/audio-answer: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

#This function will take in the files uploaded from frontend and store them inside data/raw folder. Then they will be processed through extract functions for different forms of input. Detailed implementation can be found in src/data_ingestion folder. After they are processed, they will be splitted by split_text function in src/data_ingestion/text_splitter.py and create our knowledge graph by initialize_qa_system function in src/nlp/qa_system.py. Finally, a lesson script of length based on your choice will be generated and stored in data/processed/lesson_script folder in .txt form. Detailed implementation of generate_lesson_script function can be found in src/avatar/script_generator.py.
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

#This function will handle "start quiz" button clicked from frontend. It will create a BasicQuizEngine object defined in src/nlp/quiz_system.py. This object has the ability to generate quiz questions and choices based on the number for questions you provided and the lecture script. This function send generated questions back to frontend for users to do.
@app.get("/api/generate-quiz")
async def generate_quiz():
    try:
        logger.info("Generating quiz.")
        global quiz_engine
        quiz_engine = BasicQuizEngine(global_db)
        quiz_engine.generate_quiz_from_script("data/processed/lesson_script/lesson_script.txt", num_questions=3)
        
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

#This function utilizes the same BasicQuizEngine object generated from last function. It will clear question database on the backend after the frontend button is clicked.
@app.delete("/api/clear-quiz")
async def clear_quiz():
    try:
        logger.info("Clearing quiz database")
        quiz_engine.clear_all_questions()
        
        return JSONResponse(
            status_code=200,
            content={"message": "Quiz database cleared successfully"}
        )
        
    except Exception as e:
        logger.info("Quiz database clearance failed: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to clear quiz: {str(e)}"}
        )

@app.post('/api/audio_to_blendshapes')
async def audio_to_blendshapes_route(request: Request):
    audio_bytes = await request.body()
    generated_facial_data = generate_facial_data_from_bytes(audio_bytes, blendshape_model, device, config)
    generated_facial_data_list = generated_facial_data.tolist() if isinstance(generated_facial_data, np.ndarray) else generated_facial_data

    return {'blendshapes': generated_facial_data_list}

def flush_queue(q):
    try:
        while True:
            q.get_nowait()
    except Empty:
        pass

def cleanup_audio_files():
    audio_dir = Path("local_model/NeuroSync/NeuroSync_Player/data/audio")
    for file_path in glob.glob(str(audio_dir / "*.wav")):
        try:
            os.remove(file_path)
            print(f"Deleted: {file_path}")
        except Exception as e:
            print(f"Error deleting {file_path}: {e}")
        
atexit.register(cleanup_audio_files)

#This is a backend complete testing function. Nothing will happen at the frontend, we can test our implementations and functions here. All of the output will be shown in your terminal for testing purposes. 
def main():  
    py_face = initialize_py_face()
    socket_connection = create_socket_connection()
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
    audio_worker_thread = Thread(target=audio_queue_worker, args=(audio_queue, py_face, socket_connection, default_animation_thread, stop_default_animation))
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
            # Stop any current audio playback. Adjust if you have a custom stop mechanism.
            if pygame.mixer.get_init():
                pygame.mixer.stop()
                
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
        pygame.quit()
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
        logger.info("Starting API server on port 5001.")
        uvicorn.run(app, host="127.0.0.1", port=5001)