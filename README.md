# Node.js PG SDK Sample

Node.js 가맹점 환경에서 헥토파이낸셜 PG를 연동하기 위한 샘플 코드입니다.

이 저장소는 결제, 취소, 결과 수신 및 노티 처리 방법을 설명하는 **참고용 샘플**입니다.
인증·인가, 입력값 검증, 화면 출력 인코딩, CSRF 방어, 키 관리, 로그 마스킹 및
가맹점 내부 데이터 처리는 실제 운영 환경의 정책에 맞게 가맹점에서 구현해야 합니다.

결제창 호출부터 승인 결과 수신, 노티 처리, 취소·환불까지 연동에 필요한 전체 흐름을
담고 있으며, 헥토파이낸셜 연동 규격서의 파라미터·해시 조합·암호화 규칙을 그대로 따릅니다.

## 샘플 사용 시 주의사항

> 이 저장소는 운영용 완성 모듈이 아닙니다.

- 샘플 페이지를 인터넷에 그대로 노출하거나 운영 서비스에 그대로 배포하지 마십시오.
- 취소 및 자동결제 API에는 가맹점의 인증·권한·CSRF 보호를 적용하십시오.
- `POST /pay_encryptParams`는 해시·암호문을 생성해 반환하는 엔드포인트이므로 인증 없이
  외부에 노출하면 누구나 임의 금액에 대한 유효한 `pktHash`를 얻을 수 있어
  거래금액 위변조 방지가 무력화됩니다. 운영에서는 로그인 세션 등으로 접근을
  보호하고, 거래금액은 클라이언트 전달 값이 아닌 가맹점 서버에 저장된 주문
  정보에서 조회하여 해시를 생성하십시오.
- 테스트 MID와 테스트 키는 운영에 사용할 수 없습니다. 운영 키를 소스 저장소에
  커밋하지 말고 환경변수(`HECTO_LICENSE_KEY`, `HECTO_AES256_KEY`) 등 가맹점의
  안전한 설정 관리 방식을 적용하십시오.
- 샘플에는 연동 확인을 위한 요청·응답 및 암호화 대상 값 로그가 포함되어 있습니다.
  특히 SHA256 해시 로그의 평문(`hashPlain`)에는 **라이센스키가 평문으로 포함**되어
  매 거래마다 로그 파일에 기록됩니다. 운영 적용 전 해당 로그를 제거하거나
  키 부분을 마스킹하고, 개인정보와 결제정보도 제거하거나 마스킹하십시오.
- 결과 출력 화면은 연동 결과를 확인하기 위한 샘플이며 출력 인코딩을 적용해 두었습니다.
  화면을 수정하거나 새로 작성할 때에도 출력 위치(HTML/JavaScript)에 맞는 인코딩을
  유지하십시오. 자세한 규칙은 아래 "출력 인코딩" 항목을 참고하십시오.

## 지원 환경

- Node.js 18 이상 (LTS 권장)
- Express 5 / EJS 3
- AES-256-ECB / PKCS7Padding (Node.js 내장 `crypto` 사용, 외부 암호 라이브러리 불필요)
- 외부 API 통신: TLS 1.2 이상

## 실행 방법

```sh
npm install
npm start
```

기본 포트는 8080이며 환경변수로 변경할 수 있습니다.

```sh
PORT=8081 npm start
```

실행 후 접속 주소입니다.

| 화면 | 주소 |
| --- | --- |
| 결제 샘플 | http://localhost:8080/pay_form |
| 취소 샘플 | http://localhost:8080/cancel_form |
| 노티 수신 | http://localhost:8080/receiveNoti |

`/`로 접속하면 결제 샘플로 이동합니다.

## TLS 보안

`lib/http-client.js`는 `minVersion: 'TLSv1.2'`로 TLS 1.0과 1.1을 비활성화하며,
Node.js 기본 신뢰 저장소로 서버 인증서 체인을 검증하고 호스트명 검증을 유지합니다.
모든 인증서나 호스트명을 신뢰하는 `rejectUnauthorized: false` 같은 우회 설정은
사용하지 않습니다. 운영 적용 시에도 이 설정을 완화하지 마십시오.

## 출력 인코딩

EJS의 `<%= value %>`는 HTML 이스케이프를 자동으로 수행하므로, HTML 본문에 값을
출력할 때는 별도 처리가 필요 없습니다. 여기에 `escapeHtml`을 추가로 적용하면
이중 인코딩이 발생하므로 함께 사용하지 마십시오.

자바스크립트 문자열 리터럴 안에 값을 출력할 때는 HTML 이스케이프가 맞지 않으므로
`lib/escape-util.js`의 `escapeJs`를 사용합니다.

```ejs
<!-- HTML 본문: EJS 자동 이스케이프 -->
<td><%= respParam.outRsltMsg %></td>

<!-- 자바스크립트 문자열: escapeJs -->
<script>
var msg = "<%- escapeJs(respParam.outRsltMsg) %>";
</script>
```

## 파일 구조

```
/(Project Root Directory)
│  package.json			<--- 의존성 및 실행 스크립트
│  server.js			<--- Express 서버 및 라우팅 진입점
│  config.js			<--- 기본정보 설정파일(*자사에 맞게 변경 필요)
│  process-noti.js		<--- 노티 수신 후 처리하는 로직
│
├─lib
│      encrypt-util.js		<--- 암호화 유틸(AES-256-ECB / SHA-256)
│      http-client.js		<--- HTTP 커넥션 유틸(TLS 1.2 이상)
│      api-util.js		<--- 요청 파라미터·응답 전문·암복호화 공통 처리
│      string-util.js		<--- 문자열 유틸
│      escape-util.js		<--- HTML/JavaScript 출력 인코딩 유틸
│      logger.js		<--- 로그 설정(*자사에 맞게 변경 필요)
│
├─routes
│      pay.js			<--- 결제 관련 라우트
│      cancel.js		<--- 취소 관련 라우트
│      noti.js			<--- 노티 수신 라우트
│
└─views
       pay_form.ejs			<--- 결제시 메인 폼
       pay_autoPayResult.ejs		<--- 휴대폰 자동연장결제 결과 화면
       pay_subsPayResult.ejs		<--- 간편(카카오페이/네이버페이) 정기결제 결과 화면
       pay_subsManageResult.ejs		<--- 간편 정기결제 빌키 상태조회/삭제 결과 화면
       pay_receiveResult.ejs		<--- 결제 완료 후 응답파라미터 수신 화면
       pay_showResult.ejs		<--- 자식창에서 전달된 응답파라미터 출력 화면
       cancel_form.ejs			<--- 취소 메인 폼
       cancel_showResult.ejs		<--- 취소 결과 화면
```

## 라우트 설명

### 공통
- **`GET /`**: 결제 샘플(`/pay_form`)로 이동합니다.
- **config.js**: 상점아이디, 암복호화키 등을 설정할 수 있는 설정 파일입니다.
- **lib/escape-util.js**: 요청·응답 파라미터를 화면에 출력할 때 사용하는 HTML/JavaScript 이스케이프 유틸입니다.
- **`ALL /receiveNoti`**: 결제 또는 취소 처리가 완료된 후, 헥토파이낸셜에서 가맹점으로 전달하는 노티(결과통보)를 수신합니다.
- **process-noti.js**: 결제 또는 취소의 성공/실패에 따라 수행할 로직을 정의한 파일입니다.

### 결제 관련
- **`GET /pay_form`**: 결제 요청 시 사용자로부터 정보를 입력받는 Form 화면입니다.
- **`POST /pay_encryptParams`**: 암호화가 필요한 파라미터들을 AJAX 통신으로 암호화합니다. 또한 SHA256 해시 처리도 수행합니다.
- **`ALL /pay_receiveResult`**: 결제창에서 결제가 완료된 이후 닫기 버튼을 누를 때, 헥토파이낸셜로부터 응답 파라미터를 수신하는 화면입니다.
- **`POST /pay_showResult`**: `/pay_receiveResult`에서 부모창으로 전송된 파라미터들을 수신하여 출력하는 화면입니다.
- **`POST /pay_autoPayResult`**: 휴대폰 자동연장결제 시 사용되는 결제 및 결과화면입니다.
- **`POST /pay_subsPayResult`**: 간편결제(카카오페이/네이버페이) 정기결제 2회차 이후 결제 시 사용됩니다. 결제창에서 발급받은 빌키(billKey)로 결제합니다.
- **`POST /pay_subsManageResult`**: 간편 정기결제 빌키의 상태조회 및 삭제 요청을 처리하고 결과를 출력합니다.

### 취소 관련
- **`GET /cancel_form`**: 취소 요청 시 사용자로부터 정보를 입력받는 Form 화면입니다.
- **`POST /cancel_showResult`**: 헥토파이낸셜과 Server to Server로 커넥션하여, 취소 요청을 하고 응답을 받아 결과를 출력합니다.

## 프로세스 처리 순서

- **결제 처리 순서**: `/pay_form` → `/pay_encryptParams` → `/pay_receiveResult` → `/pay_showResult`
- **휴대폰 자동연장 결제**: `/pay_form` → `/pay_autoPayResult`
- **간편 정기결제 빌키 발급(1회차)**: `/pay_form`(정기결제 전용 상점아이디 + autoPayType=A로 결제창 호출) → `/pay_receiveResult`(응답의 billKey 보관)
- **간편 정기결제(2회차 이후)**: `/pay_form` → `/pay_subsPayResult`
- **간편 정기결제 빌키 상태조회/삭제**: `/pay_form` → `/pay_subsManageResult`
- **취소 처리 순서**: `/cancel_form` → `/cancel_showResult`
- **노티 처리 순서**: `/receiveNoti` → process-noti.js

## config.js 설정 항목

- **PG_MID**: 테스트 시 샘플에 기재된 테스트 MID를 사용합니다. 운영 시에는 헥토파이낸셜에서 발급한 가맹점 MID로 교체합니다.
- **SUBS_MID_KAKAO / SUBS_MID_NAVER**: 간편결제 정기결제 전용 상점아이디입니다. 간편결제사별로 상점아이디가 상이하며, 테스트 MID는 카카오페이 `nxkkp_auto`, 네이버페이 `nxnvp_auto`입니다. 운영 시에는 정기결제 서비스가 설정된 가맹점 MID를 영업 담당자를 통해 발급받아 교체합니다.
- **LICENSE_KEY**: SHA-256 해시 검증에 사용하는 MID별 라이선스 키입니다. 환경변수 `HECTO_LICENSE_KEY`로 주입할 수 있습니다. 운영 키는 외부에 노출하거나 저장소에 커밋하지 마십시오.
- **AES256_KEY**: 개인정보 및 민감정보의 AES-256 암·복호화 키입니다. 환경변수 `HECTO_AES256_KEY`로 주입할 수 있습니다. 운영 키는 외부에 노출하거나 저장소에 커밋하지 마십시오.
- **PAYMENT_SERVER**: 헥토파이낸셜 결제 처리 서버의 URL입니다. 변경하지 마십시오.
- **CANCEL_SERVER**: 헥토파이낸셜 취소 처리 서버의 URL입니다. 변경하지 마십시오.
- **CONN_TIMEOUT**: 헥토파이낸셜 API 통신 연결 타임아웃입니다.
- **READ_TIMEOUT**: 헥토파이낸셜 API 통신 수신 타임아웃입니다.
- **PORT**: 샘플 서버 포트입니다. 환경변수 `PORT`로 변경할 수 있습니다.
- **SERVICE_BASE_URL**: 결제창에 전달하는 `notiUrl`/`nextUrl`/`cancUrl`의 앞부분입니다. 헥토파이낸셜 서버가 호출할 수 있는 주소여야 하므로, 노티 수신 테스트 시에는 외부에서 접근 가능한 도메인으로 변경하십시오. 환경변수 `SERVICE_BASE_URL`로 지정할 수 있습니다.
- **TRUST_PROXY**: 리버스 프록시(Nginx/ALB 등) 뒤에서 서비스할 때 고객 IP(`custIp`)를 얻기 위한 설정입니다. Express의 `trust proxy`와 동일한 형식으로, 바로 앞 프록시 1대만 신뢰하면 `1`, 특정 대역만 신뢰하면 `'10.0.0.0/8'`을 지정합니다. 기본값은 `false`입니다. `X-Forwarded-For`는 클라이언트가 위조할 수 있으므로, 프록시가 없는 환경에서 켜면 고객이 `custIp`를 임의로 조작할 수 있습니다. 실제 배치 구성에 맞는 값만 지정하십시오.
- **LOG_DIR**: 로그 파일 저장 경로입니다. 환경변수 `LOG_DIR`로 변경할 수 있습니다.

## 노티 수신 엔드포인트

- **경로**: `ALL /receiveNoti`
- 결제 또는 취소 완료 후 헥토파이낸셜 서버에서 콜백으로 호출하게 되는 엔드포인트이며, 헥토파이낸셜에서 가맹점으로 노티를 전송합니다.
- `nextUrl`에서는 고객에게 결제 성공 또는 실패 결과 화면을 반환합니다.
- `notiUrl`에서는 해시 검증이 성공한 요청에 한해 가맹점 내부 데이터와 DB를 처리합니다.
- 응답 본문은 반드시 `OK` 또는 `FAIL` 이어야 합니다. 다른 값이 포함되면 동작을 보장할 수 없습니다.
- 중복 노티에 대비한 멱등성 처리는 가맹점 시스템에서 구현해야 합니다.

## 로그

`lib/logger.js`는 외부 로깅 라이브러리 없이 콘솔과 파일에 동시에 기록합니다.

- `logs/trans.log`: 결제·취소 API 요청/응답 로그
- `logs/notiTrans.log`: 노티 수신 및 해시 검증 로그

운영 환경에서는 가맹점에서 사용하는 로깅 프레임워크로 교체하고,
라이선스키·개인정보·결제정보가 포함된 로그를 제거하거나 마스킹하십시오.
