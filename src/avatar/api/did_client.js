export async function handleWebRTCConnection(offer, iceServers) {
const pc = new RTCPeerConnection({ iceServers });

await pc.setRemoteDescription(offer);
const answer = await pc.createAnswer();
await pc.setLocalDescription(answer);

pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
    // Send candidate to D-ID API
    fetch(`${DID_API.url}/streams/${streamId}/ice`, {
        method: 'POST',
        headers: {
        Authorization: `Basic ${DID_API.key}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
        candidate: candidate.toJSON(),
        session_id: sessionId
        })
    });
    }
};

return answer;
}
