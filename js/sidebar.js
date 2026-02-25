/**
 * 농작물 병해충 분포/예측 지도 - 사이드바 모듈
 * 작물 선택, 병해충 목록, 날짜/지역 필터
 */

class Sidebar {
    constructor() {
        this.selectedCrop = null;
        this.selectedPest = null;
        this.selectedProvince = 'all';
        this.selectedDate = this.getTodayString();
    }

    getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    init() {
        this.renderCropGrid();
        this.renderFilters();
        this.renderPestList();

        // 차트 날짜 클릭 이벤트 리스너
        document.addEventListener('chartDateClicked', (e) => {
            const clickedDate = e.detail.date;
            if (!clickedDate) return;

            this.selectedDate = clickedDate;
            document.getElementById('date-input').value = clickedDate;
            console.log(`[Sidebar] 차트에서 날짜 선택: ${clickedDate}`);
            this.updatePrediction();
        });

        // 기본 선택: 논벼
        this.selectCrop(CROPS[0].id);
    }

    // 작물 카드 그리드 렌더링
    renderCropGrid() {
        const container = document.getElementById('crop-grid');
        container.innerHTML = CROPS.map(crop => `
            <div class="crop-card" data-crop-id="${crop.id}" onclick="sidebar.selectCrop('${crop.id}')">
                <span class="crop-icon">${crop.icon}</span>
                <span class="crop-name">${crop.name}</span>
            </div>
        `).join('');
    }

    // 작물 선택
    selectCrop(cropId) {
        this.selectedCrop = cropId;

        // UI 업데이트
        document.querySelectorAll('.crop-card').forEach(card => {
            card.classList.toggle('active', card.dataset.cropId === cropId);
        });

        // 병해충 목록 업데이트
        this.renderPestList();

        // 선택된 작물의 첫 번째 병해충 자동 선택
        const pests = PESTS[cropId];
        if (pests && pests.length > 0) {
            this.selectPest(pests[0].id);
        }

        const crop = CROPS.find(c => c.id === cropId);
        console.log(`[Sidebar] 작물 선택: ${crop.name}`);
    }

    // 병해충 목록 렌더링
    renderPestList() {
        const container = document.getElementById('pest-list');
        const pests = PESTS[this.selectedCrop] || [];

        if (pests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons">search_off</span>
                    <p>작물을 선택하면<br>병해충 목록이 표시됩니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pests.map(pest => `
            <div class="pest-item" data-pest-id="${pest.id}" onclick="sidebar.selectPest('${pest.id}')">
                <span class="pest-type-badge ${pest.type === '병해' ? 'disease' : 'pest'}">${pest.type}</span>
                <span class="pest-name">${pest.name}</span>
            </div>
        `).join('');

        // 애니메이션
        container.querySelectorAll('.pest-item').forEach((item, i) => {
            item.style.opacity = '0';
            item.style.transform = 'translateX(-10px)';
            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateX(0)';
            }, i * 50);
        });
    }

    // 병해충 선택
    selectPest(pestId) {
        this.selectedPest = pestId;

        // UI 업데이트
        document.querySelectorAll('.pest-item').forEach(item => {
            item.classList.toggle('active', item.dataset.pestId === pestId);
        });

        // 예측 데이터 생성 및 지도 업데이트
        this.updatePrediction();

        // 정보패널 업데이트 이벤트
        const pests = PESTS[this.selectedCrop] || [];
        const pest = pests.find(p => p.id === pestId);
        if (pest) {
            document.dispatchEvent(new CustomEvent('pestSelected', { detail: { pest, cropId: this.selectedCrop } }));
            console.log(`[Sidebar] 병해충 선택: ${pest.name}`);
        }
    }

    // 필터 렌더링
    renderFilters() {
        // 시/도 선택
        const provinceSelect = document.getElementById('province-select');
        provinceSelect.innerHTML = `<option value="all">전국</option>` +
            PROVINCES.map(p => `<option value="${p.code}">${p.name}</option>`).join('');

        provinceSelect.addEventListener('change', (e) => {
            this.selectedProvince = e.target.value;
            this.handleProvinceChange();
        });

        // 날짜 선택
        const dateInput = document.getElementById('date-input');
        dateInput.value = this.selectedDate;
        dateInput.addEventListener('change', (e) => {
            this.selectedDate = e.target.value;
            this.updatePrediction();
        });
    }

    // 시/도 변경 처리
    handleProvinceChange() {
        if (this.selectedProvince === 'all') {
            mapManager.flyTo(127.5, 36.0, 7);
        } else {
            const province = PROVINCES.find(p => p.code === this.selectedProvince);
            if (province) {
                mapManager.flyTo(province.center[0], province.center[1], 9);
            }
        }
        this.updatePrediction();
    }

    // 예측 데이터 업데이트 (NCPMS API 연동)
    async updatePrediction() {
        if (!this.selectedCrop || !this.selectedPest) return;

        this.showLoading();
        let predictions;

        // NCPMS API 사용 시도
        try {
            const apiData = await ncpmsApi.fetchPrediction(
                this.selectedCrop,
                this.selectedPest,
                this.selectedDate
            );

            if (apiData && Object.keys(apiData).length > 0) {
                predictions = apiData;
                console.log('[Sidebar] NCPMS API 데이터 사용');
            } else {
                predictions = generatePredictionData(this.selectedCrop, this.selectedPest, this.selectedDate);
                console.log('[Sidebar] 샘플 데이터 사용 (API 응답 없음)');
            }
        } catch (error) {
            predictions = generatePredictionData(this.selectedCrop, this.selectedPest, this.selectedDate);
            console.log('[Sidebar] 샘플 데이터 사용 (API 에러)');
        }

        // 히트맵 렌더링 완료까지 대기 후 로딩 해제
        await mapManager.updatePredictions(predictions);

        // 열려있는 팝업 갱신 (기온/습도 등 반영)
        mapManager.refreshPopup();

        // 패널 그래프 업데이트 이벤트 (날짜 포함)
        document.dispatchEvent(new CustomEvent('predictionUpdated', {
            detail: { predictions, date: this.selectedDate }
        }));

        this.hideLoading();
    }

    // ─── 로딩 오버레이 ──────────────────────
    showLoading() {
        let overlay = document.getElementById('api-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'api-loading-overlay';
            overlay.className = 'api-loading-overlay';
            overlay.innerHTML = `
                <div class="api-loading-content">
                    <div class="api-loading-spinner"></div>
                    <div class="api-loading-text">예측 데이터 조회 중...</div>
                    <div class="api-loading-sub">NCPMS API 연결 시도 중</div>
                </div>
            `;
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) {
                mapContainer.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    hideLoading() {
        const overlay = document.getElementById('api-loading-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.style.display = 'none', 300);
        }
    }
}

// 전역 인스턴스
const sidebar = new Sidebar();
