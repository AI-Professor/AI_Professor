from src.data_ingestion.pdf_parser import extract_text_from_pdf  
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system, answer_question  
from src.avatar.tts import text_to_speech
from src.avatar.lip_sync import create_talking_avatar
import warnings
import webbrowser
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

warnings.filterwarnings("ignore")

#This is our main function. We will call all of the functions here. This is the file we execute.
def main():  
    # Ingest the book chapter  
    try:
        print("📖 Loading course material...")
        text = extract_text_from_pdf("data/raw/book.pdf")  
        chunks = split_text(text)  
        db = initialize_qa_system(chunks)
        print("✅ Course material loaded successfully!\n")
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
            
            audio_path = text_to_speech(text=answer_text)
            print(f"🔊 Audio generated: {audio_path}")
            video_path = create_talking_avatar(audio_path=audio_path)
            print(f"🎥 Video generated: {video_path}")

            os.system(f'open {video_path}')

        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n⚠️ Error: {str(e)}")

if __name__ == "__main__":  
    main()