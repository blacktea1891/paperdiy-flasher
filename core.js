export async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export const FLASH_BYTES = 16 * 1024 * 1024;
export const FACTORY_FLASH_ADDRESS = 0x0000;
export const FACTORY_FILE_NAME = 'firmware.factory.bin';
export const FACTORY_PARTITION_OFFSET = 0x8000;
export const FACTORY_APP_OFFSET = 0x10000;

export function isFactoryFirmwareFilename(name) {
  return typeof name === 'string' && name.toLowerCase() === FACTORY_FILE_NAME;
}

function isEsp32S3ImageAt(bytes, offset) {
  if (bytes[offset] !== 0xe9 || bytes[offset + 1] < 1 || bytes[offset + 1] > 16) return false;
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return header.getUint16(offset + 12, true) === 9;
}

export async function inspectFactoryImage(bytes, expectedSha = '') {
  if (!(bytes instanceof Uint8Array) || bytes.length < FACTORY_APP_OFFSET + 24 || bytes.length > FLASH_BYTES) {
    throw new Error('完整 factory 镜像为空、结构不完整或超过 16 MB。');
  }
  const layoutMatches =
    isEsp32S3ImageAt(bytes, 0) &&
    bytes[FACTORY_PARTITION_OFFSET] === 0xaa &&
    bytes[FACTORY_PARTITION_OFFSET + 1] === 0x50 &&
    isEsp32S3ImageAt(bytes, FACTORY_APP_OFFSET);
  if (!layoutMatches) {
    throw new Error('文件不符合 PaperDIY Actions factory 镜像布局：bootloader @ 0x0000、partition table @ 0x8000、app @ 0x10000。请解压并选择正确的 firmware.factory.bin。');
  }
  const expected = expectedSha.trim().toLowerCase();
  if (expected && !/^[0-9a-f]{64}$/.test(expected)) throw new Error('可选 SHA-256 必须是 64 位十六进制字符串。');
  const hash = await sha256(bytes);
  if (expected && expected !== hash) throw new Error('文件 SHA-256 与你填写的值不符，已阻止刷写。');
  return hash;
}

// Preflight failures must occur before stage('writing').
export async function flashLocal({ loader, bytes, expectedSha = '', calculateMD5, progress, stage }) {
  if (loader.chip?.CHIP_NAME !== 'ESP32-S3') throw new Error('设备芯片不匹配，需要 ESP32-S3。');
  if (await loader.detectFlashSize() !== '16MB') throw new Error('未检测到 16 MB Flash，已阻止刷写。');
  if (!loader.IS_STUB) throw new Error('设备未运行刷写助手，无法保证写入后校验；请重新进入下载模式并连接。');
  const hash = await inspectFactoryImage(bytes, expectedSha);
  if (typeof calculateMD5 !== 'function') throw new Error('本地校验库未就绪，请重新加载页面。');
  // esptool pads to four bytes with 0xff. Keep the factory image parameters.
  const length = Math.ceil(bytes.length / 4) * 4;
  if (FACTORY_FLASH_ADDRESS + length > FLASH_BYTES) throw new Error('完整镜像及其对齐填充超出 16 MB Flash。');
  const padded = new Uint8Array(length).fill(0xff);
  padded.set(bytes);
  const md5 = calculateMD5(padded);
  if (!/^[0-9a-f]{32}$/i.test(md5)) throw new Error('本地 MD5 计算失败，未开始刷写。');
  stage('writing');
  await loader.writeFlash({
    fileArray: [{ data: bytes, address: FACTORY_FLASH_ADDRESS }],
    flashSize: 'keep', flashMode: 'keep', flashFreq: 'keep',
    eraseAll: false, compress: true,
    reportProgress: (_index, written, total) => progress(total ? Math.min(100, written / total * 100) : 0)
  });
  stage('verifying');
  const actual = await loader.flashMd5sum(FACTORY_FLASH_ADDRESS, length);
  if (String(actual).trim().toLowerCase() !== md5.toLowerCase()) throw new Error('设备 Flash MD5 校验失败。请勿将本次刷写视为完成。');
  stage('verified');
  return { address: FACTORY_FLASH_ADDRESS, bytes: bytes.length, sha256: hash, md5 };
}
