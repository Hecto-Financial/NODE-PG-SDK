'use strict';

const { getLogger } = require('./lib/logger');

// 노티 처리 관련 로거
const notiLogger = getLogger('notiTrans');

/*
    아래 함수들은 노티 수신 결과에 따라 호출되며, 처리 성공 여부를 boolean으로 반환합니다.
    true를 반환하면 헥토파이낸셜에 OK, false를 반환하면 FAIL로 응답합니다.
    FAIL로 응답하면 헥토파이낸셜이 노티를 재시도합니다.

    DB 처리 등으로 async 함수로 작성해도 됩니다. 호출부에서 완료를 기다린 뒤 결과를 사용합니다.
    함수가 예외를 던지면 FAIL로 응답하여 재시도를 받습니다.

    [주의] 헥토파이낸셜이 응답을 받지 못하면 같은 노티가 다시 전달될 수 있으므로,
    중복 수신에 대비한 멱등성 처리는 가맹점에서 구현해야 합니다.
*/

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
