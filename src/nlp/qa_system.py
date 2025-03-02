import os
from langchain_community.vectorstores import FAISS  
from langchain_community.embeddings import OpenAIEmbeddings  
from langchain_community.chat_models import ChatOpenAI  
from src.data_ingestion.pdf_parser_MinerU import process_pdf
from src.data_ingestion.text_splitter import split_text
from dotenv import load_dotenv
import warnings
warnings.filterwarnings("ignore")

#Get API key from our .env file for API calls to GPT-4 model
load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

#This function will use OpenAI model to generate a knowledge graph based on our input material. It will be stored in data/processed/knowledge_graph folder.
def initialize_qa_system(text_chunks: list, pdf_file_name: str) -> FAISS:  
    # Initialize embeddings with explicit API key
    embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
    DB_DIR = "data/processed/knowledge_graph"
    os.makedirs(DB_DIR, exist_ok=True)
    
    # Create FAISS index with error handling
    try:
        if os.path.exists(f"{pdf_file_name}/index.faiss"):
            db = FAISS.load_local("data/processed/knowledge_graph",embeddings=embeddings, allow_dangerous_deserialization=True)
            print("Loaded knowledge graph successfully!")
        else: 
            db = FAISS.from_texts(text_chunks, embeddings)  
            db.save_local(f"data/processed/knowledge_graph/{pdf_file_name}")
            print("Created knowledge graph successfully!")
        return db
    except Exception as e:
        print(f"Error creating FAISS index: {str(e)}")
        raise


pdf_path = "../../data/raw/cs326-3-4.pdf" 

markdown_text = process_pdf(pdf_path)

split_texts = split_text(markdown_text)

initialize_qa_system(split_texts,'cs326-3-4')