from langchain.text_splitter import RecursiveCharacterTextSplitter
import warnings

warnings.filterwarnings("ignore")  

def split_text(text: str) -> list:  
    splitter = RecursiveCharacterTextSplitter(  
        chunk_size=1000,  
        chunk_overlap=200  
    )  
    return splitter.split_text(text)  