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
    const msg = "生成 Token 失败，请检查 App ID 与 App Certificate";
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
      throw new Error(resp.msg || "获取 Token 失败");
    }
    const token = resp.data.token;
    setOptionsToLocal({ token });
    options = { ...options, token };
    $("#token").val(token);
  } catch (err) {
    console.error(err);
    message.error(err.message || "获取 Token 失败");
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
  message.success("设置已保存");
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
      joined ? "已加入频道，等待远端用户…" : "未加入频道，点击「加入」开始通话",
    );
  }
}

// ===================== join / leave =====================
$("#host-join").click(async function () {
  options = { ...getOptionsFromLocal() };
  options.uid = options.uid ? Number(options.uid) : null;
  const formToken = $("#token").val().trim();

  if (!options.appid) {
    message.warning("请先在「设置」中填写 App ID");
    return;
  }
  if (!options.channel) {
    message.warning("请先在「设置」中填写 Channel");
    return;
  }

  $("#host-join").attr("disabled", true);
  try {
    options.token = formToken || (await agoraGetAppData(options)) || null;
    await join();
    message.success("加入频道成功");
  } catch (error) {
    console.error(error);
    if (error.code === "CAN_NOT_GET_GATEWAY_SERVER") {
      message.error("Token 错误，请检查 Token 参数");
    } else {
      message.error(error.message || "加入频道失败");
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
  message.info("已离开频道");
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
  fillSettingsForm();
  refreshPlaceholder();
  fetchAndApplyToken();
});
