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
UDP_IP = os.getenv('UDP_IP')

def create_socket_connection(livelink_port: int):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect((UDP_IP, livelink_port))
    return s

def initialize_py_face(name):
    py_face = PyLiveLinkFace(name=name)
    initial_blendshapes = [0.0] * 61
    for i, value in enumerate(initial_blendshapes):
        py_face.set_blendshape(FaceBlendShape(i), float(value))
    return py_face
