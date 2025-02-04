from langchain.text_splitter import RecursiveCharacterTextSplitter
import re

def split_text(text: str) -> list:
    # Analyze text characteristics
    text_length = len(text)
    avg_line_length = sum(len(line) for line in text.split('\n')) / max(1, text.count('\n'))
    is_code_like = any(re.search(r'\b(def|class|function|import|var|let|const)\b', text) for _ in [None])
    has_markdown = bool(re.search(r'^#+|```', text, re.MULTILINE))
    paragraph_count = text.count('\n\n') + 1

    # Dynamic chunk sizing based on text characteristics
    base_chunk_size = min(max(500, text_length // 20), 2000)  # Between 500-2000 chars
    chunk_size = base_chunk_size
    
    # Adjust for code-like content
    if is_code_like:
        chunk_size = min(800, chunk_size)
        chunk_overlap = max(100, int(chunk_size * 0.15))
        separators = ["\n\n", "\n", " ", ""]
        
    # Adjust for markdown content
    elif has_markdown:
        chunk_size = min(1200, chunk_size)
        chunk_overlap = max(150, int(chunk_size * 0.2))
        separators = ["\n## ", "\n### ", "\n#### ", "\n##### ", "\n```", "\n\n", "\n", " "]
        
    # Adjust for dense prose
    elif avg_line_length > 80 and paragraph_count > 5:
        chunk_size = min(1500, chunk_size)
        chunk_overlap = max(200, int(chunk_size * 0.25))
        separators = ["\n\n", ". ", "! ", "? ", "\n", " "]
        
    # Default for general text
    else:
        chunk_overlap = max(100, int(chunk_size * 0.2))
        separators = ["\n\n", "\n", " ", ""]

    # Final safety limits
    chunk_size = max(200, min(chunk_size, 3000))
    chunk_overlap = max(50, min(chunk_overlap, chunk_size//2))

    # Create splitter with dynamic parameters
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        length_function=len,
        keep_separator=True
    )

    return splitter.split_text(text)