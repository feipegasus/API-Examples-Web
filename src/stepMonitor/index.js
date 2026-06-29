// ===================== config =====================
// 步骤状态服务（与 inmoCustomCall 同一后端域名）。
const API_BASE = "https://websocket-token-f3dgg6hzgsf4cbcz.koreasouth-01.azurewebsites.net";
const STEP_STATUS_URL = `${API_BASE}/api/step/status`;

// 模拟模式：true 时上报仅在本地构造同构返回（不请求后端，不会报错/卡加载）；
// 接入真实后端时改为 false 即走 POST /api/step/status。
const SIMULATE = true;

// 服务端只有「更新」无「查询」接口，故进度数据由前端本地累加：
// 每次 POST /api/step/status 成功后，用返回的 data 按 step_no upsert 到本地。
const VALID_STATUS = ["pending", "in_progress", "complete", "error"];

// ===================== local store =====================
function getOptionsFromLocal() {
  return JSON.parse(localStorage.getItem("__options")) || {};
}
function setOptionsToLocal(option) {
  const local = getOptionsFromLocal();
  localStorage.setItem("__options", JSON.stringify({ ...local, ...option }));
}

// ===================== i18n =====================
const I18N = {
  "zh-CN": {
    title: "步骤监控",
    live: "实时",
    remoteAssist: "远程协助",
    stream: "作业流",
    footerNote: "数据按 step_no 实时累加 · 仅本地展示",
    report: "上报状态",
    clear: "清空",
    overallProgress: "总体进度（已完成 / 总数）",
    statusPending: "待处理",
    statusInProgress: "进行中",
    statusComplete: "已完成",
    statusError: "异常",
    statusUnknown: "未知",
    emptyText: "暂无步骤上报，点击「上报状态」模拟现场上报",
    reportTitle: "上报步骤状态",
    fieldStepNo: "步骤号 step_no",
    fieldStatus: "状态 step_status",
    fieldImage: "现场图片 image（可选）",
    chooseFile: "选择文件",
    noFileChosen: "未选择文件",
    phStepNo: "请输入步骤号，如 1",
    imageHint: "仅上传至服务端用于记录，本页只展示返回的路径，不渲染图片。",
    submit: "提交上报",
    submitting: "提交中…",
    cancel: "取消",
    noImage: "无现场图",
    needStepNo: "请填写步骤号",
    badStepNo: "步骤号需为正整数",
    reportSuccess: "步骤状态更新成功",
    reportFailed: "上报失败，请检查网络或参数",
    cleared: "已清空看板",
    confirmClear: "确认清空当前看板？（仅清除本地展示，不影响服务端）",
    justNow: "刚刚",
    secondsAgo: "秒前",
    minutesAgo: "分钟前",
    hoursAgo: "小时前",
    daysAgo: "天前",
    detailTitle: "步骤详情",
    detailKeyPoints: "关键要点",
    detailReference: "手册出处",
    detailNoContent: "该步骤暂无详情说明（详情仅覆盖手册标准流程步骤 1–7）",
    viewDetail: "查看详情",
    safetyDanger: "危险",
    safetyWarning: "警告",
    safetyCaution: "注意",
    safetyNotice: "提示",
    workOrders: "工单",
    workOrdersSub: "现场作业工单",
    snLabel: "序列号",
    locationLabel: "位置",
    assigneeLabel: "负责人",
    updatedLabel: "更新于",
    backToList: "返回工单",
    ordersEmpty: "暂无工单",
    devBrakeResistor: "制动电阻",
  },
  en: {
    title: "Step Monitor",
    live: "Live",
    remoteAssist: "Remote Assistance",
    stream: "Operation stream",
    footerNote: "Accumulated by step_no in real time · local view only",
    report: "Report",
    clear: "Clear",
    overallProgress: "Overall progress (completed / total)",
    statusPending: "Pending",
    statusInProgress: "In progress",
    statusComplete: "Complete",
    statusError: "Error",
    statusUnknown: "Unknown",
    emptyText: "No steps reported yet. Click “Report” to simulate a field report.",
    reportTitle: "Report step status",
    fieldStepNo: "Step No. (step_no)",
    fieldStatus: "Status (step_status)",
    fieldImage: "On-site image (optional)",
    chooseFile: "Choose file",
    noFileChosen: "No file chosen",
    phStepNo: "Enter step number, e.g. 1",
    imageHint: "Uploaded to the server for record only; this page shows the returned path, not the image.",
    submit: "Submit",
    submitting: "Submitting…",
    cancel: "Cancel",
    noImage: "No image",
    needStepNo: "Please enter the step number",
    badStepNo: "Step number must be a positive integer",
    reportSuccess: "Step status updated",
    reportFailed: "Report failed. Check network or parameters",
    cleared: "Board cleared",
    confirmClear: "Clear the current board? (local view only, server unaffected)",
    justNow: "just now",
    secondsAgo: "s ago",
    minutesAgo: "m ago",
    hoursAgo: "h ago",
    daysAgo: "d ago",
    detailTitle: "Step details",
    detailKeyPoints: "Key points",
    detailReference: "Manual reference",
    detailNoContent: "No details for this step (details cover standard procedure steps 1–7 only).",
    viewDetail: "View details",
    safetyDanger: "Danger",
    safetyWarning: "Warning",
    safetyCaution: "Caution",
    safetyNotice: "Notice",
    workOrders: "Work Orders",
    workOrdersSub: "Field operation orders",
    snLabel: "S/N",
    locationLabel: "Location",
    assigneeLabel: "Assignee",
    updatedLabel: "Updated",
    backToList: "Orders",
    ordersEmpty: "No work orders",
    devBrakeResistor: "Brake resistor",
  },
};

function getLang() {
  const saved = getOptionsFromLocal().language;
  if (saved === "en" || saved === "zh-CN") return saved;
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}
function applyI18n() {
  const lang = getLang();
  const dict = I18N[lang] || I18N.en;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = dict[key];
    if (text == null) return;
    const attrs = el.getAttribute("data-i18n-attr");
    if (attrs) {
      attrs.split(",").forEach((a) => el.setAttribute(a.trim(), text));
    } else {
      el.textContent = text;
    }
  });
  $("#lang-select").val(lang);
}
function setLang(lang) {
  setOptionsToLocal({ language: lang });
  applyI18n();
  refreshFileName();
  if (currentDetailStep != null) populateDetail();
  if (currentOrderId) render();
  else renderOrders();
}

// 自定义文件选择控件的文件名回显（替代浏览器原生、随浏览器语言的按钮文案）。
function refreshFileName() {
  const input = document.getElementById("f-image");
  const nameEl = document.getElementById("f-image-name");
  if (!input || !nameEl) return;
  const file = input.files && input.files[0];
  if (file) {
    nameEl.textContent = file.name;
    nameEl.classList.add("has-file");
  } else {
    nameEl.textContent = t("noFileChosen");
    nameEl.classList.remove("has-file");
  }
}

// ===================== helpers =====================
function escapeHTML(unsafeText) {
  const elem = document.createElement("div");
  elem.innerText = unsafeText == null ? "" : String(unsafeText);
  return elem.innerHTML;
}

let _toastTimer = null;
function showToast(text, type) {
  const host = document.getElementById("toast-host");
  if (!host) return;
  host.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      <div>${escapeHTML(text)}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    const btn = host.querySelector(".btn-close");
    if (btn) btn.click();
  }, 3000);
}
const message = {
  success: (m) => showToast(m, "success"),
  error: (m) => showToast(m, "danger"),
  warning: (m) => showToast(m, "warning"),
  info: (m) => showToast(m, "info"),
};

function normalizeStatus(s) {
  return VALID_STATUS.includes(s) ? s : "unknown";
}
function statusLabel(s) {
  const map = {
    pending: "statusPending",
    in_progress: "statusInProgress",
    complete: "statusComplete",
    error: "statusError",
    unknown: "statusUnknown",
  };
  return t(map[s] || "statusUnknown");
}

// 相对时间：基于 update_time（ISO）与当前时刻。
function formatRelative(iso) {
  const ts = Date.parse(iso);
  if (isNaN(ts)) return "";
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return t("justNow");
  if (sec < 60) return `${sec} ${t("secondsAgo")}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${t("minutesAgo")}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t("hoursAgo")}`;
  return `${Math.floor(hr / 24)} ${t("daysAgo")}`;
}
function formatAbsolute(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return escapeHTML(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ===================== state =====================
// 工单模型：每张工单持有独立的步骤集合，按 (工单, step_no) 隔离，
// 避免多设备并发上报时同一 step_no 互相覆盖。
// WorkOrder = { id, no, device:{type, model, sn}, location, assignee, created, updated,
//               steps: Map<step_no, { step_no, step_status, image_path, update_time }> }
const workOrders = new Map();
let currentOrderId = null;

function getCurrentOrder() {
  return currentOrderId ? workOrders.get(currentOrderId) : null;
}

// 工单汇总状态：有 error→error；有步骤且全部 complete→complete；有进行/完成→in_progress；否则 pending。
function orderRollupStatus(order) {
  const tpl = DEVICE_TYPES[order.device.type];
  const total = (tpl && tpl.stepCount) || order.steps.size;
  const counts = { pending: 0, in_progress: 0, complete: 0, error: 0 };
  order.steps.forEach((s) => {
    const k = normalizeStatus(s.step_status);
    if (counts[k] != null) counts[k] += 1;
  });
  if (counts.error) return "error";
  if (total > 0 && counts.complete >= total) return "complete";
  if (counts.in_progress || counts.complete) return "in_progress";
  return "pending";
}

// 工单进度：已完成 / 模板总步数。
function orderProgress(order) {
  const tpl = DEVICE_TYPES[order.device.type];
  const total = (tpl && tpl.stepCount) || order.steps.size || 0;
  let done = 0;
  order.steps.forEach((s) => {
    if (normalizeStatus(s.step_status) === "complete") done += 1;
  });
  return { done, total };
}

// 工单最近更新时间：取所有步骤最新 update_time，否则用 created。
function orderUpdatedTime(order) {
  let latest = order.created;
  order.steps.forEach((s) => {
    if (s.update_time && (!latest || Date.parse(s.update_time) > Date.parse(latest))) {
      latest = s.update_time;
    }
  });
  return latest;
}

// 上报数据 upsert 到「当前工单」的步骤集合。
//   POST /api/step/status -> { step_no, step_status, image_path, update_time }
//   WS "step_update"       -> { step_no, step_status, image_url,  timestamp  }
function upsertStep(data) {
  const order = getCurrentOrder();
  if (!order || !data || data.step_no == null) return;
  const key = String(data.step_no);
  order.steps.set(key, {
    step_no: key,
    step_status: data.step_status,
    image_path: data.image_path || data.image_url || null,
    update_time: data.update_time || data.timestamp || new Date().toISOString(),
  });
  order.updated = new Date().toISOString();
}

// ===================== procedure catalog =====================
// 设备类型注册表：新增设备类型只需在此登记，并在 PROCEDURE_TEMPLATES 加一套同构模板。
// stepCount 用于工单进度分母。
const DEVICE_TYPES = {
  brake_resistor: { labelKey: "devBrakeResistor", template: "brake_resistor", stepCount: 7 },
};

// 设备类型 → 流程模板库。按 step_no 映射，内容提炼自 ABB《SACE/SAFUR/JBR 制动电阻器硬件手册》
// (3AXD50001283780 Rev A)。后端不返回详情，由前端按当前工单的设备类型叠加展示；未命中显示「暂无详情」。
// safety 取手册危险分级：danger / warning / caution / notice / none。
const PROCEDURE_TEMPLATES = {
  brake_resistor: {
  "1": {
    safety: "warning",
    "zh-CN": {
      title: "电气安全预防措施",
      ref: "第 1 章 · 第 8 页",
      summary: "所有安装与维护作业前必须执行的电气安全流程。",
      points: [
        "备工：确认工单，做现场风险评估，备齐正确工具，确保人员合格，选好个人防护装备(PPE)，停止驱动与电机。",
        "明确标识作业位置与设备。",
        "断开所有可能的电压源并锁定挂牌；断电后等待 5 分钟让中间回路电容放电。",
        "防护作业区内其它带电部件，靠近裸导体时格外小心。",
        "用高质量验电器确认已断电：输入端 L1/L2/L3、输出端 U/V/W、直流端 UDC+/UDC- 对 PE 的电压均为零。",
        "按当地法规安装临时接地。",
        "向电气作业负责人申请作业许可。",
      ],
    },
    en: {
      title: "Electrical safety precautions",
      ref: "Ch.1 · p.8",
      summary: "Mandatory electrical safety sequence before any installation or maintenance work.",
      points: [
        "Prepare: confirm the work order, do an on-site risk assessment, get the correct tools, make sure workers are qualified, select PPE, and stop the drive and motor(s).",
        "Clearly identify the work location and equipment.",
        "Disconnect all possible voltage sources, lock out and tag out; after disconnecting, wait 5 minutes for the DC-link capacitors to discharge.",
        "Protect other energized parts in the area; take special care near bare conductors.",
        "Verify de-energized with a quality voltage tester: voltage to PE is zero at input L1/L2/L3, output U/V/W, and DC UDC+/UDC-.",
        "Install temporary grounding as required by local regulations.",
        "Ask the responsible person for a work permit.",
      ],
    },
  },
  "2": {
    safety: "warning",
    "zh-CN": {
      title: "放置制动电阻",
      ref: "第 4 章 · 第 15 页",
      summary: "将制动电阻安装在驱动器外、能良好散热的位置。",
      points: [
        "安装在驱动器外部、可冷却的位置。",
        "合理安排散热：不得对电阻或周边材料造成过热危险；所在房间温度不超过允许上限。",
        "按电阻厂家说明提供冷却风/水。",
        "电阻周围材料必须为不可燃材料；电阻表面温度可达数百摄氏度。",
        "若排气接入通风系统，材料须耐高温；并防止接触电阻。",
      ],
    },
    en: {
      title: "Placing the brake resistor",
      ref: "Ch.4 · p.15",
      summary: "Mount the brake resistor outside the drive where it can cool.",
      points: [
        "Install outside the drive in a place where it will cool.",
        "Arrange cooling so there is no overheating risk to the resistor or nearby materials, and the room temperature stays within the allowed maximum.",
        "Supply cooling air/water per the resistor manufacturer's instructions.",
        "Materials near the resistor must be non-flammable; the surface temperature can reach hundreds of °C.",
        "If exhaust vents connect to a ventilation system, the material must withstand high temperature; protect the resistor against contact.",
      ],
    },
  },
  "3": {
    safety: "notice",
    "zh-CN": {
      title: "安装净空",
      ref: "第 4 章 · 第 16–20 页",
      summary: "按电阻型号预留安装净空 (X / Y / Z)。",
      points: [
        "SACE 型 (08 RE 44 / 15 RE 13 / 15 RE 22)：X 150 / Y 150 / Z 300 mm。",
        "SAFUR 型 (80F500 / 90F575 / 125F500 / 200F500)：X 40 / Y 40 / Z 300 mm。",
        "JBR 型 (CAR 155/200、CBR-V 210)：X 200 / Y 200 / Z 200 mm。",
        "SAFUR 专为 ACS880-BRR 机柜集成设计，需主动冷却 (W2E250-HL06-21 风机，1275 m³/h @ 90 Pa)。",
      ],
    },
    en: {
      title: "Free space / clearance",
      ref: "Ch.4 · p.16–20",
      summary: "Reserve mounting clearance (X / Y / Z) per resistor type.",
      points: [
        "SACE (08 RE 44 / 15 RE 13 / 15 RE 22): X 150 / Y 150 / Z 300 mm.",
        "SAFUR (80F500 / 90F575 / 125F500 / 200F500): X 40 / Y 40 / Z 300 mm.",
        "JBR (CAR 155/200, CBR-V 210): X 200 / Y 200 / Z 200 mm.",
        "SAFUR is designed for ACS880-BRR cabinet integration and needs active cooling (W2E250-HL06-21 fan, 1275 m³/h @ 90 Pa).",
      ],
    },
  },
  "4": {
    safety: "warning",
    "zh-CN": {
      title: "测量绝缘电阻",
      ref: "第 5 章 · 第 21 页",
      summary: "接线前测量制动电阻回路的绝缘电阻。",
      points: [
        "停止驱动，先执行「电气安全预防措施」(步骤 1)。",
        "确认电阻线已接到电阻、且已从驱动输出端断开。",
        "在驱动侧将电阻线 R+ 与 R- 短接。",
        "用 1000 V DC 测量导体与 PE 之间的绝缘电阻。",
        "绝缘电阻必须大于 1 MΩ。",
      ],
    },
    en: {
      title: "Measure insulation resistance",
      ref: "Ch.5 · p.21",
      summary: "Measure the insulation resistance of the brake resistor circuit before wiring.",
      points: [
        "Stop the drive and first do \"Electrical safety precautions\" (Step 1).",
        "Make sure the resistor cable is connected to the resistor and disconnected from the drive output terminals.",
        "At the drive end, connect R+ and R- together.",
        "Measure the insulation resistance between the conductors and PE at 1000 V DC.",
        "The insulation resistance must be more than 1 MΩ.",
      ],
    },
  },
  "5": {
    safety: "notice",
    "zh-CN": {
      title: "故障保护",
      ref: "第 5 章 · 第 22–23 页",
      summary: "配置制动回路的短路与热过载保护。",
      points: [
        "当电阻线与输入电源线相同时，驱动输入熔断器同时保护电阻线。",
        "在启动时启用驱动的制动热模型。",
        "即使已启用热模型，ABB 建议加装主接触器并接线，使电阻过热时断开（斩波器故障导通时驱动无法自行切断主供电）。",
        "建议使用内置热开关(1)的电阻；将热开关接到驱动数字输入，过热指示时触发故障跳闸。",
      ],
    },
    en: {
      title: "Fault protection",
      ref: "Ch.5 · p.22–23",
      summary: "Configure short-circuit and thermal-overload protection for the brake circuit.",
      points: [
        "When the resistor cable is identical to the input power cable, the drive input fuses also protect it.",
        "Enable the drive's brake thermal model at start-up.",
        "Even with the thermal model enabled, ABB recommends a main contactor wired to open if the resistor overheats (the drive cannot otherwise cut the main supply if the chopper stays conductive in a fault).",
        "Use a resistor with an internal thermal switch (1); wire it to a drive digital input to trip a fault on overtemperature.",
      ],
    },
  },
  "6": {
    safety: "none",
    "zh-CN": {
      title: "接线步骤",
      ref: "第 5 章 · 第 24 页",
      summary: "将制动电阻接到驱动器端子并接好热开关。",
      points: [
        "将电阻线接到驱动器的 R+ 和 R- 端子。",
        "若使用屏蔽三芯线：剪断第三芯，并在两端将绞合屏蔽（电阻组件的保护接地）接地。",
        "将热开关接到驱动控制单元的数字输入。",
      ],
    },
    en: {
      title: "Connection procedure",
      ref: "Ch.5 · p.24",
      summary: "Connect the brake resistor to the drive terminals and wire the thermal switch.",
      points: [
        "Connect the resistor cables to the drive's R+ and R- terminals.",
        "If a shielded three-conductor cable is used, cut the third conductor and ground the twisted shield (the resistor assembly's PE conductor) at both ends.",
        "Wire the thermal switch to a digital input on the drive control unit.",
      ],
    },
  },
  "7": {
    safety: "warning",
    "zh-CN": {
      title: "启动",
      ref: "第 6 章 · 第 25 页",
      summary: "上电启动并完成制动相关参数设置。",
      points: [
        "确保通风充足。",
        "新电阻可能带有保护性油脂涂层，首次升温时油脂烧除会冒烟，属正常现象。",
        "制动相关参数设置请参见驱动硬件与固件手册。",
        "若通过参数禁用制动斩波器，必须同时断开电阻线，否则有电阻过热损坏的风险。",
      ],
    },
    en: {
      title: "Start-up",
      ref: "Ch.6 · p.25",
      summary: "Power up and complete the brake-related parameter settings.",
      points: [
        "Make sure there is sufficient ventilation.",
        "New resistors may have a protective grease coating; on first warm-up the grease burns off and can cause some smoke (normal).",
        "For brake-related parameter settings, refer to the drive hardware and firmware manuals.",
        "If you disable the brake chopper by parameter, also disconnect the resistor cable, otherwise there is a risk of resistor overheating and damage.",
      ],
    },
  },
  },
};

function getProcedure(stepNo) {
  const order = getCurrentOrder();
  const typeKey = order && order.device ? order.device.type : null;
  const tplName = (DEVICE_TYPES[typeKey] && DEVICE_TYPES[typeKey].template) || null;
  const tpl = tplName ? PROCEDURE_TEMPLATES[tplName] : null;
  const p = tpl ? tpl[String(stepNo)] : null;
  if (!p) return null;
  const lang = getLang();
  return { safety: p.safety, ...(p[lang] || p.en) };
}

// ===================== detail drawer =====================
let currentDetailStep = null;

function populateDetail() {
  if (currentDetailStep == null) return;
  document.getElementById("detail-step-no").textContent = currentDetailStep;

  const proc = getProcedure(currentDetailStep);
  const content = document.getElementById("detail-content");
  const emptyEl = document.getElementById("detail-empty");

  if (!proc) {
    content.style.display = "none";
    emptyEl.style.display = "";
    return;
  }
  content.style.display = "";
  emptyEl.style.display = "none";

  const sev = document.getElementById("detail-safety");
  if (proc.safety && proc.safety !== "none") {
    const labelMap = {
      danger: "safetyDanger",
      warning: "safetyWarning",
      caution: "safetyCaution",
      notice: "safetyNotice",
    };
    sev.style.display = "";
    sev.className = `safety-badge sev-${proc.safety}`;
    sev.textContent = t(labelMap[proc.safety] || "safetyNotice");
  } else {
    sev.style.display = "none";
  }

  document.getElementById("detail-title").textContent = proc.title;
  document.getElementById("detail-summary").textContent = proc.summary;
  document.getElementById("detail-points").innerHTML = proc.points
    .map((p) => `<li>${escapeHTML(p)}</li>`)
    .join("");
  document.getElementById("detail-ref").textContent = proc.ref;
}

function openDetail(stepNo) {
  currentDetailStep = String(stepNo);
  populateDetail();
  document.getElementById("detail-drawer").classList.add("open");
  document.getElementById("detail-backdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeDetail() {
  currentDetailStep = null;
  document.getElementById("detail-drawer").classList.remove("open");
  document.getElementById("detail-backdrop").classList.remove("open");
  document.body.style.overflow = "";
}

// ===================== render =====================
function render() {
  const order = getCurrentOrder();
  const list = document.getElementById("step-list");
  const empty = document.getElementById("empty-state");

  renderOrderBar(order);

  const stepsMap = order ? order.steps : new Map();
  const items = Array.from(stepsMap.values()).sort(
    (a, b) => Number(a.step_no) - Number(b.step_no),
  );

  // 已上报步骤按状态统计
  const counts = { pending: 0, in_progress: 0, complete: 0, error: 0 };
  items.forEach((it) => {
    const s = normalizeStatus(it.step_status);
    if (counts[s] != null) counts[s] += 1;
  });

  // 进度按设备模板总步数计（未上报的步骤计为待处理）；无模板时退化为已上报数。
  const tpl = order ? DEVICE_TYPES[order.device.type] : null;
  const total = Math.max((tpl && tpl.stepCount) || 0, items.length);
  counts.pending += Math.max(0, total - items.length);
  const done = counts.complete;
  document.getElementById("progress-text").textContent = `${done} / ${total}`;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById("progress-bar");
  bar.style.width = `${pct}%`;
  bar.setAttribute("aria-valuenow", String(pct));
  VALID_STATUS.forEach((s) => {
    document.getElementById(`count-${s}`).textContent = String(counts[s]);
  });

  // 作业流空态：以"是否有上报"判断（即便模板有 7 步，0 上报也显示空态）
  if (!items.length) {
    empty.classList.remove("hide");
    list.innerHTML = "";
    return;
  }
  empty.classList.add("hide");

  list.innerHTML = items
    .map((it) => {
      const s = normalizeStatus(it.step_status);
      const img = it.image_path
        ? `<div class="step-image" title="${escapeHTML(it.image_path)}">
             <span>&#128206;</span><span class="path">${escapeHTML(it.image_path)}</span>
           </div>`
        : `<div class="step-image none"><span>&#9898;</span><span>${escapeHTML(t("noImage"))}</span></div>`;
      return `
        <div class="step-card s-${s}" data-step="${escapeHTML(it.step_no)}"
             role="button" tabindex="0" title="${escapeHTML(t("viewDetail"))}">
          <div class="step-no">${escapeHTML(it.step_no)}<small>STEP</small></div>
          <div class="step-main">
            <span class="status-badge"><i class="dot"></i>${escapeHTML(statusLabel(s))}</span>
            ${img}
          </div>
          <div class="step-time">
            ${escapeHTML(formatRelative(it.update_time))}
            <span class="abs">${escapeHTML(formatAbsolute(it.update_time))}</span>
          </div>
          <div class="step-chevron" aria-hidden="true">&#8250;</div>
        </div>`;
    })
    .join("");
}

// 每 20s 刷新相对时间显示（仅在监控视图且当前工单有步骤时）。
setInterval(() => {
  const o = getCurrentOrder();
  if (o && o.steps.size) render();
}, 20000);

// ===================== work-order views =====================
// 启动时 seed 几张本地模拟工单（前端 mock；接后端后由接口替换）。
function seedWorkOrders() {
  const now = Date.now();
  const iso = (offsetMin) => new Date(now - offsetMin * 60000).toISOString();
  const defs = [
    {
      id: "wo-1024", no: "WO-1024",
      device: { type: "brake_resistor", model: "SACE 15 RE 13", sn: "SN-2406-0087" },
      location: "车间 A · 1#驱动柜", assignee: "张工",
      created: iso(180),
      steps: [
        { step_no: "1", step_status: "complete", image_path: "uploads/step1.jpg", update_time: iso(150) },
        { step_no: "2", step_status: "complete", image_path: null, update_time: iso(120) },
        { step_no: "3", step_status: "in_progress", image_path: null, update_time: iso(20) },
      ],
    },
    {
      id: "wo-1025", no: "WO-1025",
      device: { type: "brake_resistor", model: "SAFUR 125F500", sn: "SN-2406-0091" },
      location: "车间 B · ACS880-BRR 机柜2", assignee: "李工",
      created: iso(90),
      steps: [],
    },
    {
      id: "wo-1026", no: "WO-1026",
      device: { type: "brake_resistor", model: "JBR CAR 155 DT 414 120R", sn: "SN-2405-0042" },
      location: "总装线 · 3#工位", assignee: "王工",
      created: iso(300),
      steps: [
        { step_no: "1", step_status: "complete", image_path: null, update_time: iso(260) },
        { step_no: "4", step_status: "error", image_path: "uploads/insulation.jpg", update_time: iso(40) },
      ],
    },
  ];
  defs.forEach((d) => {
    const stepsMap = new Map();
    d.steps.forEach((s) => stepsMap.set(String(s.step_no), s));
    workOrders.set(d.id, {
      id: d.id, no: d.no, device: d.device, location: d.location,
      assignee: d.assignee, created: d.created, updated: d.created, steps: stepsMap,
    });
  });
}

// 设备类型本地化标签 + 型号。
function deviceLabel(order) {
  const tpl = DEVICE_TYPES[order.device.type];
  const typeName = tpl ? t(tpl.labelKey) : order.device.type;
  return `${typeName} · ${order.device.model}`;
}

// 渲染工单列表视图。
function renderOrders() {
  const list = document.getElementById("order-list");
  const empty = document.getElementById("orders-empty");
  const orders = Array.from(workOrders.values());
  if (!orders.length) {
    empty.classList.remove("hide");
    list.innerHTML = "";
    return;
  }
  empty.classList.add("hide");

  list.innerHTML = orders
    .map((o) => {
      const st = orderRollupStatus(o);
      const { done, total } = orderProgress(o);
      const pct = total ? Math.round((done / total) * 100) : 0;
      const updated = orderUpdatedTime(o);
      return `
        <div class="order-card s-${st}" data-order="${escapeHTML(o.id)}"
             role="button" tabindex="0" title="${escapeHTML(o.no)}">
          <div class="order-card-head">
            <span class="order-no">${escapeHTML(o.no)}</span>
            <span class="status-badge s-${st}"><i class="dot"></i>${escapeHTML(statusLabel(st))}</span>
          </div>
          <div class="order-device">${escapeHTML(deviceLabel(o))}</div>
          <div class="order-meta">
            <span><b>${escapeHTML(t("snLabel"))}</b> ${escapeHTML(o.device.sn)}</span>
            <span><b>${escapeHTML(t("locationLabel"))}</b> ${escapeHTML(o.location)}</span>
            <span><b>${escapeHTML(t("assigneeLabel"))}</b> ${escapeHTML(o.assignee)}</span>
          </div>
          <div class="order-progress-line">
            <span class="order-progress-text">${done} / ${total}</span>
            <div class="order-progress-track"><div class="order-progress-bar" style="width:${pct}%"></div></div>
          </div>
          <div class="order-foot">
            <span>${escapeHTML(t("updatedLabel"))} ${escapeHTML(formatRelative(updated))}</span>
            <span class="order-enter" aria-hidden="true">&#8250;</span>
          </div>
        </div>`;
    })
    .join("");
}

// 渲染监控视图顶部的工单信息条。
function renderOrderBar(order) {
  const bar = document.getElementById("order-bar");
  if (!bar) return;
  if (!order) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "";
  const st = orderRollupStatus(order);
  document.getElementById("ob-no").textContent = order.no;
  document.getElementById("ob-device").textContent = deviceLabel(order);
  document.getElementById("ob-meta").textContent =
    `${order.device.sn} · ${order.location} · ${order.assignee}`;
  const badge = document.getElementById("ob-status");
  badge.className = `status-badge s-${st}`;
  badge.innerHTML = `<i class="dot"></i>${escapeHTML(statusLabel(st))}`;
}

// ===================== hash router =====================
// #orders（默认）→ 工单列表；#order/<id> → 该工单的步骤监控。
function route() {
  const hash = location.hash || "#orders";
  const m = hash.match(/^#order\/(.+)$/);
  const viewOrders = document.getElementById("view-orders");
  const viewMonitor = document.getElementById("view-monitor");
  const shell = document.getElementById("app-shell");

  if (m && workOrders.has(m[1])) {
    currentOrderId = m[1];
    if (currentDetailStep != null) closeDetail();
    shell.dataset.view = "monitor";
    viewOrders.style.display = "none";
    viewMonitor.style.display = "";
    render();
  } else {
    currentOrderId = null;
    if (currentDetailStep != null) closeDetail();
    shell.dataset.view = "orders";
    viewMonitor.style.display = "none";
    viewOrders.style.display = "";
    renderOrders();
  }
  window.scrollTo(0, 0);
}

function goToOrder(id) {
  location.hash = `#order/${id}`;
}
function goToOrders() {
  location.hash = "#orders";
}

// ===================== report (POST) =====================
async function submitReport() {
  const stepNo = $("#f-step-no").val().trim();
  const status = $("#f-step-status").val();
  const fileInput = document.getElementById("f-image");
  const file = fileInput.files && fileInput.files[0];

  if (!stepNo) {
    message.warning(t("needStepNo"));
    return;
  }
  if (!/^\d+$/.test(stepNo) || Number(stepNo) <= 0) {
    message.warning(t("badStepNo"));
    return;
  }

  const $btn = $("#submit-report");
  $btn.attr("disabled", true).text(t("submitting"));

  const fd = new FormData();
  fd.append("step_no", stepNo);
  fd.append("step_status", status);
  if (file) fd.append("image", file);

  try {
    const resp = SIMULATE
      ? {
          code: 200,
          msg: t("reportSuccess"),
          data: {
            step_no: stepNo,
            step_status: status,
            image_path: file ? `uploads/${file.name}` : null,
            update_time: new Date().toISOString(),
          },
        }
      : await fetch(STEP_STATUS_URL, { method: "POST", body: fd }).then((r) => r.json());
    if (!resp || resp.code !== 200 || !resp.data) {
      throw new Error((resp && resp.msg) || t("reportFailed"));
    }
    upsertStep(resp.data);
    render();
    message.success(resp.msg || t("reportSuccess"));

    const modalEl = document.getElementById("report-modal");
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.hide();
    fileInput.value = "";
    refreshFileName();
  } catch (err) {
    console.error(err);
    message.error(err.message || t("reportFailed"));
  } finally {
    $btn.attr("disabled", false).text(t("submit"));
  }
}

// ===================== init =====================
$(function () {
  seedWorkOrders();
  applyI18n();
  refreshFileName();
  route();

  window.addEventListener("hashchange", route);

  $("#submit-report").click(submitReport);
  $("#f-image").change(refreshFileName);

  // 工单列表：点击/键盘进入该工单的步骤监控（事件委托）。
  $("#order-list").on("click", ".order-card", function () {
    goToOrder($(this).attr("data-order"));
  });
  $("#order-list").on("keydown", ".order-card", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goToOrder($(this).attr("data-order"));
    }
  });

  // 返回工单列表。
  $("#back-to-orders").click(goToOrders);

  // 点击/键盘打开步骤详情抽屉（事件委托，兼容每次 render 重建卡片）。
  $("#step-list").on("click", ".step-card", function () {
    openDetail($(this).attr("data-step"));
  });
  $("#step-list").on("keydown", ".step-card", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail($(this).attr("data-step"));
    }
  });
  $("#detail-close").click(closeDetail);
  $("#detail-backdrop").click(closeDetail);
  $(document).on("keydown", function (e) {
    if (e.key === "Escape" && currentDetailStep != null) closeDetail();
  });

  $("#clear-all").click(function () {
    const order = getCurrentOrder();
    if (!order || !order.steps.size) return;
    if (!window.confirm(t("confirmClear"))) return;
    order.steps.clear();
    order.updated = new Date().toISOString();
    render();
    message.info(t("cleared"));
  });

  $("#lang-select").change(function () {
    setLang(this.value === "en" ? "en" : "zh-CN");
  });
});
