'use strict';

const path = require('node:path');

const express = require('express');

const config = require('./config');
const { escapeHtml, escapeJs } = require('./lib/escape-util');
const { getLogger } = require('./lib/logger');
const payRouter = require('./routes/pay');
const cancelRouter = require('./routes/cancel');
const notiRouter = require('./routes/noti');

const logger = getLogger('trans');
const app = express();

/** 뷰 엔진 설정(EJS). `<%= value %>` 출력은 HTML 이스케이프가 자동 적용됩니다. */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/** 결제창과 노티는 폼(application/x-www-form-urlencoded) 방식으로 전달됩니다. */
app.use(express.urlencoded({ extended: false }));

/** 자바스크립트 문자열 출력용 이스케이프를 모든 뷰에서 사용할 수 있게 등록합니다. */
app.locals.escapeHtml = escapeHtml;
app.locals.escapeJs = escapeJs;

/** 인덱스 페이지 */
app.get('/', (req, res) => {
    res.redirect('/pay_form');
});

app.use(payRouter);
app.use(cancelRouter);
app.use(notiRouter);

/** 라우트에서 발생한 예외 처리 */
app.use((err, req, res, next) => {
    logger.error('[' + req.path + '][Unhandled Error]' + err.toString());
    res.status(500).type('text/plain').send('Internal Server Error');
});

app.listen(config.PORT, () => {
    console.log('헥토파이낸셜 PG 샘플 서버가 실행되었습니다.');
    console.log('  결제 샘플 : ' + config.SERVICE_BASE_URL + '/pay_form');
    console.log('  취소 샘플 : ' + config.SERVICE_BASE_URL + '/cancel_form');
    console.log('  노티 수신 : ' + config.SERVICE_BASE_URL + '/receiveNoti');
});
