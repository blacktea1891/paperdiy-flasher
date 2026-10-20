# PaperDIY Factory Flasher — research and verification notes

Updated 2026-10-20. Version 1.2.0 is scoped to the complete factory image emitted by the PaperDIY GitHub Actions build. It no longer accepts arbitrary single-image firmware or asks the user to supply a starting address.

## Build layout

The CrossPoint Reader PaperDIY Actions build log records the merged factory image components:

- `0x0000`: `bootloader.bin`
- `0x8000`: `partitions.bin`
- `0xE000`: `boot_app0.bin`
- `0x10000`: `firmware.bin`

The page links to https://github.com/blacktea1891/crosspoint-reader/actions . Download the `CrossMux-PaperDIY-port-paperdiy` artifact from a successful PaperDIY build, extract it, and select `artifacts/firmware.factory.bin` inside the ZIP. The inspected artifact file was 6,016,032 bytes; its bootloader header at `0x0000`, partition-table marker `AA 50` at `0x8000`, and application header at `0x10000` matched the expected layout. The app requires that filename and checks the ESP32-S3 image headers at offsets 0 and `0x10000`, plus the partition-table marker at `0x8000`. These structural checks are not proof of provenance, firmware authenticity or board compatibility.

## Hardware and flashing

M5Stack documentation https://docs.m5stack.com/en/core/PaperDIY_Assembly_Kit identifies PaperDIY as ESP32-S3 with 16 MB Flash and 8 MB PSRAM, and documents the power-button download-mode sequence. Chip/USB identification cannot establish the actual PCB model. The page requires user confirmation that the device is PaperDIY and that the factory file came from a trusted compatible build.

The start address is a constant, `FACTORY_FLASH_ADDRESS = 0x0000`; there is no address input or arbitrary-file mode. The entire factory image is written as one byte array. Flash mode, frequency and size are all `keep`, preserving the image's existing parameters. No whole-chip erase is requested, but flash sectors covered by the factory image are erased/written and old contents in that region are overwritten.

## Local processing and verification

Unmodified, vendored `esptool-js@0.7.0` browser bundle, Apache-2.0. Official source: https://github.com/espressif/esptool-js . The package tarball SHA-512 was checked against npm registry integrity metadata. The bundle includes its dependencies and requires no CDN.

The page uses `navigator.serial.requestPort()`, `Transport`, and `ESPLoader.main()`; it requires ESP32-S3, detected 16 MB Flash and a running stub. The file is read locally. SHA-256 is computed with Web Crypto and optionally compared with a builder-provided value. The vendored SparkMD5 3.0.2 browser script is used for local MD5. The package declares `WTFPL OR MIT`; its bundled WTFPL license is retained. Source: https://github.com/satazor/js-spark-md5 .

esptool pads the written data to a four-byte boundary with `0xff`. After writing, the app calls `flashMd5sum(0x0000, paddedLength)` and compares the device checksum with the same padded local factory image. Transfer progress reaching 100% is not treated as success. A failed write or verification cannot produce a success state.

The app does not use fetch, XHR, WebSocket, beacon, remote checksum or firmware service. Selected firmware bytes stay in browser memory and pass to the USB serial library; the application has no file upload endpoint. GitHub Pages receives normal page/asset requests, not firmware contents.

## Validation boundary

Automated tests cover filename gating, factory layout checks, fixed address 0x0000, chip/capacity/stub gates, write/verify order, failures never succeeding, four-byte padding, bundled MD5 vectors, vendor exports and local-only page constraints.

A real USB PaperDIY browser flash, disconnect recovery, reboot and screen check remain pending. Do not infer hardware success from successful Actions checks or HTTPS delivery.
