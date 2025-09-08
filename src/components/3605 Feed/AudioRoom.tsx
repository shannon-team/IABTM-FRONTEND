import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { toast } from 'react-toastify';
import axios from 'axios';

interface Participant {
  userId: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isConnected: boolean;
}

interface AudioRoomProps {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  socket: Socket | null;
  onLeave: () => void;
}

const AudioRoom: React.FC<AudioRoomProps> = ({
  groupId,
  currentUserId,
  currentUserName,
  socket,
  onLeave
}) => {
  // State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreams = useRef<Map<string, MediaStream>>(new Map());
  const audioElements = useRef<Map<string, HTMLAudioElement>>(new Map());

  // WebRTC Configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Initialize microphone
  const initializeMicrophone = async () => {
    try {
      console.log('🎤 Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false 
      });
      
      setLocalStream(stream);
      console.log('✅ Microphone initialized successfully');
      return stream;
    } catch (err) {
      console.error('❌ Failed to get microphone permission:', err);
      setError('Microphone permission denied. Please allow microphone access.');
      toast.error('Microphone permission required');
      throw err;
    }
  };

  // Create peer connection
  const createPeerConnection = (userId: string): RTCPeerConnection => {
    console.log(`🔗 Creating peer connection for user: ${userId}`);
    
    const pc = new RTCPeerConnection(rtcConfig);
    
    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log(`📥 Received remote stream from ${userId}`);
      const stream = event.streams[0];
      remoteStreams.current.set(userId, stream);
      
      // Create or update audio element
      let audioElement = audioElements.current.get(userId);
      if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
        audioElements.current.set(userId, audioElement);
      }
      
      audioElement.srcObject = stream;
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 Sending ICE candidate to ${userId}`);
        socket?.emit('ice-candidate', {
          targetUserId: userId,
          candidate: event.candidate,
          groupId
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state for ${userId}: ${pc.connectionState}`);
      updateParticipantConnection(userId, pc.connectionState === 'connected');
    };

    peerConnections.current.set(userId, pc);
    return pc;
  };

  // Update participant connection status
  const updateParticipantConnection = (userId: string, isConnected: boolean) => {
    setParticipants(prev => 
      prev.map(p => 
        p.userId === userId 
          ? { ...p, isConnected } 
          : p
      )
    );
  };

  // Handle incoming offer
  const handleOffer = async (data: any) => {
    const { fromUserId, offer } = data;
    console.log(`📨 Received offer from ${fromUserId}`);

    try {
      const pc = createPeerConnection(fromUserId);
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log(`📤 Sending answer to ${fromUserId}`);
      socket?.emit('answer', {
        targetUserId: fromUserId,
        answer,
        groupId
      });
    } catch (err) {
      console.error('❌ Error handling offer:', err);
    }
  };

  // Handle incoming answer
  const handleAnswer = async (data: any) => {
    const { fromUserId, answer } = data;
    console.log(`📨 Received answer from ${fromUserId}`);

    try {
      const pc = peerConnections.current.get(fromUserId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err) {
      console.error('❌ Error handling answer:', err);
    }
  };

  // Handle incoming ICE candidate
  const handleIceCandidate = async (data: any) => {
    const { fromUserId, candidate } = data;
    console.log(`🧊 Received ICE candidate from ${fromUserId}`);

    try {
      const pc = peerConnections.current.get(fromUserId);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('❌ Error handling ICE candidate:', err);
    }
  };

  // Send offer to user
  const sendOffer = async (userId: string) => {
    try {
      const pc = createPeerConnection(userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log(`📤 Sending offer to ${userId}`);
      socket?.emit('offer', {
        targetUserId: userId,
        offer,
        groupId
      });
    } catch (err) {
      console.error('❌ Error sending offer:', err);
    }
  };

  // Connect to all participants
  const connectToParticipants = async () => {
    const otherParticipants = participants.filter(p => p.userId !== currentUserId);
    
    for (const participant of otherParticipants) {
      if (!peerConnections.current.has(participant.userId)) {
        await sendOffer(participant.userId);
      }
    }
  };

  // Handle user joined
  const handleUserJoined = (data: any) => {
    const { userId, name } = data;
    console.log(`👥 User joined: ${name} (${userId})`);
    
    setParticipants(prev => [
      ...prev,
      {
        userId,
        name,
        isMuted: false,
        isSpeaking: false,
        isConnected: false
      }
    ]);

    // Send offer to new user
    if (userId !== currentUserId) {
      sendOffer(userId);
    }
  };

  // Handle user left
  const handleUserLeft = (data: any) => {
    const { userId } = data;
    console.log(`👋 User left: ${userId}`);
    
    // Cleanup peer connection
    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }

    // Remove audio element
    const audioElement = audioElements.current.get(userId);
    if (audioElement) {
      audioElement.remove();
      audioElements.current.delete(userId);
    }

    // Remove from participants
    setParticipants(prev => prev.filter(p => p.userId !== userId));
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log(`🎤 Microphone ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      }
    }
  };

  // Leave room
  const leaveRoom = async () => {
    console.log('🚪 Leaving audio room...');
    
    try {
      // Call backend API to leave audio room
      await axios.post('/api/audio-rooms/leave', {
        groupId
      }, {
        withCredentials: true
      });

      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      // Close all peer connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();

      // Remove all audio elements
      audioElements.current.forEach(audio => audio.remove());
      audioElements.current.clear();

      // Emit leave event
      socket?.emit('leave-audio-room', { groupId });

      console.log('✅ Successfully left audio room');
      onLeave();
    } catch (err) {
      console.error('❌ Error leaving audio room:', err);
      // Still try to leave the UI even if API call fails
      onLeave();
    }
  };

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsConnecting(true);
        setError(null);

        // Initialize microphone
        await initializeMicrophone();

        // Call backend API to join audio room
        const response = await axios.post('/api/audio-rooms/join', {
          groupId
        }, {
          withCredentials: true
        });

        console.log('✅ Joined audio room via API:', response.data);

        // Join audio room socket
        socket?.emit('join-audio-room', { groupId });

        // Set participants from API response
        const audioRoomData = response.data.data.audioRoom;
        if (audioRoomData && audioRoomData.participants) {
          const participantList = await Promise.all(
            audioRoomData.participants.map(async (p: any) => {
              const userResponse = await axios.get(`/api/user/${p.userId}`, {
                withCredentials: true
              });
              return {
                userId: p.userId,
                name: userResponse.data.user.name,
                isMuted: p.isMuted,
                isSpeaking: p.isSpeaking,
                isConnected: true
              };
            })
          );
          setParticipants(participantList);
        }

        setIsConnecting(false);
      } catch (err) {
        console.error('❌ Failed to initialize audio room:', err);
        setError('Failed to initialize audio room');
        setIsConnecting(false);
      }
    };

    if (socket) {
      initialize();
    }
  }, [socket, groupId, currentUserId, currentUserName]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('user-joined-audio-room', handleUserJoined);
    socket.on('user-left-audio-room', handleUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    return () => {
      socket.off('user-joined-audio-room', handleUserJoined);
      socket.off('user-left-audio-room', handleUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
    };
  }, [socket, groupId]);

  // Connect to participants when they change
  useEffect(() => {
    if (participants.length > 1 && localStream) {
      connectToParticipants();
    }
  }, [participants.length, localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, []);

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to audio room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onLeave}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Audio Room</h2>
              <p className="text-sm text-gray-500">
                {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          <button
            onClick={leaveRoom}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Participants */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4">
          {participants.map((participant) => (
            <div
              key={participant.userId}
              className={`flex items-center gap-4 p-4 bg-white rounded-lg border ${
                participant.isSpeaking ? 'border-green-500 bg-green-50' : 'border-gray-200'
              }`}
            >
              {/* Avatar */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                participant.isConnected ? 'bg-blue-500' : 'bg-gray-400'
              }`}>
                <span className="text-white font-semibold">
                  {participant.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{participant.name}</h3>
                  {participant.userId === currentUserId && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">You</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {participant.isMuted && (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                      Muted
                    </span>
                  )}
                  {participant.isSpeaking && (
                    <span className="flex items-center gap-1 text-green-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Speaking
                    </span>
                  )}
                  {!participant.isConnected && (
                    <span className="text-red-500">Disconnected</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isMuted 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMuted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>
          
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">
              {isMuted ? 'Microphone Off' : 'Microphone On'}
            </p>
            <p className="text-xs text-gray-500">
              Click to {isMuted ? 'unmute' : 'mute'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioRoom; 