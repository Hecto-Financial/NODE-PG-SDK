'use strict';

const EncryptUtil = require('./encrypt-util');
const StringUtil = require('./string-util');
const { getLogger } = require('./logger');

/**
 * 헥토파이낸셜 API 전문(params/data)을 다루는 공통 처리입니다.
 * 각 결제/취소 페이지에서 반복되는 요청 파라미터 조회, 응답 파싱,
 * AES256 암·복호화 루틴을 모아두었습니다.
 */

const logger = getLogger('trans');

/** 요청 파라미터 얻기(POST 바디 우선, 없으면 쿼리스트링) */
function param(req, name) {
    const body = req.body || {};
    return StringUtil.isNull(Object.prototype.hasOwnProperty.call(body, name) ? body[name] : req.query[name]);
}

/**
 * 응답 전문(params/data)에서 화면 출력용 파라미터 맵을 만듭니다.
 * 전문에 없는 항목은 빈 문자열로 채웁니다.
 */
function parseResponse(resData, resHeaderKeys, resBodyKeys, mchtTrdNo) {
    const respParam = {};

    try {
        const resp = JSON.parse(resData);
        const respHeader = resp.params || null;
        const respBody = resp.data || null;

        //응답 파라미터 세팅(헤더)
        resHeaderKeys.forEach((key) => {
            respParam[key] = respHeader ? StringUtil.isNull(respHeader[key]) : '';
        });

        //응답 파라미터 세팅(바디)
        resBodyKeys.forEach((key) => {
            respParam[key] = respBody ? StringUtil.isNull(respBody[key]) : '';
        });
    } catch (e) {
        respParam.outStatCd = '0098';
        respParam.outRsltCd = '0098';
        respParam.outRsltMsg = '[Response Parsing Error]' + e.toString();
        logger.error('[' + mchtTrdNo + '][Response Parsing Error]' + e.toString());
    }

    return respParam;
}

/** AES256 암호화 처리(AES-256-ECB encrypt -> Base64 encoding) */
function encryptParams(target, encryptKeys, aesKey, mchtTrdNo) {
    try {
        encryptKeys.forEach((key) => {
            const aesPlain = target[key];
            if (aesPlain !== '') {
                const aesCipher = EncryptUtil.encryptParam(aesKey, aesPlain);

                target[key] = aesCipher; //암호화 결과 값 세팅
                logger.info('[' + mchtTrdNo + '][AES256 Encrypt] ' + key + '[' + aesPlain + '] ---> [' + aesCipher + ']');
            }
        });
    } catch (e) {
        logger.error('[' + mchtTrdNo + '][AES256 Encrypt] AES256 Encrypt Fail! : ' + e.toString());
    }
}

/** AES256 복호화 처리(Base64 decoding -> AES-256-ECB decrypt) */
function decryptParams(target, decryptKeys, aesKey, mchtTrdNo) {
    try {
        decryptKeys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                const aesCipher = target[key].trim();
                if (aesCipher !== '') {
                    const aesPlain = EncryptUtil.decryptParam(aesKey, aesCipher);

                    target[key] = aesPlain; //복호화된 데이터로 세팅
                    logger.info('[' + mchtTrdNo + '][AES256 Decrypt] ' + key + '[' + aesCipher + '] ---> [' + aesPlain + ']');
                }
            }
        });
    } catch (e) {
        logger.error('[' + mchtTrdNo + '][AES256 Decrypt] AES256 Decrypt Fail! : ' + e.toString());
    }
}

module.exports = { param, parseResponse, encryptParams, decryptParams };
