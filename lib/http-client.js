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
 *
 * [응답 보장]
 * 이 함수는 어떤 통신 실패에서도 reject하지 않고 항상 오류 응답 전문으로 resolve합니다.
 * 호출부가 결과 화면을 그리지 못한 채 멈추는 일이 없도록 하기 위한 것입니다.
 */

/** 통신 실패 시 화면에서 사용할 오류 응답 전문을 생성합니다. */
function errorResponse(message) {
    return JSON.stringify({
        params: {
            outStatCd: '0031',
            outRsltCd: '9999',
            outRsltMsg: message
        },
        data: {}
    });
}

/**
 * API를 호출하고 응답 본문 문자열을 반환합니다.
 *
 * @param {string} targetUrl  API 호출 URL
 * @param {object} param      전송할 데이터({ params: 헤더, data: 바디 })
 * @param {number} connTimeout 연결 타임아웃(ms)
 * @param {number} readTimeout 수신 타임아웃(ms, 마지막 수신 이후 무응답 허용 시간)
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
        let request = null;

        const finish = (resData) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(connTimer);
            clearTimeout(readTimer);
            if (request) {
                request.destroy(); //남은 소켓 정리
            }
            logger.info('[' + trdNo + ']=========================END SEND API=========================');
            resolve(resData);
        };

        /** 통신 오류를 로그로 남기고 오류 응답 전문으로 종료합니다. */
        const fail = (message) => {
            if (settled) {
                return;
            }
            logger.error('[' + trdNo + ']' + message);
            finish(errorResponse(message));
        };

        /**
         * 수신 타임아웃을 다시 설정합니다.
         * 데이터를 받을 때마다 호출하여 "마지막 수신 이후 무응답 시간"을 재는 방식으로 동작합니다.
         * (전체 소요 시간이 아니라 무응답 구간을 재므로, 응답이 계속 흐르는 동안에는 끊기지 않습니다.)
         */
        const armReadTimeout = () => {
            if (settled) {
                return;
            }
            clearTimeout(connTimer); //연결 단계 종료
            clearTimeout(readTimer);
            readTimer = setTimeout(() => {
                fail('[HTTP Connect Error]Error: Read timed out');
            }, readTimeout);
        };

        try {
            const url = new URL(targetUrl);

            logger.info('[' + trdNo + '][API Send URL]' + url.href);
            logger.info('[' + trdNo + '][URL Protocol]' + url.protocol.replace(':', '')
                + ' [Connect Timeout]' + connTimeout + ' [Read Timeout]' + readTimeout);

            request = https.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    charset: 'UTF-8',
                    'Content-Length': Buffer.byteLength(sendData, 'utf8')
                },
                minVersion: 'TLSv1.2' //TLS 1.0/1.1 비활성화
            }, (response) => {
                armReadTimeout();
                logger.info('[' + trdNo + '][Response Code]' + response.statusCode);

                const chunks = [];

                response.on('data', (chunk) => {
                    chunks.push(chunk);
                    armReadTimeout(); //수신이 이어지는 동안에는 타임아웃을 미룹니다.
                });

                //응답 스트림이 중간에 끊긴 경우(서버/중계장비의 커넥션 리셋 등)
                response.on('aborted', () => {
                    fail('[HTTP Connect Error]Error: Response aborted before completion');
                });
                response.on('error', (e) => {
                    fail('[HTTP Connect Error]' + e.toString());
                });

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
                fail('[HTTP Connect Error]' + e.toString());
            });

            //어떤 경로로도 결과가 확정되지 않은 채 커넥션이 닫히는 경우의 최종 안전장치
            request.on('close', () => {
                fail('[HTTP Connect Error]Error: Connection closed before response completed');
            });

            //연결 타임아웃: 연결 단계가 끝나면 해제하고 수신 타임아웃으로 전환합니다.
            connTimer = setTimeout(() => {
                fail('[HTTP Connect Error]Error: Connect timed out');
            }, connTimeout);

            request.on('socket', (socket) => {
                //재사용된 커넥션은 연결 단계가 없으므로 바로 수신 타임아웃으로 전환합니다.
                if (socket.connecting === false && socket.authorized !== undefined) {
                    armReadTimeout();
                } else {
                    socket.once('secureConnect', armReadTimeout);
                }
            });

            //보낼 데이터
            logger.info('[' + trdNo + '][Send Data]' + sendData);

            request.end(sendData, 'utf8');
        } catch (e) {
            //URL 형식 오류 등으로 요청 생성 자체가 실패한 경우에도 오류 전문으로 반환합니다.
            fail('[HTTP Connect Error]' + e.toString());
        }
    });
}

module.exports = { sendApi };
