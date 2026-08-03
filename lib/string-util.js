'use strict';

/**
 * 요청 파라미터 처리용 문자열 유틸입니다.
 */

/**
 * 값이 없거나 문자열 "null"인 경우 빈 문자열을 반환합니다.
 * 폼에서 넘어온 값이 배열(같은 이름의 필드가 여러 개)인 경우 첫 번째 값을 사용합니다.
 */
function isNull(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (Array.isArray(value)) {
        return isNull(value[0]);
    }
    if (typeof value === 'string') {
        return value === 'null' ? '' : value;
    }
    return String(value);
}

/** 구분자로 값들을 연결합니다. */
function join(delimiter, values) {
    if (delimiter === null || delimiter === undefined) {
        throw new Error('delimiter must not be null');
    }
    if (values === null || values === undefined) {
        throw new Error('values must not be null');
    }
    return Array.from(values).map(String).join(delimiter);
}

module.exports = { isNull, join };
