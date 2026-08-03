'use strict';

const https = require('node:https');

const { getLogger } = require('./logger');

const logger = getLogger('trans');

/**
 * 헥토파이낸셜 API 서버와 통신하는 HTTP 클라이언트입니다.
 *
 * [TLS 보안]
 * Node.js 기본 동작인 서버 인증서 체인 검증과 호스트명 검증을 그대로 사용하며,
 * TLS 1.2 미만은 사용하지 않습니다. 모든 인증서를 신뢰하는 rejectUnauthorized:false
 * 같은 우회 설정은 절대 사용하지 마십시오.
 */

/**
 * API를 호출하고 응답 본문 문자열을 반환합니다.
 *
 * @param {string} targetUrl  API 호출 URL
 * @param {object} param      전송할 데이터({ params: 헤더, data: 바디 })
 * @param {number} connTimeout 연결 타임아웃(ms)
 * @param {number} readTimeout 수신 타임아웃(ms)
 * @returns {Promise<string>} 응답 본문(JSON 문자열)
 */
function sendApi(targetUrl, param, connTimeout, readTimeout) {
    //로그표시용 주문번호 얻기
    const trdNo = (param && param.params && param.params.mchtTrdNo) || '';

    logger.info('[' + trdNo + ']=========================START SEND API=========================');

    //파라미터 JSON스트링으로 변환
    const sendData = JSON.stringify(param);

    return new Promise((resolve) => {
        let settled = false;
        let connTimer = null;
        let readTimer = null;

        const url = new URL(targetUrl);

        logger.info('[' + trdNo + '][API Send URL]' + url.href);
        logger.info('[' + trdNo + '][URL Protocol]' + url.protocol.replace(':', '')
            + ' [Connect Timeout]' + connTimeout + ' [Read Timeout]' + readTimeout);

        const finish = (resData) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(connTimer);
            clearTimeout(readTimer);
            logger.info('[' + trdNo + ']=========================END SEND API=========================');
            resolve(resData);
        };

        /** 연결 단계가 끝나면 연결 타임아웃을 해제하고 수신 타임아웃으로 전환합니다. */
        const startReadTimeout = () => {
            if (readTimer !== null) {
                return;
            }
            clearTimeout(connTimer);
            readTimer = setTimeout(() => {
                request.destroy(new Error('Read timed out'));
            }, readTimeout);
        };

        /** 통신 실패 시 화면에서 사용할 오류 응답 전문을 생성합니다. */
        const errorResponse = (message) => JSON.stringify({
            params: {
                outStatCd: '0031',
                outRsltCd: '9999',
                outRsltMsg: message
            },
            data: {}
        });

        const request = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                charset: 'UTF-8',
                'Content-Length': Buffer.byteLength(sendData, 'utf8')
            },
            minVersion: 'TLSv1.2' //TLS 1.0/1.1 비활성화
        }, (response) => {
            startReadTimeout();
            logger.info('[' + trdNo + '][Response Code]' + response.statusCode);

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const resMessage = Buffer.concat(chunks);

                if (response.statusCode === 200) {
                    const resData = resMessage.toString('utf8');
                    logger.info('[' + trdNo + '][Response Data]' + resData);
                    logger.info('[' + trdNo + '][Response Data] byte length : ' + resMessage.length);
                    finish(resData);
                } else {
                    logger.error('[' + trdNo + '][Connect Error]' + response.statusMessage);
                    finish(errorResponse('[Connect Error]' + response.statusMessage));
                }
            });
        });

        request.on('error', (e) => {
            logger.error('[' + trdNo + '][HTTP Connect Error]' + e.toString());
            finish(errorResponse('[HTTP Connect Error]' + e.toString()));
        });

        //연결 타임아웃: TLS 핸드셰이크가 끝나면 해제하고 수신 타임아웃으로 전환합니다.
        connTimer = setTimeout(() => {
            request.destroy(new Error('Connect timed out'));
        }, connTimeout);

        request.on('socket', (socket) => {
            //재사용된 커넥션은 연결 단계가 없으므로 바로 수신 타임아웃으로 전환합니다.
            if (socket.connecting === false && socket.authorized !== undefined) {
                startReadTimeout();
            } else {
                socket.once('secureConnect', startReadTimeout);
            }
        });

        //보낼 데이터
        logger.info('[' + trdNo + '][Send Data]' + sendData);

        request.end(sendData, 'utf8');
    });
}

module.exports = { sendApi };
