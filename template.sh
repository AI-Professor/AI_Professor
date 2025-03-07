#!/bin/bash
#SBATCH --job-name=AI_Professor
#SBATCH --output=ai_professor_main_%j.log
#SBATCH --mem=64g -c 16
#SBATCH --gres=gpu:1

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

# Start signalling server with output to signalling log
./Linux/AI_Professor/Samples/PixelStreaming2/WebServers/SignallingWebServer/platform_scripts/bash/start_with_turn.sh --nosudo > "$SIGNAL_LOG" 2>&1 &
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

# Monitor all processes
while is_running $UE_PID || is_running $SIGNAL_PID || is_running $BACKEND_PID || is_running $FRONTEND_PID; do
    echo "$(date) - Service status:"
    is_running $UE_PID && echo "UE Engine: Running (PID: $UE_PID)" || echo "UE Engine: Stopped"
    is_running $SIGNAL_PID && echo "Signalling: Running (PID: $SIGNAL_PID)" || echo "Signalling: Stopped"
    is_running $BACKEND_PID && echo "Backend: Running (PID: $BACKEND_PID)" || echo "Backend: Stopped"
    is_running $FRONTEND_PID && echo "Frontend: Running (PID: $FRONTEND_PID)" || echo "Frontend: Stopped"
    
    sleep 30
done

echo "All services have exited. Job complete."

# Cleanup function
cleanup() {
    echo "Stopping all services..."
    
    # Kill all processes
    [[ -n $UE_PID ]] && kill -TERM $UE_PID 2>/dev/null
    [[ -n $SIGNAL_PID ]] && kill -TERM $SIGNAL_PID 2>/dev/null
    [[ -n $BACKEND_PID ]] && kill -TERM $BACKEND_PID 2>/dev/null
    [[ -n $FRONTEND_PID ]] && kill -TERM $FRONTEND_PID 2>/dev/null
    
    # Wait for processes to terminate
    wait
    
    echo "All services stopped"
}

# Register the cleanup function to be called on script exit
trap cleanup EXIT INT TERM