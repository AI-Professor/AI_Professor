# utils/chat_utils.py
import os
import json

CHAT_LOGS_DIR = "local_model/NeuroSync/NeuroSync_Player/chat_logs"
MAX_CONTEXT_LENGTH = 5000

# Ensure the directory exists
os.makedirs(CHAT_LOGS_DIR, exist_ok=True)

def load_chat_history(user_id=None, session_id=None):
    """
    Loads chat history from the log file.
    
    Args:
        user_id: The user ID to load chat history for
        session_id: The session ID to load chat history for
        
    Returns:
        A list of chat history entries
    """
    if user_id and session_id:
        # Create user-specific directory if it doesn't exist
        user_chat_dir = os.path.join(CHAT_LOGS_DIR, str(user_id))
        os.makedirs(user_chat_dir, exist_ok=True)
        
        # Load session-specific chat history
        log_file = os.path.join(user_chat_dir, f"{session_id}.json")
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return []
    else:
        # Fallback to legacy behavior for backwards compatibility
        log_file = os.path.join(CHAT_LOGS_DIR, "chat_history.json")
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

def save_chat_log(chat_history, user_id=None, session_id=None):
    """
    Saves the chat history, ensuring it stays within context length.
    
    Args:
        chat_history: The chat history to save
        user_id: The user ID to save chat history for
        session_id: The session ID to save chat history for
    """
    if user_id and session_id:
        # Create user-specific directory if it doesn't exist
        user_chat_dir = os.path.join(CHAT_LOGS_DIR, str(user_id))
        os.makedirs(user_chat_dir, exist_ok=True)
        
        # Save to session-specific file
        log_file = os.path.join(user_chat_dir, f"{session_id}.json")
    else:
        # Fallback to legacy behavior
        log_file = os.path.join(CHAT_LOGS_DIR, "chat_history.json")
    
    # Ensure chat history stays within context length
    total_length = sum(len(json.dumps(entry)) for entry in chat_history)
    while total_length > MAX_CONTEXT_LENGTH and chat_history:
        chat_history.pop(0)
        total_length = sum(len(json.dumps(entry)) for entry in chat_history)
    
    # Save to file
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(chat_history, f, indent=4)

def clear_chat_log(user_id=None, session_id=None):
    """
    Clears the chat history by deleting the JSON files.
    
    Args:
        user_id: The user ID to clear chat history for
        session_id: The session ID to clear chat history for
        
    Returns:
        True if successful, False otherwise
    """
    try:
        if user_id and session_id:
            # Delete specific session chat log
            log_file = os.path.join(CHAT_LOGS_DIR, str(user_id), f"{session_id}.json")
            if os.path.exists(log_file):
                os.remove(log_file)
                return True
        elif user_id:
            # Delete all session chat logs for a user
            user_chat_dir = os.path.join(CHAT_LOGS_DIR, str(user_id))
            if os.path.exists(user_chat_dir):
                for filename in os.listdir(user_chat_dir):
                    if filename.endswith('.json'):
                        file_path = os.path.join(user_chat_dir, filename)
                        os.remove(file_path)
                return True
        else:
            # Delete global chat log (legacy)
            log_file = os.path.join(CHAT_LOGS_DIR, "chat_history.json")
            if os.path.exists(log_file):
                os.remove(log_file)
            else:
                # Create empty file if it doesn't exist (legacy behavior)
                with open(log_file, 'w', encoding='utf-8') as f:
                    json.dump([], f, indent=4)
            return True
    except Exception as e:
        print(f"Error clearing chat log: {e}")
        return False