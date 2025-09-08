import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/storage/authStore';
import { AnimatePresence, motion } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface AddUsersModalProps {
  open: boolean;
  onClose: () => void;
  onStartRoom: (selectedUserIds: string[]) => void;
  roomTitle: string;
  micAccess: boolean;
}

export default function AddUsersModal({ open, onClose, onStartRoom, roomTitle, micAccess }: AddUsersModalProps) {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]); // store user objects
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Fetch all users
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get('/api/user/get-all-users', { withCredentials: true })
      .then(res => setUsers(res.data.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
    setSelected([]);
    setSearch('');
  }, [open]);

  // Always include host in group creation
  const getFinalUserIds = () => {
    const ids = selected.map(u => u.id);
    if (user && !ids.includes(user._id)) ids.unshift(user._id);
    return Array.from(new Set(ids));
  };

  // Filter users by search and remove already selected
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) &&
    !selected.some(sel => sel.id === u.id)
  );

  // Add user to selection
  const addUser = (u: any) => {
    setSelected(sel => [...sel, u]);
  };

  // Remove user from selection
  const removeUser = (id: string) => {
    setSelected(sel => sel.filter(u => u.id !== id));
  };

  // Handle group creation
  const handleStartRoom = async () => {
    setCreating(true);
    try {
      await onStartRoom(getFinalUserIds());
      toast.success('Group created successfully!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-10 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-[656px] min-h-[384px] rounded-lg bg-white p-6 flex flex-col gap-6 relative">
              {/* Close (X) Button */}
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-6 right-6 w-6 h-6 flex items-center justify-center bg-none border-none cursor-pointer"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2E2E2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <Dialog.Title className="font-satoshi font-bold text-[21px] leading-[120%] mb-2">Add users</Dialog.Title>
              {/* Selected Users as Chips */}
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                <AnimatePresence>
                  {user && (
                    <motion.div
                      key={user._id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-300 text-sm font-medium"
                    >
                      <img src={user.profilePicture || '/default-profile.svg'} alt={user.name} className="w-6 h-6 rounded-full object-cover" />
                      <span>{user.name} (Host)</span>
                    </motion.div>
                  )}
                  {selected.map(u => (
                    <motion.div
                      key={u.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-300 text-sm font-medium"
                    >
                      <img src={u.profilePicture || '/default-profile.svg'} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                      <span>{u.name}</span>
                      <button onClick={() => removeUser(u.id)} className="ml-1 text-gray-400 hover:text-gray-700">
                        &times;
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {/* Search Bar */}
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-[608px] h-[35px] rounded-md border border-gray-200 px-4 font-satoshi text-base mb-2"
              />
              {/* User List */}
              <div className="w-[608px] max-h-[240px] overflow-y-auto flex flex-col gap-2">
                {loading ? <div>Loading...</div> : filteredUsers.map(user => (
                  <div
                    key={user.id}
                    onClick={() => addUser(user)}
                    className="w-full h-10 flex items-center gap-2 cursor-pointer rounded-md px-2 hover:bg-gray-100 transition"
                  >
                    <img src={user.profilePicture || '/default-profile.svg'} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                    <div className="flex flex-col justify-center">
                      <span className="font-satoshi font-bold text-[16px] leading-[120%]">{user.name}</span>
                      <span className="font-satoshi text-[14px]" style={{ color: user.isOnline ? '#2F80ED' : '#8F8F8F' }}>{user.isOnline ? 'Online' : user.lastSeen ? `Last seen ${formatLastSeen(user.lastSeen)}` : 'Last seen recently'}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Buttons */}
              <div className="flex justify-center gap-6 mt-8">
                <button
                  onClick={onClose}
                  className="w-[135px] h-[56px] rounded-full bg-white text-[#222] font-satoshi font-bold text-lg border-2 border-[#222] cursor-pointer"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRoom}
                  className={`w-[180px] h-[56px] rounded-full font-satoshi font-bold text-lg text-white ${getFinalUserIds().length < 2 || creating ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#2E2E2E]'} transition`}
                  disabled={getFinalUserIds().length < 2 || creating}
                >
                  {creating ? 'Creating...' : 'Start Your Room'}
                </button>
              </div>
              <ToastContainer position="top-right" autoClose={2000} />
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

// Helper to format last seen
function formatLastSeen(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return d.toLocaleDateString();
} 