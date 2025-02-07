from src.avatar.script_generator import generate_lesson_script;
from src.data_ingestion.text_splitter import split_text;
from src.nlp.quiz_system import BasicQuizEngine;
from src.data_ingestion.epub_parser import extract_text_from_epub;
from src.nlp.qa_system import initialize_qa_system;
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
print("✅ Lecture script prepared successfully!")

#Initialize BasicQuizEngine object base on the knowledge graph we generated above.
#Detailed implementation for all below functions can be found in src/nlp/quiz_system.py
bqe = BasicQuizEngine(db=epub_db)
print("Start generating quiz from script...")
#Generate quiz questions and choices from the lecture script we generated above.
bqe.generate_quiz_from_script(script_path="data/processed/lesson_script/lesson_script.txt",num_questions=3)
print("Quiz generated successfully!")
#Show the questions we generated from last step
bqe.print_all_questions()
#Clear quiz database for future usage
bqe.clear_all_questions()

