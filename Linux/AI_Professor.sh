#!/bin/sh
export XDG_RUNTIME_DIR=/local/scratch/hzha627/run/user/52909
UE_TRUE_SCRIPT_NAME=$(echo \"$0\" | xargs readlink -f)
UE_PROJECT_ROOT=$(dirname "$UE_TRUE_SCRIPT_NAME")
chmod +x "$UE_PROJECT_ROOT/AI_Professor/Binaries/Linux/AI_Professor-Linux-Shipping"
PIXEL_STREAMING_ARGS="-PixelStreamingURL=ws://0.0.0.0:12345 -AllowPixelStreamingCommands -RenderOffscreen -AudioMixer -PixelStreamingWebRTCMaxFps=120"
"$UE_PROJECT_ROOT/AI_Professor/Binaries/Linux/AI_Professor-Linux-Shipping" AI_Professor $PIXEL_STREAMING_ARGS "$@" 
