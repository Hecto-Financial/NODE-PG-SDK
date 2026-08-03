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

/**
 * 로거 이름별 append 스트림입니다.
 * 매 줄마다 파일을 여닫으면(appendFileSync) 그동안 이벤트 루프가 멈춰
 * 동시에 진행 중인 API 호출까지 함께 지연되므로, 스트림을 한 번만 열어 재사용합니다.
 */
const streams = new Map();

function getStream(name) {
    let stream = streams.get(name);
    if (stream) {
        return stream;
    }

    fs.mkdirSync(logDir, { recursive: true });
    stream = fs.createWriteStream(path.join(logDir, name + '.log'), { flags: 'a' });
    stream.on('error', (e) => {
        console.error('로그 파일 기록 실패 - ' + e.toString());
    });
    streams.set(name, stream);
    return stream;
}

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
        getStream(name).write(line + '\n');
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
