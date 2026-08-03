'use strict';

const { getLogger } = require('./lib/logger');

// 노티 처리 관련 로거
const notiLogger = getLogger('notiTrans');

// 노티를 성공적으로 수신한 경우 처리할 로직을 작성하여 주세요.
function notiSuccess(noti) {
    /* TODO : 관련 로직 추가 */

    return true;
}

/** 입금대기시 처리할 로직을 작성하여 주세요. */
function notiWaitingPay(noti) {
    /* TODO : 관련 로직 추가 */

    return true;
}

/** 노티 수신중 해시 체크 에러가 생긴 경우 처리할 로직을 작성하여 주세요. */
function notiHashError(noti) {
    /* TODO : 관련 로직 추가 */

    return false;
}

module.exports = { notiLogger, notiSuccess, notiWaitingPay, notiHashError };
