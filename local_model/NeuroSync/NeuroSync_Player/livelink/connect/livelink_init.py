# This software is licensed under a **dual-license model**
# For individuals and businesses earning **under $1M per year**, this software is licensed under the **MIT License**
# Businesses or organizations with **annual revenue of $1,000,000 or more** must obtain a to use this software commercially.

# # livelink_init.py

import sys
import os
from dotenv import load_dotenv

# Add the parent directory (NeuroSync's parent) to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import socket
from livelink.connect.pylivelinkface import PyLiveLinkFace, FaceBlendShape

load_dotenv()
UDP_IP = os.getenv('SERVER_HOST_NAME')
UDP_PORT = int(os.getenv('UDP_PORT'))

def create_socket_connection():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    return s

def initialize_py_face():
    py_face = PyLiveLinkFace()
    initial_blendshapes = [0.0] * 61
    for i, value in enumerate(initial_blendshapes):
        py_face.set_blendshape(FaceBlendShape(i), float(value))
    return py_face
