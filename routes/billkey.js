'use strict';

const express = require('express');

const config = require('../config');
const { param, setHash, callApi, clientIp } = require('../lib/api-util');
const { getLogger } = require('../lib/logger');

const router = express.Router();

/** 로거 얻기 */
const logger = getLogger('trans');

/* ============================================================================================
 *  신용카드 0원 등록(빌키발급) 결제창 호출 폼
 *  - 실제 결제 없이 0원 인증으로 카드를 등록하고 정기결제용 billKey를 발급받습니다.
 *  - 해시/암호화는 /pay_encryptParams, 결제창 응답 수신은 /pay_receiveResult를 재사용합니다.
 *  ============================================================================================ */
router.get('/cardReg_form', (req, res) => {
    res.render('cardReg_form', {
        PAYMENT_SERVER: config.PAYMENT_SERVER,
        SERVICE_BASE_URL: config.SERVICE_BASE_URL,
        remoteAddr: clientIp(req) //고객 IP
    });
});

/* ============================================================================================
 *  신용카드 빌키 결제(2회차) 요청 폼
 *  ============================================================================================ */
router.get('/billkey_pay_form', (req, res) => {
    res.render('billkey_pay_form', {
        SERVICE_BASE_URL: config.SERVICE_BASE_URL
    });
});

/* ============================================================================================
 *  신용카드 빌키 결제(2회차) 요청 및 결과 화면
 *  - 0원 등록 또는 표준 결제창에서 발급받은 billKey로 UI 없이 서버 간 통신으로 결제합니다.
 *  - 호출 경로: /spay/APICardActionPay.do (게이트웨이, JSON)
 *  - 빌키 결제 전용이며 카드번호 직접 입력(수기결제)은 지원하지 않습니다.
 *  ============================================================================================ */
router.post('/billkey_payResult', async (req, res) => {
    //설정 정보 가져오기
    const aesKey = config.AES256_KEY;           //AES256 암복호화 키
    const licenseKey = config.LICENSE_KEY;      //라이센스 키
    const apiHost = config.CANCEL_SERVER;       //게이트웨이(API) 서버 = 취소/빌키결제 공통 호스트(tbgw/gw)
    const connTimeout = config.CONN_TIMEOUT;    //connect timeout
    const readTimeout = config.READ_TIMEOUT;    //read timeout

    //요청 파라미터(헤더)
    const REQ_HEADER = {
        mchtId: param(req, 'mchtId'),           //상점아이디
        ver: param(req, 'ver'),                 //버전
        method: param(req, 'method'),           //결제수단(CA)
        bizType: param(req, 'bizType'),         //업무구분(B0)
        encCd: param(req, 'encCd'),             //암호화구분
        mchtTrdNo: param(req, 'mchtTrdNo'),     //상점주문번호
        trdDt: param(req, 'trdDt'),             //요청일자
        trdTm: param(req, 'trdTm'),             //요청시간
        mobileYn: param(req, 'mobileYn'),       //모바일여부
        osType: param(req, 'osType')            //운영체제구분
    };

    //요청 파라미터(바디) - 빌키 결제 전용(카드번호 등 수기 입력 필드 없음)
    const REQ_BODY = {
        pmtprdNm: param(req, 'pmtprdNm'),       //상품명
        mchtCustNm: param(req, 'mchtCustNm'),   //상점고객명
        mchtCustId: param(req, 'mchtCustId'),   //상점고객아이디
        email: param(req, 'email'),             //이메일
        billKey: param(req, 'billKey'),         //빌키
        instmtMon: param(req, 'instmtMon'),     //할부개월수
        crcCd: param(req, 'crcCd'),             //통화구분
        taxTypeCd: param(req, 'taxTypeCd'),     //세금유형
        trdAmt: param(req, 'trdAmt'),           //거래금액
        taxAmt: param(req, 'taxAmt'),           //과세금액
        vatAmt: param(req, 'vatAmt'),           //부가세금액
        taxFreeAmt: param(req, 'taxFreeAmt'),   //비과세금액
        svcAmt: param(req, 'svcAmt'),           //봉사료
        notiUrl: param(req, 'notiUrl'),         //결과처리URL
        mchtParam: param(req, 'mchtParam')      //기타주문정보
    };

    //응답 파라미터(바디)
    const RES_BODY = [
        'pktHash',          //해쉬값
        'trdAmt',           //거래금액
        'billKey',          //빌키
        'cardNo',           //마스킹된 카드번호(사전 협의 가맹점 한정)
        'vldDtMon',         //유효기간(월)
        'vldDtYear',        //유효기간(년)
        'issrId',           //발급사아이디
        'cardNm',           //카드사명
        'cardKind',         //카드종류명
        'ninstmtTypeCd',    //무이자할부타입
        'instmtMon',        //할부개월수
        'apprNo'            //승인번호
    ];

    //AES256 암호화 필요 파라미터(요청) - 금액 항목만
    const ENCRYPT_PARAMS = ['trdAmt', 'taxAmt', 'vatAmt', 'taxFreeAmt', 'svcAmt'];

    //AES256 복호화 필요 파라미터(응답)
    const DECRYPT_PARAMS = ['trdAmt'];

    /* ======================================================================================================================
     *                          SHA256 해쉬 처리
     *          조합필드 : 요청일자 + 요청시간 + 상점아이디 + 상점주문번호 + 거래금액(평문) + 라이센스키
     *          (암호화 전 평문 trdAmt로 해쉬를 생성해야 하므로 callApi 호출 전에 처리합니다.)
     *  ====================================================================================================================== */
    setHash(REQ_BODY, REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + REQ_BODY.trdAmt + licenseKey,
        REQ_HEADER.mchtTrdNo, logger);

    /* ======================================================================
     *      암호화 -> API호출(가맹점->헥토파이낸셜) -> 응답 파싱 -> 복호화
     *  ====================================================================== */
    const respParam = await callApi({
        header: REQ_HEADER,
        body: REQ_BODY,
        requestUrl: apiHost + '/spay/APICardActionPay.do', //신용카드 빌키 결제 URL
        aesKey: aesKey,
        encryptKeys: ENCRYPT_PARAMS,
        decryptKeys: DECRYPT_PARAMS,
        resBodyKeys: RES_BODY,
        connTimeout: connTimeout,
        readTimeout: readTimeout
    });

    res.render('billkey_pay_showResult', { respParam: respParam });
});

module.exports = router;
