import { onMessagePersisted } from "../agent/drafting/draft.service.js";
import { logger } from "../logger.js";
import { publish } from "../realtime/event-bus.js";
import type { NormalizedMessage } from "./message.types.js";
import { persistMessage } from "./persistence.js";

export function handleInboundMessage(message: NormalizedMessage): void {
  const result = persistMessage(message);

  if (
    result.status === "inserted" &&
    result.conversationId !== undefined &&
    result.messageId !== undefined
  ) {
    publish({
      type: "message.created",
      conversationId: result.conversationId,
      messageId: result.messageId
    });

    void onMessagePersisted({
      message,
      conversationId: result.conversationId,
      triggerMessageId: result.messageId
    }).catch((err) => {
      logger.error(
        { err, triggerMessageId: result.messageId },
        "Draft generation failed"
      );
    });
  }

  logger.info(
    {
      externalMessageId: message.externalMessageId,
      externalConversationId: message.externalConversationId,
      direction: message.direction,
      messageType: message.type,
      status: result.status
    },
    "WhatsApp message persisted"
  );
}
