/**
 * NCPMS 병해충 예측지도 위젯 (SVC31) 임베딩 모듈
 *
 * NCPMS SVC31은 위젯(지도 임베딩) API:
 *   필수: apiKey, serviceCode, proxyUrl, div_id, address, zoomLevel
 *   선택: width, cropList
 *
 * PHP 프록시(api/proxy.php)를 통해 Mixed Content + CORS 우회
 */

class NcpmsWidget {
    constructor() {
        this.isOpen = false;
        this.isLoaded = false;
        this.phpAvailable = null; // null=미확인, true/false
        this.proxyUrl = 'api/proxy.php';
        this.ncpmsBaseUrl = 'http://ncpms.rda.go.kr/npmsAPI/service';
    }

    // 패널 토글
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    // 패널 열기
    async open() {
        const overlay = document.getElementById('ncpms-overlay');
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('open'));
        this.isOpen = true;

        // 버튼 활성화 표시
        const btn = document.getElementById('ncpms-map-btn');
        if (btn) btn.classList.add('active');

        // 작물 셀렉트 초기화
        this._initCropSelect();

        // PHP 사용 가능 여부 확인
        if (this.phpAvailable === null) {
            await this._checkPhpAvailable();
        }

        if (!this.phpAvailable) {
            const notice = document.getElementById('ncpms-php-notice');
            if (notice) notice.style.display = 'block';
        }
    }

    // 패널 닫기
    close() {
        const overlay = document.getElementById('ncpms-overlay');
        overlay.classList.remove('open');
        setTimeout(() => overlay.style.display = 'none', 300);
        this.isOpen = false;

        const btn = document.getElementById('ncpms-map-btn');
        if (btn) btn.classList.remove('active');
    }

    // 작물 셀렉트 드롭다운 초기화
    _initCropSelect() {
        const select = document.getElementById('ncpms-crop-select');
        if (!select || select.options.length > 1) return;

        // NCPMS SVC31 지원 작물
        const ncpmsCrops = [
            { code: 'FT060614', name: '감귤' },
            { code: 'FC050501', name: '감자' },
            { code: 'VC011205', name: '고추' },
            { code: 'FC010101', name: '논벼' },
            { code: 'VC041209', name: '마늘' },
            { code: 'FT010602', name: '배' },
            { code: 'FT010601', name: '사과' },
            { code: 'VC041202', name: '파' },
            { code: 'FT040603', name: '포도' }
        ];

        ncpmsCrops.forEach(crop => {
            const opt = document.createElement('option');
            opt.value = crop.code;
            opt.textContent = crop.name;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            if (select.value) {
                this.loadWidget(select.value);
            }
        });
    }

    // PHP 프록시 사용 가능 여부 확인
    async _checkPhpAvailable() {
        try {
            const resp = await fetch('api/settings.php');
            const text = await resp.text();
            this.phpAvailable = !text.trimStart().startsWith('<?php');
            console.log(`[NCPMS Widget] PHP 사용 가능: ${this.phpAvailable}`);
        } catch {
            this.phpAvailable = false;
            console.log('[NCPMS Widget] PHP 확인 실패');
        }
    }

    // NCPMS 위젯 로드
    async loadWidget(cropCode) {
        const mapDiv = document.getElementById('ncpms-map');
        const placeholder = document.getElementById('ncpms-placeholder');
        const settings = settingsModal ? settingsModal.load() : {};
        const apiKey = settings.ncpmsKey || ncpmsApi.apiKey;

        if (!apiKey) {
            this._showMessage('NCPMS API Key가 필요합니다. 설정에서 입력해주세요.');
            return;
        }

        if (!this.phpAvailable) {
            this._showMessage(
                'PHP가 활성화되지 않아 NCPMS 위젯을 로드할 수 없습니다.<br>' +
                'Web Station → 스크립트 언어 설정에서 PHP를 활성화해주세요.<br><br>' +
                '<small style="color:var(--text-muted);">NCPMS API는 HTTP만 지원하여 HTTPS 페이지에서 직접 호출할 수 없습니다.</small>'
            );
            return;
        }

        // 로딩 표시
        placeholder.style.display = 'none';
        mapDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="loading-spinner"></div><span style="margin-left:12px;color:var(--text-muted);">NCPMS 예측지도 로딩 중...</span></div>';

        try {
            // proxyUrl: NCPMS 위젯이 내부적으로 사용할 프록시 주소
            // 위젯이 proxyUrl?url=... 형태로 호출함
            const proxyFullUrl = new URL(this.proxyUrl, window.location.href).href;

            const params = new URLSearchParams({
                apiKey: apiKey,
                serviceCode: 'SVC31',
                proxyUrl: proxyFullUrl,
                div_id: 'ncpms-map',
                address: '서울',
                zoomLevel: '8',
                cropList: cropCode
            });

            // NCPMS API를 PHP 프록시를 통해 호출
            const ncpmsUrl = `${this.ncpmsBaseUrl}?${params.toString()}`;
            const fetchUrl = `${this.proxyUrl}?url=${encodeURIComponent(ncpmsUrl)}`;

            console.log(`[NCPMS Widget] 위젯 로드: ${ncpmsUrl}`);
            const resp = await fetch(fetchUrl);
            const content = await resp.text();

            if (!content || content.trim().length === 0) {
                this._showMessage('NCPMS 서버 응답이 비어있습니다.');
                return;
            }

            // 응답이 HTML/JS인 경우 렌더링
            if (content.includes('<script') || content.includes('<div') || content.includes('function')) {
                mapDiv.innerHTML = '';
                // iframe으로 안전하게 렌더링
                this._renderInIframe(mapDiv, content, proxyFullUrl);
                console.log('[NCPMS Widget] 위젯 렌더링 완료');
            } else if (content.includes('ERR_')) {
                // NCPMS 에러 코드 처리
                const errorMatch = content.match(/ERR_\d+/);
                const errorCode = errorMatch ? errorMatch[0] : 'UNKNOWN';
                const errorMessages = {
                    'ERR_101': '인증키를 입력하지 않았습니다.',
                    'ERR_102': '서비스가 중지되었습니다.',
                    'ERR_103': '서비스코드가 잘못되었습니다.',
                    'ERR_104': '서비스 권한이 없습니다.',
                    'ERR_105': '인증받지 않은 도메인입니다.',
                    'ERR_201': '필수 파라미터가 누락되었습니다.',
                    'ERR_901': 'NCPMS 시스템 오류입니다.'
                };
                this._showMessage(`NCPMS 오류 (${errorCode}): ${errorMessages[errorCode] || '알 수 없는 오류'}`);
            } else {
                // 기타 응답 - 그대로 표시
                mapDiv.innerHTML = content;
                console.log('[NCPMS Widget] 응답 직접 렌더링');
            }

            this.isLoaded = true;

        } catch (err) {
            console.error('[NCPMS Widget] 로드 실패:', err);
            this._showMessage(`위젯 로드 실패: ${err.message}`);
        }
    }

    // iframe으로 안전하게 렌더링
    _renderInIframe(container, htmlContent, proxyUrl) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        iframe.sandbox = 'allow-scripts allow-same-origin';
        container.appendChild(iframe);

        // proxyUrl을 절대경로로 교체하여 위젯 내 요청이 프록시를 거치도록
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>body{margin:0;font-family:sans-serif;}</style>
</head><body>
<div id="ncpms-map" style="width:100%;height:100vh;"></div>
${htmlContent}
</body></html>`);
        doc.close();
    }

    // 메시지 표시
    _showMessage(html) {
        const placeholder = document.getElementById('ncpms-placeholder');
        const mapDiv = document.getElementById('ncpms-map');
        mapDiv.innerHTML = '';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <span class="material-icons" style="font-size:36px;color:var(--risk-caution);">info</span>
            <p style="text-align:center;line-height:1.6;">${html}</p>
        `;
    }
}

// 전역 인스턴스
const ncpmsWidget = new NcpmsWidget();
