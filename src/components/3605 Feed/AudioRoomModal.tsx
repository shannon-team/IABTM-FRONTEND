import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { toast } from 'react-toastify';
import { Socket } from 'socket.io-client';
import axios from 'axios';

interface AudioRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  currentUserId: string;
  socket: Socket | null;
  onStartAudioRoom: () => void;
  onJoinAudioRoom: () => void;
}

interface AudioRoomState {
  isActive: boolean;
  participants: Array<{
    userId: string;
    name: string;
  }>;
}

const AudioRoomModal: React.FC<AudioRoomModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  currentUserId,
  socket,
  onStartAudioRoom,
  onJoinAudioRoom
}) => {
  const [audioRoomState, setAudioRoomState] = useState<AudioRoomState>({
    isActive: false,
    participants: []
  });
  const [loading, setLoading] = useState(false);

  // Fetch current audio room status
  const fetchAudioRoomStatus = async () => {
    try {
      const response = await axios.get(`/api/audio-rooms/status/${groupId}`, {
        withCredentials: true
      });

      const audioRoomData = response.data.data.audioRoom;
      setAudioRoomState({
        isActive: audioRoomData?.isActive || false,
        participants: audioRoomData?.participants || []
      });
    } catch (err) {
      console.error('Failed to fetch audio room status:', err);
      // Set default state if API fails
      setAudioRoomState({
        isActive: false,
        participants: []
      });
    }
  };

  // Fetch status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAudioRoomStatus();
    }
  }, [isOpen, groupId]);

  // Listen for audio room updates
  useEffect(() => {
    if (!socket) return;

    const handleAudioRoomStarted = (data: any) => {
      if (data.groupId === groupId) {
        setAudioRoomState({
          isActive: true,
          participants: data.participants || []
        });
        toast.success('Audio room started!');
      }
    };

    const handleAudioRoomEnded = (data: any) => {
      if (data.groupId === groupId) {
        setAudioRoomState({
          isActive: false,
          participants: []
        });
        toast.info('Audio room ended');
      }
    };

    const handleUserJoined = (data: any) => {
      if (data.groupId === groupId) {
        setAudioRoomState(prev => ({
          ...prev,
          participants: data.participants || []
        }));
      }
    };

    const handleUserLeft = (data: any) => {
      if (data.groupId === groupId) {
        setAudioRoomState(prev => ({
          ...prev,
          participants: data.participants || []
        }));
      }
    };

    socket.on('audio-room-started', handleAudioRoomStarted);
    socket.on('audio-room-ended', handleAudioRoomEnded);
    socket.on('user-joined-audio-room', handleUserJoined);
    socket.on('user-left-audio-room', handleUserLeft);

    return () => {
      socket.off('audio-room-started', handleAudioRoomStarted);
      socket.off('audio-room-ended', handleAudioRoomEnded);
      socket.off('user-joined-audio-room', handleUserJoined);
      socket.off('user-left-audio-room', handleUserLeft);
    };
  }, [socket, groupId]);

  const handleStartAudioRoom = async () => {
    try {
      setLoading(true);

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Call backend API to start audio room
      const response = await axios.post('/api/audio-rooms/start', {
        groupId
      }, {
        withCredentials: true
      });

      console.log('✅ Started audio room via API:', response.data);

      // Emit start event
      socket?.emit('start-audio-room', { groupId });

      onStartAudioRoom();
      onClose();
    } catch (err) {
      console.error('Failed to start audio room:', err);
      toast.error('Microphone permission required to start audio room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAudioRoom = async () => {
    try {
      setLoading(true);

      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Call backend API to join audio room
      const response = await axios.post('/api/audio-rooms/join', {
        groupId
      }, {
        withCredentials: true
      });

      console.log('✅ Joined audio room via API:', response.data);

      // Emit join event
      socket?.emit('join-audio-room', { groupId });

      onJoinAudioRoom();
      onClose();
    } catch (err) {
      console.error('Failed to join audio room:', err);
      toast.error('Microphone permission required to join audio room');
    } finally {
      setLoading(false);
    }
  };

  const isInRoom = audioRoomState.participants.some(p => p.userId === currentUserId);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div>
                      <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
                        Audio Room
                      </Dialog.Title>
                      <p className="text-sm text-gray-500">{groupName}</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-6">
                      {audioRoomState.isActive ? (
                    <div>
                      <div className="text-center mb-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-medium text-gray-900">Audio Room Active</h4>
                        <p className="text-sm text-gray-500">
                          {audioRoomState.participants.length} participant{audioRoomState.participants.length !== 1 ? 's' : ''} in the room
                        </p>
                      </div>

                      {isInRoom ? (
                        <div className="text-center">
                          <p className="text-gray-600 mb-4">You are already in the audio room</p>
                          <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleJoinAudioRoom}
                          disabled={loading}
                          className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? (
                          <div className="flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Joining...
                          </div>
                          ) : (
                            'Join Audio Room'
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="text-center mb-4">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-medium text-gray-900">Start Audio Room</h4>
                        <p className="text-sm text-gray-500">
                          Create a voice chat room for this group
                        </p>
                      </div>

                      <button
                        onClick={handleStartAudioRoom}
                        disabled={loading}
                        className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Starting...
                          </div>
                        ) : (
                          'Start Audio Room'
                        )}
                      </button>
                    </div>
                )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default AudioRoomModal; 