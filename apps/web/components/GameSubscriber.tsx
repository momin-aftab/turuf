'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAbly } from 'ably/react';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';
import type { ServerEvent } from '@/types';
import * as Ably from 'ably';

/** Turn timeout duration in milliseconds */
const TURN_TIMEOUT_MS = 20_000;

export function GameSubscriber() {
  const { lobbyId, myPlayerId, jwt, mySeat, view, applyServerEvent, setError, setTurnDeadline } = useGameStore();
  const ablyClient = useAbly();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // ── 20-second turn timeout timer ──────────────────────────────────────────
  // Runs for every turn change during the 'playing' phase.
  // When the timer fires, it calls the server timeout endpoint.
  const currentTurn = view?.currentTurn ?? null;
  const phase = view?.phase ?? null;

  useEffect(() => {
    // Clear any existing timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Only start timer during active play
    if (phase !== 'playing' || currentTurn === null) {
      setTurnDeadline(null);
      return;
    }

    // Set the deadline for the UI countdown
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    setTurnDeadline(deadline);

    // Start the timer — any connected client can trigger the timeout
    timeoutRef.current = setTimeout(async () => {
      try {
        await apiClient.game.timeout();
      } catch (err) {
        // Another client may have already triggered the timeout, or
        // the turn may have changed — both are fine, ignore errors
        console.log('Timeout call result:', err);
      }
    }, TURN_TIMEOUT_MS + 1000); // Add 1s buffer to avoid racing with the server's 20s check

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [currentTurn, phase, setTurnDeadline]);

  return null; // This is a headless logic component
}

