/**
 * 농작물 병해충 분포/예측 지도 - 설정 모달
 * API Key: DB 저장 (백엔드) + localStorage 캐시
 */

class SettingsModal {
    constructor() {
        this.STORAGE_KEY = 'pestmap_settings';
        this.API_URL = 'api/settings.php';
    }

    // 모달 열기
    open() {
        const modal = document.getElementById('settings-modal');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('open'));

        // 저장된 값 로드
        const settings = this.load();
        document.getElementById('setting-vworld-key').value = settings.vworldKey || '';
        document.getElementById('setting-ncpms-key').value = settings.ncpmsKey || '';

        // 둘 다 password 타입으로
        document.getElementById('setting-vworld-key').type = 'password';
        document.getElementById('setting-ncpms-key').type = 'password';

        // 상태 표시
        this.updateStatusDisplay();

        // ESC 키로 닫기
        this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
        document.addEventListener('keydown', this._escHandler);
    }

    // 모달 닫기
    close() {
        const modal = document.getElementById('settings-modal');
        modal.classList.remove('open');
        setTimeout(() => modal.style.display = 'none', 300);
        document.removeEventListener('keydown', this._escHandler);
    }

    // 저장 (DB + localStorage)
    async save() {
        const vworldKey = document.getElementById('setting-vworld-key').value.trim();
        const ncpmsKey = document.getElementById('setting-ncpms-key').value.trim();
        const settings = { vworldKey, ncpmsKey };

        // localStorage 캐시 저장
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));

        // DB 저장 (백엔드)
        try {
            const resp = await fetch(this.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const result = await resp.json();
            if (result.success) {
                console.log('[Settings] DB 저장 완료:', result.message);
            } else {
                console.warn('[Settings] DB 저장 실패:', result.error);
            }
        } catch (err) {
            console.warn('[Settings] DB 연결 실패, localStorage만 사용:', err.message);
        }

        // VWorld API Key 적용
        if (vworldKey) {
            this.applyVWorldKey(vworldKey);
        }

        // NCPMS API Key 적용
        ncpmsApi.setApiKey(ncpmsKey || '');

        // 상태 업데이트
        this.updateStatusDisplay();

        // 데이터 새로고침
        sidebar.updatePrediction();

        // 성공 토스트
        this.showToast('설정이 저장되었습니다.');

        // 모달 닫기
        setTimeout(() => this.close(), 800);
    }

    // 로드: localStorage 캐시 (즉시)
    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    // DB에서 설정 로드 (비동기)
    async loadFromDB() {
        try {
            const resp = await fetch(this.API_URL);
            const result = await resp.json();
            if (result.success && result.settings) {
                // localStorage 캐시도 동기화
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(result.settings));
                console.log('[Settings] DB에서 설정 로드 완료');
                return result.settings;
            }
        } catch (err) {
            console.warn('[Settings] DB 로드 실패, localStorage 사용:', err.message);
        }
        return null;
    }

    // 앱 시작 시 저장된 설정 적용
    async applyStoredSettings() {
        // 1) localStorage에서 즉시 적용 (빠른 시작)
        const localSettings = this.load();
        this._applySettings(localSettings);

        // 2) DB에서 비동기 로드 → 덮어쓰기
        const dbSettings = await this.loadFromDB();
        if (dbSettings) {
            this._applySettings(dbSettings);
        }
    }

    // 설정값 실제 적용
    _applySettings(settings) {
        if (!settings) return;

        if (settings.vworldKey) {
            this.applyVWorldKey(settings.vworldKey);
            console.log('[Settings] VWorld API Key 적용됨');
        }

        if (settings.ncpmsKey) {
            ncpmsApi.setApiKey(settings.ncpmsKey);
            console.log('[Settings] NCPMS API Key 적용됨');
        }
    }

    // VWorld API Key를 지도 레이어에 적용
    applyVWorldKey(key) {
        const layers = {
            base: `https://api.vworld.kr/req/wmts/1.0.0/${key}/Base/{z}/{y}/{x}.png`,
            satellite: `https://api.vworld.kr/req/wmts/1.0.0/${key}/Satellite/{z}/{y}/{x}.jpeg`,
            hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${key}/Hybrid/{z}/{y}/{x}.png`
        };

        if (mapManager.baseLayer) {
            mapManager.baseLayer.getSource().setUrl(layers.base);
        }
        if (mapManager.satelliteLayer) {
            mapManager.satelliteLayer.getSource().setUrl(layers.satellite);
        }
        if (mapManager.hybridLayer) {
            mapManager.hybridLayer.getSource().setUrl(layers.hybrid);
        }

        if (typeof VWORLD_API_KEY !== 'undefined') {
            window.VWORLD_API_KEY = key;
        }
    }

    // 비밀번호 가시성 토글
    toggleVisibility(inputId) {
        const input = document.getElementById(inputId);
        const btn = input.parentElement.querySelector('.settings-eye-btn .material-icons');

        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = 'visibility';
        } else {
            input.type = 'password';
            btn.textContent = 'visibility_off';
        }
    }

    // 상태 표시 업데이트
    updateStatusDisplay() {
        const el = document.getElementById('settings-status');
        if (!el) return;

        const settings = this.load();
        const vworldOk = !!settings.vworldKey;
        const ncpmsOk = !!settings.ncpmsKey;

        el.innerHTML = `
            <div class="settings-status-title">연결 상태</div>
            <div class="settings-status-row">
                <span class="status-dot" style="background:${vworldOk ? 'var(--risk-safe)' : 'var(--risk-caution)'}; box-shadow:0 0 6px ${vworldOk ? 'var(--risk-safe)' : 'var(--risk-caution)'}"></span>
                <span>VWorld API: ${vworldOk ? '<span style="color:var(--risk-safe)">설정됨</span>' : '<span style="color:var(--text-muted)">미설정 (기본 키 사용)</span>'}</span>
            </div>
            <div class="settings-status-row">
                <span class="status-dot" style="background:${ncpmsOk ? 'var(--risk-safe)' : 'var(--risk-caution)'}; box-shadow:0 0 6px ${ncpmsOk ? 'var(--risk-safe)' : 'var(--risk-caution)'}"></span>
                <span>NCPMS API: ${ncpmsOk ? '<span style="color:var(--risk-safe)">설정됨</span>' : '<span style="color:var(--text-muted)">미설정 (시뮬레이션 모드)</span>'}</span>
            </div>
            <div class="settings-status-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">
                <span class="status-dot" id="db-status-dot" style="background:var(--text-muted)"></span>
                <span id="db-status-text" style="font-size:11px;">DB 연결 확인 중...</span>
            </div>
        `;

        // DB 연결 상태 비동기 확인
        this._checkDBStatus();
    }

    async _checkDBStatus() {
        const dot = document.getElementById('db-status-dot');
        const text = document.getElementById('db-status-text');
        if (!dot || !text) return;

        try {
            const resp = await fetch(this.API_URL);
            const result = await resp.json();
            if (result.success) {
                dot.style.background = 'var(--risk-safe)';
                dot.style.boxShadow = '0 0 6px var(--risk-safe)';
                text.innerHTML = 'DB: <span style="color:var(--risk-safe)">연결됨</span>';
            } else {
                dot.style.background = 'var(--risk-danger)';
                text.innerHTML = 'DB: <span style="color:var(--risk-danger)">오류</span>';
            }
        } catch {
            dot.style.background = 'var(--risk-caution)';
            text.innerHTML = 'DB: <span style="color:var(--text-muted)">미연결 (localStorage 사용)</span>';
        }
    }

    // 토스트 알림
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `<span class="material-icons">check_circle</span>${message}`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
}

// 전역 인스턴스
const settingsModal = new SettingsModal();
