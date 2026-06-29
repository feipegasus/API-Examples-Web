const express = require("express");
const path = require("path");
const fs = require("fs");
const Busboy = require("busboy");
const Jimp = require("jimp");
const QRCodeReader = require("qrcode-reader");
const { Server } = require("ws");

const PORT = process.env.PORT || 3001;
const URL = `http://localhost:${PORT}/stepMonitor/index.html`;

const dir = path.join(__dirname, "../src");
const abbDemoDir = path.join(dir, "abb-ai-demo");
const TOKEN_FILE = path.join(__dirname, "token.json");
const STEP_RECORD_FILE = path.join(__dirname, "step_record.json");
const STEP_FILE = path.join(__dirname, "step.json");
const UPLOAD_DIR = path.join(__dirname, "upload");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let tokenStore = {
  token: null,
  updateTime: null
};

let stepRecords = {};

const DEFAULT_STEP_DATA = {
  steps: [
    { step: 0, status: "pending", url: "" },
    { step: 1, status: "pending", url: "" },
    { step: 2, status: "pending", url: "" }
  ]
};

function createDefaultStepData() {
  return {
    steps: DEFAULT_STEP_DATA.steps.map((item) => ({
      step: item.step,
      status: item.status,
      url: item.url
    }))
  };
}

let stepData = createDefaultStepData();

function loadTokenFromFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, "utf8");
      tokenStore = JSON.parse(raw);
    }
  } catch (_err) {
    tokenStore = {
      token: null,
      updateTime: null
    };
  }
}

function saveTokenToFile() {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenStore, null, 2), "utf8");
}

function loadStepRecords() {
  try {
    if (fs.existsSync(STEP_RECORD_FILE)) {
      const raw = fs.readFileSync(STEP_RECORD_FILE, "utf8");
      stepRecords = JSON.parse(raw);
    }
  } catch (_err) {
    stepRecords = {};
  }
}

function saveStepRecords() {
  fs.writeFileSync(STEP_RECORD_FILE, JSON.stringify(stepRecords, null, 2), "utf8");
}

function loadStepDataFromFile() {
  try {
    if (fs.existsSync(STEP_FILE)) {
      const raw = fs.readFileSync(STEP_FILE, "utf8");
      const parsed = JSON.parse(raw);
      const isValid = parsed && Array.isArray(parsed.steps);
      if (isValid) {
        stepData = {
          steps: parsed.steps
            .filter((item) => item && Number.isInteger(Number(item.step)) && typeof item.status === "string")
            .map((item) => ({
              step: Number(item.step),
              status: item.status,
              url: typeof item.url === "string" ? item.url : ""
            }))
        };
        return;
      }
    }
  } catch (_err) {
    // fall back to default step data
  }

  stepData = createDefaultStepData();
  fs.writeFileSync(STEP_FILE, JSON.stringify(stepData, null, 2), "utf8");
}

function saveStepDataToFile() {
  fs.writeFileSync(STEP_FILE, JSON.stringify(stepData, null, 2), "utf8");
}

function clearUploadDirectory() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    return 0;
  }

  let deletedCount = 0;
  const entries = fs.readdirSync(UPLOAD_DIR, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(UPLOAD_DIR, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
      deletedCount += 1;
      continue;
    }

    fs.unlinkSync(entryPath);
    deletedCount += 1;
  }

  return deletedCount;
}

function isValidStepStatus(status) {
  return ["complete", "pending", "failed"].includes(status);
}

function isAllowedImageExt(filename) {
  const ext = path.extname(filename || "").toLowerCase();
  return [".png", ".jpg", ".jpeg"].includes(ext);
}

async function scanQRCode(imgBuffer) {
  try {
    const image = await Jimp.read(imgBuffer);
    const qr = new QRCodeReader();
    return await new Promise((resolve, reject) => {
      qr.callback = (err, value) => {
        if (err) {
          reject(err);
          return;
        }

        if (!value || !value.result) {
          resolve(null);
          return;
        }

        resolve(value.result);
      };

      qr.decode(image.bitmap);
    });
  } catch (_err) {
    return null;
  }
}

loadTokenFromFile();
loadStepRecords();
loadStepDataFromFile();

const app = express();
app.set("trust proxy", true);

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "5mb" }));

let latestApiData = {
  updatedAt: new Date().toISOString(),
  payload: {
    status: "init",
    message: "Server started"
  }
};

const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "API Examples Web Server API",
    version: "1.0.0",
    description: "Merged API document for scripts/server.js"
  },
  servers: [
    {
      url: `http://localhost:${PORT}`
    }
  ],
  tags: [
    { name: "basic" },
    { name: "token" },
    { name: "qr" },
    { name: "step" },
    { name: "realtime" }
  ],
  paths: {
    "/api/hello": {
      get: {
        tags: ["basic"],
        summary: "Health check hello API",
        responses: {
          "200": {
            description: "Success"
          }
        }
      }
    },
    "/api/user": {
      get: {
        tags: ["basic"],
        summary: "Get demo user",
        responses: {
          "200": {
            description: "Success"
          }
        }
      }
    },
    "/api/token/update": {
      put: {
        tags: ["token"],
        summary: "Update token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token"],
                properties: {
                  token: { type: "string", example: "your-token-value" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Token updated" },
          "400": { description: "Invalid request" }
        }
      }
    },
    "/api/token/get": {
      get: {
        tags: ["token"],
        summary: "Get current token",
        responses: {
          "200": {
            description: "Success"
          }
        }
      }
    },
    "/api/scan-qr": {
      post: {
        tags: ["qr"],
        summary: "Upload image and parse QR",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["img"],
                properties: {
                  img: {
                    type: "string",
                    format: "binary"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Parsed or no qr code" },
          "400": { description: "Invalid upload" },
          "500": { description: "Decode failed" }
        }
      }
    },
    "/api/step/status": {
      get: {
        tags: ["step"],
        summary: "Get step status data from step.json",
        responses: {
          "200": { description: "Step data" },
          "500": { description: "Read step data failed" }
        }
      },
      post: {
        tags: ["step"],
        summary: "Update step status with optional image",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["step_no", "step_status"],
                properties: {
                  step_no: { type: "string", example: "1" },
                  step_status: {
                    type: "string",
                    enum: ["complete", "pending", "failed"],
                    example: "complete"
                  },
                  image: {
                    type: "string",
                    format: "binary"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Step updated" },
          "400": { description: "Validation error" },
          "500": { description: "File save error" }
        }
      }
    },
    "/api/step/status/reset": {
      post: {
        tags: ["step"],
        summary: "Reset step.json data to default",
        responses: {
          "200": { description: "Step data reset success" },
          "500": { description: "Reset step data failed" }
        }
      }
    },
    "/api/realtime/latest": {
      get: {
        tags: ["realtime"],
        summary: "Get latest realtime payload",
        responses: {
          "200": { description: "Success" }
        }
      },
      post: {
        tags: ["realtime"],
        summary: "Update latest realtime payload",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
                example: {
                  status: "running",
                  message: "new payload"
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated" }
        }
      }
    },
    "/api/swagger.json": {
      get: {
        tags: ["basic"],
        summary: "Get OpenAPI spec json",
        responses: {
          "200": {
            description: "OpenAPI json"
          }
        }
      }
    },
    "/api/swagger": {
      get: {
        tags: ["basic"],
        summary: "Open Swagger UI page",
        responses: {
          "200": {
            description: "Swagger UI HTML"
          }
        }
      }
    }
  }
};

function buildUpdateMessage(payload) {
  return JSON.stringify({
    type: "api-data-update",
    updatedAt: new Date().toISOString(),
    payload
  });
}

function safeSend(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(message);
  }
}

function broadcast(wss, message, exceptWs = null) {
  wss.clients.forEach((client) => {
    if (client !== exceptWs) {
      safeSend(client, message);
    }
  });
}

app.use(express.static(dir));
app.use("/abb-ai-demo", express.static(abbDemoDir));
app.use("/upload", express.static(UPLOAD_DIR));

app.get("/abb-ai-demo", (_req, res) => {
  res.sendFile(path.join(abbDemoDir, "index.html"));
});

app.get("/api/hello", (_req, res) => {
  res.json({ msg: "Hello Azure REST API", time: new Date().toISOString() });
});

app.get("/api/user", (_req, res) => {
  res.json({ id: 1, name: "test" });
});

app.put("/api/token/update", (req, res) => {
  const { token } = req.body ?? {};

  if (!token || typeof token !== "string" || token.trim() === "") {
    res.status(400).json({ code: 400, error: "token is required and must be a non-empty string" });
    return;
  }

  tokenStore.token = token.trim();
  tokenStore.updateTime = new Date().toISOString();
  saveTokenToFile();

  res.json({
    code: 200,
    msg: "token updated",
    data: tokenStore
  });
});

app.get("/api/token/get", (_req, res) => {
  if (!tokenStore.token) {
    res.json({ code: 200, msg: "no valid token", data: null });
    return;
  }

  res.json({
    code: 200,
    msg: "token fetched",
    data: tokenStore
  });
});

app.post("/api/scan-qr", (req, res) => {
  const bb = Busboy({ headers: req.headers });
  let imgBuffer = null;
  let parseErr = null;

  bb.on("file", (fieldname, file) => {
    if (fieldname !== "img") {
      file.resume();
      return;
    }

    const chunks = [];
    file.on("data", (chunk) => chunks.push(chunk));
    file.on("end", () => {
      imgBuffer = Buffer.concat(chunks);
    });
  });

  bb.on("error", (err) => {
    parseErr = err;
  });

  bb.on("close", async () => {
    if (parseErr) {
      res.status(400).json({ code: 400, error: `file parse failed: ${parseErr.message}` });
      return;
    }

    if (!imgBuffer) {
      res.status(400).json({ code: 400, error: "upload image with form field 'img'" });
      return;
    }

    try {
      const qrText = await scanQRCode(imgBuffer);
      if (!qrText) {
        res.json({ code: 200, msg: "no qr code found", qrContent: null });
        return;
      }

      res.json({ code: 200, msg: "qr code parsed", qrContent: qrText });
    } catch (scanErr) {
      res.status(500).json({ code: 500, error: `qr decode failed: ${scanErr.message}` });
    }
  });

  req.pipe(bb);
});

app.get("/api/step/status", (_req, res) => {
  try {
    loadStepDataFromFile();
    res.json(stepData);
  } catch (err) {
    res.status(500).json({ code: 500, error: `read step data failed: ${err.message}` });
  }
});

app.post("/api/step/status/reset", (_req, res) => {
  try {
    const deletedUploadCount = clearUploadDirectory();
    stepData = createDefaultStepData();
    saveStepDataToFile();
    res.json({
      code: 200,
      msg: "step data reset success",
      deleted_upload_count: deletedUploadCount,
      data: stepData
    });
  } catch (err) {
    res.status(500).json({ code: 500, error: `reset step data failed: ${err.message}` });
  }
});

app.post("/api/step/status", (req, res) => {
  const bb = Busboy({ headers: req.headers });
  const formData = { step_no: null, step_status: null };
  let imageSavePath = null;
  let imageUrl = null;
  let parseError = null;
  const fileWriteTasks = [];

  bb.on("field", (key, val) => {
    formData[key] = String(val).trim();
  });

  bb.on("file", (field, stream, fileInfo) => {
    if (field !== "image") {
      stream.resume();
      return;
    }

    const filename = fileInfo?.filename || "";
    if (!isAllowedImageExt(filename)) {
      parseError = `unsupported image extension: ${filename}`;
      stream.resume();
      return;
    }

    const uniqueName = `${Date.now()}_${filename}`;
    const fullPath = path.join(UPLOAD_DIR, uniqueName);
    imageSavePath = `upload/${uniqueName}`;
    imageUrl = `/upload/${uniqueName}`;

    const task = new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(fullPath);
      stream.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      stream.on("error", reject);
    });
    fileWriteTasks.push(task);
  });

  bb.on("error", (err) => {
    parseError = err.message;
  });

  bb.on("close", async () => {
    if (parseError) {
      res.status(400).json({ code: 400, error: parseError });
      return;
    }

    try {
      await Promise.all(fileWriteTasks);
    } catch (err) {
      res.status(500).json({ code: 500, error: `image save failed: ${err.message}` });
      return;
    }

    const { step_no, step_status } = formData;
    if (!step_no) {
      res.status(400).json({ code: 400, error: "step_no is required" });
      return;
    }

    if (!step_status || !isValidStepStatus(step_status)) {
      res.status(400).json({ code: 400, error: "step_status must be complete, pending, or failed" });
      return;
    }

    const parsedStepNo = Number(step_no);
    if (!Number.isInteger(parsedStepNo) || parsedStepNo < 0) {
      res.status(400).json({ code: 400, error: "step_no must be a non-negative integer" });
      return;
    }

    const stepIndex = stepData.steps.findIndex((item) => item.step === parsedStepNo);
    if (stepIndex >= 0) {
      stepData.steps[stepIndex].status = step_status;
      if (imageUrl) {
        stepData.steps[stepIndex].url = imageUrl;
      }
    } else {
      stepData.steps.push({
        step: parsedStepNo,
        status: step_status,
        url: imageUrl || ""
      });
    }
    saveStepDataToFile();

    stepRecords[step_no] = {
      step_no,
      step_status,
      image_path: imageSavePath,
      update_time: new Date().toISOString()
    };
    saveStepRecords();

    res.json({
      code: 200,
      msg: "step status updated",
      data: stepRecords[step_no]
    });
  });

  req.pipe(bb);
});

app.get("/api/realtime/latest", (_req, res) => {
  res.json({
    ok: true,
    data: latestApiData
  });
});

app.get("/api/swagger.json", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.json({
    ...OPENAPI_SPEC,
    // Relative URL guarantees Swagger uses the same origin as the current page.
    servers: [{ url: "/" }]
  });
});

app.get("/api/swagger", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Server API Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    (async function renderSwagger() {
      const resp = await fetch("/api/swagger.json?t=" + Date.now(), { cache: "no-store" });
      const spec = await resp.json();
      spec.servers = [{ url: window.location.origin }];

      window.ui = SwaggerUIBundle({
        spec,
        dom_id: "#swagger-ui"
      });
    })().catch(function (err) {
      document.getElementById("swagger-ui").innerHTML = "<pre>Failed to load swagger: " + String(err) + "</pre>";
    });
  </script>
</body>
</html>`);
});

const server = app.listen(PORT, () => {
  console.info(`\n---------------------------------------\n`);
  console.info(`Main demo: ${URL}`);
  console.info(`ABB demo:  http://localhost:${PORT}/abb-ai-demo`);
  console.info(`API latest: http://localhost:${PORT}/api/realtime/latest`);
  console.info(`Token get:  http://localhost:${PORT}/api/token/get`);
  console.info(`Swagger:    http://localhost:${PORT}/api/swagger`);
  console.info(`SwaggerJSON:http://localhost:${PORT}/api/swagger.json`);
  console.info(`\n---------------------------------------\n`);
});

const wss = new Server({ server });

app.post("/api/realtime/latest", (req, res) => {
  const payload = req.body ?? {};

  latestApiData = {
    updatedAt: new Date().toISOString(),
    payload
  };

  const message = buildUpdateMessage(payload);
  broadcast(wss, message);

  res.json({
    ok: true,
    data: latestApiData,
    onlineClients: wss.clients.size
  });
});

wss.on("connection", (ws) => {
  safeSend(ws, buildUpdateMessage(latestApiData.payload));

  ws.on("message", (message) => {
    if (typeof message !== "string" && !Buffer.isBuffer(message)) {
      return;
    }
    broadcast(wss, message, ws);
  });
});
