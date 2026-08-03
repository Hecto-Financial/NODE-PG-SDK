'use strict';

const express = require('express');

const config = require('../config');
const EncryptUtil = require('../lib/encrypt-util');
const HttpClientUtil = require('../lib/http-client');
const { param, parseResponse, encryptParams, decryptParams, clientIp } = require('../lib/api-util');
const { getLogger } = require('../lib/logger');

const router = express.Router();

/** 로거 얻기 */
const logger = getLogger('trans');

/* ============================================================================================
 *  결제시 메인 폼
 *  ============================================================================================ */
router.get('/pay_form', (req, res) => {
    res.render('pay_form', {
        PG_MID: config.PG_MID,
        SUBS_MID_KAKAO: config.SUBS_MID_KAKAO,
        SUBS_MID_NAVER: config.SUBS_MID_NAVER,
        PAYMENT_SERVER: config.PAYMENT_SERVER,
        CANCEL_SERVER: config.CANCEL_SERVER,
        SERVICE_BASE_URL: config.SERVICE_BASE_URL,
        remoteAddr: clientIp(req) //고객 IP
    });
});

/* ============================================================================================
 *  [운영 적용 시 필수 확인]
 *  이 페이지는 결제 요청 파라미터의 SHA256 해시와 AES256 암호문을 생성해 반환하는 샘플입니다.
 *
 *  1. 이 페이지를 인증(로그인 세션 등) 없이 외부에 노출하지 마십시오.
 *     인증 없이 노출되면 누구나 임의 금액에 대한 유효한 pktHash를 얻을 수 있어
 *     해시의 목적인 거래금액 위변조 방지가 무력화됩니다.
 *  2. 거래금액(plainTrdAmt)을 요청 파라미터로 받아 그대로 해시하는 것은 테스트 편의를 위한
 *     구성입니다. 운영에서는 가맹점 서버에 저장된 주문 정보에서 금액을 조회하여 해시를
 *     생성하고, 클라이언트가 전달한 금액은 신뢰하지 마십시오.
 *  ============================================================================================ */
router.post('/pay_encryptParams', (req, res) => {
    /** 설정 정보 얻기 */
    const licenseKey = config.LICENSE_KEY;
    const aesKey = config.AES256_KEY;

    /** 해쉬 및 aes256암호화 후 리턴 될 json */
    const rsp = {};

    /** SHA256 해쉬 파라미터 */
    const mchtId = param(req, 'mchtId');
    const method = param(req, 'method');
    const mchtTrdNo = param(req, 'mchtTrdNo');
    const trdDt = param(req, 'trdDt');
    const trdTm = param(req, 'trdTm');
    const trdAmt = param(req, 'plainTrdAmt');

    /** AES256 암호화 파라미터 */
    const params = {
        trdAmt: trdAmt,
        mchtCustNm: param(req, 'plainMchtCustNm'),
        cphoneNo: param(req, 'plainCphoneNo'),
        email: param(req, 'plainEmail'),
        mchtCustId: param(req, 'plainMchtCustId'),
        taxAmt: param(req, 'plainTaxAmt'),
        vatAmt: param(req, 'plainVatAmt'),
        taxFreeAmt: param(req, 'plainTaxFreeAmt'),
        svcAmt: param(req, 'plainSvcAmt'),
        clipCustNm: param(req, 'plainClipCustNm'),
        clipCustCi: param(req, 'plainClipCustCi'),
        clipCustPhoneNo: param(req, 'plainClipCustPhoneNo')
    };

    /* ============================================================================================
     *  SHA256 해쉬 처리
     *  조합 필드 : 상점아이디 + 결제수단 + 상점주문번호 + 요청일자 + 요청시간 + 거래금액(평문) + 라이센스키
     *  ============================================================================================ */
    const hashPlain = mchtId + method + mchtTrdNo + trdDt + trdTm + trdAmt + licenseKey;
    let hashCipher = '';
    try {
        hashCipher = EncryptUtil.digestSHA256(hashPlain); //해쉬 값
    } catch (e) {
        logger.error('[' + mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
        throw e;
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        logger.info('[' + mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
        rsp.hashCipher = hashCipher; // sha256 해쉬 결과 저장
    }

    /* ============================================================================================
     *  AES256 암호화 처리(AES-256-ECB encrypt -> Base64 encoding)
     *  ============================================================================================ */
    try {
        Object.keys(params).forEach((key) => {
            const aesPlain = params[key];
            if (aesPlain !== '') {
                const aesCipher = EncryptUtil.encryptParam(aesKey, aesPlain);

                params[key] = aesCipher; //암호화된 데이터로 세팅
                logger.info('[' + mchtTrdNo + '][AES256 Encrypt] ' + key + '[' + aesPlain + '] ---> [' + aesCipher + ']');
            }
        });
    } catch (e) {
        logger.error('[' + mchtTrdNo + '][AES256 Encrypt] AES256 Fail! : ' + e.toString());
        throw e;
    } finally {
        rsp.encParams = params; //aes256 암호화 결과 저장
    }

    /* 결과 리턴 */
    res.json(rsp);
});

/* ============================================================================================
 *  결제 완료 후 응답파라미터 수신
 *  ============================================================================================ */
router.all('/pay_receiveResult', (req, res) => {
    /** 설정 정보 저장 */
    const aesKey = config.AES256_KEY;

    /** 응답 파라미터 세팅 */
    const RES_PARAMS = {
        mchtId: param(req, 'mchtId'),               //상점아이디
        outStatCd: param(req, 'outStatCd'),         //결과코드
        outRsltCd: param(req, 'outRsltCd'),         //거절코드
        outRsltMsg: param(req, 'outRsltMsg'),       //결과메세지
        method: param(req, 'method'),               //결제수단
        mchtTrdNo: param(req, 'mchtTrdNo'),         //상점주문번호
        mchtCustId: param(req, 'mchtCustId'),       //상점고객아이디
        trdNo: param(req, 'trdNo'),                 //헥토파이낸셜 거래번호
        trdAmt: param(req, 'trdAmt'),               //거래금액
        mchtParam: param(req, 'mchtParam'),         //상점 예약필드
        authDt: param(req, 'authDt'),               //승인일시
        authNo: param(req, 'authNo'),               //승인번호
        reqIssueDt: param(req, 'reqIssueDt'),       //채번요청일시
        intMon: param(req, 'intMon'),               //할부개월수
        fnNm: param(req, 'fnNm'),                   //카드사명
        fnCd: param(req, 'fnCd'),                   //카드사코드
        pointTrdNo: param(req, 'pointTrdNo'),       //포인트거래번호
        pointTrdAmt: param(req, 'pointTrdAmt'),     //포인트거래금액
        cardTrdAmt: param(req, 'cardTrdAmt'),       //신용카드결제금액
        vtlAcntNo: param(req, 'vtlAcntNo'),         //가상계좌번호
        expireDt: param(req, 'expireDt'),           //입금기한
        cphoneNo: param(req, 'cphoneNo'),           //휴대폰번호
        billKey: param(req, 'billKey'),             //자동결제키
        csrcAmt: param(req, 'csrcAmt')              //현금영수증 발급 금액(네이버페이)
    };

    //AES256 복호화 필요 파라미터
    const DECRYPT_PARAMS = ['mchtCustId', 'trdAmt', 'pointTrdAmt', 'cardTrdAmt', 'vtlAcntNo', 'cphoneNo', 'csrcAmt'];

    decryptParams(RES_PARAMS, DECRYPT_PARAMS, aesKey, RES_PARAMS.mchtTrdNo);

    //응답 파라미터 로깅
    const logStr = Object.keys(RES_PARAMS)
        .map((key) => key + '(' + RES_PARAMS[key] + ') ')
        .join('');
    logger.info('[' + RES_PARAMS.mchtTrdNo + '][Response Data] ' + logStr);

    res.render('pay_receiveResult', { RES_PARAMS: RES_PARAMS });
});

/* ============================================================================================
 *  자식페이지에서 전달된 응답파라미터 출력
 *  ============================================================================================ */
router.post('/pay_showResult', (req, res) => {
    /** 넘어온 응답 파라미터 받기 */
    res.render('pay_showResult', {
        mchtId: param(req, 'respMchtId'),               //상점아이디
        outStatCd: param(req, 'respOutStatCd'),         //결과코드
        outRsltCd: param(req, 'respOutRsltCd'),         //거절코드
        outRsltMsg: param(req, 'respOutRsltMsg'),       //결과메세지
        method: param(req, 'respMethod'),               //결제수단
        mchtTrdNo: param(req, 'respMchtTrdNo'),         //상점주문번호
        mchtCustId: param(req, 'respMchtCustId'),       //상점고객아이디
        trdNo: param(req, 'respTrdNo'),                 //헥토파이낸셜 거래번호
        trdAmt: param(req, 'respTrdAmt'),               //거래금액
        mchtParam: param(req, 'respMchtParam'),         //상점예약필드
        authDt: param(req, 'respAuthDt'),               //승인일시
        authNo: param(req, 'respAuthNo'),               //승인번호
        reqIssueDt: param(req, 'respReqIssueDt'),       //채번요청일시
        intMon: param(req, 'respIntMon'),               //할부개월수
        fnNm: param(req, 'respFnNm'),                   //카드사명
        fnCd: param(req, 'respFnCd'),                   //카드사코드
        pointTrdNo: param(req, 'respPointTrdNo'),       //포인트거래번호
        pointTrdAmt: param(req, 'respPointTrdAmt'),     //포인트거래금액
        cardTrdAmt: param(req, 'respCardTrdAmt'),       //신용카드결제금액
        vtlAcntNo: param(req, 'respVtlAcntNo'),         //가상계좌번호
        expireDt: param(req, 'respExpireDt'),           //입금만료일시
        cphoneNo: param(req, 'respCphoneNo'),           //휴대폰번호
        billKey: param(req, 'respBillKey'),             //자동결제키
        csrcAmt: param(req, 'respCsrcAmt')              //현금영수증 발급 금액(네이버페이)
    });
});

/* ============================================================================================
 *  휴대폰 자동연장결제(2회차) 요청 및 결과 화면
 *  ============================================================================================ */
router.post('/pay_autoPayResult', async (req, res) => {
    //설정 정보 가져오기
    const aesKey = config.AES256_KEY;           //AES256 암복호화 키
    const licenseKey = config.LICENSE_KEY;      //라이센스 키
    const apiHost = config.CANCEL_SERVER;       //자동연장결제 타겟 서버
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
        telCo: param(req, 'telCo'),             //통신사
        email: param(req, 'email'),             //상점고객이메일
        mUserId: param(req, 'mUserId'),         //상점고객아이디
        crcCd: param(req, 'crcCd'),             //통화구분
        trdAmt: param(req, 'trdAmt'),           //거래금액
        prdtNm: param(req, 'prdtNm'),           //상품명
        sellerNm: param(req, 'sellerNm'),       //판매자명
        ordNm: param(req, 'ordNm'),             //주문자명
        billKey: param(req, 'billKey')          //자동결제키
    };

    //응답 파라미터(헤더)
    const RES_HEADER = [
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

    //응답 파라미터(바디)
    const RES_BODY = [
        'pktHash',      //해쉬값
        'telCo',        //통신사
        'trdAmt',       //거래금액
        'billKey'       //자동결제키
    ];

    //AES256 암호화 필요 파라미터
    const ENCRYPT_PARAMS = ['telCo', 'trdAmt'];

    //AES256 복호화 필요 파라미터
    const DECRYPT_PARAMS = ['telCo', 'trdAmt'];

    /* ======================================================================================================================
     *                          SHA256 해쉬 처리
     *          조합필드 : 요청일자 + 요청시간 + 상점아이디 + 상점주문번호 + 거래금액 + 라이센스키
     *  ====================================================================================================================== */
    let hashPlain = '';
    let hashCipher = '';
    try {
        hashPlain = REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + REQ_BODY.trdAmt + licenseKey;
        hashCipher = EncryptUtil.digestSHA256(hashPlain);
    } catch (e) {
        logger.error('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        logger.info('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
        REQ_BODY.pktHash = hashCipher; //해쉬 결과 값 세팅
    }

    /* ======================================================================
     *                              AES256 암호화 처리
     *  ====================================================================== */
    encryptParams(REQ_BODY, ENCRYPT_PARAMS, aesKey, REQ_HEADER.mchtTrdNo);

    //URL설정
    const requestUrl = apiHost + '/spay/APIService.do'; //휴대폰 자동연장 결제 URL

    //요청파라미터 세팅
    //params, data 이름은 헥토파이낸셜로 전달되어야 하는 값이니 변경하지 마십시오.
    const reqParam = { params: REQ_HEADER, data: REQ_BODY };

    /* ======================================================================
     *                          API호출(가맹점->헥토파이낸셜) 및 응답 처리
     *  ====================================================================== */
    //sendApi ( API호출 URL, 전송될데이터, 연결 타임아웃, 수신 타임아웃 )
    const resData = await HttpClientUtil.sendApi(requestUrl, reqParam, connTimeout, readTimeout);

    //응답 파라미터 파싱
    const respParam = parseResponse(resData, RES_HEADER, RES_BODY, REQ_HEADER.mchtTrdNo);

    /* ======================================================================
     *                          AES256 복호화 처리
     *  ====================================================================== */
    decryptParams(respParam, DECRYPT_PARAMS, aesKey, REQ_HEADER.mchtTrdNo);

    res.render('pay_autoPayResult', { respParam: respParam });
});

/* ============================================================================================
 *  간편(카카오페이/네이버페이) 정기결제(2회차 이후) 요청 및 결과 화면
 *  ============================================================================================ */
router.post('/pay_subsPayResult', async (req, res) => {
    //설정 정보 가져오기
    const aesKey = config.AES256_KEY;           //AES256 암복호화 키
    const licenseKey = config.LICENSE_KEY;      //라이센스 키
    const apiHost = config.CANCEL_SERVER;       //간편 정기결제 타겟 서버
    const connTimeout = config.CONN_TIMEOUT;    //connect timeout
    const readTimeout = config.READ_TIMEOUT;    //read timeout

    //요청 파라미터(헤더)
    const REQ_HEADER = {
        mchtId: param(req, 'mchtId'),           //상점아이디(간편결제사별 정기결제 MID 상이)
        ver: param(req, 'ver'),                 //버전
        method: param(req, 'method'),           //결제수단(PZ:간편결제)
        bizType: param(req, 'bizType'),         //업무구분(B3:정기결제)
        encCd: param(req, 'encCd'),             //암호화구분
        mchtTrdNo: param(req, 'mchtTrdNo'),     //상점주문번호
        trdDt: param(req, 'trdDt'),             //요청일자
        trdTm: param(req, 'trdTm'),             //요청시간
        mobileYn: param(req, 'mobileYn'),       //모바일여부
        osType: param(req, 'osType')            //운영체제구분
    };

    //요청 파라미터(바디)
    const REQ_BODY = {
        corpPayCode: param(req, 'corpPayCode'), //간편결제사 ID(KKP:카카오페이, NVP:네이버페이)
        mUserId: param(req, 'mUserId'),         //상점고객아이디(빌키 발급 시 사용한 값과 동일해야 함)
        ordNm: param(req, 'ordNm'),             //주문자명
        crcCd: param(req, 'crcCd'),             //통화구분
        trdAmtEnc: param(req, 'trdAmt'),        //거래금액
        billKey: param(req, 'billKey'),         //자동결제키(빌키)
        prdtNm: param(req, 'prdtNm')            //결제상품명
    };

    //응답 파라미터(헤더)
    const RES_HEADER = [
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

    //응답 파라미터(바디)
    const RES_BODY = [
        'pktHash',      //해쉬값
        'AuthTrdNo',    //결제 시 발급된 거래번호
        'TrdAmtEnc',    //거래금액
        'csrcIssNo'     //현금영수증 승인번호(네이버페이 전용)
    ];

    //AES256 암호화 필요 파라미터
    const ENCRYPT_PARAMS = ['trdAmtEnc'];

    //AES256 복호화 필요 파라미터
    const DECRYPT_PARAMS = ['TrdAmtEnc'];

    /* ======================================================================================================================
     *                          SHA256 해쉬 처리
     *          조합필드 : 요청일자 + 요청시간 + 상점아이디 + 상점주문번호 + 거래금액 + 라이센스키
     *  ====================================================================================================================== */
    let hashPlain = '';
    let hashCipher = '';
    try {
        hashPlain = REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + REQ_BODY.trdAmtEnc + licenseKey;
        hashCipher = EncryptUtil.digestSHA256(hashPlain);
    } catch (e) {
        logger.error('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        logger.info('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
        REQ_BODY.pktHash = hashCipher; //해쉬 결과 값 세팅
    }

    /* ======================================================================
     *                              AES256 암호화 처리
     *  ====================================================================== */
    encryptParams(REQ_BODY, ENCRYPT_PARAMS, aesKey, REQ_HEADER.mchtTrdNo);

    //URL설정
    const requestUrl = apiHost + '/spay/APIPZSubsTrd.do'; //간편 정기결제 URL

    //요청파라미터 세팅
    //params, data 이름은 헥토파이낸셜로 전달되어야 하는 값이니 변경하지 마십시오.
    const reqParam = { params: REQ_HEADER, data: REQ_BODY };

    /* ======================================================================
     *                          API호출(가맹점->헥토파이낸셜) 및 응답 처리
     *      간편 정기결제 API는 노티 전문이 없으므로 응답 전문으로 결과를 확인합니다.
     *  ====================================================================== */
    //sendApi ( API호출 URL, 전송될데이터, 연결 타임아웃, 수신 타임아웃 )
    const resData = await HttpClientUtil.sendApi(requestUrl, reqParam, connTimeout, readTimeout);

    //응답 파라미터 파싱
    const respParam = parseResponse(resData, RES_HEADER, RES_BODY, REQ_HEADER.mchtTrdNo);

    /* ======================================================================
     *                          AES256 복호화 처리
     *  ====================================================================== */
    decryptParams(respParam, DECRYPT_PARAMS, aesKey, REQ_HEADER.mchtTrdNo);

    res.render('pay_subsPayResult', { respParam: respParam });
});

/* ============================================================================================
 *  간편 정기결제 빌키 상태조회(S1) / 빌키 삭제(C1)
 *  ============================================================================================ */
router.post('/pay_subsManageResult', async (req, res) => {
    //설정 정보 가져오기
    const licenseKey = config.LICENSE_KEY;      //라이센스 키
    const apiHost = config.CANCEL_SERVER;       //간편 정기결제 타겟 서버
    const connTimeout = config.CONN_TIMEOUT;    //connect timeout
    const readTimeout = config.READ_TIMEOUT;    //read timeout

    //요청 파라미터(헤더)
    const REQ_HEADER = {
        mchtId: param(req, 'mchtId'),           //상점아이디(간편결제사별 정기결제 MID 상이)
        ver: param(req, 'ver'),                 //버전
        method: param(req, 'method'),           //결제수단(PZ:간편결제)
        bizType: param(req, 'bizType'),         //업무구분(S1:빌키 상태조회, C1:빌키 삭제)
        encCd: param(req, 'encCd'),             //암호화구분
        mchtTrdNo: param(req, 'mchtTrdNo'),     //상점주문번호
        trdDt: param(req, 'trdDt'),             //요청일자
        trdTm: param(req, 'trdTm'),             //요청시간
        mobileYn: param(req, 'mobileYn'),       //모바일여부
        osType: param(req, 'osType')            //운영체제구분
    };

    //요청 파라미터(바디)
    const REQ_BODY = {
        corpPayCode: param(req, 'corpPayCode'), //간편결제사 ID(KKP:카카오페이, NVP:네이버페이)
        billKey: param(req, 'billKey')          //자동결제키(빌키)
    };

    //업무구분에 따른 API URL 및 업무명 설정
    //S1(상태조회) : /spay/APIPZSubsStatus.do, C1(삭제) : /spay/APIPZSubsDelKey.do
    const bizType = REQ_HEADER.bizType;
    const apiPath = bizType === 'S1' ? '/spay/APIPZSubsStatus.do' : '/spay/APIPZSubsDelKey.do';
    const jobName = bizType === 'S1' ? '빌키 상태조회' : '빌키 삭제';

    //응답 파라미터(헤더)
    const RES_HEADER = [
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

    //응답 파라미터(바디)
    const RES_BODY = ['pktHash']; //해쉬값

    /* ======================================================================================================================
     *                          SHA256 해쉬 처리
     *          조합필드 : 요청일자 + 요청시간 + 상점아이디 + 상점주문번호 + 라이센스키
     *  ====================================================================================================================== */
    let hashPlain = '';
    let hashCipher = '';
    try {
        hashPlain = REQ_HEADER.trdDt + REQ_HEADER.trdTm + REQ_HEADER.mchtId + REQ_HEADER.mchtTrdNo + licenseKey;
        hashCipher = EncryptUtil.digestSHA256(hashPlain);
    } catch (e) {
        logger.error('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Hashing Fail! : ' + e.toString());
    } finally {
        //[주의] hashPlain에는 라이센스키가 평문으로 포함됩니다. 운영 적용 시 이 로그를 제거하거나 키 부분을 마스킹하십시오.
        logger.info('[' + REQ_HEADER.mchtTrdNo + '][SHA256 HASHING] Plain Text[' + hashPlain + '] ---> Cipher Text[' + hashCipher + ']');
        REQ_BODY.pktHash = hashCipher; //해쉬 결과 값 세팅
    }

    //URL설정
    const requestUrl = apiHost + apiPath; //간편 정기결제 빌키 상태조회/삭제 URL

    //요청파라미터 세팅
    //params, data 이름은 헥토파이낸셜로 전달되어야 하는 값이니 변경하지 마십시오.
    const reqParam = { params: REQ_HEADER, data: REQ_BODY };

    /* ======================================================================
     *                          API호출(가맹점->헥토파이낸셜) 및 응답 처리
     *      간편 정기결제 상태조회/키삭제 API는 노티 전문이 없으므로 응답 전문으로 결과를 확인합니다.
     *  ====================================================================== */
    //sendApi ( API호출 URL, 전송될데이터, 연결 타임아웃, 수신 타임아웃 )
    const resData = await HttpClientUtil.sendApi(requestUrl, reqParam, connTimeout, readTimeout);

    //응답 파라미터 파싱
    const respParam = parseResponse(resData, RES_HEADER, RES_BODY, REQ_HEADER.mchtTrdNo);

    res.render('pay_subsManageResult', { respParam: respParam, jobName: jobName });
});

module.exports = router;
