'use strict';

const crypto = require('node:crypto');

/**
 * AES-256-ECB / PKCS7Padding 및 SHA-256 유틸입니다.
 *
 * 헥토파이낸셜 연동 규격의 암호화 방식을 Node.js 내장 crypto 모듈만으로 처리하므로
 * 별도의 암호 라이브러리를 설치할 필요가 없습니다.
 */

const AES_256_KEY_BYTES = 32;

/**
 * 키를 AES-256 키 길이(32바이트)로 정규화합니다.
 * 발급받은 키가 32바이트보다 짧으면 0으로 채우고, 길면 잘라냅니다.
 */
function normalizeKey(key) {
    requireNonNull(key, 'key');

    const normalized = Buffer.alloc(AES_256_KEY_BYTES);
    Buffer.from(String(key), 'utf8').copy(normalized, 0, 0, AES_256_KEY_BYTES);
    return normalized;
}

/** 평문을 AES-256-ECB로 암호화한 뒤 Base64로 인코딩합니다. */
function encryptParam(aesKey, plainText) {
    if (plainText === null || plainText === undefined || plainText.length === 0) {
        return '';
    }
    return encodeBase64(aes256EncryptEcb(aesKey, plainText));
}

/** Base64 암호문을 디코딩한 뒤 AES-256-ECB로 복호화합니다. */
function decryptParam(aesKey, cipherText) {
    if (cipherText === null || cipherText === undefined || cipherText.length === 0) {
        return '';
    }
    return aes256DecryptEcb(aesKey, decodeBase64(cipherText)).toString('utf8');
}

/** SHA-256 해시를 소문자 16진 문자열로 반환합니다. */
function digestSHA256(plain) {
    if (plain === null || plain === undefined) {
        return null;
    }
    return crypto.createHash('sha256').update(Buffer.from(String(plain), 'utf8')).digest('hex');
}

/** AES-256-ECB 암호화(PKCS7 패딩). 반환값은 Buffer입니다. */
function aes256EncryptEcb(key, plainText) {
    requireNonNull(plainText, 'plainText');

    const cipher = crypto.createCipheriv('aes-256-ecb', normalizeKey(key), null);
    cipher.setAutoPadding(true); //PKCS7 패딩
    return Buffer.concat([cipher.update(Buffer.from(String(plainText), 'utf8')), cipher.final()]);
}

/** AES-256-ECB 복호화(PKCS7 패딩). 반환값은 Buffer입니다. */
function aes256DecryptEcb(key, encrypted) {
    requireNonNull(encrypted, 'encrypted');

    const decipher = crypto.createDecipheriv('aes-256-ecb', normalizeKey(key), null);
    decipher.setAutoPadding(true); //PKCS7 패딩
    return Buffer.concat([decipher.update(Buffer.from(encrypted)), decipher.final()]);
}

function encodeBase64(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return Buffer.from(value).toString('base64');
}

function decodeBase64(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return Buffer.from(value, 'base64');
}

/**
 * 해시 값을 상수 시간으로 비교합니다.
 *
 * `===`는 처음 다른 문자에서 즉시 끝나므로 비교에 걸린 시간이 "몇 글자까지 맞았는지"를
 * 노출합니다. 노티 수신 주소는 외부에 공개되어 있어 공격자가 해시를 한 글자씩 바꿔가며
 * 응답 시간을 재는 방식으로 기대 해시를 알아낼 수 있으므로, 검증에는 이 함수를 사용합니다.
 */
function secureCompare(a, b) {
    const bufA = Buffer.from(String(a === null || a === undefined ? '' : a), 'utf8');
    const bufB = Buffer.from(String(b === null || b === undefined ? '' : b), 'utf8');

    //길이가 다르면 timingSafeEqual이 예외를 던지므로 먼저 확인합니다.
    //해시 길이는 고정이라 길이 자체는 비밀이 아닙니다.
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function requireNonNull(value, name) {
    if (value === null || value === undefined) {
        throw new Error(name + ' must not be null');
    }
}

module.exports = {
    encryptParam,
    decryptParam,
    digestSHA256,
    secureCompare,
    aes256EncryptEcb,
    aes256DecryptEcb,
    encodeBase64,
    decodeBase64
};
