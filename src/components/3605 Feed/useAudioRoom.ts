import { useEffect, useRef, useState } from 'react';

export function useAudioRoom({
  socket,
  groupId,
  userId,
  audioRoomUsers,
  isInAudioRoom
}: {
  socket: any;
  groupId: string;
  userId: string;
  audioRoomUsers: string[];
  isInAudioRoom: boolean;
}) {
  const [micEnabled, setMicEnabled] = useState(true);
  const [connections, setConnections] = useState<{ [id: string]: RTCPeerConnection }>({});
  const [remoteStreams, setRemoteStreams] = useState<{ [id: string]: MediaStream }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // Get mic stream when joining audio room
  useEffect(() => {
    if (!isInAudioRoom) {
      // Cleanup on leave
      Object.values(connections).forEach(pc => pc.close());
      setConnections({});
      setRemoteStreams({});
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      return;
    }
    // Get user media
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      localStreamRef.current = stream;
      setMicEnabled(true);
    });
    // eslint-disable-next-line
  }, [isInAudioRoom]);

  // Handle peer connections
  useEffect(() => {
    if (!socket || !isInAudioRoom || !localStreamRef.current) return;
    // For each other user in the audio room, create a peer connection if not exists
    audioRoomUsers.forEach(peerId => {
      if (peerId === userId) return;
      if (connections[peerId]) return;
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:relay1.expressturn.com:3480',
            username: '000000002072354464',
            credential: 'URGF0vnaKMoQ58xdOLZj2ZY2d3M=',
          },
        ],
      });
      // Add local stream
      if (localStreamRef.current) {
  localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
      }
      // Handle remote stream
      pc.ontrack = (event) => {
        setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
      };
      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', { targetUserId: peerId, candidate: event.candidate, groupId });
        }
      };
      setConnections(prev => ({ ...prev, [peerId]: pc }));
      // Create offer
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { targetUserId: peerId, offer, groupId });
      });
    });
    // eslint-disable-next-line
  }, [audioRoomUsers, isInAudioRoom, localStreamRef.current]);

  // Handle incoming signaling
  useEffect(() => {
    if (!socket) return;
    // Offer
    const handleOffer = async ({ fromUserId, offer }: any) => {
      if (!isInAudioRoom || fromUserId === userId) return;
      let pc = connections[fromUserId];
      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
              urls: 'turn:relay1.expressturn.com:3480',
              username: '000000002072354464',
              credential: 'URGF0vnaKMoQ58xdOLZj2ZY2d3M=',
            },
          ],
        });
        localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
        pc.ontrack = (event) => {
          setRemoteStreams(prev => ({ ...prev, [fromUserId]: event.streams[0] }));
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc_ice_candidate', { targetUserId: fromUserId, candidate: event.candidate, groupId });
          }
        };
        setConnections(prev => ({ ...prev, [fromUserId]: pc }));
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', { targetUserId: fromUserId, answer, groupId });
    };
    // Answer
    const handleAnswer = async ({ fromUserId, answer }: any) => {
      const pc = connections[fromUserId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };
    // ICE
    const handleIce = async ({ fromUserId, candidate }: any) => {
      const pc = connections[fromUserId];
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };
    socket.on('webrtc_offer', handleOffer);
    socket.on('webrtc_answer', handleAnswer);
    socket.on('webrtc_ice_candidate', handleIce);
    return () => {
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleIce);
    };
    // eslint-disable-next-line
  }, [socket, connections, isInAudioRoom]);

  // Mute/unmute
  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setMicEnabled(track.enabled);
      });
    }
  };

  return {
    micEnabled,
    toggleMic,
    remoteStreams,
    localStream: localStreamRef.current,
  };
} 