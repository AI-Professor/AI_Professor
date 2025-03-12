#!/bin/bash
#SBATCH --job-name=AI_Professor
#SBATCH --output=ai_professor_main_%j.log
#SBATCH --mem=64g -c 16
#SBATCH --gres=gpu:1

export PATH=$HOME/bin/ffmpeg-master-latest-linux64-gpl/bin:$PATH
export PATH=$HOME/.local/bin:$PATH
export LD_LIBRARY_PATH=$HOME/.local/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
export XDG_RUNTIME_DIR=/local/scratch/hzha627/run/user/52909
pulseaudio --start --log-level=info --exit-idle-time=-1 --realtime
pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description=VirtualSpeaker channels=2 channel_map=front-left,front-right rate=48000 format=float32le
pactl set-default-sink virtual_speaker
pactl list short sinks

LOG_DIR="/local/scratch/$USER/AI_Professor/logs/logs_$(date +%Y%m%d_%H%M%S)"
mkdir -p $LOG_DIR

# Define log files
UE_LOG="$LOG_DIR/ue_engine.log"
SIGNAL_LOG="$LOG_DIR/signalling_server.log"
BACKEND_LOG="$LOG_DIR/backend_server.log"
FRONTEND_LOG="$LOG_DIR/frontend_server.log"

echo "Starting AI Professor services..."
echo "Log directory: $LOG_DIR"

# Change to project directory
cd /local/scratch/$USER/AI_Professor

# Make scripts executable
chmod +x ./Linux/AI_Professor.sh
chmod +x ./Linux/AI_Professor/Samples/PixelStreaming2/WebServers/SignallingWebServer/platform_scripts/bash/start_with_turn.sh

# Start Unreal Engine with output to UE log
./Linux/AI_Professor.sh -RenderOffscreen > "$UE_LOG" 2>&1 &
UE_PID=$!
echo "UE Engine started with PID $UE_PID"

# Wait for UE to initialize
sleep 5

PUBLIC_IP=$(curl -s https://api.ipify.org)
if [[ -z "$PUBLIC_IP" ]]; then
    PUBLIC_IP="127.0.0.1"  # Fallback to localhost if detection fails
fi

# Start signalling server with output to signalling log
./Linux/AI_Professor/Samples/PixelStreaming2/WebServers/SignallingWebServer/platform_scripts/bash/start.sh --nosudo> "$SIGNAL_LOG" 2>&1 &
SIGNAL_PID=$!
echo "Signalling server started with PID $SIGNAL_PID"

# Wait for signalling server to initialize
sleep 5

# Start backend server with output to backend log
source venv/bin/activate
python main.py > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "Backend server started with PID $BACKEND_PID"

# Wait for backend to initialize
sleep 5

# Start frontend server with output to frontend log
npm start > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Frontend server started with PID $FRONTEND_PID"

echo "All services started. Monitoring processes..."

# Function to check if process is running
is_running() {
    kill -0 $1 2>/dev/null
    return $?
}

# Cleanup function that properly shuts down the backend server
cleanup() {
    echo "Stopping all services..."
    
    # First, properly shut down the backend server with SIGINT to trigger the shutdown event
    if is_running $BACKEND_PID; then
        echo "Sending SIGINT to backend server to trigger proper shutdown..."
        kill -SIGINT $BACKEND_PID
        
        # Wait for backend to clean up (max 30 seconds)
        echo "Waiting for backend to clean up resources..."
        for i in {1..30}; do
            if ! is_running $BACKEND_PID; then
                echo "Backend server shut down properly."
                break
            fi
            sleep 1
        done
        
        # Force kill if it's still running after timeout
        if is_running $BACKEND_PID; then
            echo "Backend server didn't shut down gracefully. Forcing termination."
            kill -TERM $BACKEND_PID
        fi
    fi
    
    # Then stop other services
    [[ -n $UE_PID ]] && is_running $UE_PID && kill -TERM $UE_PID 2>/dev/null
    [[ -n $SIGNAL_PID ]] && is_running $SIGNAL_PID && kill -TERM $SIGNAL_PID 2>/dev/null
    [[ -n $FRONTEND_PID ]] && is_running $FRONTEND_PID && kill -TERM $FRONTEND_PID 2>/dev/null
    
    # Wait for processes to terminate
    wait
    
    echo "All services stopped"
    
    # Verify audio files were cleaned up
    AUDIO_DIR="local_model/NeuroSync/NeuroSync_Player/data/audio"
    if [ -d "$AUDIO_DIR" ]; then
        AUDIO_COUNT=$(find "$AUDIO_DIR" -name "*.wav" | wc -l)
        if [ "$AUDIO_COUNT" -gt 0 ]; then
            echo "Warning: $AUDIO_COUNT audio files remain in $AUDIO_DIR"
            echo "Manually cleaning up remaining audio files..."
            find "$AUDIO_DIR" -name "*.wav" -delete
        else
            echo "Audio files successfully cleaned up"
        fi
    fi
}

# Register the cleanup function to be called on script exit
trap cleanup EXIT INT TERM

# Monitor all processes
while is_running $UE_PID || is_running $SIGNAL_PID || is_running $BACKEND_PID || is_running $FRONTEND_PID; do
    echo "$(date) - Service status:"
    is_running $UE_PID && echo "UE Engine: Running (PID: $UE_PID)" && echo "=== Sink Inputs ===" && pactl list short sink-inputs && echo "=== PulseAudio Clients ===" && pactl list short clients || echo "UE Engine: Stopped"
    is_running $SIGNAL_PID && echo "Signalling: Running (PID: $SIGNAL_PID)" || echo "Signalling: Stopped"
    is_running $BACKEND_PID && echo "Backend: Running (PID: $BACKEND_PID)" || echo "Backend: Stopped"
    is_running $FRONTEND_PID && echo "Frontend: Running (PID: $FRONTEND_PID)" || echo "Frontend: Stopped"
    
    sleep 30
done

echo "All services have exited. Job complete."