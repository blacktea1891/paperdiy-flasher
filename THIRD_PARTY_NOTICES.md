# Third-party notices

Application HTML/CSS/JavaScript (excluding vendor files): copyright 2026 PaperDIY Flasher contributors; MIT license in LICENSE.txt. Independent community software, not an official M5Stack or CrossMux product. Product names identify compatibility only.

## esptool-js 0.7.0

Copyright (c) 2023 Espressif Systems (Shanghai) Co. Ltd.
Apache License 2.0: [full license](vendor/esptool-js-LICENSE.txt).
Source: https://github.com/espressif/esptool-js
Distribution: official npm package `esptool-js@0.7.0`.
`vendor/esptool-js-0.7.0.js` is the unchanged bundled browser build; only its filename is changed. Embedded RAM flasher stubs are part of the upstream package.

## pako 2.1.0 (embedded in the esptool-js bundle)

Copyright (C) 2014-2017 Vitaly Puzrin and Andrei Tuputcyn.
MIT AND Zlib; [MIT license](vendor/pako-LICENSE.txt), [zlib notices](vendor/zlib-NOTICE.txt).
Source: https://github.com/nodeca/pako/tree/2.1.0

## atob-lite 2.0.0

MIT; [full license](vendor/atob-lite-LICENSE.txt).
Declared upstream esptool-js dependency; included notice conservatively. Browser build uses native atob.

## Reference firmware / site

CrossMux firmware repository code is MIT: https://github.com/0x1abin/crossmux/blob/main/LICENSE.
No firmware binary, repository source code, reference-site code, logo or photo is redistributed in this package. Firmware dependency obligations must be reviewed before any future binary redistribution. There is no active firmware catalog or automatic firmware download in this app.

## SparkMD5 3.0.2

Copyright (C) 2015 André Cruz. Upstream package declares `(WTFPL OR MIT)`; this distribution retains its bundled [WTFPL version 2 license](vendor/spark-md5-LICENSE.txt). The unmodified `spark-md5.min.js` from the pinned official npm package is served locally as `vendor/spark-md5-3.0.2.min.js`. Source: https://github.com/satazor/js-spark-md5 . No CDN or network checksum service is used.
