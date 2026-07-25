'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '@/store/game';
import { apiClient } from '@/lib/api-client';

export function ChatPanel() {
  const { chatHistory, mySeat } = useGameStore();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;

    setIsSending(true);
    const text = message;
    setMessage(''); // Optimistic clear

    try {
      await apiClient.game.chat(text);
    } catch (err) {
      // Revert if failed
      setMessage(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="glass-panel" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      maxHeight: '400px',
      width: '100%',
      minWidth: '280px'
    }}>
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid var(--color-panel-border)',
        fontWeight: 'bold',
        color: 'var(--color-carpet-gold)'
      }}>
        Majlis Chat
      </div>
      
      <div ref={scrollRef} style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {chatHistory.map((msg) => {
          const isSystem = msg.seat === 0 && msg.name === 'System';
          const isMe = msg.seat === mySeat;

          if (isSystem) {
            return (
              <div key={msg.id} style={{ 
                textAlign: 'center', 
                fontSize: '0.85rem', 
                color: 'var(--color-carpet-gold)',
                margin: '0.5rem 0',
                fontStyle: 'italic'
              }}>
                {msg.message}
              </div>
            );
          }

          return (
            <div key={msg.id} style={{
              alignSelf: isMe ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: isMe ? 'rgba(207, 168, 94, 0.2)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${isMe ? 'var(--color-carpet-gold)' : 'transparent'}`,
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
            }}>
              {!isMe && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>{msg.name}</div>}
              <div style={{ fontSize: '0.9rem', wordBreak: 'break-word' }}>{msg.message}</div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', padding: '0.75rem', borderTop: '1px solid var(--color-panel-border)', gap: '0.5rem' }}>
        <input 
          type="text" 
          className="input-field"
          placeholder="Say something..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={isSending || !message.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
