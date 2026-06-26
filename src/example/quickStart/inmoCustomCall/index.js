AgoraRTC.enableLogUpload();

// ===================== self-contained helpers =====================
// 本页面独立于全局 setup 流程：不引入 common/utils.js 与 left-menu.js，
// 因此把所需的少量工具函数内置于此，避免被全局 appid 校验强制跳转。

const BASE_URL = "https://service-staging.agora.io/toolbox"; // token 服务（dev/staging）
const TOKEN_URL =
  "https://websocket-token-f3dgg6hzgsf4cbcz.koreasouth-01.azurewebsites.net/api/token/get"; // 页面级 token 服务

// 默认 App ID / App Certificate（未手动设置时使用）
const DEFAULT_APPID = "b1f05c421c3c4390aadee9b48d782c7c";
const DEFAULT_CERTIFICATE = "0941681280474b8481322ad237c170d6";

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
    language: "语言",
    localView: "本地画面",
    local: "本地",
    settings: "设置",
    close: "关闭",
    join: "加入",
    leave: "离开",
    video: "视频",
    audio: "音频",
    enable: "开启",
    disable: "关闭",
    cancel: "取消",
    save: "保存",
    appCertificate: "App Certificate（可选）",
    userId: "User ID（可选）",
    tokenLabel: "Token（可选）",
    phAppId: "请输入 App ID",
    phAppCertificate: "请输入 App Certificate",
    phChannel: "请输入频道名",
    phUserId: "请输入用户 ID",
    phToken: "请输入 Token",
    placeholderNotJoined: "未加入频道，点击「加入」开始通话",
    placeholderJoined: "已加入频道，等待远端用户…",
    settingsSaved: "设置已保存",
    needAppId: "请先在「设置」中填写 App ID",
    needChannel: "请先在「设置」中填写 Channel",
    joinSuccess: "加入频道成功",
    tokenError: "Token 错误，请检查 Token 参数",
    joinFailed: "加入频道失败",
    leftChannel: "已离开频道",
    genTokenFailed: "生成 Token 失败，请检查 App ID 与 App Certificate",
    getTokenFailed: "获取 Token 失败",
  },
  en: {
    language: "Language",
    localView: "Local view",
    local: "Local",
    settings: "Settings",
    close: "Close",
    join: "Join",
    leave: "Leave",
    video: "Video",
    audio: "Audio",
    enable: "Enable",
    disable: "Disable",
    cancel: "Cancel",
    save: "Save",
    appCertificate: "App Certificate (optional)",
    userId: "User ID (optional)",
    tokenLabel: "Token (optional)",
    phAppId: "Enter App ID",
    phAppCertificate: "Enter App Certificate",
    phChannel: "Enter channel name",
    phUserId: "Enter user ID",
    phToken: "Enter token",
    placeholderNotJoined: "Not joined. Click “Join” to start the call",
    placeholderJoined: "Joined the channel, waiting for remote users…",
    settingsSaved: "Settings saved",
    needAppId: "Please fill in App ID in Settings first",
    needChannel: "Please fill in Channel in Settings first",
    joinSuccess: "Joined the channel successfully",
    tokenError: "Invalid token, please check the Token",
    joinFailed: "Failed to join the channel",
    leftChannel: "Left the channel",
    genTokenFailed: "Failed to generate token, please check App ID and App Certificate",
    getTokenFailed: "Failed to fetch token",
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
  options = { ...options, language: lang };
  applyI18n();
  refreshPlaceholder();
}

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
  success: (t) => showToast(t, "success"),
  error: (t) => showToast(t, "danger"),
  warning: (t) => showToast(t, "warning"),
  info: (t) => showToast(t, "info"),
};

// 通过 appid + certificate 请求 token 服务生成 token（仅 demo 用途）
async function agoraGetAppData(config) {
  const { uid, channel, appid, certificate } = config;
  if (!certificate) return null;
  const data = {
    appId: appid,
    appCertificate: certificate,
    channelName: channel,
    expire: 7200,
    src: "web",
    types: [1, 2],
    uid: uid,
  };
  const resp =
    (await fetch(`${BASE_URL}/v2/token/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json())) || {};
  if (resp.code != 0) {
    const msg = t("genTokenFailed");
    message.error(msg);
    throw new Error(msg);
  }
  return (resp.data || {}).token;
}

// 页面加载时从 token 服务拉取 token，并写入设置（localStorage + 表单）
async function fetchAndApplyToken() {
  try {
    const resp = await fetch(TOKEN_URL).then((r) => r.json());
    if (resp.code !== 200 || !resp.data || !resp.data.token) {
      throw new Error(resp.msg || t("getTokenFailed"));
    }
    const token = resp.data.token;
    setOptionsToLocal({ token });
    options = { ...options, token };
    $("#token").val(token);
  } catch (err) {
    console.error(err);
    message.error(err.message || t("getTokenFailed"));
  }
}

// ===================== state =====================
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const localTracks = { videoTrack: null, audioTrack: null };
let remoteUsers = {};
let options = { ...getOptionsFromLocal() };
let localVisible = false; // 本地画面默认隐藏
let joined = false;

const localTrackState = { videoTrackEnabled: true, audioTrackEnabled: true };

// ===================== settings =====================
function fillSettingsForm() {
  const o = getOptionsFromLocal();
  $("#appid").val(o.appid || DEFAULT_APPID);
  $("#certificate").val(o.certificate || DEFAULT_CERTIFICATE);
  $("#channel").val(o.channel || "");
  $("#uid").val(o.uid || "");
  $("#token").val(o.token || "");
}

$("#save-settings").click(function () {
  const next = {
    appid: escapeHTML($("#appid").val().trim()),
    certificate: escapeHTML($("#certificate").val().trim()),
    channel: $("#channel").val().trim(),
    uid: $("#uid").val().trim(),
    token: $("#token").val().trim(),
  };
  setOptionsToLocal(next);
  options = { ...options, ...next };
  message.success(t("settingsSaved"));
});

// ===================== local view toggle =====================
$("#toggle-local").change(function () {
  localVisible = this.checked;
  if (localVisible) {
    $("#video-stage").addClass("show-local");
    $("#local-player").removeClass("hide");
    playLocalVideo();
  } else {
    $("#video-stage").removeClass("show-local");
    $("#local-player").addClass("hide");
  }
});

function playLocalVideo() {
  if (localVisible && localTracks.videoTrack) {
    localTracks.videoTrack.play("local-player");
    $("#local-player-name").text(`uid: ${options.uid || ""}`);
  }
}

// ===================== placeholder =====================
function refreshPlaceholder() {
  const hasRemoteVideo = $("#remote-playerlist").children().length > 0;
  const $ph = $("#stage-placeholder");
  if (hasRemoteVideo) {
    $ph.addClass("hide");
  } else {
    $ph.removeClass("hide");
    $("#stage-placeholder-text").text(
      joined ? t("placeholderJoined") : t("placeholderNotJoined"),
    );
  }
}

// ===================== join / leave =====================
$("#host-join").click(async function () {
  options = { ...getOptionsFromLocal() };
  options.uid = options.uid ? Number(options.uid) : null;
  const formToken = $("#token").val().trim();

  if (!options.appid) {
    message.warning(t("needAppId"));
    return;
  }
  if (!options.channel) {
    message.warning(t("needChannel"));
    return;
  }

  $("#host-join").attr("disabled", true);
  try {
    options.token = formToken || (await agoraGetAppData(options)) || null;
    await join();
    message.success(t("joinSuccess"));
  } catch (error) {
    console.error(error);
    if (error.code === "CAN_NOT_GET_GATEWAY_SERVER") {
      message.error(t("tokenError"));
    } else {
      message.error(error.message || t("joinFailed"));
    }
    $("#host-join").attr("disabled", false);
    return;
  }

  joined = true;
  $("#leave").attr("disabled", false);
  $("#video-set-enabled").attr("disabled", true);
  $("#video-set-disable").attr("disabled", false);
  $("#audio-set-enabled").attr("disabled", true);
  $("#audio-set-disable").attr("disabled", false);
  refreshPlaceholder();
});

$("#leave").click(async function () {
  await leave();
  joined = false;
  $("#host-join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#video-set-enabled").attr("disabled", true);
  $("#video-set-disable").attr("disabled", true);
  $("#audio-set-enabled").attr("disabled", true);
  $("#audio-set-disable").attr("disabled", true);
  refreshPlaceholder();
  message.info(t("leftChannel"));
});

async function join() {
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  const proxyMode = Number(options.proxyMode);
  if (proxyMode != 0 && !isNaN(proxyMode)) {
    client.startProxyServer(proxyMode);
  }

  options.uid = await client.join(
    options.appid,
    options.channel,
    options.token || null,
    options.uid || null,
  );

  localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
    encoderConfig: "music_standard",
  });
  localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
  localTrackState.audioTrackEnabled = true;
  localTrackState.videoTrackEnabled = true;

  playLocalVideo();
  await client.publish(Object.values(localTracks));
}

async function leave() {
  for (const trackName in localTracks) {
    const track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = null;
    }
  }
  remoteUsers = {};
  $("#remote-playerlist").empty();
  $("#local-player-name").text("");
  await client.leave();
}

// ===================== remote =====================
async function subscribe(user, mediaType) {
  const uid = user.uid;
  await client.subscribe(user, mediaType);
  if (mediaType === "video") {
    if (!$(`#player-wrapper-${uid}`).length) {
      const player = $(`
        <div id="player-wrapper-${uid}" class="player">
          <div class="remote-player-name">uid: ${uid}</div>
        </div>`);
      $("#remote-playerlist").append(player);
    }
    user.videoTrack.play(`player-wrapper-${uid}`);
    refreshPlaceholder();
  }
  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  remoteUsers[user.uid] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user, mediaType) {
  if (mediaType === "video") {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
    refreshPlaceholder();
  }
}

// ===================== enable / disable =====================
$("#video-set-enabled").click(function () {
  setEnabled("video", true);
  $("#video-set-enabled").attr("disabled", true);
  $("#video-set-disable").attr("disabled", false);
  playLocalVideo();
});

$("#video-set-disable").click(function () {
  setEnabled("video", false);
  $("#video-set-enabled").attr("disabled", false);
  $("#video-set-disable").attr("disabled", true);
});

$("#audio-set-enabled").click(function () {
  setEnabled("audio", true);
  $("#audio-set-enabled").attr("disabled", true);
  $("#audio-set-disable").attr("disabled", false);
});

$("#audio-set-disable").click(function () {
  setEnabled("audio", false);
  $("#audio-set-enabled").attr("disabled", false);
  $("#audio-set-disable").attr("disabled", true);
});

async function setEnabled(type, state) {
  try {
    if (type === "audio" && localTracks.audioTrack) {
      await localTracks.audioTrack.setEnabled(state);
      localTrackState.audioTrackEnabled = state;
    } else if (type === "video" && localTracks.videoTrack) {
      await localTracks.videoTrack.setEnabled(state);
      localTrackState.videoTrackEnabled = state;
    }
  } catch (err) {
    console.error(err);
    message.error(err.message);
  }
}

// ===================== init =====================
$(function () {
  const o = getOptionsFromLocal();
  const defaults = {};
  if (!o.appid) defaults.appid = DEFAULT_APPID;
  if (!o.certificate) defaults.certificate = DEFAULT_CERTIFICATE;
  if (Object.keys(defaults).length) {
    setOptionsToLocal(defaults);
    options = { ...options, ...defaults };
  }
  applyI18n();
  fillSettingsForm();
  refreshPlaceholder();
  fetchAndApplyToken();

  $("#lang-select").change(function () {
    setLang(this.value === "en" ? "en" : "zh-CN");
  });
});
