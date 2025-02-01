import os
from src.avatar.script_generator import generate_lesson_script;
from src.data_ingestion.pdf_parser import extract_text_from_pdf;
from src.data_ingestion.text_splitter import split_text;
from src.nlp.qa_system import initialize_qa_system;
import warnings
warnings.filterwarnings("ignore")

#Test text extration from pdf
text = extract_text_from_pdf('data/raw/book.pdf')
print(f'Extracted {len(text)} characters')

#Test text split into chunks
chunks = split_text(text)
print(f'Split into {len(chunks)} chunks')

#Check knowledge graph initialization
db = initialize_qa_system(chunks)
print('Index created at data/processed/knowledge_graph')

#Check lesson script generation
def test_script_generation():
    script_path = "data/processed/lesson_script.txt"
    assert os.path.exists(script_path), "Script file not created"
    assert os.path.getsize(script_path) > 500, "Script file too small (minimum 1KB expected)"
    print("✅ Basic file validation passed")

#Check content structure
def test_script_structure():
    with open("data/processed/lesson_script.txt", "r") as f:
        script = f.read()
        
    required_sections = [
        "Opening Scene",
        "Character Introduction", 
        "Conflict",
        "Resolution",
        "Moral/Lesson"
    ]
    
    missing = [section for section in required_sections 
              if section not in script]
    assert not missing, f"Missing sections: {', '.join(missing)}"
    print("✅ Content structure validation passed")

lesson_script = generate_lesson_script(db)
with open("data/processed/lesson_script.txt", "w") as f:
    f.write(lesson_script)
test_script_generation()
test_script_structure()
lecture = open("data/processed/lesson_script.txt").read()
print(lecture)

