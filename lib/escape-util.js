'use strict';

/**
 * 요청/응답 파라미터를 화면에 출력할 때 사용하는 이스케이프 유틸입니다.
 * 외부에서 전달된 값을 인코딩 없이 출력하면 XSS 취약점이 발생합니다.
 *
 * [중요] EJS의 `<%= value %>`는 HTML 이스케이프를 자동으로 수행합니다.
 * 따라서 HTML 본문 출력에는 `<%= value %>`를 그대로 사용하고,
 * 아래 escapeHtml을 함께 적용하지 마십시오(이중 인코딩이 발생합니다).
 * 자바스크립트 문자열 리터럴 안에 출력할 때는 HTML 이스케이프가 맞지 않으므로
 * `<%- escapeJs(value) %>` 형태로 escapeJs를 사용하십시오.
 */

/** 자바스크립트 문자열 리터럴을 끊어버리는 줄 구분자(U+2028, U+2029) */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#x27;'
};

const JS_ESCAPES = {
    '\\': '\\\\',
    '"': '\\"',
    '\'': '\\\'',
    '<': '\\u003C',
    '>': '\\u003E',
    '\r': '\\r',
    '\n': '\\n',
    [LINE_SEPARATOR]: '\\u2028',
    [PARAGRAPH_SEPARATOR]: '\\u2029'
};

const HTML_PATTERN = /[&<>"']/g;
const JS_PATTERN = new RegExp('[\\\\"\'<>\\r\\n' + LINE_SEPARATOR + PARAGRAPH_SEPARATOR + ']', 'g');

/**
 * HTML 출력용 이스케이프.
 * 서버 코드에서 HTML 문자열을 직접 조립하는 경우에 사용합니다.
 * (EJS `<%= %>` 출력에는 이미 적용되어 있으므로 중복 사용 금지)
 */
function escapeHtml(value) {
    if (value === null || value === undefined || value.length === 0) {
        return '';
    }
    return String(value).replace(HTML_PATTERN, (c) => HTML_ESCAPES[c]);
}

/** 자바스크립트 문자열 리터럴 출력용 이스케이프 */
function escapeJs(value) {
    if (value === null || value === undefined || value.length === 0) {
        return '';
    }
    return String(value).replace(JS_PATTERN, (c) => JS_ESCAPES[c]);
}

module.exports = { escapeHtml, escapeJs };
