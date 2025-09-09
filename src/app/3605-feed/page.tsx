"use client"

import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import IABTM3605Feed from "@/components/3605 Feed/IABTM3605Feed";
import ModernChatRoom from "@/components/3605 Feed/ModernChatRoom";
import Sidebar from '@/components/Dashboard/Sidebar';
import { useAuthStore } from '@/storage/authStore';
import React, { useState, useEffect } from 'react'

function page() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuthStore();
  const [chatType, setChatType] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setChatType(sp.get('chat'));
    setRecipientId(sp.get('recipientId'));
    setRecipientName(sp.get('recipientName'));
  }, []);

  console.log('3605-feed page - URL parameters:', { chatType, recipientId, recipientName });

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  // Determine if we should show chat room
  const shouldShowChat = chatType === 'personal' && recipientId && recipientName;
  
  console.log('3605-feed page - shouldShowChat:', shouldShowChat);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeItem="IABTM 3605" onNavClick={() => {}} isOpen={sidebarOpen} onClose={closeSidebar}/>

      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Toggle button only visible on mobile */}
        <div className="md:hidden p-4">
          <button onClick={toggleSidebar} className="text-black">
            ☰ Menu
          </button>
        </div>

        <Navbar/>

        <div className="flex gap-6 flex-1 p-4 min-w-[1200px] overflow-x-auto">
          <div className="w-[792px] flex-shrink-0">
            {shouldShowChat ? (
              <div className="w-full h-full">
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-semibold">Chat with {decodeURIComponent(recipientName || '')}</h1>
                  <button 
                    onClick={() => window.history.back()} 
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    ← Back to Feed
                  </button>
                </div>
                <div className="h-[calc(100vh-200px)] rounded-lg overflow-hidden border border-gray-200">
                  <ModernChatRoom />
                </div>
              </div>
            ) : (
              <div className="w-full h-full">
                <h1 className="text-2xl font-semibold mb-6">IABTM 3605 Chat Room</h1>
                <div className="h-[calc(100vh-200px)] rounded-lg overflow-hidden border border-gray-200">
                  <ModernChatRoom />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default page