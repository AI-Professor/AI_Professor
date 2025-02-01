import os
from langchain.vectorstores import FAISS  
from langchain.embeddings import OpenAIEmbeddings  
from langchain.chat_models import ChatOpenAI  
from src.avatar.lip_sync import create_talking_avatar
from src.avatar.tts import text_to_speech
from dotenv import load_dotenv
import warnings
warnings.filterwarnings("ignore")

# Load environment variables first
load_dotenv(override=True)  # Force reload environment variables

# Get API key with validation
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

def initialize_qa_system(text_chunks: list):  
    # Initialize embeddings with explicit API key
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    
    # Create FAISS index with error handling
    try:
        db = FAISS.from_texts(text_chunks, embeddings)  
        db.save_local("data/processed/knowledge_graph")
        return db
    except Exception as e:
        print(f"Error creating FAISS index: {str(e)}")
        raise

def answer_question(question: str, db: FAISS) -> str:  
    try:
        # Search with error handling
        relevant_text = db.similarity_search(question, k=2)
        
        # Initialize chat model with explicit API key
        llm = ChatOpenAI(
            model="gpt-4",
            openai_api_key=openai_api_key,
            temperature=0.7
        )
        
        # Enhanced prompt engineering
        prompt = f"""You are a helpful teaching assistant. Answer the question 
        using ONLY the provided text. If unsure, say "I don't know".
        
        Context: {relevant_text}
        
        Question: {question}
        
        Answer in 2-3 sentences:"""
        
        answer_text = llm.predict(prompt)
    
        # Generate avatar response
        audio_file = text_to_speech(answer_text)
        video_url = create_talking_avatar(answer_text)
        
        return {
            "text": answer_text,
            "audio": audio_file,
            "video": video_url
        }
        
    except Exception as e:
        print(f"Error answering question: {str(e)}")
        return {  # Keep return type consistent
            "text": "I'm having trouble answering that right now.",
            "audio": None,
            "video": None
        }