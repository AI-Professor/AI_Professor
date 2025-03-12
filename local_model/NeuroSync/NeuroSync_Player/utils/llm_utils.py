# utils/llm_utils.py
import os
from dotenv import load_dotenv
import openai
from langchain_community.vectorstores import FAISS  
import re

# This is terrible, I know. I am sorry. Better coming soon.

load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

def stream_llm_chunks(user_input, chat_history, chunk_queue, db:FAISS, is_lesson=False):
    """
    Streams tokens from the LLM and buffers them into text chunks that end at sentence boundaries,
    exceed the maximum chunk length, or after a given number of tokens have been received.
    Each chunk is put into chunk_queue for TTS processing.
    Returns the full response as a string.
    """
    def flush_buffer():
        nonlocal buffer, token_count
        chunk_text_val = buffer.strip()
        if chunk_text_val:
            chunk_queue.put(chunk_text_val)
        buffer = ""
        token_count = 0
    
    buffer = ""
    full_response = ""
    token_count = 0
    max_chunk_length = 500
    flush_token_count = 60 

    if not is_lesson:
        relevant_text = db.similarity_search(user_input, k=5)

        text = ""

        for doc in relevant_text:
            text += doc.page_content + "\n\n"
        
        relevant_text = text
        messages = [{"role": "system", "content": f"""You are a helpful teaching assistant. Answer the question 
            using ONLY the provided text. If unsure or not related to the context, say "I don't know".
            
            Context: {relevant_text}
            
            Question: {user_input}
            
            Answer in 2-3 sentences:"""}]
        for entry in chat_history:
            messages.append({"role": "user", "content": entry["input"]})
            messages.append({"role": "assistant", "content": entry["response"]})
        messages.append({"role": "user", "content": user_input})
        
        try:
            openai.api_key = openai_api_key
            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=messages,
                max_tokens=4000,
                temperature=0,
                top_p=0.9,
                stream=True
            )
            for chunk in response:
                token = chunk["choices"][0].get("delta", {}).get("content", "")
                full_response += token
                buffer += token
                token_count += 1
                
                # ----- CHANGED LOGIC (same as above) -----
                if buffer.strip() and buffer.strip()[-1] in ".!?":
                    flush_buffer()
                elif len(buffer) >= max_chunk_length:
                    flush_buffer()
                elif token_count >= flush_token_count:
                    flush_buffer()
                # --------------------------------------------
            if buffer.strip():
                chunk_queue.put(buffer.strip())
            return full_response
        
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return "Error: OpenAI API call failed."

    else:
        lesson_script_chunks = re.split(r'(?<=[.!?])\s+', user_input.strip())
        for chunk in lesson_script_chunks:
            chunk = chunk.strip()  # Ensure no leading/trailing whitespace

            if chunk:
                chunk_queue.put(chunk)  # Send each chunk to the TTS system

                # Ensure buffer is cleared per chunk before adding the next one
                buffer = ""
                token_count = 0

                flush_buffer()  # Immediately process and send the chunk

        if buffer.strip():
            chunk_queue.put(buffer.strip())