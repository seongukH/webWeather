/**
 * NCPMS 병해충 예측지도 위젯 (SVC31) 임베딩 모듈
 *
 * 공식 샘플(fore1_1.php) 기반 구현:
 *   1. NCPMS JS 라이브러리 로드 (openapiFore.jsp)
 *   2. setNpmsOpenApiKey(), setNpmsOpenApiServiceCode() 등 호출
 *   3. setNpmsOpenApiProxyUrl() → 우리 PHP 콜백 (ncpms_callback.php)
 *   4. actionMapInfo("div_id") → 위젯 렌더링
 *
 * HTTPS 페이지에서 HTTP NCPMS 리소스를 로드해야 하므로
 * iframe 내에서 실행하여 Mixed Content 문제를 우회
 */

class NcpmsWidget {
    constructor() {
        this.isOpen = false;
        this.phpAvailable = null;
        this.callbackUrl = null; // 절대 URL
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    async open() {
        const overlay = document.getElementById('ncpms-overlay');
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('open'));
        this.isOpen = true;

        document.getElementById('ncpms-map-btn')?.classList.add('active');

        this._initCropSelect();

        // PHP 확인
        if (this.phpAvailable === null) {
            await this._checkPhp();
        }

        if (!this.phpAvailable) {
            document.getElementById('ncpms-php-notice').style.display = 'block';
        }
    }

    close() {
        const overlay = document.getElementById('ncpms-overlay');
        overlay.classList.remove('open');
        setTimeout(() => overlay.style.display = 'none', 300);
        this.isOpen = false;
        document.getElementById('ncpms-map-btn')?.classList.remove('active');
    }

    _initCropSelect() {
        const select = document.getElementById('ncpms-crop-select');
        if (!select || select.options.length > 1) return;

        const crops = [
            { code: 'FC010101', name: '논벼' },
            { code: 'FT010601', name: '사과' },
            { code: 'VC011205', name: '고추' },
            { code: 'FC050501', name: '감자' },
            { code: 'FT010602', name: '배' },
            { code: 'FT040603', name: '포도' },
            { code: 'FT060614', name: '감귤' },
            { code: 'VC041202', name: '파' },
            { code: 'VC041209', name: '마늘' }
        ];

        crops.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = c.name;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            if (select.value) this.loadWidget(select.value);
        });
    }

    async _checkPhp() {
        try {
            const resp = await fetch('api/settings.php');
            const text = await resp.text();
            this.phpAvailable = !text.trimStart().startsWith('<?php') && !text.trimStart().startsWith('<?');
            if (this.phpAvailable) {
                // 콜백 절대 URL 계산
                this.callbackUrl = new URL('api/ncpms_callback.php', window.location.href).href;
            }
            console.log(`[NCPMS Widget] PHP: ${this.phpAvailable}, callback: ${this.callbackUrl}`);
        } catch {
            this.phpAvailable = false;
        }
    }

    // NCPMS 위젯을 iframe으로 로드
    loadWidget(cropCode) {
        const mapDiv = document.getElementById('ncpms-map');
        const placeholder = document.getElementById('ncpms-placeholder');
        const settings = typeof settingsModal !== 'undefined' ? settingsModal.load() : {};
        const apiKey = settings.ncpmsKey || ncpmsApi?.apiKey || '';

        if (!apiKey) {
            this._showMessage('NCPMS API Key가 필요합니다.<br>설정에서 입력해주세요.');
            return;
        }

        if (!this.phpAvailable) {
            this._showMessage(
                'PHP가 활성화되지 않아 NCPMS 위젯을 로드할 수 없습니다.<br>' +
                'Web Station → 스크립트 언어 설정에서 PHP를 활성화해주세요.'
            );
            return;
        }

        placeholder.style.display = 'none';
        mapDiv.innerHTML = '';

        // iframe 생성 (NCPMS는 HTTP-only → iframe에서 로드)
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
        mapDiv.appendChild(iframe);

        // NCPMS 공식 샘플 기반 HTML 생성
        const iframeHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { margin: 0; padding: 0; }
    #ncpms-widget { width: 100%; height: 100vh; }
</style>
<script type="text/javascript" src="http://ncpms.rda.go.kr/npmsAPI/api/openapiFore.jsp"><\/script>
<script type="text/javascript">
    npmsJ(document).ready(function() {
        // API Key
        setNpmsOpenApiKey("${apiKey}");

        // 서비스 코드
        setNpmsOpenApiServiceCode("SVC31");

        // CORS 콜백 프록시 (우리 NAS PHP)
        setNpmsOpenApiProxyUrl("${this.callbackUrl}");

        // 지도 너비
        setNpmsOpenAPIWidth(${mapDiv.offsetWidth || 800});

        // 초기 좌표 (대한민국 중심)
        setCoordinateZoom("36.5", "127.5", 8);

        // 작물 목록
        var cropList = new Array('${cropCode}');
        setCropList(cropList);

        // 지도 이동 허용
        setMoveMatAt(true);

        // 위젯 실행
        actionMapInfo("ncpms-widget");
    });
<\/script>
</head>
<body>
<div id="ncpms-widget"></div>
</body>
</html>`;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(iframeHtml);
        doc.close();

        console.log(`[NCPMS Widget] 위젯 로드: crop=${cropCode}, callback=${this.callbackUrl}`);
    }

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

const ncpmsWidget = new NcpmsWidget();
