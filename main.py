import json
from typing import List
from fastapi.responses import JSONResponse
import uvicorn
from src.data_ingestion.pdf_parser import extract_text_from_pdf 
from src.data_ingestion.epub_parser import extract_text_from_epub
from src.data_ingestion.video_parser import extract_text_from_video 
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system, answer_question  
from src.avatar.tts import text_to_speech
from src.avatar.lip_sync import create_talking_avatar
from src.avatar.script_generator import generate_lesson_script
from pathlib import Path
import argparse
import warnings
import webbrowser
import os
import sys
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil

from src.nlp.quiz_system import BasicQuizEngine

#global_db
AUDIO_DIR = "data/processed/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
app = FastAPI()
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

warnings.filterwarnings("ignore")

@app.get("/health")
async def health_check():
    return {"status": "ok", "initialized": bool(global_db)}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5001"],  # Frontend's port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/answer")
async def answer_endpoint(question_data: dict):
    try:
        if not global_db:
            raise HTTPException(status_code=503, detail="System not initialized")
            
        response = answer_question(question_data["question"], global_db)
        return {"text": response['text']}
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    
@app.post("/api/audio-answer")
async def audio_answer(text_data: dict):
    try:
        audio_path, audio_url = text_to_speech(text=text_data["text"])
        return {"audio_url": audio_url}
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/api/upload")
async def upload_file(files: List[UploadFile] = File(...)):
    try:
        # Create upload directory
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

        lesson_script = generate_lesson_script(global_db, "TEACHING", 5)
        with open("data/processed/lesson_script/lesson_script.txt", "w") as f:
            f.write(lesson_script)
        
        return {"status": "success", "message": f"Processed {file.filename}"}
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"File processing failed: {str(e)}"}
        )
    finally:
        if 'file' in locals():
            file.file.close()

@app.get("/api/generate-quiz")
async def generate_quiz():
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

#This is our main function. We will call all of the functions here. This is the file we execute.
def main():  
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
        print("📝 Generating lesson script...")
        lesson_script = generate_lesson_script(db, "TEACHING", 5)
        with open("data/processed/lesson_script/lesson_script.txt", "w") as f:
            f.write(lesson_script)
        print("✅ Lecture script prepared successfully!\n")

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
    while True:  
        try:
            question = input("\nYou: ")  
            if question.lower() == "exit":  
                break
                
            print("\n💭 Thinking...", end="\r")
            
            # Get answer with avatar components
            response = answer_question(question, db)
            answer_text = response['text']
            print(f"\n👩🏫 AI Professor: {answer_text}")
            """
            audio_path, audio_url = text_to_speech(text=answer_text)
            print(f"🔊 Audio generated: {audio_path}")
            video_path = create_talking_avatar(audio_url=audio_url)
            print(f"🎥 Video generated: {video_path}")

            os.system(f'open {video_path}')
            """
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n⚠️ Error: {str(e)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['cli', 'api'], default='api')
    args = parser.parse_args()

    if args.mode == 'cli':
        main()
    else:
        uvicorn.run(app, host="0.0.0.0", port=5001)