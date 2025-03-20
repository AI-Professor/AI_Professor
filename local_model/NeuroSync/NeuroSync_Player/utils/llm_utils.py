# utils/llm_utils.py
import os
from dotenv import load_dotenv
import re
import base64
import io
import re
from google.cloud import storage
from google.oauth2 import service_account
from openai import OpenAI
from langchain_community.vectorstores import FAISS 


load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")
GCS_CREDENTIALS_PATH = "FigureFetchingKey.json"
BUCKET_NAME = "ai_professor_uploaded_figures"
credentials = service_account.Credentials.from_service_account_file(GCS_CREDENTIALS_PATH)
storage_client = storage.Client(credentials=credentials)
bucket = storage_client.bucket(BUCKET_NAME)
client = OpenAI(api_key=openai_api_key)
# This is terrible, I know. I am sorry. Better coming soon.


def fetch_image_from_gcs(image_url):
    """
    Fetches an image from a private Google Cloud Storage bucket, removes trailing ')',
    encodes it in Base64, and returns the encoded string.
    """
    try:
        # Remove trailing `)` from the URL if they exist
        cleaned_url = re.sub(r"\)+$", "", image_url)

        # Extract the object path from the GCS URL
        if "storage.googleapis.com" in cleaned_url:
            object_path = cleaned_url.split(f"{BUCKET_NAME}/")[-1]  # Extract only the object name
        else:
            raise ValueError(f"Invalid GCS URL format: {cleaned_url}")

        # Fetch the image from GCS
        blob = bucket.blob(object_path)
        image_data = blob.download_as_bytes()  # Download image as bytes

        if not image_data:
            print(f"Failed to fetch image: {cleaned_url}")
            return None

        print(f"Successfully fetched image from GCS: {cleaned_url}")

        # Encode the image in Base64
        base64_encoded_image = base64.b64encode(image_data).decode("utf-8")
        return base64_encoded_image

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
            base64_image = fetch_image_from_gcs(url)
            if base64_image:
                image_data_list.append(base64_image)

        relevant_text = text
        messages = [{"role": "system", "content": f"""You are a helpful teaching assistant. Answer the question 
            using ONLY the provided text. If unsure or not related to the context, say "I don't know".
            
            Context: {relevant_text}
            
            Question: {user_input}
            
            Answer in 2-3 sentences:"""}]
        for entry in chat_history:
            messages.append({"role": "user", "content": entry["input"]})
            messages.append({"role": "assistant", "content": entry["response"]})
        
        try:
            request_payload = {
                "model": "gpt-4o",
                "messages" :messages,
                "max_tokens": 4000,
                "temperature": 0,
                "top_p": 0.9,
                "stream": True
            }
            content = []
            content.append({ "type": "text", "text": user_input })
            if image_data_list:
                for image in image_data_list:
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image}"},
                    })
            cur_msg = {"role": "user", "content": content}
            messages.append(cur_msg)

            response = client.chat.completions.create(**request_payload)
            for chunk in response:
                if hasattr(chunk, "choices") and chunk.choices:  # Ensure choices exist
                    choice = chunk.choices[0]  # Access first choice object

                    if hasattr(choice, "delta") and choice.delta.content is not None:
                        content = choice.delta.content  # ✅ Use dot notation instead of dictionary indexing
                        full_response += content
                        buffer += content
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