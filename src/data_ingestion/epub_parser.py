# src/data_ingestion/epub_parser.py
from ebooklib import epub
from bs4 import BeautifulSoup
import warnings
warnings.filterwarnings("ignore")

def extract_text_from_epub(epub_path: str) -> str:
    book = epub.read_epub(epub_path)
    text = []
    
    for item in book.get_items():
        if item.get_type() == 9:
            # Convert bytes to string with proper encoding
            content = item.get_content().decode('utf-8', errors='replace')
            soup = BeautifulSoup(content, 'html.parser')
            # Extract text with proper spacing
            item_text = soup.get_text(separator='\n', strip=True)
            text.append(item_text)
    
    return '\n\n'.join(text)