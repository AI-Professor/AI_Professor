from src.data_ingestion.pdf_parser import extract_text_from_pdf  
from src.data_ingestion.text_splitter import split_text  
from src.nlp.qa_system import initialize_qa_system, answer_question  
import warnings
import webbrowser
import os
import sys

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

warnings.filterwarnings("ignore")

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
            
            # Display response
            print(f"\n👩🏫 AI Professor: {response['text']}")
            
            # Play audio and video
            if response.get('audio'):
                if sys.platform == "darwin":
                    os.system(f"afplay {response['audio']}")
                elif sys.platform == "win32":
                    os.system(f"start {response['audio']}")
                else:  # Linux
                    os.system(f"xdg-open {response['audio']}")
                
            if response.get('video'):
                webbrowser.open(response['video'])
                
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n⚠️ Error: {str(e)}")

if __name__ == "__main__":  
    main()