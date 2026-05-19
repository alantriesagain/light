import * as router from "../router.js";
import { listAdapters } from "../../adapters/index.js";
import { sendJson, parseBody } from "../sse.js";

const parseModel = (model, defaultModel) => {
  if (!model) return { adapter: null, model: defaultModel };
  const slash = model.indexOf("/");
  if (slash === -1) return { adapter: null, model };
  return { adapter: model.slice(0, slash), model: model.slice(slash + 1) };
};

const promptFromMessages = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].role === "user") {
      const c = messages[i].content;
      const text = typeof c === "string"
        ? c
        : Array.isArray(c) ? c.map((p) => p.text || "").join("") : String(c);
      return [{ type: "text", text }];
    }
  return [{ type: "text", text: "" }];
};

const systemFromMessages = (messages) =>
  messages.find((m) => m.role === "system")?.content || null;

const openAiChunk = (sessionId, model, delta, finishReason) => ({
  id: `chatcmpl-${sessionId}`,
  object: "chat.completion.chunk",
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [{ index: 0, delta, finish_reason: finishReason || null }],
});

const writeChunk = (res, chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);

const isTextChunk = (u) => u?.sessionUpdate === "agent_message_chunk" && u.content?.type === "text";

/**
 * @param {RequestContext} ctx
 * @returns {Promise<boolean | void>}
 */
export const handleOpenAi = async (ctx) => {
  const { req, res, method, pathname, cfg, defaultModel, cors } = ctx;

  if (method === "GET" && pathname === "/v1/models") {
    const models = [];
    for (const a of listAdapters())
      for (const m of a.models)
        models.push({ id: `${a.id}/${m.id}`, object: "model", created: 0, owned_by: a.id });
    return sendJson(res, 200, { object: "list", data: models }, cors);
  }

  if (method === "POST" && pathname === "/v1/chat/completions") {
    const body = await parseBody(req);
    const { messages = [], model: modelInput, stream = false } = body;
    const { adapter: adapterId, model } = parseModel(modelInput, defaultModel);
    const systemPrompt = systemFromMessages(messages);
    const prompt = promptFromMessages(messages);

    const { sessionId } = await router.createSession(
      adapterId,
      { model, customPrompt: systemPrompt },
      { cfgDir: cfg._dir },
    );

    if (!stream) {
      let text = "";
      const iter = router.send(sessionId, prompt);
      while (true) {
        const r = await iter.next();
        if (r.done) break;
        if (isTextChunk(r.value)) text += r.value.content.text;
      }
      await router.closeSession(sessionId);
      return sendJson(res, 200, {
        id: `chatcmpl-${sessionId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelInput,
        choices: [{
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        }],
      }, cors);
    }

    res.writeHead(200, {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    writeChunk(res, openAiChunk(sessionId, modelInput, { role: "assistant", content: "" }));

    try {
      const iter = router.send(sessionId, prompt);
      while (true) {
        const r = await iter.next();
        if (r.done) break;
        if (isTextChunk(r.value))
          writeChunk(res, openAiChunk(sessionId, modelInput, { content: r.value.content.text }));
      }
      writeChunk(res, openAiChunk(sessionId, modelInput, {}, "stop"));
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
      await router.closeSession(sessionId);
    }
    return;
  }

  return false;
};
