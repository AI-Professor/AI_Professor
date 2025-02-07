import os
from src.nlp.qa_system import answer_question
from pathlib import Path

#This function will generate lesson script through GPT-4 model identified in answer_question function in src/nlp/qa_system.py. The content is based on the template we defined here and give to GPT-4.
def generate_lesson_script(db, template, length):
    """Auto-generates lesson script using GPT-4"""

    templates = {
        "STORYTELLING": f"""Create a {length}-minute lesson script from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Format like natural speech:

        STORYTELLING STRUCTURE:
        1. Opening Scene ({length/5}m)
        2. Character Introduction ({length/5}m)
        3. Conflict ({length/5}m)
        4. Resolution ({length/5}m)
        5. Moral/Lesson ({length/5}m)

        Write ONLY the spoken content, no timestamps or section titles. Maintain this flow naturally.""",

        "TEACHING": f"""Create a {length}-minute structured teaching lesson from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Keep the flow conversational:

        TEACHING STRUCTURE:
        1. Introduction to Topic ({length/5}m)
        2. Explanation of Key Concepts ({length/5}m)
        3. Practical Examples ({length/5}m)
        4. Interactive Question/Engagement ({length/5}m)
        5. Summary & Takeaways ({length/5}m)

        Write as if you are delivering a spoken lecture. Make it engaging and clear.""",

        "DISCUSSION": f"""Generate a {length}-minute discussion-driven lesson from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Keep the flow conversational:

        DISCUSSION STRUCTURE:
        1. Thought-Provoking Question ({length/5}m)
        2. Exploration of Perspectives ({length/5}m)
        3. Counterarguments/Alternative Views ({length/5}m)
        4. Real-World Application ({length/5}m)
        5. Final Reflection & Conclusion ({length/5}m)

        Maintain a dynamic and engaging tone, guiding the listener through the conversation naturally."""
    }
    
    if template not in templates:
        raise ValueError(f"Invalid template type. Choose one of: {list(templates.keys())}")

    prompt = templates[template]  
    
    lesson_script = answer_question(prompt, db)['text']

    LESSON_DIR = "data/processed/lesson_script"
    os.makedirs(LESSON_DIR, exist_ok=True)

    with open(f"{LESSON_DIR}/lesson_script.txt", "w") as f:
        f.write(lesson_script)

    return lesson_script