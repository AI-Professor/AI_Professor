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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
AUDIO_DIR = "data/processed/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)
app = FastAPI()
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

warnings.filterwarnings("ignore")

global_db = None

def init_system():
    global global_db
    text = extract_text_from_epub("data/raw/scrum.epub")
    chunks = split_text(text)
    global_db = initialize_qa_system(chunks)

@app.on_event("startup")
async def startup_event():
    init_system()

@app.get("/health")
async def health_check():
    return {"status": "ok", "initialized": bool(global_db)}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5001", "http://localhost:3000"],  # Frontend's port
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
        elif file.suffix.lower() == '.youtube':
            text += extract_text_from_video(file.read_text().strip(), is_youtube=True)
        chunks = split_text(text)  
        db = initialize_qa_system(chunks)
        print("✅ Course material loaded successfully!\n")

        #Generate lesson script from knowledge graph
        print("📝 Generating lesson script...")
        lesson_script = generate_lesson_script(db, "TEACHING")
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