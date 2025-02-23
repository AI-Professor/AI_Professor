import os
from src.avatar.script_generator import generate_lesson_script;
from src.data_ingestion.pdf_parser import extract_text_from_pdf;
from src.data_ingestion.epub_parser import extract_text_from_epub;
from src.data_ingestion.video_parser import extract_text_from_video;
from src.data_ingestion.text_splitter import split_text;
from src.nlp.qa_system import initialize_qa_system;
import warnings
warnings.filterwarnings("ignore")
import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


#Test text extration from pdf
#Detailed implementation can be found in src/data_ingestion/pdf_parser.py
pdf_text = extract_text_from_pdf('data/raw/book.pdf')
print(f'Extracted {len(pdf_text)} characters')

#Test text extraction from epub
#Detailed implementation can be found in src/data_ingestion/epub_parser.py
epub_text = extract_text_from_epub('data/raw/scrum.epub')
print(f'Extracted {len(epub_text)} characters')

#Test content extraction from video
#Detailed implementation can be found in src/data_ingestion/video_parser.py
video_text = extract_text_from_video('data/raw/python_tutorial.mp4')
print(f'Extracted {len(video_text)} characters')

#Test pdf_text split into chunks
#Detailed implementation can be found in src/data_ingestion/text_splitter.py
pdf_chunks = split_text(pdf_text)
print(f'Split pdf into {len(pdf_chunks)} chunks')

#Test epub_text split into chunks
epub_chunks = split_text(epub_text)
print(f'Split pdf into {len(epub_chunks)} chunks')

#Test pdf_text split into chunks
video_chunks = split_text(video_text)
print(f'Split video into {len(video_chunks)} chunks')

#Check pdf knowledge graph initialization
#Detailed implementation can be found in src/nlp/qa_system.py
pdf_db = initialize_qa_system(pdf_chunks)
print('PDF Index created at data/processed/knowledge_graph')

#Check epub knowledge graph initialization
epub_db = initialize_qa_system(epub_chunks)
print('EPUB Index created at data/processed/knowledge_graph')

#Check video knowledge graph initialization
video_db = initialize_qa_system(video_chunks)
print('Video Index created at data/processed/knowledge_graph')

#Check lecture script generation
#Detailed implementation can be found in src/avatar/script_generator
topic = "scrum_planning"
generate_lesson_script(epub_db,"TEACHING",5,topic)
lecture = open(f"data/processed/lesson_script/{topic}_lesson_script.txt").read()
print(lecture)

