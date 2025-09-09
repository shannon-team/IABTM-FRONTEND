'use client';

import { useEffect, useState } from 'react';
import Tabs from './components/Tabs';
import SearchBar from './components/SearchBar';
import FriendRequestCard from './components/FriendRequestCard';
import UserCard from './components/FriendListCard';
import axios from 'axios';
import Spinner from '../ui/spinner';
import PeopleCard from './components/PeopleListCard';

// const friendRequests = [
//   { id: 1, name: 'Jessie Quigley', image: '/images/jessie.jpg' },
//   { id: 2, name: 'Marty Reynolds', image: '/images/marty.jpg' },
//   { id: 3, name: 'Juana Tromp', image: '/images/juana.jpg' },
// ];

// const friends = [
//   { id: 1, name: 'Claire Bogan', image: '/images/claire.jpg', online: true },
//   { id: 2, name: 'Peter Fisher', image: '/images/peter.jpg', online: true },
//   { id: 3, name: 'Anne Stanton', image: '/images/anne.jpg' },
//   { id: 4, name: 'Leslie Reichert', image: '/images/leslie.jpg' },
// ];

// const people = [
//   { id: 1, name: 'Claire Bogan', image: '/images/claire.jpg', online: true },
//   { id: 2, name: 'Peter Fisher', image: '/images/peter.jpg', online: true },
//   { id: 3, name: 'Doyle Steuber', image: '/images/doyle.jpg' },
//   { id: 4, name: 'Lorraine Rempel', image: '/images/lorraine.jpg' },
//   { id: 5, name: 'Melanie Johnston', image: '/images/melanie.jpg', online: true },
//   { id: 6, name: 'Tyler Howell', image: '/images/tyler.jpg' },
//   { id: 7, name: 'Anne Stanton', image: '/images/anne.jpg' },
//   { id: 8, name: 'Leslie Reichert', image: '/images/leslie.jpg' },
//   { id: 9, name: "Mike O'Reilly Jr.", image: '/images/mike.jpg', online: true },
//   { id: 10, name: 'Marion Wilkinson', image: '/images/marion.jpg' },
//   { id: 11, name: "Cecelia O'Connell", image: '/images/cecelia.jpg' },
//   { id: 12, name: 'Lena Zieme', image: '/images/lena.jpg' },
// ];

export default function Page() {
  const [activeTab, setActiveTab] = useState('Friends');
  type User = {
    id: string;
    name: string;
    profilePicture?: string;
    online?: boolean;
    role?: any;
  };

  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<User[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFriend, setSearchFriend] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingPendingRequests, setLoadingPendingRequests] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/friend/get-friends`, { withCredentials: true });
      console.log('Fetched friends:', res.data);
      setFriends(res.data.data);  
    } catch (error) {  
      console.error('Error fetching friends:', error);
    } finally {
      setLoadingFriends(false);
    }
  }

  const fetchPendingRequests = async () => {
    try {
      setLoadingPendingRequests(true);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/friend/pending-received-requests`, { withCredentials: true });
      console.log('Fetched pending requests:', res.data);
      setFriendRequests(res.data.data);
    } catch (error) { 
      console.error('Error fetching pending requests:', error);
    } finally {
      setLoadingPendingRequests(false);
    }
  }

  const fetchPeople = async () => {
    try {
      setLoadingPeople(true)
      const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/get-all-users`, { withCredentials: true })
      console.log('Fetched people:', res.data);
      setPeople(res.data.data)
    } catch {
      console.log("Please try again later!")
    } finally {
      setLoadingPeople(false);
    }
  }

  // const fetchPendingSentRequests = async () => {
  //   const res = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/friend/pending-sent-requests`, { withCredentials: true });
  //   console.log('Fetched pending sent requests:', res.data);
  // }

  const handleSearch = async () => {
      if (!searchQuery.trim()) {
        fetchPeople();
        return;
      }
      try {
        const res = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/search`,
          { "name": searchQuery },
          { withCredentials: true }
        );
        console.log(res.data.data)
        setPeople(res.data.data);
      } catch (error) {
        console.error('Error searching users:', error);
      }
  }
  
  const clearSearch = () => {
    setSearchQuery("")
    fetchPeople()
  }

  const handleSearchFriend = () => {
    const query = searchFriend.trim().toLowerCase();

    if (query !== "") {
      const filtered = friends.filter(friend => friend.name.toLowerCase().includes(query));
      setFriends(filtered)
    }
  }

  const clearSearchFriend = () => {
    setSearchFriend("");
    fetchFriends();
  }

  useEffect(() => {
    fetchPeople();
    fetchFriends();
    fetchPendingRequests();
    // fetchPendingSentRequests();
  }, []);
    
  if (loadingFriends || loadingPendingRequests || loadingPeople) {
    return <Spinner/>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === 'Friends' && (
        <>
          <SearchBar searchQuery={searchFriend} setSearchQuery={ setSearchFriend}  handleSearch={handleSearchFriend} onUpdate={clearSearchFriend} />  
          <h2 className="text-lg font-semibold mb-3">Friends requests</h2>
          {friendRequests.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {friendRequests.map((req) => (
                <FriendRequestCard key={req.id} id={(req as any).requesterId || req.id} name={req.name} image={req.profilePicture || ''} onUpdateFriends={fetchFriends} onUpdateRequests={fetchPendingRequests} />
              ))}
            </div> ) :(
            <div className="text-gray-500 text-sm mt-4 mb-5">You have no pending friend requests.</div>
          )}

          <h2 className="text-lg font-semibold mb-3">My Friends</h2>
          {friends.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {friends.map((friend) => (
                <UserCard key={friend.id} id={friend.id} name={friend.name} image={friend.profilePicture || ''} online={friend.online} onUpdate={fetchFriends}/>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm mt-4">You have no friends yet.</div>
          )}
        </>
      )}

      {activeTab === 'People' && (
        <>
          <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch} onUpdate={clearSearch} />
          {people.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {people.map((person) => (
              <PeopleCard
                key={person.id}
                id={person.id}
                name={person.name}
                image={person.profilePicture || ''}
                online={person.role}
              />
            ))}
          </div>
          ) : (
              <div className="text-gray-500 text-sm mt-4">No users found.</div>
          )}
        </>
      )}
    </div>
  );
}