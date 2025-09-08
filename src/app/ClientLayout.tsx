// app/ClientLayout.tsx
"use client"

import { useAuthStore } from "@/storage/authStore"
import { useEffect } from "react"
import axios from "axios"

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me/profile`,
          {
            withCredentials: true
          }
        );

        if (response.data.statusCode === 200) {
          setUser(response.data.data);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        
        // Handle database connection errors gracefully
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 503) {
            console.log('Database temporarily unavailable - will retry on next page load');
          } else if (error.response?.status === 401) {
            console.log('User not authenticated');
          }
        }
        
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, [setUser, setLoading]);

  return <>{children}</>;
}