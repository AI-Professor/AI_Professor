# session_manager.py
import os
import uuid
import time
import threading
import psutil
from typing import Dict, List, Optional, Tuple
from fastapi import HTTPException
from queue import Queue
from threading import Thread, Event, Lock
from pythonosc import udp_client
from src.Multiuser.ue_manager import UEManager, UEInstance
from local_model.NeuroSync.NeuroSync_Player.utils.chat_utils import clear_chat_log

class UserSession:
    def __init__(self, user_id: str, py_face_name: str, livelink_port: int, audio_port: int, ue_instance: Optional[UEInstance] = None):
        self.session_id = str(uuid.uuid4())
        self.user_id = user_id
        self.py_face_name = py_face_name
        self.livelink_port = livelink_port
        self.audio_port = audio_port
        self.ue_instance = ue_instance
        self.created_at = time.time()
        self.last_activity = time.time()
        self.chunk_queue = None
        self.audio_queue = None
        self.stop_default_animation = None
        self.default_animation_thread = None
        self.tts_worker_thread = None
        self.audio_worker_thread = None
        self.socket_connection = None
        self.audio_sender = None
        self.py_face = None
        self.chat_history = []
        self.lesson_path = None
        self.last_topic = None
        self.knowledge_db = None  
        self.quiz_engine = None  
        
    def update_activity(self):
        self.last_activity = time.time()
        if self.ue_instance:
            self.ue_instance.update_activity()
        
    def is_inactive(self, timeout_seconds=900):  # 30 minutes default timeout
        return (time.time() - self.last_activity) > timeout_seconds
    
    def get_session_info(self):
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "py_face_name": self.py_face_name,
            "livelink_port": self.livelink_port,
            "audio_port": self.audio_port,
            "streamer_id": self.ue_instance.streamer_id if self.ue_instance else None,
            "websocket_port": self.ue_instance.websocket_port if self.ue_instance else None,
            "signaling_port": self.ue_instance.signaling_port if self.ue_instance else None,
            "created_at": self.created_at,
            "last_activity": self.last_activity,
            "status": self.ue_instance.status if self.ue_instance else "no_instance",
            "has_knowledge_db": self.knowledge_db is not None,
            "has_quiz_engine": self.quiz_engine is not None
        }

class SessionManager:
    def __init__(self, logger):
        self.logger = logger
        self.sessions: Dict[str, UserSession] = {}
        self.ue_manager = UEManager(logger)
        self.lock = Lock()
        
        self.base_livelink_port = 11111
        self.base_audio_port = 11222  
        self.next_livelink_port = self.base_livelink_port
        self.next_audio_port = self.base_audio_port
        self.used_livelink_ports = set()
        self.used_audio_ports = set()
        
        self.cleanup_thread = Thread(target=self._cleanup_inactive_sessions, daemon=True)
        self.cleanup_thread.start()
    
    def _allocate_ports(self) -> Tuple[int, int, int]:
        """
        Allocate unique audio and face ports for a new session
        Uses a simpler approach to avoid deadlocks
        """
        try:
            self.logger.info("Starting port allocation")
            
            with self.lock:
                # Simply increment from the last used port
                livelink_port = self.next_livelink_port
                audio_port = self.next_audio_port
                
                # Update next ports
                self.next_livelink_port += 1
                self.next_audio_port += 1
                
                # Record used ports
                self.used_livelink_ports.add(livelink_port)
                self.used_audio_ports.add(audio_port)
                
                self.logger.info(f"Allocated ports: livelink_port={livelink_port}, audio_port={audio_port}")
                return livelink_port, audio_port
                
        except Exception as e:
            self.logger.error(f"Error in port allocation: {str(e)}")
            # Fallback to default ports if allocation fails
            return self.base_livelink_port + len(self.sessions), self.base_audio_port + len(self.sessions)
    
    def _release_ports(self, livelink_port: int, audio_port: int):
        """
        Release ports when a session is terminated
        Optimized version to avoid long execution times
        """
        try:
            # Quick operation with minimal locking
            if livelink_port and livelink_port in self.used_livelink_ports:
                self.used_livelink_ports.discard(livelink_port)
                self.logger.info(f"Released livelink port: {livelink_port}")

            if audio_port and audio_port in self.used_audio_ports:
                self.used_audio_ports.discard(audio_port)
                self.logger.info(f"Released audio port: {audio_port}")
                
        except Exception as e:
            self.logger.error(f"Error releasing ports: {str(e)}")
        
    def create_session(self, user_id: str) -> UserSession:
        """Create a new session for a user with unique ports and UE instance"""
        try:
            self.logger.info(f"Creating new session for user {user_id}")
            
            # Generate a unique sync_id for the session
            streamer_id = f"Streamer_{user_id}"
            py_face_name = f"User_{user_id}"
            
            # Allocate unique ports for this session
            livelink_port, audio_port = self._allocate_ports()
            self.logger.info(f"Allocated ports: livelink={livelink_port} audio={audio_port}")
            
            # Create a UE instance
            self.logger.info("Creating UE instance")
            ue_instance = self.ue_manager.create_instance(streamer_id)
            
            # Create a new session
            session = UserSession(
                user_id=user_id, 
                py_face_name = py_face_name,
                livelink_port=livelink_port,
                audio_port=audio_port,
                ue_instance=ue_instance
            )
            
            # Store the session
            with self.lock:
                self.sessions[session.session_id] = session
            
            self.logger.info(f"Created new session {session.session_id} for user {user_id} with "
                             f"livelink_port {livelink_port} audio_port {audio_port}")
            
            return session
            
        except Exception as e:
            self.logger.error(f"Error creating session: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")
    
    def get_session(self, session_id: str) -> Optional[UserSession]:
        """Get a session by ID and update its activity timestamp"""
        session = self.sessions.get(session_id)
        if session:
            session.update_activity()
        return session
    
    def get_user_sessions(self, user_id: str) -> List[UserSession]:
        """Get all sessions for a specific user"""
        return [session for session in self.sessions.values() if session.user_id == user_id]
    
    def terminate_session(self, session_id: str):
        """
        Terminate a session with proper cleanup and dictionary removal
        """
        # First, retrieve the session without removing it
        session = None
        try:
            session = self.sessions.get(session_id)
            if not session:
                self.logger.warning(f"Session {session_id} not found for termination")
                return False
            
            self.logger.info(f"Starting termination for session {session_id}")
        except Exception as e:
            self.logger.error(f"Error accessing session {session_id}: {str(e)}")
            return False
        
        # Perform cleanup operations on the session
        self._cleanup_session_resources(session)
        
        # After resources are cleaned up, remove from dictionary
        try:
            with self.lock:
                if session_id in self.sessions:
                    self.logger.info(f"Removing session {session_id} from sessions dictionary")
                    del self.sessions[session_id]
                    self.logger.info(f"Removed session {session_id} from sessions dictionary")
                    return True
                else:
                    self.logger.info(f"Session {session_id} already removed from dictionary")
                    return True
        except Exception as e:
            self.logger.error(f"Error removing session from dictionary: {str(e)}")
            # Last resort: try without the lock
            try:
                if session_id in self.sessions:
                    del self.sessions[session_id]
                    self.logger.info(f"Force-removed session {session_id} from sessions dictionary")
                    return True
            except Exception as inner_e:
                self.logger.error(f"Failed to force-remove session: {str(inner_e)}")
            return False
    
    def _cleanup_session_resources(self, session):
        """
        Clean up all resources associated with a session without
        involving dictionary operations.
        """
        session_id = session.session_id
        
        # 1. Stop worker threads
        if session.chunk_queue:
            try:
                session.chunk_queue.put(None)
                if session.tts_worker_thread and session.tts_worker_thread.is_alive():
                    session.tts_worker_thread.join(timeout=1)
                self.logger.info(f"Signaled TTS worker to stop for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error stopping TTS worker: {str(e)}")
        
        if session.audio_queue:
            try:
                session.audio_queue.put(None)
                if session.audio_worker_thread and session.audio_worker_thread.is_alive():
                    session.audio_worker_thread.join(timeout=1)
                self.logger.info(f"Signaled audio worker to stop for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error stopping audio worker: {str(e)}")
        
        # 2. Stop animation thread
        if session.stop_default_animation:
            try:
                session.stop_default_animation.set()
                if session.default_animation_thread and session.default_animation_thread.is_alive():
                    session.default_animation_thread.join(timeout=1)
                self.logger.info(f"Signaled animation thread to stop for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error stopping animation thread: {str(e)}")
        
        # 3. Close socket connection
        if session.socket_connection:
            try:
                session.socket_connection.close()
                self.logger.info(f"Closed socket connection for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error closing socket connection: {str(e)}")
        
        # 4. Terminate UE instance
        if session.ue_instance:
            try:
                self.ue_manager.terminate_instance(session.ue_instance.instance_id)
                self.logger.info(f"Terminated UE instance for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error terminating UE instance: {str(e)}")
        
        # 5. Clear chat history
        if session.chat_history:
            try:
                clear_chat_log(session.user_id, session.session_id)
                self.logger.info(f"Cleared chat history for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error clearing chat history: {str(e)}")
        
        # 6. Clean up quiz database
        if session.quiz_engine:
            try:
                # Just close the connection without clearing questions
                if session.quiz_engine.conn:
                    session.quiz_engine.clear_all_questions()
                    session.quiz_engine.close()
                    self.logger.info(f"Closed quiz database connection for session {session_id}")
            except Exception as e:
                self.logger.error(f"Error closing quiz database: {str(e)}")
        
        # 7. Release ports
        try:
            if session.livelink_port and session.audio_port:
                self._release_ports(session.livelink_port, session.audio_port)
                self.logger.info(f"Released ports for session {session_id}")
        except Exception as e:
            self.logger.error(f"Error releasing ports: {str(e)}")
        
        try:
            lecture_history_dir = f"data/processed/lecture_history/{session.user_id}/{session.session_id}"
            if os.path.exists(lecture_history_dir):
                shutil.rmtree(lecture_history_dir)
                self.logger.info(f"Cleared lecture history for session {session_id}")
        except Exception as e:
            self.logger.error(f"Error clearing lecture history: {str(e)}")
        
        self.logger.info(f"Completed resource cleanup for session {session_id}")

    def _cleanup_inactive_sessions(self):
        """Periodically check for and clean up inactive sessions"""
        while True:
            try:
                # Sleep for 30 seconds before checking
                time.sleep(150)
                
                # Find inactive sessions WITHOUT holding the lock during termination
                inactive_sessions = []
                with self.lock:
                    inactive_sessions = [
                        session_id for session_id, session in self.sessions.items() 
                        if session.is_inactive()
                    ]
                
                # Terminate each inactive session (outside the lock)
                for session_id in inactive_sessions:
                    self.logger.info(f"Cleaning up inactive session {session_id}")
                    self.terminate_session(session_id)
                
                # Also clean up any inactive UE instances
                self.ue_manager.cleanup_inactive_instances()
                    
            except Exception as e:
                self.logger.error(f"Error in session cleanup: {str(e)}")

    def cleanup(self):
        """
        Clean up all sessions when shutting down
        """
        self.logger.info("Starting cleanup of all sessions")
        
        # Get a list of session IDs first, without holding the lock
        session_ids = []
        try:
            # Use a copy to avoid modification during iteration
            session_ids = list(self.sessions.keys())
        except Exception as e:
            self.logger.error(f"Error getting session IDs: {str(e)}")
        
        # Terminate each session individually
        terminated_count = 0
        for session_id in session_ids:
            try:
                # Use get to check if session still exists (might have been removed already)
                if session_id in self.sessions:
                    success = self.terminate_session(session_id)
                    if success:
                        terminated_count += 1
                else:
                    self.logger.info(f"Session {session_id} already removed, skipping termination")
                    terminated_count += 1
            except Exception as e:
                self.logger.error(f"Error during termination of session {session_id}: {str(e)}")
        
        self.logger.info(f"Terminated {terminated_count} of {len(session_ids)} sessions")
        
        # Clean up any remaining UE instances
        try:
            self.ue_manager.cleanup_all()
            self.logger.info("Cleaned up all UE instances")
        except Exception as e:
            self.logger.error(f"Error cleaning up UE instances: {str(e)}")
        
        self.logger.info("Cleanup completed")