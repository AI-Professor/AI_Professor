from langchain.text_splitter import RecursiveCharacterTextSplitter
from src.data_ingestion.pdf_parser_MinerU import process_pdf 
import json
import re

def split_text(text: str) -> list:
    """Dynamically splits text while ensuring image links (GCS URLs) are preserved in the correct chunks."""

    # Regular expression to find image URLs in Markdown format: ![alt text](https://storage.googleapis.com/...)
    image_url_pattern = re.compile(r"!\[.*?\]\((https://storage.googleapis.com/[^)]+)\)")

    # Extract image URLs and replace them with placeholders to prevent splitting
    url_map = {}
    matches = image_url_pattern.findall(text)
    for idx, url in enumerate(matches):
        placeholder = f"[[IMAGE-{idx}]]"
        text = text.replace(url, placeholder)
        url_map[placeholder] = url  # Map placeholder back to the actual GCS URL

    # Analyze text characteristics
    text_length = len(text)
    avg_line_length = sum(len(line) for line in text.split('\n')) / max(1, text.count('\n'))
    is_code_like = any(re.search(r'\b(def|class|function|import|var|let|const)\b', text) for _ in [None])
    has_markdown = bool(re.search(r'^#+|```', text, re.MULTILINE))
    paragraph_count = text.count('\n\n') + 1

    # Dynamic chunk sizing
    base_chunk_size = min(max(500, text_length // 20), 2000)
    chunk_size = base_chunk_size
    chunk_overlap = max(100, int(chunk_size * 0.2))

    # Adjust based on content type
    if is_code_like:
        chunk_size = min(800, chunk_size)
        separators = ["\n\n", "\n", " ", ""]
    elif has_markdown:
        chunk_size = min(1200, chunk_size)
        separators = ["\n## ", "\n### ", "\n#### ", "\n##### ", "\n```", "\n\n", "\n", " "]
    elif avg_line_length > 80 and paragraph_count > 5:
        chunk_size = min(1500, chunk_size)
        separators = ["\n\n", ". ", "! ", "? ", "\n", " "]
    else:
        separators = ["\n\n", "\n", " ", ""]

    # Ensure chunk size stays within limits
    chunk_size = max(200, min(chunk_size, 3000))
    chunk_overlap = max(50, min(chunk_overlap, chunk_size // 2))

    # Initialize the splitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        length_function=len,
        keep_separator=True
    )

    # Perform text chunking
    chunks = splitter.split_text(text)

    # Restore image URLs in the correct chunks
    for i, chunk in enumerate(chunks):
        for placeholder, url in url_map.items():
            if placeholder in chunk:
                chunks[i] = chunk.replace(placeholder, f"![Image]({url})")

    return chunks

# pdf_path = "../../data/raw/cs326-4-5.pdf" 
# markdown_text = process_pdf(pdf_path)

# # 🔹 Process and split text while preserving GCS image URLs
# split_texts = split_text(markdown_text)

# # 🔹 Save processed text
# split_text_file = "cs326_split_text.json"
# with open(split_text_file, "w") as f:
#     json.dump(split_texts, f, indent=4)

# print(f"Text successfully split while preserving images. Saved to {split_text_file}")
