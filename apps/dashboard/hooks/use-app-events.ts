"use client";

import { useEffect, useRef, useState } from "react";
import { getServerBaseUrl } from "../lib/api";
import type { StreamState, WhatsAppConnectionState } from "../lib/types";

interface EventCallbacks {
  onMessageCreated: (event: { conversationId: number; messageId: number }) => void;
  onStatus: (event: { state: WhatsAppConnectionState; connected: boolean }) => void;
  onOpen: () => void;
}

export function useAppEvents(callbacks: EventCallbacks): StreamState {
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const source = new EventSource(`${getServerBaseUrl()}/api/events`);

    source.onopen = () => {
      setStreamState("live");
      callbacksRef.current.onOpen();
    };
    source.onerror = () => {
      setStreamState("reconnecting");
    };
    source.addEventListener("message.created", (rawEvent) => {
      try {
        const event = JSON.parse(rawEvent.data) as {
          conversationId: number;
          messageId: number;
        };
        callbacksRef.current.onMessageCreated(event);
      } catch {
        setStreamState("reconnecting");
      }
    });
    source.addEventListener("whatsapp.status", (rawEvent) => {
      try {
        const event = JSON.parse(rawEvent.data) as {
          state: WhatsAppConnectionState;
          connected: boolean;
        };
        callbacksRef.current.onStatus(event);
      } catch {
        setStreamState("reconnecting");
      }
    });

    return () => source.close();
  }, []);

  return streamState;
}
