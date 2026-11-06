import { ESPLoader, Transport } from './vendor/esptool-js-0.7.0.js';
import { FLASH_BYTES, FACTORY_FLASH_ADDRESS, isFactoryFirmwareFilename, inspectFactoryImage, flashLocal } from './core.js';

const $ = id => document.getElementById(id);
let fileHash = '', filename = '';
let loader = null, transport = null, port = null, image = null;
let busy = false, selecting = false, fileEpoch = 0, written = false;
const supported = window.isSecureContext && 'serial' in navigator;
const logLines = [];
function log(message) {
  logLines.push(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${String(message).replace(/\x1b\[[0-9;]*m/g, '')}`);
  if (logLines.length > 600) logLines.splice(0, logLines.length - 600);
  $('log').textContent = logLines.join('\n');
  $('log').scrollTop = $('log').scrollHeight;
}
function status(title, message) { $('statusTitle').textContent = title; $('statusText').textContent = message; }
function progress(value) { $('progress').value = value; $('percent').textContent = Math.floor(value); }
function update() {
  $('connect').disabled = !supported || busy || !!loader;
  $('disconnect').disabled = busy || !loader;
  $('firmware').disabled = busy;
  $('expectedSha').disabled = busy;
  $('confirmBoard').disabled = busy;
  const expected = $('expectedSha').value.trim().toLowerCase();
  const hashValid = !expected || /^[0-9a-f]{64}$/.test(expected) && expected === fileHash;
  if (image && !hashValid) $('parameterStatus').textContent = '提供的 SHA-256 格式不正确或与本地文件不符，已阻止刷写；不提供时请留空。';
  $('flash').disabled = !supported || busy || selecting || !loader || !image || !hashValid || !$('confirmBoard').checked || written;
  $('connectionBadge').textContent = loader ? '● 已连接 ESP32-S3' : '● 未连接';
  $('connectionBadge').classList.toggle('connected', !!loader);
  $('liveDot').classList.toggle('active', busy);
}
async function release() {
  const oldTransport = transport;
  loader = null; transport = null; port = null;
  try { await oldTransport?.disconnect(); } catch (e) { log(`释放串口：${e.message}`); }
  update();
}
function clearStages() { for (const id of ['connect', 'image', 'write', 'verify']) $('stage-' + id).className = ''; }
$('sha').textContent = '选择本地文件后计算';
$('environment').textContent = supported ? '环境已就绪 · Web Serial 可用。请使用 USB 数据线连接设备，并关闭其他占用串口的程序。' : '当前浏览器暂不支持 USB 刷写，请使用电脑上的 Chrome 或 Edge 打开本页面后重试。';
$('environment').className = 'notice ' + (supported ? 'ok' : 'error');
log('工作台已启动。当前未连接设备，未执行刷写。');
update();

$('connect').addEventListener('click', async () => {
  busy = true; written = false; clearStages(); progress(0); update();
  status('正在连接设备', '在浏览器弹窗中选择 PaperDIY 的串口。连接会重置设备并加载 RAM 刷写助手。');
  $('stage-connect').className = 'current';
  try {
    // Must be called before any await to retain the user's transient activation.
    port = await navigator.serial.requestPort();
    transport = new Transport(port, true);
    const terminal = { clean() {}, write: log, writeLine: log };
    const candidate = new ESPLoader({ transport, baudrate: 115200, terminal, debugLogging: false });
    await candidate.main();
    if (candidate.chip?.CHIP_NAME !== 'ESP32-S3') throw new Error('芯片不是 ESP32-S3，已拒绝连接。');
    const size = await candidate.detectFlashSize();
    if (size !== '16MB') throw new Error(`检测到 Flash：${size || '未知'}；需要 16MB。`);
    if (!candidate.IS_STUB) throw new Error('刷写助手未加载，无法保证写入后校验。请重新进入下载模式并连接。');
    loader = candidate;
    const info = port.getInfo();
    $('deviceInfo').textContent = `已检测 ESP32-S3 / ${size} · USB VID ${info.usbVendorId?.toString(16) || '未知'} / PID ${info.usbProductId?.toString(16) || '未知'}。请人工确认主板为 PaperDIY。`;
    $('stage-connect').className = 'done';
    if (image) $('stage-image').className = 'done';
    status('设备已连接', '选择 Actions 构建产物中的完整 firmware.factory.bin。芯片匹配不代表固件兼容主板。');
    log('连接检查通过；未写入 Flash。');
  } catch (error) {
    const canceled = error.name === 'NotFoundError';
    status(canceled ? '已取消连接' : '连接失败', canceled ? '未选择串口，可以再次连接。' : `${error.message} 请查看下方排查说明。`);
    $('stage-connect').className = '';
    log(error.message); await release();
  } finally { busy = false; update(); }
});
$('disconnect').addEventListener('click', async () => {
  busy = true; update(); await release(); busy = false;
  $('stage-connect').className = '';
  $('deviceInfo').textContent = '串口已释放。重新连接前，请将设备置于下载模式。';
  if (written) status('已校验并断开', 'Flash 写入及 MD5 校验完成。请单击电源键重置设备，人工检查启动与屏幕。');
  else status('设备已断开', '串口已释放。');
  log('已断开串口。'); update();
});
$('firmware').addEventListener('change', async event => {
  const epoch = ++fileEpoch;
  image = null; fileHash = ''; filename = ''; written = false; selecting = true; update();
  $('confirmBoard').checked = false; $('sha').textContent = '尚未读取文件';
  $('stage-image').className = '';
  const file = event.target.files[0];
  $('fileStatus').className = 'hint';
  if (!file) { selecting = false; $('fileTitle').textContent = '选择 firmware.factory.bin'; $('fileStatus').textContent = '未选择固件。'; update(); return; }
  $('fileTitle').textContent = file.name;
  $('fileStatus').textContent = '正在计算 SHA-256…';
  try {
    if (!isFactoryFirmwareFilename(file.name)) throw new Error('必须选择原名为 firmware.factory.bin 的完整 Actions 构建镜像。请先解压构建产物 ZIP；不要选择 firmware.bin、bootloader.bin 或 partitions.bin，也不要重命名其他文件。');
    if (file.size < 24 || file.size > FLASH_BYTES) throw new Error('文件为空、过短或超过 16 MB，无法作为本版支持的固件写入。');
    if (!supported) throw new Error('当前浏览器环境不支持刷写。请使用桌面 Chrome / Edge 的 HTTPS 或 localhost 页面。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await inspectFactoryImage(bytes);
    if (epoch !== fileEpoch) return;
    image = bytes; fileHash = hash; filename = file.name; $('sha').textContent = hash;
    $('fileStatus').textContent = `已在本地读取 ${bytes.length.toLocaleString()} bytes。完整 factory 镜像结构检查通过；固定写入地址为 0x0000。结构检查不证明文件来源或 PaperDIY 兼容性。`;
    $('parameterStatus').textContent = '固定写入地址：0x0000；完整镜像 ' + bytes.length.toLocaleString() + ' bytes。';
    $('fileStatus').className = 'hint success';
    $('stage-image').className = 'done';
    log(`本地文件 ${file.name} / SHA-256 ${hash}；未上传。`);
  } catch (e) {
    if (epoch !== fileEpoch) return;
    $('fileStatus').textContent = e.message; $('fileStatus').className = 'hint error'; log(e.message);
  } finally { if (epoch === fileEpoch) { selecting = false; update(); } }
});
$('confirmBoard').addEventListener('change', update);
$('expectedSha').addEventListener('input', () => {
  $('confirmBoard').checked = false;
  const expected = $('expectedSha').value.trim().toLowerCase();
  if (!expected) $('parameterStatus').textContent = image
    ? '固定写入地址：0x0000；完整镜像 ' + image.length.toLocaleString() + ' bytes。'
    : '完整镜像将固定从 0x0000 开始写入。';
  else if (!/^[0-9a-f]{64}$/.test(expected)) $('parameterStatus').textContent = '可选 SHA-256 需要 64 位十六进制字符；不提供时留空。';
  else if (expected !== fileHash) $('parameterStatus').textContent = '文件 SHA-256 与填写的值不符，已阻止刷写。';
  else $('parameterStatus').textContent = 'SHA-256 匹配。固定写入地址：0x0000。';
  update();
});
$('flash').addEventListener('click', async () => {
  if (busy || selecting || !loader || !image || !$('confirmBoard').checked || written) return;
  busy = true; progress(0); update();
  let started = false;
  $('stage-write').className = ''; $('stage-verify').className = '';
  try {
    log('开始刷写前检查：本地完整镜像 ' + filename + '，固定地址 0x' + FACTORY_FLASH_ADDRESS.toString(16).padStart(4, '0') + '，' + image.length + ' bytes；不执行整片擦除。');
    await flashLocal({ loader, bytes: image, expectedSha: $('expectedSha').value,
      calculateMD5: bytes => globalThis.SparkMD5.ArrayBuffer.hash(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), progress, stage: stage => {
      if (stage === 'writing') { started = true; $('stage-write').className = 'current'; status('正在写入固件', '请保持 USB 连接，不要关闭页面。进度来自真实串口传输。'); }
      if (stage === 'verifying') { $('stage-write').className = 'done'; $('stage-verify').className = 'current'; status('正在校验设备 Flash', '传输已结束，正在读取设备端 MD5。校验通过前，不代表写入完成。'); }
      if (stage === 'verified') { $('stage-verify').className = 'done'; }
    }});
    written = true;
    log('设备 Flash MD5 与本地文件（含 4 字节对齐填充）一致。写入完成；固件兼容性、启动与屏幕效果未由网页验证。');
    status('写入完成 · 校验通过', '设备 Flash MD5 校验通过。点击「断开」，再单击电源键重置，并检查启动与屏幕。');
    $('readyHint').textContent = '写入和校验已完成。请断开串口后重置设备；重刷需重新连接。';
  } catch (e) {
    status(started ? '刷写未完成' : '未开始刷写', started ? `${e.message} 已写入的内容无法由断开操作撤销。保留日志，重新进入下载模式后重试。` : e.message);
    log(`失败：${e.message}`);
    $('stage-write').classList.remove('current'); $('stage-verify').classList.remove('current');
    if (started) await release();
  } finally { busy = false; update(); }
});
$('saveLog').addEventListener('click', () => {
  const blob = new Blob([`PaperDIY Local Flasher 1.2.0\nLocal file: ${filename || '(none)'}\nSHA256: ${fileHash || '(none)'}\nFlash address: 0x${FACTORY_FLASH_ADDRESS.toString(16).padStart(4, '0')} (fixed factory image offset)\n\n`, logLines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'paperdiy-flash-log.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
navigator.serial?.addEventListener('disconnect', async event => {
  if (event.target !== port) return;
  log('USB 设备已断开。');
  if (!busy) { await release(); $('stage-connect').className = ''; status('USB 连接已断开', '重新进入下载模式后再连接。'); }
  // An in-flight loader operation rejects on transport failure; its catch releases state.
});
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
