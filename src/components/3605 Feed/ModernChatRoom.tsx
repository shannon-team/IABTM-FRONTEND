"use client";

import React, { useEffect, useRef, useState, Fragment, useMemo } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuthStore } from '@/storage/authStore';
import axios from 'axios';
import StartRoomModal from './StartRoomModal';
import AddUsersModal from './AddUsersModal';
import AudioRoom from './AudioRoom';
import AudioRoomModal from './AudioRoomModal';
import FileUploadModal from './FileUploadModal';
import { toast } from 'react-toastify';
import AboutButtonModal from './AboutButtonModal';
import { Dialog, Transition } from '@headlessui/react';
import { useRecentlyViewedChats } from '@/hooks/useRecentlyViewedChats';
import { debounce, throttle, createTypingDebounce, createMicToggleThrottle } from '@/utils/performanceUtils';
import { useEventBus, chatEvents } from '@/utils/pubSub';
import { binarySearchByTimestamp, jumpToMessageByTimestamp } from '@/utils/searchAlgorithms';
import { useRateLimiting } from '@/utils/rateLimiting';
import { useAudioRoomStateMachine } from '@/utils/stateMachine';

// Modern high-tech icons
const SpeakerIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19 12c0-2.21-1.79-4-4-4" />
    <path d="M19 12c0 2.21-1.79 4-4 4" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

// Message type
interface Message {
  id: string;
  sender: string;
  content: string;
  time: string;
  isUser: boolean;
  timestamp: Date;
  messageType?: 'text' | 'file';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  readBy?: Array<{ userId: string; timestamp: Date }>;
}

interface Chat {
  id: string;
  name: string;
  type: 'group' | 'personal';
  profilePicture?: string;
  memberCount?: number;
  onlineCount?: number;
  isMicEnabled: boolean;
  members?: any[];
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount?: number;
}

// Helper to get initials from group or user name
function getInitials(name: string) {
  if (!name) return '';
  const words = name.trim().split(' ');
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Helper to format date for chat messages
function formatMessageDate(date: Date | undefined | null): string {
  if (!date) return 'Unknown Date';
  
  try {
  const now = new Date();
  const messageDate = new Date(date);
  
  // Reset time to compare only dates
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (messageDay.getTime() === today.getTime()) {
    return 'Today';
  } else if (messageDay.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    // Format as "Monday, January 15" or "January 15, 2023" if different year
    const currentYear = now.getFullYear();
    const messageYear = messageDate.getFullYear();
    
    if (messageYear === currentYear) {
      return messageDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    } else {
      return messageDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
    }
  } catch (error) {
    console.warn('Error formatting message date:', error);
    return 'Unknown Date';
  }
}

// Helper to check if two dates are on the same day
function isSameDay(date1: Date | undefined | null, date2: Date | undefined | null): boolean {
  if (!date1 || !date2) return false;
  
  try {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1.getTime() === d2.getTime();
  } catch (error) {
    console.warn('Error comparing dates:', error);
    return false;
  }
}

const ModernChatRoom = () => {
  const { user } = useAuthStore();
  const userId = user?._id || 'user-123';
  const userName = user?.name || 'You';
  
  // URL params (read on the client to avoid SSR/suspense requirement)
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
  
  // Debug user information
  useEffect(() => {
    console.log('🔍 User info:', { 
      userId, 
      userName, 
      userExists: !!user,
      userData: user 
    });
  }, [user, userId, userName]);

  // Debug URL parameters
  useEffect(() => {
    console.log('🔍 URL Parameters:', { 
      chatType, 
      recipientId, 
      recipientName 
    });
  }, [chatType, recipientId, recipientName]);
  
  // Recently viewed chats hook
  const { 
    recentChats, 
    addRecentChat, 
    updateUnreadCount, 
    updateLastMessage 
  } = useRecentlyViewedChats();

  // Event bus for pub/sub pattern
  const { subscribe, publish } = useEventBus();

  // Rate limiting hooks
  const { 
    checkMessageLimit, 
    checkMicToggleLimit, 
    checkTypingLimit, 
    checkAudioRoomLimit 
  } = useRateLimiting(userId);

  // Audio room state machine
  const audioRoomStateMachine = useAudioRoomStateMachine();

  // State for groups and personal chats
  const [groupChats, setGroupChats] = useState<Chat[]>([]);
  const [personalChats, setPersonalChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPersonalChats, setLoadingPersonalChats] = useState(true);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [personalChatsError, setPersonalChatsError] = useState<string | null>(null);

  // Real-time state
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Enhanced chat features
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [showUnreadIndicator, setShowUnreadIndicator] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modal state
  const [showStartRoomModal, setShowStartRoomModal] = useState(false);
  const [showAddUsersModal, setShowAddUsersModal] = useState(false);
  const [showAudioRoomModal, setShowAudioRoomModal] = useState(false);
  const [pendingRoomDetails, setPendingRoomDetails] = useState<{ roomTitle: string; micAccess: boolean } | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // File sharing state
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Audio room state
  const [audioRoomUsers, setAudioRoomUsers] = useState<string[]>([]);
  const [isInAudioRoom, setIsInAudioRoom] = useState(false);
  const [showAudioRoom, setShowAudioRoom] = useState(false);
  const [audioRoomState, setAudioRoomState] = useState<any>(null);

  // Pagination state
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [lastCursor, setLastCursor] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Debounced and throttled functions
  const debouncedTypingIndicator = useMemo(
    () => createTypingDebounce(1000),
    []
  );

  const throttledMicToggle = useMemo(
    () => createMicToggleThrottle(500),
    []
  );

  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      // Perform search logic here
      console.log('Searching for:', query);
    }, 300),
    []
  );

  const throttledScrollToBottom = useMemo(
    () => throttle(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100),
    []
  );

  // Enhanced message read/unread tracking
  const [unreadMessages, setUnreadMessages] = useState<Set<string>>(new Set());
  const [readMessages, setReadMessages] = useState<Set<string>>(new Set());
  const messageObserverRef = useRef<IntersectionObserver | null>(null);

  // Enhanced mark messages as read with intersection observer
  const markMessagesAsRead = async (messageIds: string[] = []) => {
    if (!selectedChat || !userId) return;
    
    try {
      console.log('📖 Marking messages as read for chat:', selectedChat.id);
      
      // If no specific message IDs provided, get all unread messages
      const idsToMark = messageIds.length > 0 ? messageIds : 
        messages
          .filter(msg => !msg.isUser && !msg.readBy?.some(read => read.userId === userId))
          .map(msg => msg.id);
      
      if (idsToMark.length === 0) {
        console.log('📖 No unread messages to mark');
        return;
      }
      
      console.log('📖 Marking', idsToMark.length, 'messages as read');
      
      const response = await axios.post('/api/messages/mark-read', {
        messageIds: idsToMark,
        chatId: selectedChat.id,
        chatType: selectedChat.type
      }, { withCredentials: true });
      
      if (response.data.success) {
        console.log('✅ Messages marked as read successfully');
        
        // Update local state
        setReadMessages(prev => new Set([...prev, ...idsToMark]));
        setUnreadMessages(prev => {
          const newSet = new Set(prev);
          idsToMark.forEach(id => newSet.delete(id));
          return newSet;
        });
        
        // Update message read status in UI
        setMessages(prev => prev.map(msg => 
          idsToMark.includes(msg.id) 
            ? { ...msg, readBy: [...(msg.readBy || []), { userId, timestamp: new Date() }] }
            : msg
        ));
        
        // Update unread count for this chat
        updateChatUnreadCount(selectedChat.id, -idsToMark.length);
        
        // Emit read status via socket
        socket?.emit('message_read_enhanced', {
          messageIds: idsToMark,
          roomId: selectedChat.id,
          readBy: userId
        });
        
      } else {
        console.error('❌ Failed to mark messages as read:', response.data);
      }
    } catch (error: any) {
      console.error('❌ Error marking messages as read:', error);
      console.error('❌ Error response:', error.response?.data);
    }
  };

  // Update chat unread count in the sidebar
  const updateChatUnreadCount = (chatId: string, change: number) => {
    setGroupChats(prev => prev.map(chat => 
      chat.id === chatId 
        ? { ...chat, unreadCount: Math.max(0, (chat.unreadCount || 0) + change) }
        : chat
    ));
    
    setPersonalChats(prev => prev.map(chat => 
      chat.id === chatId 
        ? { ...chat, unreadCount: Math.max(0, (chat.unreadCount || 0) + change) }
        : chat
    ));
  };

  // Setup intersection observer for automatic read detection
  useEffect(() => {
    if (!selectedChat || !userId) return;

    // Cleanup previous observer
    if (messageObserverRef.current) {
      messageObserverRef.current.disconnect();
    }

    // Create new intersection observer
    messageObserverRef.current = new IntersectionObserver(
      (entries) => {
        const unreadMessageIds: string[] = [];
        
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute('data-message-id');
            if (messageId && !readMessages.has(messageId) && !unreadMessages.has(messageId)) {
              unreadMessageIds.push(messageId);
            }
          }
        });
        
        // Mark messages as read if any unread messages came into view
        if (unreadMessageIds.length > 0) {
          markMessagesAsRead(unreadMessageIds);
        }
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.5 // Message is considered "read" when 50% visible
      }
    );

    // Observe all unread messages
    const unreadMessageElements = document.querySelectorAll('[data-message-id]');
    unreadMessageElements.forEach(element => {
      const messageId = element.getAttribute('data-message-id');
      if (messageId && !readMessages.has(messageId)) {
        messageObserverRef.current?.observe(element);
      }
    });

    return () => {
      if (messageObserverRef.current) {
        messageObserverRef.current.disconnect();
      }
    };
  }, [selectedChat, userId, messages, readMessages, unreadMessages]);

  // Mark all messages as read when entering a chat
  useEffect(() => {
    if (selectedChat && userId) {
      const unreadMessageIds = messages
        .filter(msg => !msg.isUser && !msg.readBy?.some(read => read.userId === userId))
        .map(msg => msg.id);
      
      if (unreadMessageIds.length > 0) {
        // Small delay to ensure UI is rendered
        setTimeout(() => {
          markMessagesAsRead(unreadMessageIds);
        }, 500);
      }
    }
  }, [selectedChat?.id, userId]);

  // Fetch groups
  useEffect(() => {
    const fetchGroups = async () => {
    setLoadingGroups(true);
    setGroupError(null);
      try {
        console.log('🔍 Fetching groups for user:', userId);
        const response = await axios.get('/api/group/my-groups', { withCredentials: true });
        console.log('📦 Groups response:', response.data);
        
        if (response.data.success) {
          const groups = response.data.data.map((group: any) => ({
            id: group._id,
            name: group.name,
            type: 'group' as const,
            profilePicture: group.avatar,
            memberCount: group.members?.length || 0,
            onlineCount: group.onlineCount || 0,
            isMicEnabled: group.isMicEnabled || false,
            members: group.members || [],
            lastMessage: group.lastMessage || '',
            lastMessageTime: group.lastMessageTime || new Date(),
            unreadCount: group.unreadCount || 0
          }));
          console.log('✅ Groups processed:', groups);
        setGroupChats(groups);
        } else {
          console.error('❌ Groups API returned success: false:', response.data);
          setGroupError('Failed to load groups');
        }
      } catch (error: any) {
        console.error('❌ Error fetching groups:', error);
        console.error('❌ Error response:', error.response?.data);
        setGroupError(error.response?.data?.message || 'Failed to load groups');
        toast.error('Failed to load groups');
      } finally {
        setLoadingGroups(false);
      }
    };

    if (userId) {
      fetchGroups();
    }
  }, [userId]);

  // Request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  // Fetch personal chats from backend
  useEffect(() => {
    setLoadingPersonalChats(true);
    setPersonalChatsError(null);
    
    console.log('🔍 Fetching personal chats for user:', userId);
    
    axios.get('/api/messages/conversations', { withCredentials: true })
      .then(res => {
        console.log('📦 Personal chats response:', res.data);
        console.log('📦 Response status:', res.status);
        
        if (!res.data.success) {
          console.error('❌ Personal chats API returned success: false:', res.data);
          setPersonalChats([]);
          setPersonalChatsError('Failed to load personal chats');
          return;
        }
        
        const conversations = (res.data.data || [])
          .filter((conv: any) => conv && conv.id) // Filter out invalid conversations
          .map((conv: any, index: number) => ({
            id: conv.id || `personal-${index}-${Date.now()}`,
            name: conv.name || 'Unknown User',
            type: 'personal' as const,
            profilePicture: conv.profilePicture,
            lastMessage: conv.lastMessage || '',
            lastMessageTime: conv.lastMessageTime || new Date(),
            unreadCount: conv.unreadCount || 0,
            isMicEnabled: false,
          }))
          .filter((chat: Chat, index: number, array: Chat[]) => 
            array.findIndex((c: Chat) => c.id === chat.id) === index
          );
        
        console.log('✅ Personal chats processed:', conversations);
        setPersonalChats(conversations);
        
        // If we have URL parameters, make sure the chat is selected
        if (chatType === 'personal' && recipientId && recipientName) {
          const existingChat = conversations.find((chat: Chat) => chat.id === recipientId);
          if (existingChat && !selectedChat) {
            console.log('🎯 Selecting personal chat from URL params:', existingChat);
            setSelectedChat(existingChat);
          }
        }
      })
      .catch(error => {
        console.error('❌ Error fetching personal chats:', error);
        console.error('❌ Error response:', error.response?.data);
        console.error('❌ Error status:', error.response?.status);
        setPersonalChats([]);
        setPersonalChatsError(error.response?.data?.message || 'Failed to load personal chats');
        toast.error('Failed to load personal chats');
      })
      .finally(() => {
        setLoadingPersonalChats(false);
      });
  }, [userId, chatType, recipientId, recipientName, selectedChat]);

  // Connect to socket server
  useEffect(() => {
    console.log('🔌 Attempting to connect to socket server...');
    
    const newSocket = io('http://localhost:8000', { 
      withCredentials: true,
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Debug: Listen for all group avatar events
    newSocket.on('group:avatar-updated', (data) => {
      console.log('ModernChatRoom received group:avatar-updated event:', data);
    });

    // Enhanced connection monitoring
    newSocket.on('connect', () => {
      console.log('✅ ModernChatRoom connected to socket server');
      console.log('🔗 Socket ID:', newSocket.id);
      
      // Authenticate the socket connection
      newSocket.emit('authenticate');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ ModernChatRoom disconnected from socket server:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ ModernChatRoom socket connection error:', error);
      console.log('💡 This is normal if the backend server is not running on port 8000');
      console.log('💡 Chat functionality will work without real-time features');
      // Don't show error toast for connection issues - it's not critical
    });
    
    newSocket.on('auth_error', (error) => {
      console.error('❌ ModernChatRoom socket authentication error:', error);
      console.log('💡 Socket connected but authentication failed');
    });

    newSocket.on('error', (error) => {
      console.error('❌ ModernChatRoom socket error:', error);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('🔄 ModernChatRoom reconnected after', attemptNumber, 'attempts');
    });

    newSocket.on('reconnect_error', (error) => {
      console.log('🔄 ModernChatRoom reconnection failed:', error);
    });

    setSocket(newSocket);
    
    return () => {
      console.log('🧹 Cleaning up ModernChatRoom socket connection');
      newSocket.close();
    };
  }, []);

  // Real-time group update logic
  useEffect(() => {
    if (!socket) return;
    const handleGroupUpdated = (updatedGroup: any) => {
      // Validate the updated group data
      if (!updatedGroup || (!updatedGroup._id && !updatedGroup.id)) {
        console.warn('Received invalid group update data:', updatedGroup);
        return;
      }

      const groupId = updatedGroup._id || updatedGroup.id;
      setGroupChats(prev =>
        prev.map(group =>
          group.id === groupId
            ? {
                ...group,
                profilePicture: updatedGroup.profilePicture,
                memberCount: updatedGroup.memberCount || 0,
                onlineCount: updatedGroup.onlineCount || 0,
                name: updatedGroup.name || group.name,
                isMicEnabled: updatedGroup.isMicEnabled || false,
                members: updatedGroup.members || [],
              }
            : group
        )
      );
      if (selectedChat && selectedChat.id === groupId) {
        setSelectedChat(prev =>
          prev
            ? {
                ...prev,
                profilePicture: updatedGroup.profilePicture,
                memberCount: updatedGroup.memberCount || 0,
                onlineCount: updatedGroup.onlineCount || 0,
                name: updatedGroup.name || prev.name,
                isMicEnabled: updatedGroup.isMicEnabled || false,
                members: updatedGroup.members || [],
              }
            : prev
        );
      }
    };
    socket.on('group-updated', handleGroupUpdated);
    
    const handleGroupAvatarUpdated = (data: { groupId: string; avatar: string }) => {
      console.log('Group avatar updated in ModernChatRoom:', data);
      
      // Update group in the list
      setGroupChats(prev =>
        prev.map(group =>
          group.id === data.groupId
            ? {
                ...group,
                profilePicture: data.avatar,
              }
            : group
        )
      );
      
      // Update selected chat if it's the same group
      if (selectedChat && selectedChat.id === data.groupId) {
        setSelectedChat(prev =>
          prev
            ? {
                ...prev,
                profilePicture: data.avatar,
              }
            : prev
        );
      }
    };
    
    socket.on('group:avatar-updated', handleGroupAvatarUpdated);
    
    return () => {
      socket.off('group-updated', handleGroupUpdated);
      socket.off('group:avatar-updated', handleGroupAvatarUpdated);
    };
  }, [socket, selectedChat]);

  // Join/leave room on chat switch
  useEffect(() => {
    if (!socket || !selectedChat) return;
    
    // Reset audio room view when switching chats
    setShowAudioRoom(false);
    
    // Join appropriate room based on chat type
    if (selectedChat.type === 'group') {
      socket.emit('joinRoom', { roomName: selectedChat.id });
    } else {
      // For personal chats, join a room with both user IDs sorted
      const roomName = [userId, selectedChat.id].sort().join('_');
      socket.emit('joinRoom', { roomName });
    }
    
    return () => {
      if (selectedChat.type === 'group') {
        socket.emit('leaveRoom', { roomName: selectedChat.id });
      } else {
        const roomName = [userId, selectedChat.id].sort().join('_');
        socket.emit('leaveRoom', { roomName });
      }
    };
  }, [socket, selectedChat, userId]);

  // Fetch messages for selected chat
  useEffect(() => {
    if (!selectedChat) return;
    console.log('🔍 Fetching messages for chat:', selectedChat.id, 'Type:', selectedChat.type);
    console.log('🔍 Current user ID:', userId);
    console.log('🔍 Selected chat full data:', selectedChat);
    
    setIsLoadingMessages(true);
    setMessages([]); // Clear previous messages
    
    // For initial load, don't use cursor - get the most recent messages
    const params = selectedChat.type === 'group' 
      ? { groupId: selectedChat.id, limit: 50 }
      : { recipientId: selectedChat.id, limit: 50 };
    
    console.log('📦 Message fetch params:', params);
    console.log('📦 API endpoint: /api/messages');
    
    axios.get('/api/messages', { 
      params,
      withCredentials: true 
    })
      .then(res => {
        console.log('📦 Messages response:', res.data);
        console.log('📦 Response status:', res.status);
        console.log('📦 Response headers:', res.headers);
        
        if (!res.data.success) {
          console.error('❌ Messages API returned success: false:', res.data);
          setMessages([]);
          toast.error(res.data.message || 'Failed to load messages');
          return;
        }
        
        const rawMessages = res.data.data || [];
        console.log('📦 Raw messages from API:', rawMessages);
        console.log('📦 Number of messages:', rawMessages.length);
        
        if (rawMessages.length === 0) {
          console.log('📭 No messages found for this chat');
          setMessages([]);
          return;
        }
        
        const msgs = rawMessages.map((msg: any, index: number) => {
          console.log(`📝 Processing message ${index}:`, {
            id: msg._id,
            sender: msg.sender,
            content: msg.content?.substring(0, 50),
            createdAt: msg.createdAt
          });
          
          return {
          id: msg._id || msg.id || `msg-${selectedChat.id}-${index}-${Date.now()}`,
          sender: msg.sender?.name || msg.sender || 'Unknown',
          content: msg.content || msg.message || '',
          time: msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Now',
            isUser: (msg.sender?._id === userId) || (msg.sender === userId) || (typeof msg.sender === 'string' && msg.sender === userId),
          timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
            messageType: msg.messageType || 'text',
            mediaUrl: msg.mediaUrl || msg.fileUrl,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            fileType: msg.fileType,
            readBy: msg.readBy || []
          };
        });
        
        console.log('✅ Processed messages:', msgs);
        console.log('✅ Messages count after processing:', msgs.length);
        
        // Set pagination state
        if (res.data.pagination) {
          setHasMoreMessages(res.data.pagination.hasMore);
          setLastCursor(res.data.pagination.nextCursor);
          console.log('📄 Pagination info:', res.data.pagination);
        }
        
        setMessages(msgs);
        
        // Scroll to bottom after messages are loaded
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
        
        // Mark messages as read
        if (msgs.length > 0) {
          markMessagesAsRead();
        }
      })
      .catch(error => {
        console.error('❌ Error fetching messages:', error);
        console.error('❌ Error response:', error.response?.data);
        console.error('❌ Error status:', error.response?.status);
        console.error('❌ Error config:', error.config);
        setMessages([]);
        toast.error(error.response?.data?.message || 'Failed to load messages');
      })
      .finally(() => {
        setIsLoadingMessages(false);
      });
  }, [selectedChat, userId]); // Removed lastCursor dependency

  // Function to refresh personal chats
  const refreshPersonalChats = async () => {
    try {
      console.log('🔍 Fetching personal chats for user:', userId);
      const response = await axios.get('/api/messages/conversations', { withCredentials: true });
      console.log('📦 Personal chats response:', response.data);
      
      if (response.data.success) {
      const conversations = (response.data.data || [])
        .filter((conv: any) => conv && conv.id)
        .map((conv: any, index: number) => ({
          id: conv.id || `personal-${index}-${Date.now()}`,
          name: conv.name || 'Unknown User',
          type: 'personal' as const,
          profilePicture: conv.profilePicture,
          lastMessage: conv.lastMessage || '',
          lastMessageTime: conv.lastMessageTime || new Date(),
          unreadCount: conv.unreadCount || 0,
          isMicEnabled: false,
        }))
        .filter((chat: Chat, index: number, array: Chat[]) => 
          array.findIndex((c: Chat) => c.id === chat.id) === index
        );
        
        console.log('✅ Personal chats processed:', conversations);
      setPersonalChats(conversations);
      
      // If we have URL parameters, make sure the chat is selected
      if (chatType === 'personal' && recipientId && recipientName) {
        const existingChat = conversations.find((chat: Chat) => chat.id === recipientId);
        if (existingChat && !selectedChat) {
            console.log('🎯 Selecting personal chat from URL params:', existingChat);
          setSelectedChat(existingChat);
        }
      }
      } else {
        console.error('❌ Personal chats API returned success: false:', response.data);
        setPersonalChatsError('Failed to load personal chats');
      }
    } catch (error: any) {
      console.error('❌ Error fetching personal chats:', error);
      console.error('❌ Error response:', error.response?.data);
      setPersonalChatsError(error.response?.data?.message || 'Failed to load personal chats');
      toast.error('Failed to load personal chats');
    }
  };

  // Enhanced chat sorting and unread count management
  const sortChatsByActivity = (chats: Chat[]): Chat[] => {
    return [...chats].sort((a, b) => {
      // First, sort by unread count (unread chats first)
      if ((a.unreadCount || 0) > 0 && (b.unreadCount || 0) === 0) return -1;
      if ((a.unreadCount || 0) === 0 && (b.unreadCount || 0) > 0) return 1;
      
      // Then sort by last message timestamp (most recent first)
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      
      return bTime - aTime;
    });
  };

  // Move chat to top when new message arrives
  const moveChatToTop = (chatId: string, lastMessage: string, lastMessageTime: Date) => {
    setGroupChats(prev => {
      const updated = prev.map(chat => 
        chat.id === chatId 
          ? { ...chat, lastMessage, lastMessageTime, unreadCount: (chat.unreadCount || 0) + 1 }
          : chat
      );
      return sortChatsByActivity(updated);
    });
    
    setPersonalChats(prev => {
      const updated = prev.map(chat => 
        chat.id === chatId 
          ? { ...chat, lastMessage, lastMessageTime, unreadCount: (chat.unreadCount || 0) + 1 }
          : chat
      );
      return sortChatsByActivity(updated);
    });
  };

  // Enhanced message receiving with chat sorting
    const handleNewMessage = (data: any) => {
    console.log('📨 Received message via new-message:', data);
    console.log('🎯 Current selected chat:', selectedChat);
    console.log('🔍 Message groupId:', data.groupId);
    console.log('🔍 Message roomName:', data.roomName);
    console.log('🔍 Message recipientId:', data.recipientId);
      
      // Check if this message is for the current chat
      const isForCurrentChat = selectedChat && (
        (selectedChat.type === 'group' && data.groupId === selectedChat.id) ||
        (selectedChat.type === 'personal' && (data.roomName === selectedChat.id || data.recipientId === selectedChat.id))
      );
    
    console.log('✅ Is message for current chat:', isForCurrentChat);
      
      if (isForCurrentChat) {
        const newMsg: Message = {
          id: data._id || data.id || `new-${selectedChat.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sender: data.sender?.name || data.sender || 'Unknown',
          content: data.content || data.message || '',
          time: data.createdAt ? new Date(data.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Now',
        isUser: (data.sender?._id === userId) || (data.sender === userId) || (typeof data.sender === 'string' && data.sender === userId),
          timestamp: data.createdAt ? new Date(data.createdAt) : new Date(),
        };
      
      console.log('📝 Created new message object:', newMsg);
        
        // Check if message already exists to avoid duplicates
        setMessages(prev => {
          const messageExists = prev.some(msg => msg.id === newMsg.id);
        console.log('🔍 Message already exists:', messageExists);
        console.log('📊 Current messages count:', prev.length);
        
          if (messageExists) {
            return prev;
          }
        
        console.log('✅ Adding new message to state');
          return [...prev, newMsg];
        });
        
        // Enhanced message handling
      if ((data.sender?._id !== userId) && (data.sender !== userId)) {
          setUnreadCount(prev => prev + 1);
          setShowUnreadIndicator(true);
          sendPushNotification(data);
          
          // Mark message as delivered
          socket?.emit('message_delivered', {
          messageId: data._id || data.id,
            roomId: selectedChat?.id
          });
        }
        
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    
    // Move chat to top and update unread count for all chats
    const chatId = data.groupId || data.roomName || data.recipientId;
    if (chatId && (data.sender?._id !== userId) && (data.sender !== userId)) {
      moveChatToTop(chatId, data.content || data.message || '', new Date(data.createdAt || Date.now()));
    }
      
      // Refresh personal chats list when new message is received
    if (data.recipientId || (data.sender?._id !== userId && data.sender !== userId)) {
        refreshPersonalChats();
      }
    };

    // Enhanced typing indicator handlers
    const handleTypingIndicator = (data: any) => {
      if (data.roomId === selectedChat?.id) {
        setTypingUsers(data.typingUsers || []);
      }
    };

    // Enhanced message delivery/read status handlers
    const handleMessageDelivered = (data: any) => {
      console.log('Message delivered:', data);
      // Update message delivery status in UI if needed
    };

    const handleMessageRead = (data: any) => {
      console.log('Message read:', data);
      // Update message read status in UI if needed
    };

  // Handle receiving messages (legacy event)
  const handleReceive = (data: any) => {
    console.log('📨 Received message via receive_message:', data);
    // This is a legacy event, use handleNewMessage instead
    handleNewMessage(data);
  };

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;
    
    socket.on('receive_message', handleReceive);
    socket.on('new-message', handleNewMessage);
    socket.on('typing-indicator', handleTypingIndicator);
    socket.on('message_delivered', handleMessageDelivered);
    socket.on('message_read_enhanced', handleMessageRead);
    
    return () => {
      socket.off('receive_message', handleReceive);
      socket.off('new-message', handleNewMessage);
      socket.off('typing-indicator', handleTypingIndicator);
      socket.off('message_delivered', handleMessageDelivered);
      socket.off('message_read_enhanced', handleMessageRead);
    };
  }, [socket, userId, selectedChat]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedChat || !socket) return;
    
    // Create the message object
    const messageContent = newMessage.trim();
    const currentTime = new Date();
    const timeString = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Create the message to add to UI immediately
    const newMsg: Message = {
      id: `temp-${selectedChat.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique temporary ID
      sender: userName,
      content: messageContent,
      time: timeString,
      isUser: true,
      timestamp: currentTime,
    };
    
    // Add message to UI immediately for better UX
    setMessages(prev => [...prev, newMsg]);
    setNewMessage('');
    
    // Move chat to top immediately when user sends a message
    moveChatToTop(selectedChat.id, messageContent, currentTime);
    
    // Scroll to bottom
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    
    // Send message via socket
    const messageData = {
      text: messageContent,
      roomName: selectedChat.type === 'group' ? selectedChat.id : [userId, selectedChat.id].sort().join('_'),
      groupId: selectedChat.type === 'group' ? selectedChat.id : undefined,
      recipientId: selectedChat.type === 'personal' ? selectedChat.id : undefined,
      sender: userId,
    };
    
    console.log('📤 Sending message via socket:', messageData);
    console.log('🔗 Socket connected:', socket.connected);
    console.log('🔗 Socket ID:', socket.id);
    console.log('👤 Current user ID:', userId);
    console.log('💬 Selected chat:', selectedChat);
    
    // Check if socket is connected
    if (!socket.connected) {
      console.warn('⚠️ Socket not connected, trying API fallback...');
      sendMessageViaAPI(messageContent, newMsg);
      return;
    }
    
    socket.emit('send_message', messageData, (response: any) => {
      console.log('📨 Send message socket response:', response);
      if (response && response.success) {
        console.log('✅ Message sent successfully via socket');
        // Update the message with the real ID from server
        setMessages(prev => 
          prev.map(msg => 
            msg.id === newMsg.id 
              ? { ...msg, id: response.message?._id || response.message?.id || `sent-${selectedChat.id}-${Date.now()}` }
              : msg
          )
        );
        
        // Refresh personal chats if this was a personal chat
        if (selectedChat.type === 'personal') {
          refreshPersonalChats();
        }
      } else {
        console.error('❌ Socket send failed:', response?.error);
        console.log('🔄 Trying API fallback...');
        // Try API fallback
        sendMessageViaAPI(messageContent, newMsg);
      }
    });
    
    // Fallback: if no response after 3 seconds, try API
    setTimeout(() => {
      setMessages(prev => {
        const tempMessage = prev.find(msg => msg.id === newMsg.id);
        if (tempMessage && tempMessage.id === newMsg.id) {
          console.log('⏰ Socket timeout, trying API fallback...');
          sendMessageViaAPI(messageContent, newMsg);
          // Update to a more permanent ID
          return prev.map(msg => 
            msg.id === newMsg.id 
              ? { ...msg, id: `fallback-${selectedChat.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }
              : msg
          );
        }
        return prev;
      });
    }, 3000);
  };

  // API fallback for sending messages
  const sendMessageViaAPI = async (content: string, tempMessage: Message) => {
    try {
      console.log('📡 Sending message via API fallback...');
      
      const messageData = {
        content: content,
        groupId: selectedChat?.type === 'group' ? selectedChat.id : undefined,
        recipientId: selectedChat?.type === 'personal' ? selectedChat.id : undefined,
      };
      
      console.log('📡 API message data:', messageData);
      
      const response = await axios.post('/api/messages/send-message', messageData, {
        withCredentials: true
      });
      
      console.log('📡 API response:', response.data);
      
      if (response.data.success) {
        console.log('✅ Message sent successfully via API');
        // Update the message with the real ID from server
        setMessages(prev => 
          prev.map(msg => 
            msg.id === tempMessage.id 
              ? { ...msg, id: response.data.data?._id || response.data.data?.id || `api-${selectedChat?.id}-${Date.now()}` }
              : msg
          )
        );
        
        // Refresh personal chats if this was a personal chat
        if (selectedChat?.type === 'personal') {
          refreshPersonalChats();
        }
      } else {
        console.error('❌ API send failed:', response.data);
        // Remove the message if sending failed
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
        toast.error('Failed to send message. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ API send error:', error);
      console.error('❌ Error response:', error.response?.data);
      // Remove the message if sending failed
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      toast.error('Failed to send message. Please try again.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Enhanced typing indicator with debounce
  const handleTypingStart = () => {
    if (!isTyping) {
      setIsTyping(true);
      socket?.emit('typing-start', { roomId: selectedChat?.id });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit('typing-stop', { roomId: selectedChat?.id });
    }, 2000); // 2 second debounce
  };

  const handleTypingStop = () => {
    if (isTyping) {
      setIsTyping(false);
      socket?.emit('typing-stop', { roomId: selectedChat?.id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  // Send push notification
  const sendPushNotification = (message: any) => {
    if (notificationPermission === 'granted' && (message.sender?._id !== userId && message.sender !== userId)) {
      const notification = new Notification(`New message from ${message.sender?.name}`, {
        body: message.content,
        icon: message.sender?.profilePicture || '/default-profile.svg',
        badge: '/default-profile.svg',
        tag: `message-${selectedChat?.id}`,
        requireInteraction: false,
        silent: false
      });

      // Auto-close notification after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
        // Scroll to the message
        const messageElement = document.getElementById(`message-${message._id || message.id}`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }
  };

  // Enhanced typing indicator with rate limiting
  const handleTypingStartEnhanced = () => {
    if (!selectedChat || !checkTypingLimit()) return;

    debouncedTypingIndicator(() => {
      // Stop typing indicator
      chatEvents.publishTypingStop(userId, selectedChat.id);
    });

    // Start typing indicator
    chatEvents.publishTypingStart(userId, selectedChat.id);
  };

  // Enhanced mic toggle with rate limiting and state machine
  const handleMicToggle = () => {
    if (!checkMicToggleLimit()) {
      toast.error('Please wait before toggling mic again');
      return;
    }

    throttledMicToggle(() => {
      if (audioRoomStateMachine.currentState === 'live') {
        audioRoomStateMachine.transition('MUTE_MIC');
        chatEvents.publishAudioMute(userId, selectedChat?.id || '', true);
      } else if (audioRoomStateMachine.currentState === 'muted') {
        audioRoomStateMachine.transition('UNMUTE_MIC');
        chatEvents.publishAudioMute(userId, selectedChat?.id || '', false);
      }
    });
  };

  // Enhanced audio room join with state machine
  const handleJoinAudioRoom = () => {
    if (!checkAudioRoomLimit()) {
      toast.error('Please wait before joining audio room again');
      return;
    }

    if (audioRoomStateMachine.canTransition('JOIN_ROOM')) {
      audioRoomStateMachine.transition('JOIN_ROOM');
      chatEvents.publishAudioJoin(userId, selectedChat?.id || '');
    }
  };

  // Enhanced search with binary search
  const handleSearch = (query: string) => {
    debouncedSearch(query);
  };

  // Jump to message by timestamp
  const handleJumpToMessage = (timestamp: Date | string) => {
    // Convert messages to the expected format
    const convertedMessages = messages.map(msg => ({
      _id: msg.id,
      createdAt: msg.timestamp,
      content: msg.content,
      sender: msg.sender
    }));
    
    const index = jumpToMessageByTimestamp(convertedMessages, timestamp, (index) => {
      // Scroll to message element
      const messageElement = document.getElementById(`message-${index}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    if (index === -1) {
      toast.error('Message not found');
    }
  };

  // Load more messages function
  const loadMoreMessages = async () => {
    if (!selectedChat || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    try {
      const params = selectedChat.type === 'group' 
        ? { groupId: selectedChat.id, cursor: lastCursor, limit: 50 }
        : { recipientId: selectedChat.id, cursor: lastCursor, limit: 50 };
      
      console.log('Loading more messages with params:', params);
      
      const response = await axios.get('/api/messages', { 
        params,
          withCredentials: true
        });

      console.log('Load more response:', response.data);
      
      if (response.data.success) {
        const newMessages = response.data.data.map((msg: any, index: number) => ({
          id: msg._id || msg.id || `loaded-${selectedChat.id}-${index}-${Date.now()}`,
          sender: msg.sender?.name || msg.sender || 'Unknown',
          content: msg.content || msg.message || '',
          time: msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Now',
          isUser: (msg.sender?._id === userId) || (msg.sender === userId) || (typeof msg.sender === 'string' && msg.sender === userId),
          timestamp: msg.createdAt ? new Date(msg.createdAt) : new Date(),
          messageType: msg.messageType || 'text',
          mediaUrl: msg.mediaUrl || msg.fileUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          fileType: msg.fileType,
          readBy: msg.readBy || []
        }));
        
        const pagination = response.data.pagination;
        
        // Store current scroll position
        const container = messagesContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;
        
        // Prepend older messages to the beginning
        setMessages(prev => [...newMessages, ...prev]);
        setHasMoreMessages(pagination.hasMore);
        setLastCursor(pagination.nextCursor);
        
        // Maintain scroll position after new messages are added
        setTimeout(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            const scrollDiff = scrollHeightAfter - scrollHeightBefore;
            container.scrollTop = scrollDiff;
          }
        }, 100);
        
        console.log(`Loaded ${newMessages.length} more messages. Has more: ${pagination.hasMore}`);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      toast.error('Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Subscribe to events
  useEffect(() => {
    const unsubscribeNewMessage = subscribe('message:new', (payload) => {
      if (payload.message && selectedChat) {
        // Check if message belongs to current chat
        const isCurrentChat = selectedChat.type === 'group' 
          ? payload.message.group === selectedChat.id
          : (payload.message.sender === selectedChat.id || payload.message.recipient === selectedChat.id);
        
        if (isCurrentChat) {
          setMessages(prev => [...prev, payload.message]);
          throttledScrollToBottom();
        }
      }
    });

    const unsubscribeTyping = subscribe('typing:start', (payload) => {
      if (payload.roomId === selectedChat?.id) {
        // Update typing indicators
        setTypingUsers(prev => [...prev, payload.userId]);
      }
    });

    const unsubscribeTypingStop = subscribe('typing:stop', (payload) => {
      if (payload.roomId === selectedChat?.id) {
        setTypingUsers(prev => prev.filter(id => id !== payload.userId));
      }
    });

    const unsubscribeAudioMute = subscribe('audio:mute', (payload) => {
      if (payload.roomId === selectedChat?.id) {
        // Update audio participant states
        // This would update the audio room state
        console.log('Audio mute event:', payload);
      }
    });

    return () => {
      unsubscribeNewMessage();
      unsubscribeTyping();
      unsubscribeTypingStop();
      unsubscribeAudioMute();
    };
  }, [selectedChat, subscribe, throttledScrollToBottom]);

  // Add chat to recently viewed when selected
  useEffect(() => {
    if (selectedChat) {
      addRecentChat({
        id: selectedChat.id,
        type: selectedChat.type,
        name: selectedChat.name,
        unreadCount: selectedChat.unreadCount || 0,
        lastMessage: selectedChat.lastMessage,
        profilePicture: selectedChat.profilePicture
      });
    }
  }, [selectedChat, addRecentChat]);

  // Update unread count when new messages arrive
  useEffect(() => {
    if (selectedChat && unreadCount > 0) {
      updateUnreadCount(selectedChat.id, unreadCount);
    }
  }, [unreadCount, selectedChat, updateUnreadCount]);

  // Update last message when new message is received
  useEffect(() => {
    if (selectedChat && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.content) {
        updateLastMessage(selectedChat.id, lastMessage.content);
      }
    }
  }, [messages, selectedChat, updateLastMessage]);

  // Handle file upload
  const handleFileUpload = async (fileData: {
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }) => {
    if (!selectedChat || !socket) return;

    setUploadingFile(true);
    try {
      // Create file message
      const fileMessage = {
        text: `📎 ${fileData.fileName}`,
        roomName: selectedChat.type === 'group' ? selectedChat.id : [userId, selectedChat.id].sort().join('_'),
        groupId: selectedChat.type === 'group' ? selectedChat.id : undefined,
        recipientId: selectedChat.type === 'personal' ? selectedChat.id : undefined,
        sender: userId,
        messageType: 'file',
        mediaUrl: fileData.url,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileType: fileData.fileType
      };

      // Send file message via socket
      socket.emit('send_message', fileMessage, (response: any) => {
        if (response && response.success) {
          toast.success('File sent successfully');
          setShowFileUploadModal(false);
        } else {
          toast.error('Failed to send file');
        }
      });

      // Refresh personal chats if this was a personal chat
      if (selectedChat.type === 'personal') {
        refreshPersonalChats();
      }
    } catch (error) {
      console.error('Error sending file:', error);
      toast.error('Failed to send file');
    } finally {
      setUploadingFile(false);
    }
  };

  // Handle file button click
  const handleFileButtonClick = () => {
    if (!selectedChat) {
      toast.error('Please select a chat first');
      return;
    }
    setShowFileUploadModal(true);
  };

  const handleAddGroup = (newGroup: Chat) => {
    setGroupChats(prev => {
      // Check if group already exists to avoid duplicates
      const groupExists = prev.some((chat: Chat) => chat.id === newGroup.id);
      if (groupExists) {
        return prev;
      }
      return [...prev, newGroup];
    });
  };

  // Handle group creation from StartRoomModal
  useEffect(() => {
    if (!socket) return;
    
    const handleGroupCreated = (group: Chat) => {
      // Validate the group data
      if (!group || !group.id) {
        console.warn('Received invalid group created data:', group);
        return;
      }
      
      setGroupChats(prev => {
        // Check if group already exists to avoid duplicates
        const groupExists = prev.some(g => g.id === group.id);
        if (groupExists) {
          return prev;
        }
        return [...prev, group];
      });
      setSelectedChat(group);
      setShowStartRoomModal(false);
    };
    
    socket.on('group-created', handleGroupCreated);
    return () => {
      socket.off('group-created', handleGroupCreated);
    };
  }, [socket]);

  const handleProceedRoom = (roomTitle: string, micAccess: boolean) => {
    setPendingRoomDetails({ roomTitle, micAccess });
    setShowStartRoomModal(false);
    setShowAddUsersModal(true);
  };

  // Handle audio room updates
  useEffect(() => {
    if (!socket) return;
    
    const handleAudioRoomUpdate = (data: { groupId: string; users: string[] }) => {
      if (selectedChat && selectedChat.id === data.groupId) {
        setAudioRoomUsers(data.users);
      }
    };

    const handleAudioRoomStarted = (data: any) => {
      if (selectedChat && selectedChat.id === data.groupId) {
        setAudioRoomState((prev: any) => ({
          ...prev,
          isActive: true,
          startedBy: data.startedBy,
          startedAt: data.startedAt
        }));
        
        // Show notification to other users that they can join
        if (data.startedBy !== userId) {
          toast.info('🎤 Audio room started! Click the microphone button to join.', {
            autoClose: 5000,
            onClick: () => {
              // Auto-join when notification is clicked
              handleJoinAudio();
            }
          });
        } else {
        toast.info('Audio room started');
        }
      }
    };

    const handleAudioRoomEnded = (data: any) => {
      if (selectedChat && selectedChat.id === data.groupId) {
        setAudioRoomState((prev: any) => ({
          ...prev,
          isActive: false,
          startedBy: undefined,
          startedAt: undefined,
          participants: []
        }));
        setIsInAudioRoom(false);
        setShowAudioRoom(false);
        toast.info('Audio room ended');
      }
    };

    const handleUserJoinedAudioRoom = (data: any) => {
      if (selectedChat && selectedChat.id === data.groupId) {
        setAudioRoomState((prev: any) => ({
          ...prev,
          participants: [...(prev?.participants || []), {
            userId: data.userId,
            name: 'User',
            isMuted: false,
            isSpeaking: false,
            joinedAt: data.joinedAt
          }]
        }));
      }
    };

    const handleUserLeftAudioRoom = (data: any) => {
      if (selectedChat && selectedChat.id === data.groupId) {
        setAudioRoomState((prev: any) => ({
          ...prev,
          participants: (prev?.participants || []).filter((p: any) => p.userId !== data.userId)
        }));
      }
    };
    
    socket.on('audio-room-update', handleAudioRoomUpdate);
    socket.on('audio-room-started', handleAudioRoomStarted);
    socket.on('audio-room-ended', handleAudioRoomEnded);
    socket.on('user-joined-audio-room', handleUserJoinedAudioRoom);
    socket.on('user-left-audio-room', handleUserLeftAudioRoom);
    
    return () => {
      socket.off('audio-room-update', handleAudioRoomUpdate);
      socket.off('audio-room-started', handleAudioRoomStarted);
      socket.off('audio-room-ended', handleAudioRoomEnded);
      socket.off('user-joined-audio-room', handleUserJoinedAudioRoom);
      socket.off('user-left-audio-room', handleUserLeftAudioRoom);
    };
  }, [socket, selectedChat]);

  const handleJoinAudio = async () => {
    if (!socket || !selectedChat) return;
    
    try {
      // Request microphone permission first
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: true,
          video: false 
        });
        console.log('✅ Microphone permission granted for joining');
      } catch (permissionError) {
        console.error('❌ Microphone permission denied:', permissionError);
        toast.error('Microphone permission is required to join an audio room');
        return;
      }

      // Call backend API to join audio room
      const response = await axios.post('/api/audio-rooms/join', {
        groupId: selectedChat.id
      }, {
        withCredentials: true
      });

      const updatedState = response.data.data;
      console.log('✅ Joined audio room via API:', updatedState);

      // Emit socket event
      socket.emit('join-audio-room', { 
        groupId: selectedChat.id,
        participants: updatedState.audioRoom.participants || []
      });

    setIsInAudioRoom(true);
    setShowAudioRoom(true);
      toast.success('Joined audio room successfully! 🎤');
    } catch (err: any) {
      console.error('❌ Failed to join audio room:', err);
      toast.error(err.response?.data?.message || 'Failed to join audio room');
    }
  };

  const handleLeaveAudio = () => {
    if (!socket || !selectedChat) return;
    socket.emit('leave-audio-room', { groupId: selectedChat.id });
    setIsInAudioRoom(false);
    setShowAudioRoom(false);
  };

  const handleToggleAudioRoom = () => {
    setShowAudioRoom(!showAudioRoom);
  };

  // Handle new messages and notifications
  useEffect(() => {
    if (!socket) return;
    
    const handleGroupAdded = (payload: { groupId: string; groupName: string }) => {
      // Validate the payload
      if (!payload || !payload.groupId || !payload.groupName) {
        console.warn('Received invalid group added payload:', payload);
        return;
      }
      
      const newGroup: Chat = {
        id: payload.groupId,
        name: payload.groupName,
        type: 'group',
        isMicEnabled: false,
        memberCount: 1,
        onlineCount: 1,
      };
      
      setGroupChats(prev => {
        // Check if group already exists to avoid duplicates
        const groupExists = prev.some(g => g.id === newGroup.id);
        if (groupExists) {
          return prev;
        }
        return [...prev, newGroup];
      });
      toast.success(`Added to group: ${payload.groupName}`);
    };
    
    const handleNotification = ({ message }: any) => {
      toast.info(message);
    };
    
    socket.on('group-added', handleGroupAdded);
    socket.on('notification', handleNotification);
    
    return () => {
      socket.off('group-added', handleGroupAdded);
      socket.off('notification', handleNotification);
    };
  }, [socket, selectedChat, userId]);

  const handleAboutButtonClick = () => {
    setShowAboutModal(true);
  };

  const handleGroupUpdate = () => {
    // Refresh group list
    window.location.reload();
  };

  const handleGroupDelete = () => {
    setGroupChats(prev => {
      const updated = prev.filter(group => group.id !== selectedChat?.id);
      if (updated.length > 0) {
        setSelectedChat(updated[0]);
      } else if (updated.length === 0) {
        setSelectedChat(null);
      }
      return updated;
    });
  };

  const handleAddMember = async (memberId: string) => {
    if (!selectedChat) return;
    
    try {
      const response = await axios.post('/api/group/add-member', {
        groupId: selectedChat.id,
        memberId: memberId
      });
      
      if (response.data.statusCode === 200) {
        toast.success('Member added successfully!');
        // Optionally refresh the group data or update the UI
        // You might want to fetch updated group info here
      } else {
        toast.error(response.data.message || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member. Please try again.');
    }
  };

  // Function to fetch user details for a personal chat
  const fetchUserDetails = async (userId: string) => {
    try {
      const response = await axios.get(`/api/user/${userId}`, { withCredentials: true });
      if (response.data.success) {
        const userData = response.data.data;
        return {
          id: userData.id,
          name: userData.name,
          profilePicture: userData.profilePicture || '',
        };
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
    return null;
  };

  // Add chat to recently viewed when selected
  useEffect(() => {
    if (selectedChat) {
      addRecentChat({
        id: selectedChat.id,
        type: selectedChat.type,
        name: selectedChat.name,
        unreadCount: selectedChat.unreadCount || 0,
        lastMessage: selectedChat.lastMessage,
        profilePicture: selectedChat.profilePicture
      });
    }
  }, [selectedChat, addRecentChat]);

  // Update unread count when new messages arrive
  useEffect(() => {
    if (selectedChat && unreadCount > 0) {
      updateUnreadCount(selectedChat.id, unreadCount);
    }
  }, [unreadCount, selectedChat, updateUnreadCount]);

  // Update last message when new message is received
  useEffect(() => {
    if (selectedChat && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.content) {
        updateLastMessage(selectedChat.id, lastMessage.content);
      }
    }
  }, [messages, selectedChat, updateLastMessage]);

  // Enhanced message sending with rate limiting
  const sendMessage = async (content: string) => {
    if (!content.trim() || !selectedChat || !socket) {
      console.warn('❌ Cannot send message:', { 
        hasContent: !!content.trim(), 
        hasSelectedChat: !!selectedChat, 
        hasSocket: !!socket 
      });
      return;
    }

    try {
      console.log('📤 Sending message:', { 
        content: content.substring(0, 50) + '...', 
        chatType: selectedChat.type, 
        chatId: selectedChat.id 
      });

      const messageData = {
        content: content.trim(),
        ...(selectedChat.type === 'group' 
          ? { groupId: selectedChat.id }
          : { recipientId: selectedChat.id }
        )
      };

      console.log('📦 Message data:', messageData);

      // Send via Socket.IO for real-time delivery
      socket.emit('send-message', messageData);

      // Also send via REST API for persistence
      const response = await axios.post('/api/messages/send-message', messageData, {
        withCredentials: true
      });

      console.log('✅ Message sent successfully:', response.data);

      // Add message to local state immediately for optimistic UI
      const newMsg: Message = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sender: userName,
        content: content.trim(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        isUser: true,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');

      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Update last message in chat list
      if (selectedChat.type === 'group') {
        setGroupChats(prev =>
          prev.map(chat =>
            chat.id === selectedChat.id
              ? { ...chat, lastMessage: content.trim(), lastMessageTime: new Date() }
              : chat
          )
        );
      } else {
        setPersonalChats(prev =>
          prev.map(chat =>
            chat.id === selectedChat.id
              ? { ...chat, lastMessage: content.trim(), lastMessageTime: new Date() }
              : chat
          )
        );
      }

    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      console.error('❌ Error response:', error.response?.data);
      toast.error(error.response?.data?.message || 'Failed to send message');
    }
  };

  // Handle scroll to load more messages
  const handleScroll = () => {
    if (!messagesContainerRef.current || isLoadingMore || !hasMoreMessages) return;
    
    const { scrollTop } = messagesContainerRef.current;
    
    // Load more messages when user scrolls to the top (within 100px)
    if (scrollTop < 100) {
      loadMoreMessages();
    }
  };

  // Add scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [messagesContainerRef, isLoadingMore, hasMoreMessages]);

  // Comprehensive test function to verify all functionality
  const runComprehensiveTest = async () => {
    console.log('🧪 Starting comprehensive chat functionality test...');
    
    try {
      // Test 1: User authentication
      console.log('🧪 Test 1: User Authentication');
      console.log('✅ User ID:', userId);
      console.log('✅ User Name:', userName);
      console.log('✅ User exists:', !!user);
      
      // Test 2: Socket connection
      console.log('🧪 Test 2: Socket Connection');
      console.log('✅ Socket connected:', !!socket);
      console.log('✅ Socket ID:', socket?.id);
      
      // Test 3: Groups loading
      console.log('🧪 Test 3: Groups Loading');
      console.log('✅ Groups count:', groupChats.length);
      console.log('✅ Groups data:', groupChats);
      
      // Test 4: Personal chats loading
      console.log('🧪 Test 4: Personal Chats Loading');
      console.log('✅ Personal chats count:', personalChats.length);
      console.log('✅ Personal chats data:', personalChats);
      
      // Test 5: Selected chat
      console.log('🧪 Test 5: Selected Chat');
      console.log('✅ Selected chat:', selectedChat);
      
      // Test 6: Messages loading
      console.log('🧪 Test 6: Messages Loading');
      console.log('✅ Messages count:', messages.length);
      console.log('✅ Messages data:', messages.slice(0, 3)); // Show first 3 messages
      
      // Test 7: API endpoints
      console.log('🧪 Test 7: API Endpoints');
      try {
        const groupsResponse = await axios.get('/api/group/my-groups', { withCredentials: true });
        console.log('✅ Groups API working:', groupsResponse.status === 200);
      } catch (error: any) {
        console.error('❌ Groups API failed:', error.response?.status);
      }
      
      try {
        const conversationsResponse = await axios.get('/api/messages/conversations', { withCredentials: true });
        console.log('✅ Conversations API working:', conversationsResponse.status === 200);
      } catch (error: any) {
        console.error('❌ Conversations API failed:', error.response?.status);
      }
      
      console.log('🎉 Comprehensive test completed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  };

  // Run test on component mount
  useEffect(() => {
    if (userId && socket) {
      setTimeout(runComprehensiveTest, 2000); // Wait for everything to load
    }
  }, [userId, socket, groupChats.length, personalChats.length]);

  // Test message fetching specifically
  const testMessageFetching = async () => {
    console.log('🧪 Testing message fetching...');
    
    if (!selectedChat) {
      console.log('❌ No chat selected for testing');
      return;
    }
    
    try {
      console.log('🧪 Testing messages for chat:', selectedChat.id, 'Type:', selectedChat.type);
      
      const params = selectedChat.type === 'group' 
        ? { groupId: selectedChat.id, limit: 10 }
        : { recipientId: selectedChat.id, limit: 10 };
      
      console.log('🧪 Test params:', params);
      
      const response = await axios.get('/api/messages', { 
        params,
        withCredentials: true 
      });
      
      console.log('🧪 Test response status:', response.status);
      console.log('🧪 Test response data:', response.data);
      
      if (response.data.success) {
        console.log('✅ Message fetching test PASSED');
        console.log('✅ Messages found:', response.data.data?.length || 0);
        console.log('✅ Sample messages:', response.data.data?.slice(0, 3));
      } else {
        console.error('❌ Message fetching test FAILED');
        console.error('❌ Error:', response.data.message);
      }
      
    } catch (error: any) {
      console.error('❌ Message fetching test ERROR');
      console.error('❌ Error:', error.response?.data || error.message);
      console.error('❌ Status:', error.response?.status);
    }
  };

  // Run message fetching test when chat changes
  useEffect(() => {
    if (selectedChat) {
      setTimeout(testMessageFetching, 1000); // Wait a bit for the main fetch to complete
    }
  }, [selectedChat]);

  // Debug function to test groups API directly
  const debugGroupsAPI = async () => {
    console.log('🧪 Debugging Groups API...');
    console.log('🔍 Current user ID:', userId);
    console.log('🔍 User data:', user);
    
    try {
      // Test 1: Check if user is authenticated
      console.log('📋 Test 1: Authentication check');
      if (!user || !userId) {
        console.error('❌ User not authenticated');
        return;
      }
      console.log('✅ User is authenticated');
      
      // Test 2: Call groups API directly
      console.log('📋 Test 2: Calling groups API');
      const response = await axios.get('/api/group/my-groups', { 
        withCredentials: true 
      });
      
      console.log('📦 Raw API response:', response);
      console.log('📦 Response status:', response.status);
      console.log('📦 Response data:', response.data);
      
      if (response.data.success) {
        console.log('✅ API call successful');
        console.log('✅ Groups found:', response.data.data?.length || 0);
        console.log('✅ Sample group:', response.data.data?.[0]);
      } else {
        console.error('❌ API returned success: false');
        console.error('❌ Error message:', response.data.message);
      }
      
    } catch (error: any) {
      console.error('❌ Groups API test failed:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error config:', error.config);
    }
  };

  // Run debug test when component mounts
  useEffect(() => {
    if (userId) {
      setTimeout(debugGroupsAPI, 1000); // Wait a bit for everything to load
    }
  }, [userId]);

  // Manual test function for debugging
  const testSocketConnection = () => {
    console.log('🧪 Testing socket connection...');
    console.log('🔗 Socket connected:', socket?.connected);
    console.log('🔗 Socket ID:', socket?.id);
    console.log('🎯 Selected chat:', selectedChat);
    console.log('👤 User ID:', userId);
    
    if (!socket?.connected) {
      console.error('❌ Socket not connected!');
      toast.error('Socket not connected. Check server status.');
      return;
    }
    
    // Test authentication first
    console.log('🔐 Testing socket authentication...');
    socket.emit('authenticate');
    
    // Test emit a simple event
    socket.emit('test_connection', { message: 'Hello from client' }, (response: any) => {
      console.log('✅ Test connection response:', response);
      toast.success('Socket connection test successful!');
    });
    
    // Test sending a message
    if (selectedChat) {
      const testMessage = {
        text: 'Test message from debug button',
        roomName: selectedChat.type === 'group' ? selectedChat.id : [userId, selectedChat.id].sort().join('_'),
        groupId: selectedChat.type === 'group' ? selectedChat.id : undefined,
        recipientId: selectedChat.type === 'personal' ? selectedChat.id : undefined,
        sender: userId,
      };
      
      console.log('🧪 Sending test message:', testMessage);
      socket.emit('send_message', testMessage, (response: any) => {
        console.log('🧪 Test message response:', response);
        if (response?.success) {
          toast.success('Test message sent successfully!');
        } else {
          toast.error('Test message failed: ' + (response?.error || 'Unknown error'));
        }
      });
    }
  };

  return (
    <div className="w-full h-full flex min-h-0 overflow-hidden">
      {/* Sidebar - Groups List (far left) */}
      <div className="w-[248px] h-full bg-white shadow flex flex-col p-0 border border-[#E5E5E5] min-h-0">
        <div className="flex flex-col gap-2 p-2 overflow-y-auto">
          {/* Loading States */}
          {(loadingGroups || loadingPersonalChats) && (
            <div className="text-center text-[#8F8F8F] py-4">Loading chats...</div>
          )}
          
          {/* Error States */}
          {groupError && (
            <div className="text-center text-red-500 py-2 text-sm">{groupError}</div>
          )}
          {personalChatsError && (
            <div className="text-center text-red-500 py-2 text-sm">{personalChatsError}</div>
          )}

          {/* Empty State - Show when no chats are loading and no chats exist */}
          {!loadingGroups && !loadingPersonalChats && personalChats.length === 0 && groupChats.length === 0 && (
            <div className="text-center text-[#8F8F8F] py-8">
              <div className="mb-4">
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="mx-auto text-[#BDBDBD]">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="text-sm font-medium mb-2">No chats yet</div>
              <div className="text-xs">Start a conversation or create a group to begin chatting</div>
            </div>
          )}

          {/* Personal Chats Section */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-[#8F8F8F] mb-2 mt-2">Personal Chats</div>
            {loadingPersonalChats ? (
              <div className="text-center text-[#8F8F8F] py-2 text-sm">Loading personal chats...</div>
            ) : personalChats.length > 0 ? (
              <div className="space-y-1">
                {personalChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`w-[248px] h-[52px] flex items-center justify-between px-3 py-[14px] rounded-[8px] cursor-pointer font-normal text-[16px] leading-[120%] transition-colors duration-200 ${
                      selectedChat?.id === chat.id 
                        ? 'text-[#222] bg-[#F5F5F5]' 
                        : 'text-[#8F8F8F] hover:bg-gray-50'
                    }`}
                    style={{ fontFamily: 'Satoshi, Inter, Segoe UI, Arial, sans-serif' }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Profile Picture */}
                      {chat.profilePicture ? (
                        <img
                          src={chat.profilePicture}
                          alt={chat.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#E8E8E8] flex items-center justify-center text-sm font-bold text-[#8F8F8F] flex-shrink-0">
                          {getInitials(chat.name)}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[14px] truncate">{chat.name}</div>
                        {chat.lastMessage && (
                          <div className="text-[12px] text-[#BDBDBD] truncate">
                            {chat.lastMessage.length > 30 ? chat.lastMessage.substring(0, 30) + '...' : chat.lastMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Unread Badge */}
                    {chat.unreadCount && chat.unreadCount > 0 && (
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <div className="w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-[#8F8F8F] py-4 text-sm">
                <div className="mb-2">No personal chats yet</div>
                <div className="text-xs">Start a conversation with someone</div>
              </div>
            )}
          </div>

          {/* Groups Section */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-[#8F8F8F] mb-2 mt-4">Groups</div>
            {loadingGroups ? (
              <div className="text-center text-[#8F8F8F] py-2 text-sm">Loading groups...</div>
            ) : groupChats.length > 0 ? (
              <div className="space-y-1">
                {groupChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`w-[248px] h-[52px] flex items-center justify-between px-3 py-[14px] rounded-[8px] cursor-pointer font-normal text-[16px] leading-[120%] transition-colors duration-200 ${
                      selectedChat?.id === chat.id 
                        ? 'text-[#222] bg-[#F5F5F5]' 
                        : 'text-[#8F8F8F] hover:bg-gray-50'
                    }`}
                    style={{ fontFamily: 'Satoshi, Inter, Segoe UI, Arial, sans-serif' }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Audio Room Indicator */}
                      {chat.isMicEnabled && (
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0">
                          <path d="M11 5L6 9H2v6h4l5 4V5z" />
                          <path d="M19 12c0-2.21-1.79-4-4-4" />
                          <path d="M19 12c0 2.21-1.79 4-4 4" />
                        </svg>
                      )}
                      
                      {/* Profile Picture */}
                      {chat.profilePicture ? (
                        <img
                          src={chat.profilePicture}
                          alt={chat.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#E8E8E8] flex items-center justify-center text-sm font-bold text-[#8F8F8F] flex-shrink-0">
                          {getInitials(chat.name)}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[14px] truncate">{chat.name}</div>
                        <div className="text-[12px] text-[#BDBDBD]">
                          {chat.memberCount || 0} members
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-[#8F8F8F] py-4 text-sm">
                <div className="mb-2">No groups yet</div>
                <div className="text-xs">Create a group to start chatting</div>
              </div>
            )}
          </div>
          
          {/* Start Room Button - Only show when there are groups or when not in empty state */}
          {(!loadingGroups && !loadingPersonalChats) && (groupChats.length > 0 || personalChats.length > 0) && (
            <button 
              className="w-[220px] h-[47px] flex items-center justify-center gap-2 mt-2 rounded-[8px] font-normal text-[16px] leading-[120%]"
              style={{ color: 'rgba(47, 128, 237, 1)', background: 'transparent', border: 'none' }}
              onClick={() => setShowStartRoomModal(true)}
            >
              <span className="text-[20px] font-bold" style={{ color: 'rgba(47, 128, 237, 1)' }}>+</span> Start Your Room
            </button>
          )}
        </div>
      </div>
      {/* Main Chat Content (center, flush with sidebar) */}
      <div className="flex-1 flex flex-col h-full bg-white shadow border border-[#E5E5E5] min-h-0 overflow-hidden">
        {/* Header */}
        {selectedChat && (
          <div
            className="flex items-center justify-between border-b border-[#E5E5E5] pb-2 flex-shrink-0"
            style={{ width: 648, height: 52, paddingBottom: 8 }}
          >
            <div className="flex items-center gap-4">
              {/* Profile Picture */}
              {selectedChat.profilePicture ? (
                <img
                  src={selectedChat.profilePicture}
                  alt={selectedChat.name}
                  style={{ width: 40, height: 40, borderRadius: 80, background: 'rgba(232, 232, 232, 1)', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{ width: 40, height: 40, borderRadius: 80, background: 'rgba(232, 232, 232, 1)' }}
                  className="flex items-center justify-center text-lg font-bold text-[#8F8F8F]"
                >
                  {getInitials(selectedChat.name)}
                </div>
              )}
              <div className="flex flex-col justify-center">
                {/* Group/Chat Name */}
                <div
                  style={{ width: 272, height: 25, fontFamily: 'Satoshi', fontWeight: 700, fontSize: 16, lineHeight: '120%', letterSpacing: 0, color: 'rgba(46, 46, 46, 1)', borderRadius: 6, paddingLeft: 8, display: 'flex', alignItems: 'center', background: 'none' }}
                >
                  {selectedChat.name}
                  {selectedChat.isMicEnabled && (
                    <div className="ml-2 flex items-center gap-1">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="text-blue-500">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M19 12c0-2.21-1.79-4-4-4" />
                        <path d="M19 12c0 2.21-1.79 4-4 4" />
                      </svg>
                      <span className="text-xs text-blue-500 font-medium">Audio Room</span>
                      {audioRoomState?.isActive && (
                        <span className="text-xs text-green-500 font-medium ml-1">
                          • {audioRoomState.participants?.length || 0} active
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Online/Offline Member Count */}
                <div
                  style={{ width: 272, height: 19, fontFamily: 'Satoshi', fontWeight: 400, fontSize: 16, lineHeight: '120%', letterSpacing: 0, background: 'transparent', color: 'rgba(143, 143, 143, 1)', borderRadius: 6, paddingLeft: 8, marginTop: 2, display: 'flex', alignItems: 'center' }}
                >
                  {selectedChat.memberCount ? `${selectedChat.memberCount} members, ${selectedChat.onlineCount || 0} online, ${selectedChat.memberCount - (selectedChat.onlineCount || 0)} offline` : 'No members'}
                  {selectedChat.isMicEnabled && audioRoomUsers.length > 0 && (
                    <span className="ml-2 text-blue-500 text-sm">
                      • {audioRoomUsers.length} in audio
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right side buttons - About Button and Group Type Button */}
            {selectedChat.type === 'group' && (
              <div className="flex items-center gap-2 ml-auto">
                {/* Test Button - Only show in development */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="flex gap-2">
                    <button
                      onClick={testMessageFetching}
                      className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                      title="Test Message Fetching"
                    >
                      Test Messages
                    </button>
                    <button
                      onClick={testSocketConnection}
                      className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                      title="Test Socket Connection"
                    >
                      Test Socket
                    </button>
                  </div>
                )}
                
                {/* Audio Room Toggle - Only for audio-enabled groups */}
                {selectedChat.isMicEnabled && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAudioRoomModal(true)}
                      className={`px-3 py-2 rounded-lg transition-colors duration-200 font-medium text-sm ${
                        showAudioRoom 
                          ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                          : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                      }`}
                      style={{ 
                        fontFamily: 'Satoshi', 
                        fontWeight: 500, 
                        fontSize: 12, 
                        lineHeight: '120%', 
                        letterSpacing: 0, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        cursor: 'pointer',
                        minWidth: '70px',
                        height: '28px'
                      }}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="mr-1">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M19 12c0-2.21-1.79-4-4-4" />
                        <path d="M19 12c0 2.21-1.79 4-4 4" />
                      </svg>
                      Audio Room
                    </button>
                    
                    {/* Audio Room Status Indicator */}
                    {audioRoomState?.isActive && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span>{audioRoomState.participants?.length || 0} in audio</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Text-Only Indicator for non-audio groups */}
                {!selectedChat.isMicEnabled && selectedChat.type === 'group' && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M21 12c-1 0-2-1-2-2s1-2 2-2 2 1 2 2-1 2-2 2z" />
                      <path d="M3 12c1 0 2-1 2-2s-1-2-2-2-2 1-2 2 1 2 2 2z" />
                    </svg>
                    <span>Text only</span>
                  </div>
                )}
                
                <button
                  onClick={handleAboutButtonClick}
                  className="px-4 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors duration-200 font-medium"
                  style={{ 
                    fontFamily: 'Satoshi', 
                    fontWeight: 500, 
                    fontSize: 14, 
                    lineHeight: '120%', 
                    letterSpacing: 0, 
                    background: 'transparent', 
                    color: 'rgba(47, 128, 237, 1)', 
                    borderRadius: 6, 
                    border: '1px solid rgba(47, 128, 237, 0.2)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    cursor: 'pointer',
                    minWidth: '80px',
                    height: '32px'
                  }}
                >
                  About
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Conditional Content: Show Audio Room or Regular Chat */}
        {selectedChat && selectedChat.isMicEnabled && showAudioRoom ? (
          // Audio Room Interface - Only for audio-enabled groups
          <AudioRoom
            groupId={selectedChat.id}
            currentUserId={userId}
            currentUserName={user?.name || 'User'}
            socket={socket}
            onLeave={() => setShowAudioRoom(false)}
          />
        ) : (
          // Regular Chat Interface
          <>
            {/* Messages */}
            <div 
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2 bg-[#F8F8F8] min-h-0 h-full"
            >
              {/* Load More Messages Indicator */}
              {hasMoreMessages && (
                <div className="flex justify-center py-2">
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      Loading more messages...
                    </div>
                  ) : (
                    <button
                      onClick={loadMoreMessages}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      Load More Messages
                    </button>
                  )}
                </div>
              )}
              
              {/* Initial Loading Indicator */}
              {isLoadingMessages && messages.length === 0 && (
                <div className="flex justify-center py-8">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                    Loading messages...
                  </div>
                </div>
              )}
              
              {/* No More Messages Indicator */}
              {!hasMoreMessages && messages.length > 0 && (
                <div className="flex justify-center py-2">
                  <div className="text-xs text-gray-400 px-3 py-1 bg-gray-100 rounded-full">
                    Beginning of conversation
                  </div>
                </div>
              )}

              {!isLoadingMessages && messages.map((msg, index) => {
                const messageDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
                // Check if we need to show a date separator
                const showDateSeparator = index === 0 || 
                  (index > 0 && !isSameDay(messageDate, messages[index - 1]?.timestamp));
                const messageKey = msg.id || `msg-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                return (
                  <React.Fragment key={messageKey}>
                    {/* Date Separator */}
                    {showDateSeparator && (
                      <div className="flex justify-center my-3">
                        <div className="bg-white px-3 py-1.5 rounded-full shadow-sm border border-[#E5E5E5]">
                          <span className="text-[12px] text-[#8F8F8F] font-medium" style={{ fontFamily: 'Satoshi, Inter, Segoe UI, Arial, sans-serif' }}>
                            {formatMessageDate(messageDate)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Message */}
                    <div className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[60%] px-4 py-2 rounded-[16px] shadow-sm ${msg.isUser ? 'bg-[#2F80ED] text-white rounded-br-[6px]' : 'bg-white text-[#222] rounded-bl-[6px] border border-[#E5E5E5]'}`}
                        style={{ fontFamily: 'Satoshi, Inter, Segoe UI, Arial, sans-serif' }}
                      >
                        <div className={`font-semibold text-[13px] mb-1 ${msg.isUser ? 'text-blue-100' : 'text-[#2F80ED]'}`}>
                          {msg.isUser ? userName : (typeof msg.sender === 'string' ? msg.sender : (msg.sender as any)?.name || 'Unknown')}
                        </div>
                        
                        {/* File Message */}
                        {msg.messageType === 'file' && msg.mediaUrl ? (
                          <div className="mb-2">
                            <a
                              href={msg.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14,2 14,8 20,8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10,9 9,9 8,9" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{msg.fileName}</div>
                                <div className="text-xs text-gray-500">
                                  {msg.fileSize ? `${(msg.fileSize / 1024 / 1024).toFixed(1)} MB` : 'Unknown size'}
                                </div>
                              </div>
                            </a>
                          </div>
                        ) : null}
                        
                        {/* Text Content */}
                        <div className="text-[14px] leading-[1.4]">{typeof msg.content === 'string' ? msg.content : 'Message content unavailable'}</div>
                        
                        {/* Message Status */}
                        <div className={`text-[11px] mt-1 text-right ${msg.isUser ? 'text-blue-100' : 'text-[#8F8F8F]'}`}>
                          {typeof msg.time === 'string' ? msg.time : 'Now'}
                          {msg.isUser && msg.readBy && msg.readBy.length > 0 && (
                            <span className="ml-1">✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div className="flex items-center px-6 py-3 border-t border-[#E5E5E5] bg-white flex-shrink-0">
              {/* File Upload Button */}
              <button
                onClick={handleFileButtonClick}
                disabled={uploadingFile}
                className="mr-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-700"
                title="Attach file"
              >
                {uploadingFile ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                ) : (
                  <svg 
                    width="16" 
                    height="16" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7,10 12,15 17,10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
              </button>
              
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="w-full px-4 py-2.5 rounded-[20px] border border-[#E5E5E5] bg-[#F8F8F8] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-all duration-200"
                  style={{ fontFamily: 'Satoshi, Inter, Segoe UI, Arial, sans-serif' }}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={handleTypingStart}
                  onBlur={handleTypingStop}
                />
              </div>
              <button
                className={`ml-3 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                  newMessage.trim() 
                    ? 'bg-[#2F80ED] hover:bg-[#1E6FD8] shadow-md hover:shadow-lg transform hover:scale-105' 
                    : 'bg-[#E5E5E5] cursor-not-allowed'
                }`}
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
              >
                <svg 
                  width="16" 
                  height="16" 
                  fill="none" 
                  stroke={newMessage.trim() ? "#fff" : "#BDBDBD"} 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  viewBox="0 0 24 24"
                >
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      <StartRoomModal
        open={showStartRoomModal}
        onClose={() => setShowStartRoomModal(false)}
        user={user}
        onProceed={handleProceedRoom}
      />
      <AddUsersModal
        open={showAddUsersModal}
        onClose={() => setShowAddUsersModal(false)}
        onStartRoom={async (selectedUserIds) => {
          if (!pendingRoomDetails) return;
          try {
            // Create group with all details
            const res = await axios.post('/api/group/create', {
              name: pendingRoomDetails.roomTitle,
              isMicEnabled: pendingRoomDetails.micAccess,
              members: selectedUserIds
            });
            
            if (res.data && res.data.data) {
              const newGroup = res.data.data;
              
              // Add the new group to the list
              const groupChat: Chat = {
                id: newGroup._id,
                name: newGroup.name,
                type: 'group',
                profilePicture: newGroup.profilePicture,
                memberCount: newGroup.memberCount || 0,
                onlineCount: newGroup.onlineCount || 0,
                isMicEnabled: newGroup.isMicEnabled || false,
                members: newGroup.members || []
              };
              
              setGroupChats(prev => {
                // Check if group already exists to avoid duplicates
                const groupExists = prev.some(g => g.id === groupChat.id);
                if (groupExists) {
                  return prev;
                }
                return [...prev, groupChat];
              });
              
              // Select the newly created group
              setSelectedChat(groupChat);
              
              // Show success message
              toast.success(`Group "${pendingRoomDetails.roomTitle}" created successfully!${pendingRoomDetails.micAccess ? ' Audio room is enabled.' : ' Text-only chat enabled.'}`);
            }
          } catch (error: any) {
            console.error('Error creating group:', error);
            toast.error(error.response?.data?.message || 'Failed to create group');
          } finally {
            setShowAddUsersModal(false);
            setPendingRoomDetails(null);
          }
        }}
        roomTitle={pendingRoomDetails?.roomTitle || ''}
        micAccess={pendingRoomDetails?.micAccess || false}
      />
      {/* About Button Modal */}
      {selectedChat && selectedChat.type === 'group' && (
        <AboutButtonModal
          isOpen={showAboutModal}
          onClose={() => setShowAboutModal(false)}
          groupId={selectedChat.id}
          currentUserId={userId}
          onGroupUpdate={handleGroupUpdate}
          onGroupDelete={handleGroupDelete}
        />
      )}

      {/* Audio Room Modal */}
      {selectedChat && selectedChat.isMicEnabled && (
        <AudioRoomModal
          isOpen={showAudioRoomModal}
          onClose={() => setShowAudioRoomModal(false)}
          groupId={selectedChat.id}
          groupName={selectedChat.name}
          currentUserId={userId}
          socket={socket}
          onStartAudioRoom={() => {
            setShowAudioRoom(true);
            setShowAudioRoomModal(false);
          }}
          onJoinAudioRoom={() => {
            setShowAudioRoom(true);
            setShowAudioRoomModal(false);
          }}
        />
      )}

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={showFileUploadModal}
        onClose={() => setShowFileUploadModal(false)}
        onFileUploaded={handleFileUpload}
        groupId={selectedChat?.type === 'group' ? selectedChat.id : undefined}
      />
    </div>
  );
};

export default ModernChatRoom; 