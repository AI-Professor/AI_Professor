# Update the llm_utils.py with improved sentence chunking for streaming

import os
from dotenv import load_dotenv
import openai
import re
from langchain_community.vectorstores import FAISS  


load_dotenv(override=True) 
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

def split_sentences(text):
    """
    Split text into sentences, properly handling abbreviations and other special cases.
    
    Args:
        text: The text to split into sentences
        
    Returns:
        A list of sentences
    """
    # Common abbreviations and titles that contain periods but aren't sentence endings
    common_abbreviations = [
        r'Mr\.', r'Mrs\.', r'Ms\.', r'Dr\.', r'Prof\.', r'Gov\.', r'Sen\.', r'Rep\.', 
        r'Lt\.', r'Col\.', r'Gen\.', r'Sgt\.', r'Capt\.', r'Cmdr\.', r'Admin\.', r'Adm\.', 
        r'Rev\.', r'Ph\.D\.', r'M\.D\.', r'B\.A\.', r'M\.A\.', r'B\.S\.', r'M\.S\.',
        r'Jr\.', r'Sr\.', r'Inc\.', r'Ltd\.', r'Co\.', r'Corp\.', r'P\.C\.', r'LLC\.', r'LLP\.',
        r'Assn\.', r'Bros\.', r'Dept\.', r'Est\.', r'Univ\.', r'Intl\.', r'Dist\.', r'Mt\.',
        r'St\.', r'Ave\.', r'Blvd\.', r'Rd\.', r'Ln\.', r'Dr\.', r'Ctr\.', r'Ct\.',
        r'e\.g\.', r'i\.e\.', r'etc\.', r'vs\.', r'v\.', r'Jan\.', r'Feb\.', r'Mar\.', 
        r'Apr\.', r'Jun\.', r'Jul\.', r'Aug\.', r'Sep\.', r'Sept\.', r'Oct\.', r'Nov\.', r'Dec\.',
        r'a\.m\.', r'p\.m\.', r'U\.S\.', r'U\.K\.', r'U\.N\.', r'E\.U\.', r'fig\.', r'ca\.',
        r'i\.e\.', r'e\.g\.', r'al\.', r'seq\.', r'no\.'
    ]
    
    # Create a regex pattern for all abbreviations with word boundaries
    abbreviations_pattern = r'\b(' + '|'.join(common_abbreviations) + r')\s+'
    
    # Replace abbreviations with a temporary marker
    temp_marker = "###ABBR###"
    processed_text = text
    
    # Find all abbreviations and replace their periods with a temporary marker
    abbreviation_regex = re.compile(abbreviations_pattern, re.IGNORECASE)
    processed_text = abbreviation_regex.sub(lambda match: match.group().replace('.', temp_marker), processed_text)
    
    # Find numerical markers (like 1. 2. 3.) and replace them
    numerical_markers_regex = re.compile(r'(\d+)\.\s+')
    processed_text = numerical_markers_regex.sub(lambda match: f"{match.group(1)}{temp_marker} ", processed_text)
    
    # Now split on actual sentence boundaries: .!? followed by space or end of line
    sentence_regex = re.compile(r'[.!?]+(?=\s|$)')
    
    sentences = []
    last_index = 0
    
    for match in sentence_regex.finditer(processed_text):
        # Extract the sentence including the punctuation
        sentence = processed_text[last_index:match.end()]
        
        # Restore abbreviation periods
        sentence = sentence.replace(temp_marker, '.')
        
        sentences.append(sentence)
        last_index = match.end()
    
    # Add any remaining text as the last sentence if there is any
    if last_index < len(processed_text):
        final_sentence = processed_text[last_index:]
        final_sentence = final_sentence.replace(temp_marker, '.')
        sentences.append(final_sentence)
    
    # Handle case where no sentences were found
    if not sentences:
        return [text]
        
    return sentences

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
                
                # Check if we have a complete sentence that ends with punctuation
                # Use a regex to find sentence endings but be smarter about abbreviations
                if (re.search(r'[.!?](?=\s|$)', buffer.strip()) and 
                    not re.search(r'\b(Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|etc\.)\s*$', buffer.strip())):
                    flush_buffer()
                elif len(buffer) >= max_chunk_length:
                    flush_buffer()
                elif token_count >= flush_token_count:
                    flush_buffer()
                
            if buffer.strip():
                chunk_queue.put(buffer.strip())
            return full_response
        
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return "Error: OpenAI API call failed."

    else:
        # Better sentence splitting for lesson scripts
        lesson_script_sentences = split_sentences(user_input.strip())
        grouped_chunk = group_sentences(lesson_script_sentences, 2)
        
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
            
        return user_input  # Return the complete lesson script