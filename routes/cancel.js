'use strict';

const express = require('express');

const config = require('../config');
const { param, setHash, callApi } = require('../lib/api-util');
const { getLogger } = require('../lib/logger');

const router = express.Router();

/** 로거 얻기 */
const logger = getLogger('trans');

/* ============================================================================================
 *  취소 메인 폼
 *  ============================================================================================ */
router.get('/cancel_form', (req, res) => {
    res.render('cancel_form', {
        PG_MID: config.PG_MID,
        SUBS_MID_KAKAO: config.SUBS_MID_KAKAO,
        SUBS_MID_NAVER: config.SUBS_MID_NAVER
    });
});

/* ============================================================================================
 *  취소 처리 및 결과 화면
 *  ============================================================================================ */
router.post('/cancel_showResult', async (req, res) => {
    //설정 정보 가져오기
    const aesKey = config.AES256_KEY;           //AES256 암복호화 키
    const licenseKey = config.LICENSE_KEY;      //라이센스 키
    const cnclServer = config.CANCEL_SERVER;    //타겟URL
    const connTimeout = config.CONN_TIMEOUT;    //connect timeout
    const readTimeout = config.READ_TIMEOUT;    //read timeout

    //요청 파라미터(헤더)
    const REQ_HEADER = {
        mchtId: param(req, 'mchtId'),           //상점아이디
        ver: param(req, 'ver'),                 //버전
        method: param(req, 'method'),           //결제수단
        bizType: param(req, 'bizType'),         //업무구분
        encCd: param(req, 'encCd'),             //암호화구분
        mchtTrdNo: param(req, 'mchtTrdNo'),     //상점주문번호
        trdDt: param(req, 'trdDt'),             //요청일자
        trdTm: param(req, 'trdTm'),             //요청시간
        mobileYn: param(req, 'mobileYn'),       //모바일여부
        osType: param(req, 'osType')            //운영체제구분
    };

    //요청 파라미터(바디)
    const REQ_BODY = {
        orgTrdNo: param(req, 'orgTrdNo'),               //원거래번호
        cnclAmt: param(req, 'cnclAmt'),                 //취소금액
        crcCd: param(req, 'crcCd'),                     //통화구분
        cnclOrd: param(req, 'cnclOrd'),                 //부분취소차수
        cnclRsn: param(req, 'cnclRsn'),                 //취소사유
        taxTypeCd: param(req, 'taxTypeCd'),             //면세유형
        taxAmt: param(req, 'taxAmt'),                   //과세금액
        vatAmt: param(req, 'vatAmt'),                   //부가세금액
        taxFreeAmt: param(req, 'taxFreeAmt'),           //비과세금액(면세금액)
        svcAmt: param(req, 'svcAmt'),                   //봉사료
        vAcntNo: param(req, 'vAcntNo'),                 //가상계좌번호
        refundBankCd: param(req, 'refundBankCd'),       //환불은행코드
        refundAcntNo: param(req, 'refundAcntNo'),       //환불계좌번호
        refundDpstrNm: param(req, 'refundDpstrNm')      //환불계좌예금주명
    };

    //응답 파라미터(바디)
    const RES_BODY = [
        'pktHash',      //해쉬값
        'orgTrdNo',     //원거래번호
        'cnclAmt',      //취소금액
        'cardCnclAmt',  //신용카드취소금액
        'pntCnclAmt',   //포인트취소금액
        'coupCnclAmt',  //쿠폰취소금액
        'blcAmt',       //취소가능잔액
        'acntType',     //계좌구분
        'vAcntNo',      //가상계좌번호
        'rfdPsblCd'     //휴대폰결제 환불가능여부
    ];

    //AES256 암호화 필요 파라미터
    const ENCRYPT_PARAMS = ['refundAcntNo', 'vAcntNo', 'cnclAmt', 'taxAmt', 'vatAmt', 'taxFreeAmt', 'svcAmt'];

    //AES256 복호화 필요 파라미터
    const DECRYPT_PARAMS = ['cnclAmt', 'cardCnclAmt', 'pntCnclAmt', 'coupCnclAmt', 'blcAmt', 'vAcntNo'];

    /* =================================================================================================================
     *                          SHA256 해쉬 처리
     *          조합필드 : 요청일자 + 요청시간 + 상점아이디 + 상점주문번호 + 취소금액(평문) + 라이센스키
     *  ================================================================================================================= */
    let hashPlain = '';
    if (REQ_HEADER.method === 'VA' && REQ_HEADER.bizType === 'A2') { //가상계좌/010가상계좌 채번취소 0원으로 설정
        hashPlain = REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + '0' + licenseKey;
    } else {
        hashPlain = REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + REQ_BODY.cnclAmt + licenseKey;
    }
    setHash(REQ_BODY, hashPlain, REQ_HEADER.mchtTrdNo, logger);

    /* ======================================================================
     *                          타겟 URL 설정
     *  타겟 서버 : (tb)gw.settlebank.co.kr
     *  공통 취소 : ~/spay/APICancel.do
     *  가상계좌 채번취소 : ~/spay/APIVBank.do
     *  가상계좌,휴대폰결제 환불 : ~/spay/APIRefund.do
     *  ====================================================================== */
    let requestUrl = '';
    if (REQ_HEADER.method === 'VA') {
        if (REQ_HEADER.bizType === 'C0') {
            requestUrl = cnclServer + '/spay/APIRefund.do';
        } else {
            requestUrl = cnclServer + '/spay/APIVBank.do';
        }
    } else if (REQ_HEADER.method === 'MP') {
        if (REQ_HEADER.bizType === 'C1') {
            requestUrl = cnclServer + '/spay/APIRefund.do';
        } else {
            requestUrl = cnclServer + '/spay/APICancel.do';
        }
    } else {
        requestUrl = cnclServer + '/spay/APICancel.do';
    }

    /* ======================================================================
     *      암호화 -> API호출(가맹점->헥토파이낸셜) -> 응답 파싱 -> 복호화
     *  ====================================================================== */
    const respParam = await callApi({
        header: REQ_HEADER,
        body: REQ_BODY,
        requestUrl: requestUrl,
        aesKey: aesKey,
        encryptKeys: ENCRYPT_PARAMS,
        decryptKeys: DECRYPT_PARAMS,
        resBodyKeys: RES_BODY,
        connTimeout: connTimeout,
        readTimeout: readTimeout
    });

    res.render('cancel_showResult', { respParam: respParam });
});

module.exports = router;
