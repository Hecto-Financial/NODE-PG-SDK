'use strict';

const EncryptUtil = require('./encrypt-util');
const HttpClientUtil = require('./http-client');
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

/**
 * 모든 API 요청·응답에 공통으로 쓰이는 응답 헤더(params) 항목입니다.
 */
const RES_HEADER_KEYS = [
    'mchtId',       //상점아이디
    'ver',          //버전
    'method',       //결제수단
    'bizType',      //업무구분
    'encCd',        //암호화구분
    'mchtTrdNo',    //상점주문번호
    'trdNo',        //헥토파이낸셜거래번호
    'trdDt',        //요청일자
    'trdTm',        //요청시간
    'outStatCd',    //결과코드
    'outRsltCd',    //거절코드
    'outRsltMsg'    //결과메세지
];

/**
 * SHA256 해쉬를 계산해 요청 바디의 pktHash에 세팅합니다.
 * 해쉬 조합 필드는 업무마다 다르므로 조합된 평문(hashPlain)을 인자로 받습니다.
 */
function setHash(body, hashPlain, mchtTrdNo, logger_) {
    const log = logger_ || logger;
    let hashCipher = '';

    try {
        hashCipher = EncryptUtil.digestSHA256(hashPlain);
    } catch (e) {
        log.error('[' + mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        log.info('[' + mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
        body.pktHash = hashCipher; //해쉬 결과 값 세팅
    }
    return hashCipher;
}

/**
 * 요청 바디를 암호화하고 API를 호출한 뒤, 응답을 복호화해 화면 출력용 맵으로 돌려줍니다.
 *
 * 결제·취소 API가 공통으로 수행하는 다음 절차를 담당합니다.
 *   AES256 암호화 -> API 호출 -> 응답 전문 파싱 -> AES256 복호화
 *
 * 해쉬 계산은 업무마다 조합 필드가 다르므로 호출 전에 setHash로 처리하십시오.
 *
 * @param {object}   options.header      요청 헤더(params)
 * @param {object}   options.body        요청 바디(data)
 * @param {string}   options.requestUrl  API 호출 URL
 * @param {string}   options.aesKey      AES256 암복호화 키
 * @param {string[]} options.encryptKeys 암호화할 요청 바디 항목
 * @param {string[]} options.decryptKeys 복호화할 응답 항목
 * @param {string[]} options.resBodyKeys 응답 바디(data)에서 읽을 항목
 * @returns {Promise<object>} 화면 출력용 응답 파라미터
 */
async function callApi(options) {
    const {
        header,
        body,
        requestUrl,
        aesKey,
        encryptKeys = [],
        decryptKeys = [],
        resHeaderKeys = RES_HEADER_KEYS,
        resBodyKeys = [],
        connTimeout,
        readTimeout
    } = options;

    const mchtTrdNo = header.mchtTrdNo;

    //AES256 암호화 처리
    encryptParams(body, encryptKeys, aesKey, mchtTrdNo);

    //요청파라미터 세팅
    //params, data 이름은 헥토파이낸셜로 전달되어야 하는 값이니 변경하지 마십시오.
    const reqParam = { params: header, data: body };

    //API호출(가맹점->헥토파이낸셜)
    //sendApi ( API호출 URL, 전송될데이터, 연결 타임아웃, 수신 타임아웃 )
    const resData = await HttpClientUtil.sendApi(requestUrl, reqParam, connTimeout, readTimeout);

    //응답 파라미터 파싱
    const respParam = parseResponse(resData, resHeaderKeys, resBodyKeys, mchtTrdNo);

    //AES256 복호화 처리
    decryptParams(respParam, decryptKeys, aesKey, mchtTrdNo);

    return respParam;
}

/**
 * 결제창에 전달할 고객 IP(custIp)를 얻습니다.
 *
 * Node는 듀얼스택 소켓에서 IPv4 주소를 `::ffff:203.0.113.5` 형태로 돌려주므로
 * 그대로 전달하면 PG가 정상적인 IPv4 주소로 인식하지 못합니다.
 * IPv4 매핑 표기는 점 4자리 형태로 되돌리고, 그 외 IPv6 주소는 그대로 사용합니다.
 *
 * 프록시 뒤에서 실제 고객 IP를 얻으려면 config.js의 TRUST_PROXY를 설정하십시오.
 */
function clientIp(req) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);

    return mapped ? mapped[1] : ip;
}

module.exports = {
    param,
    parseResponse,
    encryptParams,
    decryptParams,
    setHash,
    callApi,
    clientIp,
    RES_HEADER_KEYS
};
