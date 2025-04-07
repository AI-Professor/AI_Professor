import os
import subprocess
import psutil
import time
import uuid
from typing import Dict, Optional

class UEInstance:
    def __init__(self, streamer_id: str, websocket_port: int, signaling_port: int):
        self.instance_id = str(uuid.uuid4())
        self.streamer_id = streamer_id
        self.websocket_port = websocket_port
        self.signaling_port = signaling_port
        self.process = None
        self.created_at = time.time()
        self.last_activity = time.time()
        self.status = "initializing"  # initializing, running, error, terminated
        
    def update_activity(self):
        self.last_activity = time.time()
        
    def is_running(self) -> bool:
        if not self.process:
            return False
            
        try:
            process = psutil.Process(self.process.pid)
            return process.is_running()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False
    
    def stop(self) -> bool:
        """
        Stop this UE instance without removing it from the manager.
        This allows the instance to be paused and later reconnected if needed.
        """
        if not self.process:
            return False
            
        try:
            # Get the process
            process = psutil.Process(self.process.pid)
            
            # Terminate child processes
            for child in process.children(recursive=True):
                try:
                    child.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
                    
            # Terminate the main process
            process.terminate()
            process.wait(timeout=5)
            
            self.running = False
            self.status = "paused"
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as e:
            # Try to force kill if termination failed
            try:
                process.kill()
                self.running = False
                self.status = "paused"
                return True
            except Exception:
                return False

class UEManager:
    def __init__(self, logger):
        self.logger = logger
        self.instances: Dict[str, UEInstance] = {}
        self.next_port_index = 0
        self.signaling_port = 8888  # Base port for WebSocket server
        self.websocket_port = 8085  # Base port for Pixel Streaming signaling
  
    def create_instance(self, streamer_id: str) -> UEInstance:
        """Create and start a new UE instance"""
        # Allocate ports for this instance
        #websocket_port, signaling_port = self.allocate_ports()
        
        # Create instance object
        instance = UEInstance(
            streamer_id=streamer_id,
            websocket_port=self.websocket_port,
            signaling_port=self.signaling_port
        )
        
        # Find the UE executable path
        exe_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'Windows', 'AI_Professor.exe')
        if not os.path.exists(exe_path):
            self.logger.error(f"UE executable not found at {exe_path}")
            instance.status = "error"
            return instance
            
        # Construct arguments for the UE process
        args = [
            f'-PixelStreamingURL=ws://127.0.0.1:{self.signaling_port}',
            '-AllowPixelStreamingCommands',
            '-RenderOffscreen',
            f'-PixelStreamingID={streamer_id}'
        ]
        
        try:
            # Start the UE process
            process = subprocess.Popen([exe_path] + args, shell=True)
            instance.process = process
            instance.status = "running"
            
            self.logger.info(f"Started UE instance {instance.instance_id} with PID {process.pid}, "
                            f"streamer ID {streamer_id}, WebSocket port {self.websocket_port}, "
                            f"signaling port {self.signaling_port}")
        except Exception as e:
            self.logger.error(f"Failed to start UE instance: {str(e)}")
            instance.status = "error"
            
        # Store the instance
        self.instances[instance.instance_id] = instance
        return instance
    
    def get_instance(self, instance_id: str) -> Optional[UEInstance]:
        """Get an instance by ID and update activity timestamp"""
        instance = self.instances.get(instance_id)
        if instance:
            instance.update_activity()
        return instance
    
    def get_instance_by_streamer_id(self, streamer_id: str) -> Optional[UEInstance]:
        """Find an instance by streamer ID"""
        for instance in self.instances.values():
            if instance.streamer_id == streamer_id:
                instance.update_activity()
                return instance
        return None
    
    def terminate_instance(self, instance_id: str) -> bool:
        """Terminate a UE instance and clean up resources"""
        instance = self.instances.get(instance_id)
        if not instance or not instance.process:
            return False
            
        try:
            # Get the process
            process = psutil.Process(instance.process.pid)
            
            # Terminate child processes
            for child in process.children(recursive=True):
                try:
                    child.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
                    
            # Terminate the main process
            process.terminate()
            process.wait(timeout=10)
            
            instance.status = "terminated"
            self.logger.info(f"Terminated UE instance {instance_id}")
            
            # Remove from instances dict
            del self.instances[instance_id]
            return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired) as e:
            self.logger.warning(f"Error terminating UE instance {instance_id}: {str(e)}")
            
            # Try to force kill if termination failed
            try:
                process.kill()
                self.logger.info(f"Force killed UE instance {instance_id}")
                instance.status = "terminated"
                del self.instances[instance_id]
                return True
            except Exception as kill_error:
                self.logger.error(f"Failed to force kill UE instance {instance_id}: {str(kill_error)}")
                instance.status = "error"
                return False
        
    def cleanup_inactive_instances(self, timeout_seconds: int = 1800):
        """Terminate instances that have been inactive for the specified timeout"""
        current_time = time.time()
        
        # Find inactive instances
        inactive_instances = [
            instance_id for instance_id, instance in self.instances.items()
            if (current_time - instance.last_activity) > timeout_seconds
        ]
        
        # Terminate each inactive instance
        for instance_id in inactive_instances:
            self.logger.info(f"Cleaning up inactive UE instance {instance_id}")
            self.terminate_instance(instance_id)
    
    def cleanup_all(self):
        """Terminate all UE instances"""
        for instance_id in list(self.instances.keys()):
            self.terminate_instance(instance_id)