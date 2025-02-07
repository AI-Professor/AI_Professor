import os
from langchain_community.vectorstores import FAISS  
from langchain_community.embeddings import OpenAIEmbeddings  
from langchain_community.chat_models import ChatOpenAI  
from dotenv import load_dotenv
import warnings
warnings.filterwarnings("ignore")

#Get API key from our .env file for API calls to GPT-4 model
load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

#This function will use OpenAI model to generate a knowledge graph based on our input material. It will be stored in data/processed/knowledge_graph folder.
def initialize_qa_system(text_chunks: list) -> FAISS:  
    # Initialize embeddings with explicit API key
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    DB_DIR = "data/processed/knowledge_graph"
    os.makedirs(DB_DIR, exist_ok=True)
    
    # Create FAISS index with error handling
    try:
        db = FAISS.from_texts(text_chunks, embeddings)  
        db.save_local("data/processed/knowledge_graph")
        return db
    except Exception as e:
        print(f"Error creating FAISS index: {str(e)}")
        raise

#This function will use GPT-4 model to generate an answer to an user's input question and return it.
def answer_question(question: str, db: FAISS) -> str:  
    try:
        # Search with error handling
        video_keywords = ["video", "lecture", "demonstrate", "visual"]
        is_video_question = any(kw in question.lower() for kw in video_keywords)
        
        search_k = 4 if is_video_question else 2
        relevant_text = db.similarity_search(question, k=search_k)
        
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
    
        
        return {
            "text": answer_text,
        }
        
    except Exception as e:
        print(f"Error answering question: {str(e)}")
        return {  # Keep return type consistent
            "text": "I'm having trouble answering that right now.",
        }