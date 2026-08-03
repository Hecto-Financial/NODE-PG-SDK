'use strict';

/**
    ===== MID(상점아이디) =====
    상점아이디는 헥토파이낸셜에서 상점으로 발급하는 상점의 고유한 식별자입니다.
    테스트환경에서의 MID는 다음과 같습니다.
        nx_mid_il : 문화/도서/해피/스마트문상/틴캐시/계좌이체/가상계좌/티머니
        nxca_jt_il : 신용카드 인증 결제
        nxca_jt_bi : 신용카드 비인증 결제
        nxca_jt_gu : 신용카드 구인증 결제
        hecto_test : 페이코/카카오페이/네이버페이 간편결제
        nxhp_pl_il : 휴대폰 일반 결제
        nxhp_pl_hd : 휴대폰 인증/승인 분리형
        nxhp_pl_ma : 휴대폰 월 자동 결제
        nxpt_kt_il : 포인트 결제
        nxkkp_auto : 카카오페이 정기결제(자동결제)
        nxnvp_auto : 네이버페이 정기결제(자동결제)
    상용서비스시에는 헥토파이낸셜에서 발급한 상점 고유 MID를 설정하십시오.
*/
const PG_MID = 'nx_mid_il';

/**
    ===== 간편결제 정기결제(자동결제) MID =====
    간편결제 정기결제는 간편결제사별로 별도의 상점아이디를 사용합니다. (카카오페이/네이버페이 상이)
    테스트환경에서는 카카오페이 nxkkp_auto, 네이버페이 nxnvp_auto를 사용하시면 됩니다.
    상용서비스시에는 정기결제 서비스가 설정된 상점 고유 MID를 영업 담당자를 통해 발급받아 설정하십시오.
*/
const SUBS_MID_KAKAO = 'nxkkp_auto';
const SUBS_MID_NAVER = 'nxnvp_auto';

/**
    ===== 라이센스키 =====
    회원사 mid당 하나의 라이센스키가 발급되며 SHA256 해시체크 용도로 사용됩니다. 이 값은 외부에 노출되어서는 안 됩니다.
    테스트환경에서는 ST1009281328226982205 값을 사용하시면 되며,
    상용서비스시에는 헥토파이낸셜에서 발급한 상점 고유 라이센스키를 설정하십시오.
    운영 적용 시에는 소스에 직접 기재하지 말고 환경변수 등 가맹점의 안전한 설정 관리 방식을 사용하십시오.
*/
const LICENSE_KEY = process.env.HECTO_LICENSE_KEY || 'ST1009281328226982205';

/**
    ===== AES256 암호화 키 =====
    파라미터 AES256암/복호화에 사용되는 키 입니다. 이 값은 외부에 노출되어서는 안 됩니다.
    테스트환경에서는 pgSettle30y739r82jtd709yOfZ2yK5K를 사용하시면 됩니다.
    상용서비스시에는 헥토파이낸셜에서 발급한 상점 고유 암호화키를 설정하십시오.
    운영 적용 시에는 소스에 직접 기재하지 말고 환경변수 등 가맹점의 안전한 설정 관리 방식을 사용하십시오.
*/
const AES256_KEY = process.env.HECTO_AES256_KEY || 'pgSettle30y739r82jtd709yOfZ2yK5K';

/**
    ===== 결제 서버 URL =====
    헥토파이낸셜 결제 서버 URL입니다. 이 값은 변경하지 마십시오.
    필요에 따라 주석 on/off 하여 사용하십시오.
*/
const PAYMENT_SERVER = 'https://tbnpg.settlebank.co.kr'; //테스트서버 url
//const PAYMENT_SERVER = 'https://npg.settlebank.co.kr';//운영서버 url

/**
    ===== 취소 서버 URL =====
    헥토파이낸셜 취소 서버 URL입니다. 이 값은 변경하지 마십시오.
    필요에 따라 주석 on/off 하여 사용하십시오.
*/
const CANCEL_SERVER = 'https://tbgw.settlebank.co.kr'; //테스트서버 url
//const CANCEL_SERVER = 'https://gw.settlebank.co.kr';//운영서버 url

/** 헥토파이낸셜 API통신 Connect Timeout 설정(ms) */
const CONN_TIMEOUT = 5000;

/** 헥토파이낸셜 API통신 Read Timeout 설정(ms) */
const READ_TIMEOUT = 25000;

/** 샘플 서버 포트 */
const PORT = Number(process.env.PORT) || 8080;

/**
    ===== 샘플 서버 접근 URL =====
    결제창에 전달하는 notiUrl/nextUrl/cancUrl의 앞부분입니다.
    헥토파이낸셜 서버가 호출할 수 있는 주소여야 하므로, 노티 수신 테스트 시에는
    외부에서 접근 가능한 도메인으로 변경하십시오.
*/
const SERVICE_BASE_URL = process.env.SERVICE_BASE_URL || `http://localhost:${PORT}`;

/** 로그 파일 저장 경로(자사 환경에 맞게 변경) */
const LOG_DIR = process.env.LOG_DIR || 'logs';

module.exports = {
    PG_MID,
    SUBS_MID_KAKAO,
    SUBS_MID_NAVER,
    LICENSE_KEY,
    AES256_KEY,
    PAYMENT_SERVER,
    CANCEL_SERVER,
    CONN_TIMEOUT,
    READ_TIMEOUT,
    PORT,
    SERVICE_BASE_URL,
    LOG_DIR
};
