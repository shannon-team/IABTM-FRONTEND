import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';

const WebRTCTest: React.FC = () => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const initializeMedia = async () => {
    try {
      addLog('🎤 Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      addLog('✅ Microphone permission granted');
      return stream;
    } catch (error) {
      addLog(`❌ Microphone permission denied: ${error}`);
      toast.error('Microphone permission is required');
      return null;
    }
  };

  const createPeerConnection = () => {
    addLog('🔗 Creating peer connection...');
    
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local stream
    if (localStream) {
      localStream.getTracks().forEach(track => {
        addLog(`🎤 Adding track: ${track.kind}`);
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      addLog('📡 Received remote track');
      const stream = event.streams[0];
      if (stream) {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        addLog('✅ Remote stream set');
      }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      addLog(`🔗 Connection state: ${peerConnection.connectionState}`);
      setIsConnected(peerConnection.connectionState === 'connected');
    };

    // ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      addLog(`🧊 ICE connection state: ${peerConnection.iceConnectionState}`);
    };

    // ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addLog('🧊 ICE candidate generated');
        // In a real app, this would be sent to the other peer
        console.log('ICE Candidate:', event.candidate);
      }
    };

    peerConnectionRef.current = peerConnection;
    addLog('✅ Peer connection created');
    return peerConnection;
  };

  const createOffer = async () => {
    if (!peerConnectionRef.current) {
      addLog('❌ No peer connection available');
      return;
    }

    try {
      addLog('📤 Creating offer...');
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      addLog('✅ Offer created and set as local description');
      
      // In a real app, this offer would be sent to the other peer
      console.log('Offer:', offer);
      
      return offer;
    } catch (error) {
      addLog(`❌ Error creating offer: ${error}`);
    }
  };

  const createAnswer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      addLog('❌ No peer connection available');
      return;
    }

    try {
      addLog('📋 Setting remote description (offer)...');
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      
      addLog('📤 Creating answer...');
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      addLog('✅ Answer created and set as local description');
      
      // In a real app, this answer would be sent to the other peer
      console.log('Answer:', answer);
      
      return answer;
    } catch (error) {
      addLog(`❌ Error creating answer: ${error}`);
    }
  };

  const setRemoteAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      addLog('❌ No peer connection available');
      return;
    }

    try {
      addLog('📋 Setting remote description (answer)...');
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      addLog('✅ Remote answer set');
    } catch (error) {
      addLog(`❌ Error setting remote answer: ${error}`);
    }
  };

  const addIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) {
      addLog('❌ No peer connection available');
      return;
    }

    try {
      addLog('🧊 Adding ICE candidate...');
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      addLog('✅ ICE candidate added');
    } catch (error) {
      addLog(`❌ Error adding ICE candidate: ${error}`);
    }
  };

  const startTest = async () => {
    addLog('🚀 Starting WebRTC test...');
    
    // Initialize media
    const stream = await initializeMedia();
    if (!stream) return;
    
    // Create peer connection
    createPeerConnection();
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">WebRTC Audio Test</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Local Stream */}
        <div>
          <h3 className="text-lg font-medium mb-2">Local Stream</h3>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-48 bg-gray-100 rounded border"
          />
          <p className="text-sm text-gray-600 mt-2">
            Your microphone (muted to prevent feedback)
          </p>
        </div>

        {/* Remote Stream */}
        <div>
          <h3 className="text-lg font-medium mb-2">Remote Stream</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-48 bg-gray-100 rounded border"
          />
          <p className="text-sm text-gray-600 mt-2">
            Other participant's audio (if connected)
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={startTest}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Start Test
        </button>
        
        <button
          onClick={createOffer}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Create Offer
        </button>
        
        <button
          onClick={clearLogs}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Clear Logs
        </button>
      </div>

      {/* Status */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${localStream ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">
            {localStream ? 'Microphone connected' : 'Microphone disconnected'}
          </span>
          
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">
            {isConnected ? 'WebRTC connected' : 'WebRTC disconnected'}
          </span>
        </div>
      </div>

      {/* Logs */}
      <div>
        <h3 className="text-lg font-medium mb-2">Debug Logs</h3>
        <div className="bg-gray-100 p-4 rounded max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet. Start the test to see debug information.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="text-sm font-mono">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded">
        <h3 className="font-medium mb-2">Test Instructions:</h3>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>Click "Start Test" to initialize microphone and WebRTC</li>
          <li>Click "Create Offer" to generate a WebRTC offer</li>
          <li>Copy the offer from browser console</li>
          <li>In another browser, paste the offer and create an answer</li>
          <li>Exchange ICE candidates between browsers</li>
          <li>Check if audio streams are connected</li>
        </ol>
      </div>
    </div>
  );
};

export default WebRTCTest; 