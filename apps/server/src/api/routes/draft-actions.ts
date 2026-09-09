import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  approveDraft,
  ignoreDraft,
  regenerateDraft,
  type DraftActionResult
} from "../../agent/drafting/draft-approval.service.js";
import { toDraftView } from "../../agent/drafting/draft.view.js";

const idSchema = z.coerce.number().int().positive();
const paramsSchema = z.object({ conversationId: idSchema, draftId: idSchema });
const approveBodySchema = z.object({
  editedText: z.string().trim().min(1, "editedText cannot be empty or whitespace-only").max(2000).optional()
});

function sendError(
  reply: FastifyReply,
  status: 400 | 404 | 409,
  code: string,
  message: string
) {
  return reply.code(status).send({ error: { code, message } });
}

function sendResult(reply: FastifyReply, successStatus: 200 | 202, result: DraftActionResult) {
  if (result.ok) {
    return reply.code(successStatus).send({ draft: toDraftView(result.draft) });
  }

  const status = result.code === "DRAFT_NOT_FOUND" || result.code === "DRAFT_CONVERSATION_MISMATCH" ? 404 : 409;
  return sendError(reply, status, result.code, result.message);
}

export async function registerDraftActionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/conversations/:conversationId/drafts/:draftId/approve", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(reply, 400, "INVALID_ID", "conversationId and draftId must be positive integers");
    }

    const body = approveBodySchema.safeParse(request.body ?? {});

    if (!body.success) {
      return sendError(reply, 400, "INVALID_EDITED_TEXT", "editedText must be non-empty and at most 2000 characters");
    }

    const result = await approveDraft(params.data.conversationId, params.data.draftId, body.data.editedText);
    return sendResult(reply, 200, result);
  });

  app.post("/conversations/:conversationId/drafts/:draftId/regenerate", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(reply, 400, "INVALID_ID", "conversationId and draftId must be positive integers");
    }

    const result = regenerateDraft(params.data.conversationId, params.data.draftId);
    return sendResult(reply, 202, result);
  });

  app.post("/conversations/:conversationId/drafts/:draftId/ignore", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);

    if (!params.success) {
      return sendError(reply, 400, "INVALID_ID", "conversationId and draftId must be positive integers");
    }

    const result = ignoreDraft(params.data.conversationId, params.data.draftId);
    return sendResult(reply, 200, result);
  });
}
