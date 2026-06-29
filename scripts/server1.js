const http = require('http');
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const Jimp = require('jimp');
const QRCodeReader = require('qrcode-reader');

// ========== Token持久化逻辑（原有保留） ==========
const TOKEN_FILE = path.join(__dirname, 'token.json');
let tokenStore = {
  token: null,
  updateTime: null
};
function loadTokenFromFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
      tokenStore = JSON.parse(raw);
      console.log('已从本地文件加载保存的token');
    }
  } catch (err) {
    console.log('无历史token文件或文件损坏，初始化空token');
  }
}
loadTokenFromFile();
function saveTokenToFile() {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenStore, null, 2), 'utf8');
}

// ========== 步骤记录持久化（新增） ==========
const STEP_RECORD_FILE = path.join(__dirname, 'step_record.json');
const UPLOAD_DIR = path.join(__dirname, 'upload');
// 创建图片上传目录
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// 内存步骤存储 key:step_no, value:步骤对象
let stepRecords = {};

// 加载历史步骤记录
function loadStepRecords() {
  try {
    if (fs.existsSync(STEP_RECORD_FILE)) {
      const raw = fs.readFileSync(STEP_RECORD_FILE, 'utf8');
      stepRecords = JSON.parse(raw);
      console.log('已加载历史步骤记录');
    }
  } catch (e) {
    stepRecords = {};
  }
}
loadStepRecords();

// 保存步骤记录到文件
function saveStepRecords() {
  fs.writeFileSync(STEP_RECORD_FILE, JSON.stringify(stepRecords, null, 2), 'utf8');
}

// 校验步骤状态值
function isValidStepStatus(status) {
  return ['complete', 'pending', 'failed'].includes(status);
}

// 校验图片后缀
function isAllowImageExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.png', '.jpg', '.jpeg'].includes(ext);
}

// ========== 二维码识别工具函数（原有） ==========
async function scanQRCode(imgBuffer) {
  try {
    const image = await Jimp.read(imgBuffer);
    const qr = new QRCodeReader();
    return new Promise((resolve, reject) => {
      qr.callback = (err, value) => {
        if (err) return reject(err);
        if (!value || !value.result) return resolve(null);
        resolve(value.result);
      };
      qr.decode(image.bitmap);
    });
  } catch (err) {
    console.error('二维码解析失败:', err.message);
    return null;
  }
}

// ========== HTTP服务主体 ==========
const server = http.createServer(async (req, res) => {
  // 统一跨域头
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 预检OPTIONS跨域
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 根路由
  if (req.url === '/' && req.method === 'GET') {
    res.end(JSON.stringify({
      message: "API Service Running",
      apis: [
        "GET /api/hello",
        "GET /api/user",
        "PUT /api/token/update 【外部系统更新token】",
        "GET /api/token/get 【下游获取当前token】",
        "POST /api/scan-qr 【上传图片识别二维码】",
        "POST /api/step/status 【更新步骤状态+上传现场图片】"
      ]
    }));
    return;
  }

  // 2. 原有测试接口
  if (req.url === '/api/hello' && req.method === 'GET') {
    res.end(JSON.stringify({ msg: "Hello Azure REST API", time: new Date() }));
    return;
  }
  if (req.url === '/api/user' && req.method === 'GET') {
    res.end(JSON.stringify({ id: 1, name: "test" }));
    return;
  }

  // 3. Token更新接口 PUT /api/token/update（原有）
  if (req.url === '/api/token/update' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.token || typeof payload.token !== 'string' || payload.token.trim() === '') {
          res.writeHead(400);
          res.end(JSON.stringify({ code: 400, error: "token参数不能为空，请传入有效token字符串" }));
          return;
        }
        tokenStore.token = payload.token.trim();
        tokenStore.updateTime = new Date().toISOString();
        saveTokenToFile();
        res.writeHead(200);
        res.end(JSON.stringify({
          code: 200,
          msg: "token更新成功",
          data: tokenStore
        }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ code: 400, error: "请求体JSON格式错误，请检查入参" }));
      }
    });
    return;
  }

  // 4. Token获取接口 GET /api/token/get（原有）
  if (req.url === '/api/token/get' && req.method === 'GET') {
    if (!tokenStore.token) {
      res.writeHead(200);
      res.end(JSON.stringify({ code: 200, msg: "暂无有效token", data: null }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({
      code: 200,
      msg: "获取token成功",
      data: tokenStore
    }));
    return;
  }

  // 5. 二维码识别 POST /api/scan-qr（原有）
  if (req.url === '/api/scan-qr' && req.method === 'POST') {
    const bb = Busboy({ headers: req.headers });
    let imgBuffer = null;
    let parseErr = null;

    bb.on('file', (fieldname, file, info) => {
      if (fieldname !== 'img') return file.resume();
      const chunks = [];
      file.on('data', chunk => chunks.push(chunk));
      file.on('end', () => {
        imgBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('error', err => parseErr = err);
    bb.on('close', async () => {
      if (parseErr) {
        res.writeHead(400);
        return res.end(JSON.stringify({ code: 400, error: '文件解析失败：' + parseErr.message }));
      }
      if (!imgBuffer) {
        res.writeHead(400);
        return res.end(JSON.stringify({ code: 400, error: '请上传图片，表单字段名必须为 img' }));
      }
      try {
        const qrText = await scanQRCode(imgBuffer);
        if (!qrText) {
          res.writeHead(200);
          return res.end(JSON.stringify({ code: 200, msg: "图片内未识别到二维码", qrContent: null }));
        }
        res.writeHead(200);
        res.end(JSON.stringify({ code: 200, msg: "二维码识别成功", qrContent: qrText }));
      } catch (scanErr) {
        res.writeHead(500);
        res.end(JSON.stringify({ code: 500, error: "二维码解码异常：" + scanErr.message }));
      }
    });
    req.pipe(bb);
    return;
  }

  // ========== 新增：POST /api/step/status 更新步骤状态+上传图片 ==========
  if (req.url === '/api/step/status' && req.method === 'POST') {
    const bb = Busboy({ headers: req.headers });
    let formData = { step_no: null, step_status: null };
    let imageSavePath = null;
    let parseError = null;

    // 接收普通文本字段 step_no / step_status
    bb.on('field', (key, val) => {
      formData[key] = val.trim();
    });

    // 接收图片文件 image
    bb.on('file', (field, stream, fileInfo) => {
      if (field !== 'image') return stream.resume();
      const filename = fileInfo.filename;
      // 校验图片格式
      if (!isAllowImageExt(filename)) {
        parseError = `不支持图片格式，仅允许 png/jpg/jpeg，当前：${filename}`;
        return stream.resume();
      }
      // 生成唯一文件名避免覆盖
      const uniqueName = `${Date.now()}_${filename}`;
      const fullPath = path.join(UPLOAD_DIR, uniqueName);
      imageSavePath = `upload/${uniqueName}`;
      const writeStream = fs.createWriteStream(fullPath);
      stream.pipe(writeStream);
    });

    bb.on('error', err => parseError = err.message);

    bb.on('close', () => {
      // 1. 解析错误拦截
      if (parseError) {
        res.writeHead(400);
        return res.end(JSON.stringify({ code:400, error: parseError }));
      }
      // 2. 校验必填参数
      const { step_no, step_status } = formData;
      if (!step_no) {
        res.writeHead(400);
        return res.end(JSON.stringify({ code:400, error: "必填参数 step_no（步骤编号）不能为空" }));
      }
      if (!step_status || !isValidStepStatus(step_status)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ code:400, error: "step_status 仅允许：complete / pending / failed" }));
      }
      // 3. 组装步骤记录
      const stepKey = step_no;
      stepRecords[stepKey] = {
        step_no,
        step_status,
        image_path: imageSavePath,
        update_time: new Date().toISOString()
      };
      saveStepRecords();
      // 4. 返回成功结果
      res.writeHead(200);
      res.end(JSON.stringify({
        code: 200,
        msg: "步骤状态更新成功",
        data: stepRecords[stepKey]
      }));
    });

    req.pipe(bb);
    return;
  }

  // 未匹配路由404
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});