/**
 * NCPMS 위젯 임베딩 모듈
 *
 * SVC31: 병해충 예측지도 (작물 선택 필요)
 * SVC33: 예측조사비교 (작물 선택 불필요)
 *
 * 공식 샘플(fore1_1.php) 기반:
 *   NCPMS JS 라이브러리(openapiFore.jsp) + PHP 콜백 프록시
 */

class NcpmsWidget {
    constructor() {
        this.isOpen = false;
        this.phpAvailable = null;
        this.callbackUrl = null;
        this.currentSvc = 'SVC31';
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

    // 탭 전환 (SVC31 / SVC33)
    switchTab(svc) {
        this.currentSvc = svc;

        // 탭 버튼 활성화
        document.querySelectorAll('.ncpms-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.svc === svc);
        });

        const cropSelect = document.getElementById('ncpms-crop-select');
        const placeholderText = document.getElementById('ncpms-placeholder-text');

        if (svc === 'SVC31') {
            // 예측지도: 작물 선택 필요
            cropSelect.style.display = '';
            placeholderText.textContent = '작물을 선택하면 NCPMS 예측지도가 표시됩니다.';
            this._resetContent();
        } else if (svc === 'SVC33') {
            // 예측조사비교: 작물 선택 불필요, 바로 로드
            cropSelect.style.display = 'none';
            placeholderText.textContent = '예측조사비교 데이터를 로드합니다...';
            this._loadSVC33();
        }
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
            if (select.value && this.currentSvc === 'SVC31') {
                this._loadSVC31(select.value);
            }
        });
    }

    async _checkPhp() {
        try {
            const resp = await fetch('api/settings.php');
            const text = await resp.text();
            this.phpAvailable = !text.trimStart().startsWith('<?php') && !text.trimStart().startsWith('<?');
            if (this.phpAvailable) {
                this.callbackUrl = new URL('api/ncpms_callback.php', window.location.href).href;
            }
            console.log(`[NCPMS Widget] PHP: ${this.phpAvailable}`);
        } catch {
            this.phpAvailable = false;
        }
    }

    _getApiKey() {
        const settings = typeof settingsModal !== 'undefined' ? settingsModal.load() : {};
        return settings.ncpmsKey || ncpmsApi?.apiKey || '';
    }

    _preCheck() {
        const apiKey = this._getApiKey();
        if (!apiKey) {
            this._showMessage('NCPMS API Key가 필요합니다.<br>설정에서 입력해주세요.');
            return null;
        }
        if (!this.phpAvailable) {
            this._showMessage(
                'PHP가 활성화되지 않아 NCPMS 위젯을 로드할 수 없습니다.<br>' +
                'Web Station → 스크립트 언어 설정에서 PHP를 활성화해주세요.'
            );
            return null;
        }
        return apiKey;
    }

    // SVC31: 병해충 예측지도
    _loadSVC31(cropCode) {
        const apiKey = this._preCheck();
        if (!apiKey) return;

        const mapDiv = document.getElementById('ncpms-map');
        document.getElementById('ncpms-placeholder').style.display = 'none';
        mapDiv.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
        mapDiv.appendChild(iframe);

        const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>body{margin:0;padding:0;} #ncpms-widget{width:100%;height:100vh;}</style>
<script src="http://ncpms.rda.go.kr/npmsAPI/api/openapiFore.jsp"><\/script>
<script>
npmsJ(document).ready(function(){
    setNpmsOpenApiKey("${apiKey}");
    setNpmsOpenApiServiceCode("SVC31");
    setNpmsOpenApiProxyUrl("${this.callbackUrl}");
    setNpmsOpenAPIWidth(${mapDiv.offsetWidth || 800});
    setCoordinateZoom("36.5","127.5",8);
    setCropList(new Array('${cropCode}'));
    setMoveMatAt(true);
    actionMapInfo("ncpms-widget");
});
<\/script>
</head><body><div id="ncpms-widget"></div></body></html>`;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        console.log(`[NCPMS Widget] SVC31 로드: crop=${cropCode}`);
    }

    // SVC33: 예측조사비교
    _loadSVC33() {
        const apiKey = this._preCheck();
        if (!apiKey) return;

        const mapDiv = document.getElementById('ncpms-map');
        document.getElementById('ncpms-placeholder').style.display = 'none';
        mapDiv.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;';
        mapDiv.appendChild(iframe);

        const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>body{margin:0;padding:0;} #ncpms-widget{width:100%;min-height:100vh;}</style>
<script src="http://ncpms.rda.go.kr/npmsAPI/api/openapiFore.jsp"><\/script>
<script>
npmsJ(document).ready(function(){
    setNpmsOpenApiKey("${apiKey}");
    setNpmsOpenApiServiceCode("SVC33");
    setNpmsOpenApiProxyUrl("${this.callbackUrl}");
    actionMapInfo("ncpms-widget");
});
<\/script>
</head><body><div id="ncpms-widget"></div></body></html>`;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        console.log(`[NCPMS Widget] SVC33 로드 (예측조사비교)`);
    }

    _resetContent() {
        const mapDiv = document.getElementById('ncpms-map');
        const placeholder = document.getElementById('ncpms-placeholder');
        mapDiv.innerHTML = '';
        placeholder.style.display = 'flex';
    }

    // 기존 loadWidget 호환
    loadWidget(cropCode) {
        this._loadSVC31(cropCode);
    }

    _showMessage(html) {
        const placeholder = document.getElementById('ncpms-placeholder');
        document.getElementById('ncpms-map').innerHTML = '';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <span class="material-icons" style="font-size:36px;color:var(--risk-caution);">info</span>
            <p style="text-align:center;line-height:1.6;">${html}</p>
        `;
    }
}

const ncpmsWidget = new NcpmsWidget();
