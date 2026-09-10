import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getLatestDraftForConversation } from "../../agent/drafting/draft.repository.js";
import { toDraftView } from "../../agent/drafting/draft.view.js";
import {
  deleteFact,
  listFacts,
  setFactStatus,
  toFactView
} from "../../agent/memory/memory.repository.js";
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

const factParamsSchema = z.object({ id: idSchema, factId: idSchema });
const updateFactSchema = z
  .object({ status: z.enum(["confirmed", "rejected"]) })
  .strict();

function sendError(
  reply: FastifyReply,
  status: 400 | 404,
  code: string,
  message: string
) {
  return reply.code(status).send({ error: { code, message } });
}

function resolveContact(params: unknown, reply: FastifyReply) {
  const parsed = z.object({ id: idSchema }).safeParse(params);

  if (!parsed.success) {
    sendError(
      reply,
      400,
      "INVALID_CONVERSATION_ID",
      "Conversation id must be a positive integer"
    );
    return null;
  }

  const contact = getContactByConversation(parsed.data.id);

  if (!contact) {
    sendError(
      reply,
      404,
      "CONTACT_NOT_FOUND",
      `Conversation ${parsed.data.id} has no editable contact`
    );
    return null;
  }

  return contact;
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

  app.get("/conversations/:id/contact/facts", async (request, reply) => {
    const contact = resolveContact(request.params, reply);

    if (!contact) {
      return reply;
    }

    return { facts: listFacts(contact.id).map(toFactView) };
  });

  app.patch("/conversations/:id/contact/facts/:factId", async (request, reply) => {
    const params = factParamsSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(reply, 400, "INVALID_FACT_ID", "Fact id must be a positive integer");
    }

    const body = updateFactSchema.safeParse(request.body ?? {});

    if (!body.success) {
      return sendError(
        reply,
        400,
        "INVALID_FACT_UPDATE",
        "status must be 'confirmed' or 'rejected'"
      );
    }

    const contact = resolveContact(request.params, reply);

    if (!contact) {
      return reply;
    }

    const updated = setFactStatus(contact.id, params.data.factId, body.data.status);

    if (!updated) {
      return sendError(reply, 404, "FACT_NOT_FOUND", `Fact ${params.data.factId} not found`);
    }

    return { fact: toFactView(updated) };
  });

  app.delete("/conversations/:id/contact/facts/:factId", async (request, reply) => {
    const params = factParamsSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(reply, 400, "INVALID_FACT_ID", "Fact id must be a positive integer");
    }

    const contact = resolveContact(request.params, reply);

    if (!contact) {
      return reply;
    }

    if (!deleteFact(contact.id, params.data.factId)) {
      return sendError(reply, 404, "FACT_NOT_FOUND", `Fact ${params.data.factId} not found`);
    }

    return reply.code(204).send();
  });
}
