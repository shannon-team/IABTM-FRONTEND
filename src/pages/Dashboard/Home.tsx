import dynamic from 'next/dynamic';
import React from 'react';

const HomeClient = dynamic(() => import('@/components/Dashboard/HomeClient'), { ssr: false });

export default function Home() {
  return <HomeClient />;
}