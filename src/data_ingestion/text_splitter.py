from langchain.text_splitter import RecursiveCharacterTextSplitter
import warnings
warnings.filterwarnings("ignore")

def split_text(text: str, is_code: bool = False) -> list:
    if is_code:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
            separators=["\n\n", "\n", " ", ""]
        )
    else:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
    return splitter.split_text(text)