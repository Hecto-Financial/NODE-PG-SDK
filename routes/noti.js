'use strict';

const express = require('express');

const config = require('../config');
const EncryptUtil = require('../lib/encrypt-util');
const StringUtil = require('../lib/string-util');
const { notiLogger, notiSuccess, notiWaitingPay, notiHashError } = require('../process-noti');

const router = express.Router();

/**
 * 노티 수신 파라미터를 원본 그대로 얻습니다.
 * 해시 검증은 수신한 값 그대로를 대상으로 해야 하므로 별도의 가공을 하지 않습니다.
 *
 * 같은 이름의 필드가 여러 번 전달되면 첫 번째 값을 사용합니다.
 * 값들을 합치면 해시 대상 평문이 달라져 정상 노티가 검증에 실패하게 됩니다.
 */
function notiParam(req, name) {
    const body = req.body || {};
    let value = Object.prototype.hasOwnProperty.call(body, name) ? body[name] : req.query[name];

    if (Array.isArray(value)) {
        value = value[0];
    }
    return (value === null || value === undefined) ? '' : String(value);
}

/** 이 페이지는 수정시 주의가 필요합니다. 응답 본문에 OK/FAIL 이외의 값이 들어가면 동작을 보장할 수 없습니다. */
router.all('/receiveNoti', (req, res) => {
    /** 설정 정보 저장 */
    const licenseKey = config.LICENSE_KEY;

    /** 노티 처리 결과 */
    let resp = false;

    /** 노티 수신 파라미터 */
    const outStatCd = notiParam(req, 'outStatCd');
    const trdNo = notiParam(req, 'trdNo');
    const method = notiParam(req, 'method');
    const bizType = notiParam(req, 'bizType');
    const mchtId = notiParam(req, 'mchtId');
    const mchtTrdNo = notiParam(req, 'mchtTrdNo');
    const mchtCustNm = notiParam(req, 'mchtCustNm');
    const mchtName = notiParam(req, 'mchtName');
    const pmtprdNm = notiParam(req, 'pmtprdNm');
    const trdDtm = notiParam(req, 'trdDtm');
    const trdAmt = notiParam(req, 'trdAmt');
    const billKey = notiParam(req, 'billKey');
    const billKeyExpireDt = notiParam(req, 'billKeyExpireDt');
    const bankCd = notiParam(req, 'bankCd');
    const bankNm = notiParam(req, 'bankNm');
    const cardCd = notiParam(req, 'cardCd');
    const cardNm = notiParam(req, 'cardNm');
    const telecomCd = notiParam(req, 'telecomCd');
    const telecomNm = notiParam(req, 'telecomNm');
    const vAcntNo = notiParam(req, 'vAcntNo');
    const expireDt = notiParam(req, 'expireDt');
    const AcntPrintNm = notiParam(req, 'AcntPrintNm');
    const dpstrNm = notiParam(req, 'dpstrNm');
    const email = notiParam(req, 'email');
    const mchtCustId = notiParam(req, 'mchtCustId');
    const cardNo = notiParam(req, 'cardNo');
    const cardApprNo = notiParam(req, 'cardApprNo');
    const instmtMon = notiParam(req, 'instmtMon');
    const instmtType = notiParam(req, 'instmtType');
    const phoneNoEnc = notiParam(req, 'phoneNoEnc');
    const orgTrdNo = notiParam(req, 'orgTrdNo');
    const orgTrdDt = notiParam(req, 'orgTrdDt');
    const mixTrdNo = notiParam(req, 'mixTrdNo');
    const mixTrdAmt = notiParam(req, 'mixTrdAmt');
    const payAmt = notiParam(req, 'payAmt');
    const csrcIssNo = notiParam(req, 'csrcIssNo');
    const cnclType = notiParam(req, 'cnclType');
    const mchtParam = notiParam(req, 'mchtParam');
    const acntType = notiParam(req, 'acntType');
    const kkmAmt = notiParam(req, 'kkmAmt');
    const coupAmt = notiParam(req, 'coupAmt');
    const pktHash = notiParam(req, 'pktHash');

    /* 응답 파라미터 배열에 저장 */
    const noti = [];
    noti.push('거래상태:' + outStatCd);
    noti.push('거래번호:' + trdNo);
    noti.push('결제수단:' + method);
    noti.push('업무구분:' + bizType);
    noti.push('상점아이디:' + mchtId);
    noti.push('상점거래번호:' + mchtTrdNo);
    noti.push('주문자명:' + mchtCustNm);
    noti.push('상점한글명:' + mchtName);
    noti.push('상품명:' + pmtprdNm);
    noti.push('거래일시:' + trdDtm);
    noti.push('거래금액:' + trdAmt);
    noti.push('자동결제키:' + billKey);
    noti.push('자동결제키 유효기간:' + billKeyExpireDt);
    noti.push('은행코드:' + bankCd);
    noti.push('은행명:' + bankNm);
    noti.push('카드사코드:' + cardCd);
    noti.push('카드명:' + cardNm);
    noti.push('이통사코드:' + telecomCd);
    noti.push('이통사명:' + telecomNm);
    noti.push('가상계좌번호:' + vAcntNo);
    noti.push('가상계좌 입금만료일시:' + expireDt);
    noti.push('통장인자명:' + AcntPrintNm);
    noti.push('입금자명:' + dpstrNm);
    noti.push('고객이메일:' + email);
    noti.push('상점고객아이디:' + mchtCustId);
    noti.push('카드번호:' + cardNo);
    noti.push('카드승인번호:' + cardApprNo);
    noti.push('할부개월수:' + instmtMon);
    noti.push('할부타입:' + instmtType);
    noti.push('휴대폰번호(암호화):' + phoneNoEnc);
    noti.push('원거래번호:' + orgTrdNo);
    noti.push('원거래일자:' + orgTrdDt);
    noti.push('복합결제 거래번호:' + mixTrdNo);
    noti.push('복합결제 금액:' + mixTrdAmt);
    noti.push('실결제금액:' + payAmt);
    noti.push('현금영수증 승인번호:' + csrcIssNo);
    noti.push('취소거래타입:' + cnclType);
    noti.push('기타주문정보:' + mchtParam);
    noti.push('기타주문정보:' + acntType);
    noti.push('기타주문정보:' + kkmAmt);
    noti.push('기타주문정보:' + coupAmt);
    noti.push('해쉬값:' + pktHash); //서버에서 전달된 해쉬 값

    /** 해쉬 조합 필드
     *  결과코드 + 거래일시 + 상점아이디 + 가맹점거래번호 + 거래금액 + 라이센스키 */
    const hashPlain = outStatCd + trdDtm + mchtId + mchtTrdNo + trdAmt + licenseKey;
    let hashCipher = '';

    /** SHA256 해쉬 처리 */
    try {
        hashCipher = EncryptUtil.digestSHA256(hashPlain); //해쉬 값
    } catch (e) {
        notiLogger.error('[' + mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        notiLogger.info('[' + mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
    }

    /**
        hash데이타값이 맞는 지 확인 하는 루틴은 헥토파이낸셜에서 받은 데이타가 맞는지 확인하는 것이므로 꼭 사용하셔야 합니다
        정상적인 결제 건임에도 불구하고 노티 페이지의 오류나 네트웍 문제 등으로 인한 hash 값의 오류가 발생할 수도 있습니다.
        그러므로 hash 오류건에 대해서는 오류 발생시 원인을 파악하여 즉시 수정 및 대처해 주셔야 합니다.
        그리고 정상적으로 데이터를 처리한 경우에도 헥토파이낸셜에서 응답을 받지 못한 경우는 결제결과가 중복해서 나갈 수 있으므로 관련한 처리도 고려되어야 합니다
    */
    if (hashCipher === pktHash) {
        notiLogger.info('[' + mchtTrdNo + '][SHA256 Hash Check] hashCipher[' + hashCipher + '] pktHash[' + pktHash + '] equals?[TRUE]');
        if (outStatCd === '0021') {
            notiLogger.info('[' + mchtTrdNo + '][Success] params:' + StringUtil.join('|', noti));
            resp = notiSuccess(noti);
        } else if (outStatCd === '0051') {
            notiLogger.info('[' + mchtTrdNo + '][Wait For Deposit] params:' + StringUtil.join('|', noti));
            resp = notiWaitingPay(noti);
        } else {
            notiLogger.info('[' + mchtTrdNo + '][Undefined Code] outStatCd:' + outStatCd);
            resp = false;
        }
    } else {
        notiLogger.info('[' + mchtTrdNo + '][SHA256 Hash Check] hashCipher[' + hashCipher + '] pktHash[' + pktHash + '] equals?[FALSE]');
        resp = notiHashError(noti);
    }

    // OK, FAIL문자열은 헥토파이낸셜로 전송되어야 하는 값이므로 변경하거나 삭제하지마십시오.
    res.type('text/plain');
    if (resp) {
        res.send('OK');
        notiLogger.info('[' + mchtTrdNo + '][Result] OK');
    } else {
        res.send('FAIL');
        notiLogger.info('[' + mchtTrdNo + '][Result] FAIL');
    }
});

module.exports = router;
