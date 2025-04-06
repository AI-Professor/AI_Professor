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
def initialize_qa_system(text_chunks: list, user_id: str) -> FAISS:  
    # Initialize embeddings with explicit API key
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    
    # Create user-specific directory
    DB_DIR = f"data/processed/knowledge_graph/{user_id}"
    os.makedirs(DB_DIR, exist_ok=True)
    
    # Create FAISS index with error handling
    try:
        if os.path.exists(f"{DB_DIR}/index.faiss"):
            db = FAISS.load_local(DB_DIR, embeddings=embeddings, allow_dangerous_deserialization=True)
            print(f"Loaded knowledge graph for user {user_id} successfully!")
        else: 
            db = FAISS.from_texts(text_chunks, embeddings)  
            db.save_local(DB_DIR)
            print(f"Created knowledge graph for user {user_id} successfully!")
        return db
    except Exception as e:
        print(f"Error creating FAISS index: {str(e)}")
        raise
        
# Function to get user's knowledge graph if it exists
def get_user_qa_system(user_id: str) -> FAISS:
    try:
        DB_DIR = f"data/processed/knowledge_graph/{user_id}"
        
        # Check if the user has a knowledge graph
        if os.path.exists(f"{DB_DIR}/index.faiss"):
            embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
            db = FAISS.load_local(DB_DIR, embeddings=embeddings, allow_dangerous_deserialization=True)
            print(f"Retrieved knowledge graph for user {user_id}")
            return db
        else:
            print(f"No knowledge graph found for user {user_id}")
            return None
    except Exception as e:
        print(f"Error retrieving knowledge graph for user {user_id}: {str(e)}")
        return None
