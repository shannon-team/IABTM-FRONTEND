'use client';

import React from 'react';
import MicrophoneTest from '../../components/3605 Feed/MicrophoneTest';
import WebRTCTest from '../../components/3605 Feed/WebRTCTest';

const AudioTestPage = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">Audio Room Test</h1>
        <p className="text-center text-gray-600 mb-8">
          Test microphone permissions and audio streaming functionality
        </p>
        
        <div className="grid gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">Microphone Test</h2>
            <MicrophoneTest />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4">WebRTC Connection Test</h2>
            <WebRTCTest />
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Audio Room Instructions</h2>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h3 className="font-medium text-gray-800 mb-2">To test audio streaming:</h3>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>Open this page in two different browsers or incognito windows</li>
                  <li>Log in with different accounts in each browser</li>
                  <li>Navigate to a group chat with the audio room feature</li>
                  <li>Click "Audio Room" in one browser to start the room</li>
                  <li>Join the room from the other browser</li>
                  <li>Speak in one browser and you should hear it in the other</li>
                  <li>Test mute/unmute functionality</li>
                </ol>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-2">Expected Behavior:</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Microphone permission prompt when starting/joining</li>
                  <li>Real-time audio streaming between participants</li>
                  <li>Speaking indicators when someone is talking</li>
                  <li>Mute/unmute controls that actually work</li>
                  <li>Audio connection status indicators</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-800 mb-2">Troubleshooting:</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Ensure both browsers allow microphone access</li>
                  <li>Check browser console for WebRTC connection logs</li>
                  <li>Verify Socket.IO connection is established</li>
                  <li>Make sure you're using HTTPS or localhost for WebRTC</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioTestPage; 