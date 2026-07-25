'use client';

import { useEffect, useCallback } from 'react';
import { useAbly } from 'ably/react';
import { useGameStore } from '@/store/game';
import type { ServerEvent } from '@/types';
import * as Ably from 'ably';

export function GameSubscriber() {
  const { lobbyId, myPlayerId, jwt, applyServerEvent, setError } = useGameStore();
  const ablyClient = useAbly();

  // Handle messages uniformly
  const handleMessage = useCallback((message: Ably.Message) => {
    // Reconstruct ServerEvent from Ably Message
    // server-side uses channel.publish(event.type, event.payload)
    const event: ServerEvent = {
      type: message.name as ServerEvent['type'],
      payload: message.data,
    } as ServerEvent;
    
    console.log('Received ServerEvent:', event.type, event.payload);
    applyServerEvent(event);
  }, [applyServerEvent]);

  useEffect(() => {
    if (!lobbyId || !myPlayerId) return;

    const lobbyChannel = ablyClient.channels.get(`lobby:${lobbyId}`);
    const playerChannel = ablyClient.channels.get(`player:${myPlayerId}`);

    lobbyChannel.subscribe(handleMessage);
    playerChannel.subscribe(handleMessage);

    return () => {
      lobbyChannel.unsubscribe(handleMessage);
      playerChannel.unsubscribe(handleMessage);
    };
  }, [ablyClient, lobbyId, myPlayerId, handleMessage]);

  // Initial state fetch if we joined mid-game or refreshed
  useEffect(() => {
    if (!lobbyId || !jwt) return;

    async function fetchState() {
      try {
        const res = await fetch('/api/game/state', {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });
        
        const data = await res.json();
        if (res.ok) {
          // It will either return just the lobby, or also a view & myHand
          // Our API sends RECONNECT_STATE via ably but also returns the state in the HTTP response.
          // It's safer to just let the HTTP response hydrate the store if it contains a view.
          if (data.data && data.data.view) {
            applyServerEvent({
              type: 'RECONNECT_STATE',
              payload: {
                view: data.data.view,
                myHand: data.data.myHand,
              }
            });
          }
        } else {
          setError(data.error?.message || 'Failed to sync game state');
        }
      } catch (e) {
        console.error('Failed to fetch game state', e);
        setError('Failed to sync game state');
      }
    }

    fetchState();
  }, [lobbyId, jwt, applyServerEvent, setError]);

  return null; // This is a headless logic component
}
