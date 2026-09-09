"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getContact, updateContact } from "../lib/api";
import type { Contact, ContactUpdate } from "../lib/types";

export function useContact(conversationId: number | null) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversationId = useRef(conversationId);
  activeConversationId.current = conversationId;

  useEffect(() => {
    setContact(null);
    setError(null);

    if (conversationId === null) {
      return;
    }

    const controller = new AbortController();
    const id = conversationId;

    getContact(id, controller.signal)
      .then((response) => {
        if (activeConversationId.current === id) {
          setContact(response.contact);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        // No contact (e.g. a group) or a failed fetch: the panel simply hides.
      });

    return () => controller.abort();
  }, [conversationId]);

  const save = useCallback(
    async (patch: ContactUpdate) => {
      if (conversationId === null) {
        return;
      }

      const id = conversationId;
      setSaving(true);
      setError(null);

      try {
        const response = await updateContact(id, patch);
        if (activeConversationId.current === id) {
          setContact(response.contact);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Could not save contact settings";
        if (activeConversationId.current === id) {
          setError(message);
        }
      } finally {
        setSaving(false);
      }
    },
    [conversationId]
  );

  return { contact, saving, error, save };
}
