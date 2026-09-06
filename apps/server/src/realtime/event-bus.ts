import { logger } from "../logger.js";
import type { AppEvent } from "./event.types.js";

type Subscriber = (event: AppEvent) => void;

const subscribers = new Set<Subscriber>();

export function publish(event: AppEvent): void {
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch (err) {
      logger.error({ err, eventType: event.type }, "App event subscriber failed");
    }
  }
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);

  return () => {
    subscribers.delete(subscriber);
  };
}

export function getSubscriberCount(): number {
  return subscribers.size;
}
