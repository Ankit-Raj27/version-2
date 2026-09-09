import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getLatestDraftForConversation } from "../../agent/drafting/draft.repository.js";
import { toDraftView } from "../../agent/drafting/draft.view.js";
import {
  getContactByConversation,
  updateContactSettings
} from "../../messaging/contacts.js";
import {
  getConversation,
  listConversations,
  listMessages
} from "../../messaging/queries.js";
import { RELATIONSHIPS, REPLY_MODES } from "../../db/schema.js";

const idSchema = z.coerce.number().int().positive();

const MAX_CONTACT_NOTES_LENGTH = 2000;
const MAX_CONTACT_DISPLAY_NAME_LENGTH = 200;

const updateContactSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(MAX_CONTACT_DISPLAY_NAME_LENGTH)
      .optional(),
    relationship: z.enum(RELATIONSHIPS).optional(),
    replyMode: z.enum(REPLY_MODES).optional(),
    notes: z.string().max(MAX_CONTACT_NOTES_LENGTH).nullable().optional()
  })
  .strict();
const conversationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100)
});
const messageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    beforeTimestamp: z.coerce.number().int().nonnegative().optional(),
    beforeId: z.coerce.number().int().positive().optional()
  })
  .refine(
    (query) =>
      (query.beforeTimestamp === undefined) === (query.beforeId === undefined),
    { message: "beforeTimestamp and beforeId must be provided together" }
  );

function sendError(
  reply: FastifyReply,
  status: 400 | 404,
  code: string,
  message: string
) {
  return reply.code(status).send({ error: { code, message } });
}

export async function registerConversationRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/conversations", async (request, reply) => {
    const query = conversationQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendError(reply, 400, "INVALID_LIMIT", "limit must be between 1 and 200");
    }

    return { conversations: listConversations(query.data.limit) };
  });

  app.get("/conversations/:id/messages", async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);

    if (!params.success) {
      return sendError(
        reply,
        400,
        "INVALID_CONVERSATION_ID",
        "Conversation id must be a positive integer"
      );
    }

    const query = messageQuerySchema.safeParse(request.query);

    if (!query.success) {
      const hasCursorField =
        typeof request.query === "object" &&
        request.query !== null &&
        ("beforeTimestamp" in request.query || "beforeId" in request.query);

      return sendError(
        reply,
        400,
        hasCursorField ? "INVALID_CURSOR" : "INVALID_LIMIT",
        hasCursorField
          ? "beforeTimestamp and beforeId must form a valid cursor"
          : "limit must be between 1 and 200"
      );
    }

    const conversation = getConversation(params.data.id);

    if (!conversation) {
      return sendError(
        reply,
        404,
        "CONVERSATION_NOT_FOUND",
        `Conversation ${params.data.id} does not exist`
      );
    }

    const { beforeTimestamp, beforeId } = query.data;
    const page = listMessages(
      conversation.id,
      query.data.limit,
      beforeTimestamp !== undefined && beforeId !== undefined
        ? { timestamp: beforeTimestamp, id: beforeId }
        : null
    );

    return { conversation, ...page };
  });

  app.get("/conversations/:id/draft", async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);

    if (!params.success) {
      return sendError(
        reply,
        400,
        "INVALID_CONVERSATION_ID",
        "Conversation id must be a positive integer"
      );
    }

    const conversation = getConversation(params.data.id);

    if (!conversation) {
      return sendError(
        reply,
        404,
        "CONVERSATION_NOT_FOUND",
        `Conversation ${params.data.id} does not exist`
      );
    }

    const draft = getLatestDraftForConversation(conversation.id);

    if (!draft) {
      return { draft: null };
    }

    return { draft: toDraftView(draft) };
  });

  app.get("/conversations/:id/contact", async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);

    if (!params.success) {
      return sendError(
        reply,
        400,
        "INVALID_CONVERSATION_ID",
        "Conversation id must be a positive integer"
      );
    }

    const contact = getContactByConversation(params.data.id);

    if (!contact) {
      return sendError(
        reply,
        404,
        "CONTACT_NOT_FOUND",
        `Conversation ${params.data.id} has no editable contact`
      );
    }

    return { contact };
  });

  app.patch("/conversations/:id/contact", async (request, reply) => {
    const params = z.object({ id: idSchema }).safeParse(request.params);

    if (!params.success) {
      return sendError(
        reply,
        400,
        "INVALID_CONVERSATION_ID",
        "Conversation id must be a positive integer"
      );
    }

    const body = updateContactSchema.safeParse(request.body ?? {});

    if (!body.success) {
      return sendError(
        reply,
        400,
        "INVALID_CONTACT_UPDATE",
        "Contact update contains unknown or invalid fields"
      );
    }

    const contact = getContactByConversation(params.data.id);

    if (!contact) {
      return sendError(
        reply,
        404,
        "CONTACT_NOT_FOUND",
        `Conversation ${params.data.id} has no editable contact`
      );
    }

    const updated = updateContactSettings(contact.id, body.data);

    if (!updated) {
      return sendError(
        reply,
        404,
        "CONTACT_NOT_FOUND",
        `Contact ${contact.id} no longer exists`
      );
    }

    return { contact: updated };
  });
}
