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
        if os.path.exists(f"{DB_DIR}/index.faiss"):
            db = FAISS.load_local("data/processed/knowledge_graph",embeddings=embeddings, allow_dangerous_deserialization=True)
            print("Loaded knowledge graph successfully!")
        else: 
            db = FAISS.from_texts(text_chunks, embeddings)  
            db.save_local("data/processed/knowledge_graph")
            print("Created knowledge graph successfully!")
        return db
    except Exception as e:
        print(f"Error creating FAISS index: {str(e)}")
        raise
