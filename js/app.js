/**
 * 농작물 병해충 분포/예측 지도 - 앱 초기화
 */

class App {
    constructor() {
        this.initialized = false;
    }

    async init() {
        console.log('[App] 앱 초기화 시작...');

        try {
            // 1. 지도 초기화
            mapManager.init();

            // 2. 사이드바 초기화
            sidebar.init();

            // 3. 정보 패널 초기화
            infoPanel.init();

            // 4. 범례 초기화
            legend.init();

            // 4.5. NCPMS API 초기화
            ncpmsApi.updateStatus(false);
            console.log('[App] NCPMS API 모듈 초기화됨 (API Key 미설정 시 샘플 데이터 사용)');

            // 4.6. 저장된 설정 적용 (localStorage)
            settingsModal.applyStoredSettings();

            // 5. 지역 폴리곤 로드
            mapManager.loadRegions(PROVINCE_GEOJSON);

            // 6. 배경지도 전환 버튼
            this.initLayerToggle();

            // 7. 해 현재 날짜 표시
            this.updateHeaderDate();

            // 8. 상태바 업데이트
            this.updateStatusBar();

            // 9. 로딩 화면 제거
            setTimeout(() => {
                const loading = document.getElementById('loading-overlay');
                if (loading) {
                    loading.classList.add('hidden');
                    setTimeout(() => loading.remove(), 500);
                }
            }, 1000);

            this.initialized = true;
            console.log('[App] 앱 초기화 완료!');

        } catch (error) {
            console.error('[App] 초기화 에러:', error);
        }
    }

    // 배경지도 전환 버튼 초기화
    initLayerToggle() {
        document.querySelectorAll('.layer-btn[data-layer]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.layer;
                document.querySelectorAll('.layer-btn[data-layer]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                mapManager.switchLayer(type);
            });
        });
    }

    // 헤더 날짜 업데이트
    updateHeaderDate() {
        const el = document.getElementById('header-date');
        if (el) {
            const now = new Date();
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
            el.textContent = now.toLocaleDateString('ko-KR', options);
        }
    }

    // 상태바
    updateStatusBar() {
        const coordsEl = document.getElementById('status-coords');
        if (coordsEl && mapManager.map) {
            mapManager.map.on('pointermove', (evt) => {
                const coords = ol.proj.toLonLat(evt.coordinate);
                coordsEl.textContent = `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`;
            });
        }
    }
}

// DOM 로드 후 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
