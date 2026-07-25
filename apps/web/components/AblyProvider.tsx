'use client';

import React, { useEffect, useState } from 'react';
import * as Ably from 'ably';
import { AblyProvider as RealtimeProvider } from 'ably/react';
import { useGameStore } from '@/store/game';

interface AblyProviderProps {
  children: React.ReactNode;
}

export function AblyProvider({ children }: AblyProviderProps) {
  const { jwt, setConnectionStatus, setError } = useGameStore();
  const [client, setClient] = useState<Ably.Realtime | null>(null);

  useEffect(() => {
    // Only connect when we have a JWT (meaning we've joined a lobby)
    if (!jwt) {
      if (client) {
        client.close();
        setClient(null);
      }
      return;
    }

    // Initialize Ably client with the capability token URL
    const ablyClient = new Ably.Realtime({
      authUrl: '/api/ably/token',
      authHeaders: {
        Authorization: `Bearer ${jwt}`,
      },
      // Automatically recover lost state on disconnect
      recover: (_, cb) => cb(true),
    });

    ablyClient.connection.on('connected', () => {
      setConnectionStatus(true, false);
      console.log('Ably connected');
    });

    ablyClient.connection.on('disconnected', () => {
      setConnectionStatus(false, true);
      console.warn('Ably disconnected, attempting to reconnect...');
    });

    ablyClient.connection.on('suspended', () => {
      setConnectionStatus(false, true);
      setError('Connection suspended. Reconnecting...');
    });

    ablyClient.connection.on('failed', (stateChange) => {
      setConnectionStatus(false, false);
      setError(`Connection failed: ${stateChange.reason?.message || 'Unknown error'}`);
    });

    setClient(ablyClient);

    return () => {
      ablyClient.close();
      setClient(null);
    };
  }, [jwt, setConnectionStatus, setError]);

  // If not connected, render a loading state because children like GameSubscriber require the RealtimeProvider context
  if (!client) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <div style={{ marginLeft: '1rem', color: 'var(--color-carpet-gold)' }}>Connecting to real-time server...</div>
      </div>
    );
  }

  return (
    <RealtimeProvider client={client}>
      {children}
    </RealtimeProvider>
  );
}
