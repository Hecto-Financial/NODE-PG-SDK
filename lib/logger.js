'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { LOG_DIR } = require('../config');

/**
 * 연동 확인용 간단한 로거입니다.
 * 외부 로깅 라이브러리 없이 콘솔과 `LOG_DIR/<로거명>.log`에 함께 기록하며,
 * 결제·취소 API는 trans, 노티 처리는 notiTrans 로거를 사용합니다.
 * 운영 환경에서는 가맹점에서 사용하는 로깅 프레임워크로 교체하십시오.
 */

const logDir = path.resolve(LOG_DIR);
let logDirReady = false;

function timestamp() {
    const now = new Date();
    const pad = (value, size) => String(value).padStart(size, '0');
    return pad(now.getFullYear(), 4) + '/' + pad(now.getMonth() + 1, 2) + '/' + pad(now.getDate(), 2)
        + ' ' + pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2)
        + '.' + pad(now.getMilliseconds(), 3);
}

function write(name, level, message) {
    const line = timestamp() + '[' + name + '][' + level + '] : ' + message;

    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }

    try {
        if (!logDirReady) {
            fs.mkdirSync(logDir, { recursive: true });
            logDirReady = true;
        }
        fs.appendFileSync(path.join(logDir, name + '.log'), line + '\n');
    } catch (e) {
        console.error(timestamp() + '[logger][ERROR] : 로그 파일 기록 실패 - ' + e.toString());
    }
}

/** 이름별 로거를 얻습니다. 로그는 `LOG_DIR/<name>.log`에 기록됩니다. */
function getLogger(name) {
    return {
        info: (message) => write(name, 'INFO', message),
        error: (message) => write(name, 'ERROR', message)
    };
}

module.exports = { getLogger };
