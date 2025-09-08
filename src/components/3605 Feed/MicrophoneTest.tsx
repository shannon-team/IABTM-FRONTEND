import React, { useState, useRef, useEffect } from 'react';

const MicrophoneTest: React.FC = () => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    initializeMicrophone();
    return () => cleanupAudio();
  }, []);

  const initializeMicrophone = async () => {
    try {
      setError(null);
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false 
      });

      mediaStreamRef.current = stream;
      setHasPermission(true);

      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create audio source from microphone
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create analyser for voice activity detection
      audioAnalyserRef.current = audioContextRef.current.createAnalyser();
      audioAnalyserRef.current.fftSize = 256;
      audioAnalyserRef.current.smoothingTimeConstant = 0.8;
      
      // Connect microphone to analyser
      microphoneRef.current.connect(audioAnalyserRef.current);
      
      // Start voice activity detection
      startVoiceActivityDetection();
      
      console.log('✅ Microphone test initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize microphone test:', error);
      setHasPermission(false);
      setError('Microphone access is required. Please allow microphone permission.');
    }
  };

  const cleanupAudio = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    audioAnalyserRef.current = null;
    microphoneRef.current = null;
  };

  const startVoiceActivityDetection = () => {
    if (!audioAnalyserRef.current) return;

    const dataArray = new Uint8Array(audioAnalyserRef.current.frequencyBinCount);
    
    const detectVoice = () => {
      if (!audioAnalyserRef.current || !mediaStreamRef.current) return;
      
      audioAnalyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const threshold = 30;
      
      const isCurrentlySpeaking = average > threshold && !isMuted;
      
      if (isCurrentlySpeaking !== isSpeaking) {
        setIsSpeaking(isCurrentlySpeaking);
      }
      
      // Continue detection
      requestAnimationFrame(detectVoice);
    };
    
    detectVoice();
  };

  const handleToggleMute = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMutedState = !audioTrack.enabled;
        setIsMuted(newMutedState);
        
        if (newMutedState && isSpeaking) {
          setIsSpeaking(false);
        }
      }
    }
  };

  const handleRetryPermission = () => {
    cleanupAudio();
    initializeMicrophone();
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Microphone Test</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={handleRetryPermission}
            className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Retry Permission
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Permission Status */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${hasPermission ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm">
            {hasPermission ? 'Microphone permission granted' : 'Microphone permission denied'}
          </span>
        </div>

        {/* Mute Status */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-green-500'}`}></div>
          <span className="text-sm">
            {isMuted ? 'Microphone is muted' : 'Microphone is active'}
          </span>
        </div>

        {/* Speaking Status */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`}></div>
          <span className="text-sm">
            {isSpeaking ? 'Speaking detected' : 'Not speaking'}
          </span>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 pt-4">
          <button
            onClick={handleToggleMute}
            disabled={!hasPermission}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isMuted 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded">
          <p className="font-medium mb-1">Test Instructions:</p>
          <ul className="space-y-1">
            <li>• Allow microphone permission when prompted</li>
            <li>• Speak to see the "Speaking detected" indicator</li>
            <li>• Use the Mute/Unmute button to test controls</li>
            <li>• The speaking indicator should stop when muted</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MicrophoneTest; 