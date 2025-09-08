import React, { useState, useEffect } from 'react';

interface AudioRoomTestProps {
  onClose: () => void;
}

const AudioRoomTest: React.FC<AudioRoomTestProps> = ({ onClose }) => {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const runAudioTest = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      addResult('🎤 Starting audio room test...');
      
      // Test 1: Check WebRTC support
      if (!window.RTCPeerConnection) {
        addResult('❌ WebRTC not supported');
        return;
      }
      addResult('✅ WebRTC supported');
      
      // Test 2: Check getUserMedia support
      if (!navigator.mediaDevices?.getUserMedia) {
        addResult('❌ getUserMedia not supported');
        return;
      }
      addResult('✅ getUserMedia supported');
      
      // Test 3: Test microphone access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true, 
          video: false 
        });
        addResult('✅ Microphone access granted');
        
        // Check audio tracks
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          addResult(`✅ Found ${audioTracks.length} audio track(s)`);
        } else {
          addResult('❌ No audio tracks found');
        }
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        addResult(`❌ Microphone access failed: ${error}`);
      }
      
      // Test 4: Test audio output
      try {
        // Create a simple audio context and oscillator for testing
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5); // Play for 0.5 seconds
        
        addResult('✅ Audio output working (test tone played)');
        
        // Cleanup
        setTimeout(() => {
          audioContext.close();
        }, 1000);
      } catch (error) {
        addResult(`❌ Audio output failed: ${error}`);
      }
      
      // Test 5: Test STUN servers
      const stunServers = [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
      ];
      
      addResult(`🔍 Testing ${stunServers.length} STUN servers...`);
      
      for (const stunServer of stunServers) {
        try {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: stunServer }]
          });
          
          // Create a dummy offer to trigger ICE gathering
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          // Wait longer for ICE gathering and check multiple states
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const iceCandidates = pc.localDescription?.sdp || '';
          const hasStunCandidates = iceCandidates.includes('stun:') || iceCandidates.includes('STUN');
          
          if (pc.iceGatheringState === 'complete' && hasStunCandidates) {
            addResult(`✅ STUN server ${stunServer} working`);
          } else if (pc.iceGatheringState === 'gathering') {
            addResult(`⏳ STUN server ${stunServer} gathering (may be slow)`);
          } else {
            addResult(`⚠️ STUN server ${stunServer} may be blocked`);
          }
          
          pc.close();
        } catch (error) {
          addResult(`❌ STUN server ${stunServer} failed: ${error}`);
        }
      }
      
      addResult('🎉 Audio room test completed!');
      console.log('✅ Audio room test completed successfully');
      
    } catch (error) {
      addResult(`❌ Test failed: ${error}`);
      console.error('❌ Audio room test failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Audio Room Test</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-4">
          <div className="space-y-2">
            {testResults.length === 0 ? (
              <p className="text-gray-500 text-sm">
                Click "Run Test" to check audio room compatibility
              </p>
            ) : (
              testResults.map((result, index) => (
                <div
                  key={index}
                  className={`text-sm p-2 rounded ${
                    result.includes('✅') 
                      ? 'bg-green-50 text-green-800' 
                      : result.includes('❌') 
                      ? 'bg-red-50 text-red-800'
                      : result.includes('⚠️')
                      ? 'bg-yellow-50 text-yellow-800'
                      : 'bg-gray-50 text-gray-800'
                  }`}
                >
                  {result}
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={runAudioTest}
            disabled={isRunning}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Test'}
          </button>
          <button
            onClick={() => setTestResults([])}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export default AudioRoomTest; 