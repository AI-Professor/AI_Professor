from src.nlp.qa_system import answer_question
from pathlib import Path

def generate_lesson_script(db, template="STORYTELLING"):
    """Auto-generates lesson script using GPT-4"""
    prompt = f"""Create a 5-minute lesson script from this course material. Use this template structure 
    BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Format like natural speech:

    {template} STRUCTURE:
    1. Opening Scene (30s)
    2. Character Introduction (30s)
    3. Conflict (30s)
    4. Resolution (30s)
    5. Moral/Lesson (30s)

    Write ONLY the spoken content, no timestamps or section titles. Maintain this flow naturally."""
    
    return answer_question(prompt, db)['text']