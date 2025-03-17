# utils/llm_utils.py
import os
from dotenv import load_dotenv
import openai
import requests
from langchain_community.vectorstores import FAISS  
import re

# This is terrible, I know. I am sorry. Better coming soon.

load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

def fetch_image_from_gcs(image_url):
    """
    Fetches the image from Google Cloud Storage using the provided URL.
    Assumes images are stored in a public or accessible bucket.
    """
    try:
        response = requests.get(image_url)
        if response.status_code == 200:
            return response.content  # Returns binary image data
        else:
            print(f"Failed to fetch image: {image_url}")
            return None
    except Exception as e:
        print(f"Error fetching image from GCS: {e}")
        return None
    
def stream_llm_chunks(user_input, chat_history, chunk_queue, db:FAISS, is_lesson=False):
    """
    Streams tokens from the LLM and buffers them into text chunks that end at sentence boundaries,
    exceed the maximum chunk length, or after a given number of tokens have been received.
    If an image URL is detected, it fetches the image from Google Cloud Storage and includes it in the prompt.
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
    flush_token_count = 50 

    if not is_lesson:
        relevant_text = db.similarity_search(user_input, k=5)

        text = ""
        image_urls = []
        for doc in relevant_text:
            content = doc.page_content
            text += doc.page_content + "\n\n"
            found_urls = re.findall(r'https://storage\.googleapis\.com/[\S]+', content)
            if found_urls:
                image_urls.extend(found_urls)
        
        image_data_list = []
        for url in image_urls:
            image_data = fetch_image_from_gcs(url)
            if image_data:
                image_data_list.append(image_data)
        
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
            request_payload = {
                "model": "gpt-4-vision-preview" if image_data_list else "gpt-4",
                "messages": messages,
                "max_tokens": 4000,
                "temperature": 0,
                "top_p": 0.9,
                "stream": True
            }

            if image_data_list:
                request_payload["images"] = image_data_list

            response = openai.ChatCompletion.create(**request_payload)
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
        grouped_chunk = group_sentences(lesson_script_chunks, 3)
        for chunk in grouped_chunk:
            chunk = chunk.strip()  # Ensure no leading/trailing whitespace

            if chunk:
                chunk_queue.put(chunk)  # Send each chunk to the TTS system

                # Ensure buffer is cleared per chunk before adding the next one
                buffer = ""
                token_count = 0

                flush_buffer()  # Immediately process and send the chunk

        if buffer.strip():
            chunk_queue.put(buffer.strip())

def group_sentences(sentences, group_size):
    """
    Groups sentences into larger chunks to reduce TTS latency.
    """
    grouped_chunks = []
    buffer = []
    
    for sentence in sentences:
        buffer.append(sentence)
        if len(buffer) >= group_size:
            grouped_chunks.append(" ".join(buffer))
            buffer = []
    
    if buffer:  # Add remaining sentences
        grouped_chunks.append(" ".join(buffer))
    
    return grouped_chunks