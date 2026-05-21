const BASE_CORS = {
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

export const buildCorsHeaders = (requestOrigin, allowedOrigin) => {
  const headers = { ...BASE_CORS };
  if (!allowedOrigin)
    headers["Access-Control-Allow-Origin"] = "*";
   else if (requestOrigin && requestOrigin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Vary"] = "Origin";
  }
  return headers;
};

export const CORS_HEADERS = buildCorsHeaders(null, null);

/**
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {any} data
 * @param {Record<string, string>} [cors]
 */
export const sendJson = (res, status, data, cors = CORS_HEADERS) => {
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

export const writeSse = (res, event, data) => {
  if (!res || res.writableEnded) return false;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {import("http").ServerResponse} res
 * @param {Record<string, string>} [cors]
 */
export const openSseStream = (res, cors = CORS_HEADERS) => {
  res.writeHead(200, {
    ...cors,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
};

export const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
