from src.nlp.qa_system import answer_question
from pathlib import Path

def generate_lesson_script(db, template):
    """Auto-generates lesson script using GPT-4"""

    templates = {
        "STORYTELLING": """Create a 3-minute lesson script from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Format like natural speech:

        STORYTELLING STRUCTURE:
        1. Opening Scene (30s)
        2. Character Introduction (30s)
        3. Conflict (30s)
        4. Resolution (30s)
        5. Moral/Lesson (30s)

        Write ONLY the spoken content, no timestamps or section titles. Maintain this flow naturally.""",

        "TEACHING": """Create a 3-minute structured teaching lesson from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Keep the flow conversational:

        TEACHING STRUCTURE:
        1. Introduction to Topic (30s)
        2. Explanation of Key Concepts (1m 30s)
        3. Practical Examples (1m)
        4. Interactive Question/Engagement (30s)
        5. Summary & Takeaways (30s)

        Write as if you are delivering a spoken lecture. Make it engaging and clear.""",

        "DISCUSSION": """Generate a 3-minute discussion-driven lesson from this course material. Use this template structure 
        BUT DO NOT INCLUDE SECTION HEADERS IN THE FINAL SCRIPT TEXT. Keep the flow conversational:

        DISCUSSION STRUCTURE:
        1. Thought-Provoking Question (30s)
        2. Exploration of Perspectives (1m 30s)
        3. Counterarguments/Alternative Views (1m)
        4. Real-World Application (1m)
        5. Final Reflection & Conclusion (30s)

        Maintain a dynamic and engaging tone, guiding the listener through the conversation naturally."""
    }
    
    if template not in templates:
        raise ValueError(f"Invalid template type. Choose one of: {list(templates.keys())}")

    prompt = templates[template]  
    
    return answer_question(prompt, db)['text']