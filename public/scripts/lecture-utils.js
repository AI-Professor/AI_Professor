export function saveLectureTranscript(lectureContent, user_id, session_id) {
    try {
      // Format similar to chat history
      const lectureEntry = {
        timestamp: Date.now(),
        content: lectureContent
      };
      
      // Get existing lecture history or initialize empty array
      let lectureHistory = getLectureHistory(user_id, session_id) || [];
      
      // Add new lecture entry
      lectureHistory.push(lectureEntry);
      
      // Ensure we don't exceed reasonable storage limits (keep last 10 lectures)
      if (lectureHistory.length > 10) {
        lectureHistory = lectureHistory.slice(-10);
      }
      
      // Save to session storage
      const key = `lecture_history_${user_id}_${session_id}`;
      sessionStorage.setItem(key, JSON.stringify(lectureHistory));
      
      return true;
    } catch (error) {
      console.error('Error saving lecture transcript:', error);
      return false;
    }
  }
  
  // Function to get lecture history from session storage
  export function getLectureHistory(user_id, session_id) {
    try {
      const key = `lecture_history_${user_id}_${session_id}`;
      const history = sessionStorage.getItem(key);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error getting lecture history:', error);
      return [];
    }
  }
  
  // Function to clear lecture history
  export function clearLectureHistory(user_id, session_id) {
    try {
      const key = `lecture_history_${user_id}_${session_id}`;
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error clearing lecture history:', error);
      return false;
    }
  }