from flask import request, jsonify
import numpy as np
import torch
import flask

from local_model.NeuroSync.NeuroSync_Local_API.utils.generate_face_shapes import generate_facial_data_from_bytes
from local_model.NeuroSync.NeuroSync_Local_API.utils.model.model import load_model
from local_model.NeuroSync.NeuroSync_Local_API.utils.config import config

app = flask.Flask(__name__)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

model_path = 'local_model/NeuroSync/NeuroSync_Local_API/utils/model/model.pth'
blendshape_model = load_model(model_path, config, device, use_half_precision=True)

@app.route('/api/audio_to_blendshapes', methods=['POST'])
def audio_to_blendshapes_route():
    audio_bytes = request.data
    generated_facial_data = generate_facial_data_from_bytes(audio_bytes, blendshape_model, device, config)
    generated_facial_data_list = generated_facial_data.tolist() if isinstance(generated_facial_data, np.ndarray) else generated_facial_data

    return jsonify({'blendshapes': generated_facial_data_list})

if __name__ == '__main__':
    app.run(host='localhost', port=9999)
