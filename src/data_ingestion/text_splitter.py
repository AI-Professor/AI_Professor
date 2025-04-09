from langchain.text_splitter import RecursiveCharacterTextSplitter
import re

#This function will dynamically split text input based on input length into chunks for knowledge graph construction. 
def split_text(text, chunk_size=500):
    """
    Split the text into chunks of maximum size chunk_size, but try to
    keep sentences together.
    
    Args:
        text: The text to split
        chunk_size: The maximum size of each chunk
        
    Returns:
        A list of text chunks
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
    
    # Group sentences into chunks of maximum size chunk_size
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    
    for sentence in sentences:
        sentence_size = len(sentence)
        
        # If adding this sentence would exceed the chunk size and the current chunk is not empty,
        # add the current chunk to chunks and start a new one
        if current_chunk_size + sentence_size > chunk_size and current_chunk:
            chunks.append(' '.join(current_chunk))
            current_chunk = []
            current_chunk_size = 0
        
        # If a single sentence is larger than the chunk size, split it further
        if sentence_size > chunk_size:
            # If there's anything in the current chunk, add it to chunks
            if current_chunk:
                chunks.append(' '.join(current_chunk))
                current_chunk = []
                current_chunk_size = 0
            
            # Split the long sentence into chunk_size pieces
            for i in range(0, sentence_size, chunk_size):
                chunks.append(sentence[i:i + chunk_size])
            
            continue
        
        # Add the sentence to the current chunk
        current_chunk.append(sentence)
        current_chunk_size += sentence_size
    
    # Add the last chunk if it's not empty
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks