import os
from dotenv import load_dotenv
from langchain_community.chat_models import ChatOpenAI

load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

#This function will generate lesson script through GPT-4 model identified in answer_question function in src/nlp/qa_system.py. The content is based on the template we defined here and give to GPT-4.

def generate_lesson_script(db, template, length, topic, topic_path, user_id):
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

        "TEACHING": f"""You are an experienced university professor and lecturer. 
        Create a {length}-minute structured teaching lesson on the topic of {topic}. 
        DO NOT INCLUDE SECTION HEADERS LIKE 'Introduction to Topic', 'Explanation of Key Concepts', etc., in the final script. 
        Use this structure but only write the content as a flowing lecture:

            TEACHING STRUCTURE (Write it naturally without section headers):
            1. Introduction to Topic ({length/5}m)
            2. Explanation of Key Concepts ({length/5}m)
            3. Practical Examples ({length/5}m)
            4. Interactive Question/Engagement ({length/5}m)
            5. Summary & Takeaways ({length/5}m)
            
        Write a continuous, engaging spoken lesson without timestamps or section titles.""",

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
    
    relevant_text = db.similarity_search(topic, k=20)  # Fetch top 5 most relevant passages

    # Concatenate the relevant content to form the context for GPT-4
    relevant_text_content = "\n\n".join([doc.page_content for doc in relevant_text])

    # Use the relevant content in the prompt for GPT-4
    prompt = templates[template].replace("this course material", relevant_text_content)
    
    try:
        # Request GPT-4 to generate the lesson script
        llm = ChatOpenAI(
            model="gpt-4",
            openai_api_key=openai_api_key,
            temperature=0
        )
        lesson_script = llm.predict(prompt)

        LESSON_DIR = f"data/processed/lesson_script/{user_id}"
        os.makedirs(LESSON_DIR, exist_ok=True)

        with open(f"{LESSON_DIR}/{topic_path}_lesson_script.txt", "w") as f:
            f.write(lesson_script)

        return lesson_script
    
    except Exception as e:
        print(f"Error generating lesson script: {e}")
        return None