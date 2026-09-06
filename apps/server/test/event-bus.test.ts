import { describe, expect, it, vi } from "vitest";
import { getSubscriberCount, publish, subscribe } from "../src/realtime/event-bus.js";

describe("event bus", () => {
  it("publishes to subscribers and supports unsubscribe", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);
    const event = { type: "message.created", conversationId: 1, messageId: 2 } as const;

    publish(event);
    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);
    expect(getSubscriberCount()).toBe(2);

    unsubscribeFirst();
    publish(event);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    unsubscribeSecond();
    expect(getSubscriberCount()).toBe(0);
  });

  it("continues after a subscriber throws", () => {
    const unsubscribeThrowing = subscribe(() => {
      throw new Error("subscriber failed");
    });
    const working = vi.fn();
    const unsubscribeWorking = subscribe(working);

    publish({ type: "whatsapp.status", state: "connected", connected: true });
    expect(working).toHaveBeenCalledOnce();

    unsubscribeThrowing();
    unsubscribeWorking();
  });
});
