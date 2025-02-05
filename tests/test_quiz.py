from src.avatar.script_generator import generate_lesson_script;
from src.data_ingestion.text_splitter import split_text;
from src.nlp.quiz_system import BasicQuizEngine;
from src.data_ingestion.epub_parser import extract_text_from_epub;
from src.nlp.qa_system import initialize_qa_system;
import warnings
warnings.filterwarnings("ignore")

epub_text = extract_text_from_epub('data/raw/scrum.epub')
print(f'Extracted {len(epub_text)} characters')

epub_chunks = split_text(epub_text)
print(f'Split pdf into {len(epub_chunks)} chunks')

epub_db = initialize_qa_system(epub_chunks)
print('EPUB Index created at data/processed/knowledge_graph')

print("📝 Generating lesson script...")
lesson_script = generate_lesson_script(epub_db, "TEACHING",5)
with open("data/processed/lesson_script/lesson_script.txt", "w") as f:
    f.write(lesson_script)
print("✅ Lecture script prepared successfully!")

bqe = BasicQuizEngine(db=epub_db)
print("Start generating quiz from script...")
bqe.generate_quiz_from_script(script_path="data/processed/lesson_script/lesson_script.txt",num_questions=3)
print("Quiz generated successfully!")
bqe.print_all_questions()
bqe.clear_all_questions()

