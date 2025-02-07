from src.avatar.script_generator import generate_lesson_script;
from src.data_ingestion.text_splitter import split_text;
from src.data_ingestion.epub_parser import extract_text_from_epub;
from src.nlp.qa_system import initialize_qa_system;
from src.avatar.tts import text_to_speech
import warnings
warnings.filterwarnings("ignore")

#Extract text from an epub input
#Detailed implementation can be found in src/data_ingestion/epub_parser.py
epub_text = extract_text_from_epub('data/raw/scrum.epub')
print(f'Extracted {len(epub_text)} characters')

#Split text into chunks getting ready for knowledge graph construction
#Detailed implementation can be found in src/data_ingestion/text_splitter.py
epub_chunks = split_text(epub_text)
print(f'Split pdf into {len(epub_chunks)} chunks')

#Construct knowledge graph based on our processed input by previous two steps
#Detailed implementation can be found in src/nlp/qa_system.py
epub_db = initialize_qa_system(epub_chunks)
print('EPUB Index created at data/processed/knowledge_graph')

#Generate a lecture script based on the knoweledge graph we created ealier.
#Detailed implementation can be found in src/avatar/script_generator.py
print("📝 Generating lesson script...")
lesson_script = generate_lesson_script(epub_db, "TEACHING",5)
with open("data/processed/lesson_script/lesson_script.txt", "w") as f:
    f.write(lesson_script)
print("✅ Lecture script prepared successfully!")

print("📝 Generating audio lecture...")
text_to_speech(lesson_script)
print("✅ Audio script prepared successfully!")



