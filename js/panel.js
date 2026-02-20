/**
 * 농작물 병해충 분포/예측 지도 - 정보 패널 모듈
 * 주소검색, 년간 그래프 (클릭 인터랙션), 설명 탭
 */

class InfoPanel {
    constructor() {
        this.currentTab = 'search';
        this.chart = null;
        this.weatherChart = null;
        this.solarPrecipChart = null;
        this.currentPest = null;
        this.currentCropId = null;
        this.currentRegion = null;
        this.selectedDate = null;
        this.selectedProvince = null;
        // 년간 시계열 데이터 캐시
        this.yearlyTsData = null;
        this.yearlyApiData = null;
        this.nasaPowerData = null;
        this._apiLoading = false;
    }

    init() {
        // 탭 클릭 이벤트
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // 검색 이벤트
        const searchInput = document.getElementById('search-input');
        const searchBtn = document.getElementById('search-btn');
        searchBtn.addEventListener('click', () => this.handleSearch());
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // 커스텀 이벤트 리스너
        document.addEventListener('pestSelected', (e) => this.onPestSelected(e.detail));
        document.addEventListener('regionSelected', (e) => this.onRegionSelected(e.detail));
        document.addEventListener('predictionUpdated', (e) => this.onPredictionUpdated(e.detail));

        this.showInitialState();
    }

    // ─── 탭 전환 ───────────────────────────────
    switchTab(tabId) {
        this.currentTab = tabId;
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });
        if (tabId === 'chart') {
            setTimeout(() => {
                if (this.chart) this.chart.resize();
                if (this.weatherChart) this.weatherChart.resize();
                if (this.solarPrecipChart) this.solarPrecipChart.resize();
            }, 100);
        }
    }

    showInitialState() {
        this.updateRegionInfo(null);
    }

    // ─── 주소 검색 ─────────────────────────────
    async handleSearch() {
        const query = document.getElementById('search-input').value.trim();
        if (!query) return;

        const resultsContainer = document.getElementById('search-results');
        resultsContainer.innerHTML = '<div class="loading-text" style="padding:20px;text-align:center;color:var(--text-muted);">검색 중...</div>';

        try {
            const url = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=10&page=1&query=${encodeURIComponent(query)}&type=address&format=json&errorformat=json&key=${VWORLD_API_KEY}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.response && data.response.result && data.response.result.items) {
                this.renderSearchResults(data.response.result.items);
            } else {
                const matchedProvince = PROVINCES.find(p => p.name.includes(query) || query.includes(p.name.replace(/특별|광역|자치|시|도/g, '')));
                if (matchedProvince) {
                    this.renderSearchResults([{
                        id: matchedProvince.code, title: matchedProvince.name,
                        address: { road: matchedProvince.name },
                        point: { x: matchedProvince.center[0], y: matchedProvince.center[1] }
                    }]);
                } else {
                    resultsContainer.innerHTML = `<div class="empty-state" style="padding:20px;"><span class="material-icons">location_off</span><p>검색 결과가 없습니다.</p></div>`;
                }
            }
        } catch (error) {
            console.error('[InfoPanel] 검색 에러:', error);
            const matchedProvince = PROVINCES.find(p =>
                p.name.includes(document.getElementById('search-input').value.trim()) ||
                document.getElementById('search-input').value.trim().includes(p.name.replace(/특별자치|특별|광역|자치|시|도/g, ''))
            );
            if (matchedProvince) {
                this.renderSearchResults([{
                    id: matchedProvince.code, title: matchedProvince.name,
                    address: { road: matchedProvince.name },
                    point: { x: matchedProvince.center[0], y: matchedProvince.center[1] }
                }]);
            } else {
                document.getElementById('search-results').innerHTML = `<div class="empty-state" style="padding:20px;"><span class="material-icons">wifi_off</span><p>네트워크 오류가 발생했습니다.</p></div>`;
            }
        }
    }

    renderSearchResults(items) {
        const container = document.getElementById('search-results');
        container.innerHTML = items.map(item => {
            const lon = parseFloat(item.point.x);
            const lat = parseFloat(item.point.y);
            const title = item.title || '';
            const address = item.address ? (item.address.road || item.address.parcel || '') : '';

            // 가장 가까운 시/도 찾아서 위험도 표시
            const province = ncpmsApi.findNearestProvince(lon, lat);
            const predData = province ? mapManager.predictionData[province.code] : null;
            const riskLevel = predData ? predData.riskLevel : null;
            const riskInfo = riskLevel !== null ? RISK_LEVELS[riskLevel] : null;
            const riskClasses = ['safe', 'interest', 'caution', 'warning', 'danger'];

            const riskBadge = riskInfo
                ? `<span class="risk-badge ${riskClasses[riskLevel]}" style="font-size:10px;padding:2px 6px;margin-left:auto;">
                       <span class="risk-dot ${riskClasses[riskLevel]}"></span>${riskInfo.grade}
                   </span>`
                : '';

            return `
                <div class="search-result-item animate-fade-in" onclick="infoPanel.goToLocation(${lon}, ${lat}, '${title.replace(/'/g, "\\'")}')">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div class="search-result-name" style="flex:1;">${title}</div>
                        ${riskBadge}
                    </div>
                    <div class="search-result-address">${address}</div>
                    ${predData ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">기온 ${predData.temperature}°C · 습도 ${predData.humidity}% · 확률 ${predData.probability}%</div>` : ''}
                </div>
            `;
        }).join('');
    }

    goToLocation(lon, lat, label) {
        mapManager.flyTo(lon, lat, 12);
        mapManager.addSearchMarker(lon, lat, label);

        // 검색된 위치의 가장 가까운 시/도 정보 표시
        const province = ncpmsApi.findNearestProvince(lon, lat);
        if (province) {
            const predData = mapManager.predictionData[province.code];
            if (predData) {
                const detail = {
                    code: province.code,
                    name: `${label} (${province.name})`,
                    riskLevel: predData.riskLevel,
                    probability: predData.probability,
                    temperature: predData.temperature,
                    humidity: predData.humidity
                };
                this.currentRegion = detail;
                this.selectedProvince = province.code;
                this.updateRegionInfo(detail);
                this.refreshYearlyCharts();

                // 지도에서도 해당 지역 선택 상태 반영
                mapManager.selectedRegion = province.code;
                mapManager.regionLayer.getSource().changed();
            }
        }
    }

    // ─── 이벤트 핸들러 ─────────────────────────
    onPestSelected(detail) {
        this.currentPest = detail.pest;
        this.currentCropId = detail.cropId;
        this.updateDescriptionTab();
        this.refreshYearlyCharts();
    }

    onRegionSelected(detail) {
        this.currentRegion = detail;
        this.selectedProvince = detail.code;
        this.updateRegionInfo(detail);
        this.refreshYearlyCharts();
    }

    onPredictionUpdated(detail) {
        if (detail.date) this.selectedDate = detail.date;
        this.refreshYearlyCharts();
    }

    // ─── 지역 정보 카드 ────────────────────────
    updateRegionInfo(region) {
        const card = document.getElementById('region-info');
        if (!region) {
            card.innerHTML = `<div class="empty-state"><span class="material-icons">touch_app</span><p>지도에서 지역을 클릭하면<br>상세 정보가 표시됩니다.</p></div>`;
            return;
        }

        const riskInfo = RISK_LEVELS[region.riskLevel] || RISK_LEVELS[0];
        const riskClasses = ['safe', 'interest', 'caution', 'warning', 'danger'];

        card.innerHTML = `
            <div class="region-info-card animate-fade-in">
                <h3><span class="material-icons">place</span>${region.name}</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-item-label">위험수준</span>
                        <span class="risk-badge ${riskClasses[region.riskLevel]}">
                            <span class="risk-dot ${riskClasses[region.riskLevel]}"></span>
                            ${riskInfo.grade} ${riskInfo.label}
                        </span>
                    </div>
                    <div class="info-item">
                        <span class="info-item-label">발생확률</span>
                        <span class="info-item-value">${region.probability}%</span>
                    </div>
                    <div class="info-item">
                        <span class="info-item-label">기온</span>
                        <span class="info-item-value">${region.temperature}°C</span>
                    </div>
                    <div class="info-item">
                        <span class="info-item-label">습도</span>
                        <span class="info-item-value">${region.humidity}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── 년간 차트 갱신 (위험도 + 기상 + 일사량/강수량) ──
    refreshYearlyCharts() {
        const date = parseDate(this.selectedDate);
        const year = date.getFullYear();
        const cropId = this.currentCropId || 'FC010101';
        const pestId = this.currentPest ? this.currentPest.id : 'P001';
        const provinceCode = this.selectedProvince || '41'; // 기본: 경기도

        // 1) 기후 모델 기반 즉시 렌더링
        this.yearlyTsData = generateYearlyTimeSeriesData(year, cropId, pestId, provinceCode);
        this.updateYearlyRiskChart();
        this.updateYearlyWeatherChart();

        // 2) NCPMS API 배경 수집 시도
        this.fetchApiTimeSeries(cropId, pestId, year, provinceCode);

        // 3) NASA POWER 일사량/강수량 데이터 조회
        const province = PROVINCES.find(p => p.code === provinceCode);
        const lon = province ? province.center[0] : 127.0;
        const lat = province ? province.center[1] : 37.0;
        this.fetchNasaPowerData(year, lon, lat);
    }

    // API 시계열 배경 수집
    async fetchApiTimeSeries(cropId, pestId, year, provinceCode) {
        if (this._apiLoading) return;
        this._apiLoading = true;

        try {
            const apiResults = await ncpmsApi.fetchMonthlyTimeSeries(cropId, pestId, year, provinceCode);
            if (apiResults && this.yearlyTsData) {
                this.yearlyApiData = apiResults;
                mergeApiDataIntoTimeSeries(this.yearlyTsData, apiResults);
                this.updateYearlyRiskChart();
                this.updateYearlyWeatherChart();
                console.log('[InfoPanel] API 시계열 데이터 반영 완료');
            }
        } catch (err) {
            console.warn('[InfoPanel] API 시계열 수집 실패:', err.message);
        }

        this._apiLoading = false;
    }

    // ─── 현재 선택 날짜의 차트 인덱스 ─────────────
    _getSelectedDateIndex() {
        if (!this.yearlyTsData || !this.selectedDate) return -1;
        const selDate = parseDate(this.selectedDate);
        const selMonth = selDate.getMonth();
        const selDay = selDate.getDate();
        // 가장 가까운 포인트 인덱스
        return selMonth * 2 + (selDay >= 8 ? 1 : 0);
    }

    // ─── 위험도 예측 추이 (년간) ────────────────
    updateYearlyRiskChart() {
        const ctx = document.getElementById('prediction-chart');
        if (!ctx || !this.yearlyTsData) return;

        const tsData = this.yearlyTsData;
        const selIdx = this._getSelectedDateIndex();

        // 포인트별 스타일: 고위험(3등급 이상) 포인트 강조
        const pointRadii = tsData.riskData.map((v, i) => i === selIdx ? 8 : (v >= 3 ? 5 : 3));
        const pointColors = tsData.riskData.map((v, i) => {
            if (i === selIdx) return '#ffffff';
            if (v >= 4) return '#C62828';
            if (v >= 3) return '#EF6C00';
            return '#00bcd4';
        });
        const pointBorders = tsData.riskData.map((v, i) => {
            if (i === selIdx) return '#00bcd4';
            return 'transparent';
        });

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: tsData.labels,
                datasets: [
                    {
                        label: '위험도',
                        data: tsData.riskData,
                        borderColor: '#00bcd4',
                        backgroundColor: (ctx2) => {
                            const gradient = ctx2.chart.ctx.createLinearGradient(0, 0, 0, ctx2.chart.height);
                            gradient.addColorStop(0, 'rgba(198, 40, 40, 0.3)');
                            gradient.addColorStop(0.5, 'rgba(249, 168, 37, 0.15)');
                            gradient.addColorStop(1, 'rgba(0, 188, 212, 0.05)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: pointRadii,
                        pointBackgroundColor: pointColors,
                        pointBorderColor: pointBorders,
                        pointBorderWidth: tsData.riskData.map((_, i) => i === selIdx ? 3 : 0),
                        pointHoverRadius: 8,
                        pointHitRadius: 12,
                        borderWidth: 2.5,
                        yAxisID: 'y'
                    },
                    {
                        label: '기온(°C)',
                        data: tsData.tempData,
                        borderColor: '#ff7043',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.4,
                        pointRadius: tsData.tempData.map((_, i) => i === selIdx ? 6 : 1.5),
                        pointBackgroundColor: '#ff7043',
                        borderWidth: 1.5,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                onClick: (event, elements) => this._handleChartClick(elements),
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#9ab0c6', font: { size: 10, family: 'Pretendard, sans-serif' }, boxWidth: 16, padding: 8 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(23, 42, 58, 0.95)',
                        titleColor: '#e8edf2',
                        bodyColor: '#9ab0c6',
                        borderColor: 'rgba(0, 188, 212, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 10,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return tsData.dates[idx] || items[0].label;
                            },
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                const risk = tsData.riskData[idx];
                                if (risk >= 3) return ['', '⚠ 클릭하면 이 날짜로 이동합니다'];
                                return ['', '📌 클릭하면 이 날짜로 이동합니다'];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#6a8299',
                            font: { size: 10 },
                            maxRotation: 0,
                            callback: function(value, index) {
                                return tsData.labels[index] || '';
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        position: 'left',
                        min: 0, max: 4.8,
                        title: { display: true, text: '위험등급', color: '#6a8299', font: { size: 10 } },
                        ticks: {
                            color: '#6a8299',
                            font: { size: 9 },
                            stepSize: 1,
                            callback: (v) => {
                                const lvls = ['1등급', '2등급', '3등급', '4등급', '5등급'];
                                return lvls[Math.round(v)] || '';
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: '°C', color: '#6a8299', font: { size: 10 } },
                        ticks: { color: '#6a8299', font: { size: 9 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ─── 기상 데이터 차트 (년간) ────────────────
    updateYearlyWeatherChart() {
        const ctx = document.getElementById('weather-chart');
        if (!ctx || !this.yearlyTsData) return;

        const tsData = this.yearlyTsData;
        const selIdx = this._getSelectedDateIndex();

        if (this.weatherChart) this.weatherChart.destroy();

        this.weatherChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: tsData.labels,
                datasets: [
                    {
                        label: '습도(%)',
                        data: tsData.humidityData,
                        backgroundColor: tsData.humidityData.map((v, i) => {
                            if (i === selIdx) return 'rgba(0, 188, 212, 0.7)';
                            return v >= 75 ? 'rgba(0, 188, 212, 0.45)' : 'rgba(0, 188, 212, 0.2)';
                        }),
                        borderColor: tsData.humidityData.map((_, i) =>
                            i === selIdx ? '#00bcd4' : 'rgba(0, 188, 212, 0.4)'),
                        borderWidth: 1,
                        borderRadius: 3,
                        yAxisID: 'y'
                    },
                    {
                        label: '기온(°C)',
                        data: tsData.tempData,
                        type: 'line',
                        borderColor: '#ff7043',
                        backgroundColor: 'transparent',
                        tension: 0.4,
                        pointRadius: tsData.tempData.map((_, i) => i === selIdx ? 6 : 2),
                        pointBackgroundColor: tsData.tempData.map((_, i) =>
                            i === selIdx ? '#ffffff' : '#ff7043'),
                        pointBorderColor: tsData.tempData.map((_, i) =>
                            i === selIdx ? '#ff7043' : 'transparent'),
                        pointBorderWidth: 2,
                        borderWidth: 2,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                onClick: (event, elements) => this._handleChartClick(elements),
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#9ab0c6', font: { size: 10 }, boxWidth: 16, padding: 8 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(23, 42, 58, 0.95)',
                        titleColor: '#e8edf2',
                        bodyColor: '#9ab0c6',
                        borderColor: 'rgba(0, 188, 212, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return tsData.dates[idx] || items[0].label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#6a8299', font: { size: 10 }, maxRotation: 0,
                            callback: (value, index) => tsData.labels[index] || ''
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        position: 'left', min: 20, max: 100,
                        title: { display: true, text: '습도%', color: '#6a8299', font: { size: 10 } },
                        ticks: { color: '#6a8299', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: '°C', color: '#6a8299', font: { size: 10 } },
                        ticks: { color: '#6a8299', font: { size: 9 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ─── NASA POWER 일사량/강수량 데이터 조회 ──────
    async fetchNasaPowerData(year, lon, lat) {
        try {
            const data = await nasaPowerApi.fetchYearlyData(year, lon, lat);
            if (data) {
                this.nasaPowerData = data;
                this.updateSolarPrecipChart();
            }
        } catch (err) {
            console.warn('[InfoPanel] NASA POWER 조회 실패:', err.message);
        }
    }

    // ─── 일사량/강수량 차트 (NASA POWER) ─────────
    updateSolarPrecipChart() {
        const ctx = document.getElementById('solar-precip-chart');
        if (!ctx || !this.nasaPowerData) return;

        const npData = this.nasaPowerData;
        const selIdx = this._getSelectedDateIndex();

        if (this.solarPrecipChart) this.solarPrecipChart.destroy();

        this.solarPrecipChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: npData.labels,
                datasets: [
                    {
                        label: '강수량(mm/day)',
                        data: npData.precipData,
                        backgroundColor: npData.precipData.map((v, i) => {
                            if (i === selIdx) return 'rgba(66, 165, 245, 0.85)';
                            return v >= 5 ? 'rgba(66, 165, 245, 0.55)' : 'rgba(66, 165, 245, 0.25)';
                        }),
                        borderColor: npData.precipData.map((_, i) =>
                            i === selIdx ? '#42a5f5' : 'rgba(66, 165, 245, 0.4)'),
                        borderWidth: 1,
                        borderRadius: 3,
                        yAxisID: 'y'
                    },
                    {
                        label: '일사량(MJ/m²/day)',
                        data: npData.solarData,
                        type: 'line',
                        borderColor: '#ffd54f',
                        backgroundColor: (ctx2) => {
                            const gradient = ctx2.chart.ctx.createLinearGradient(0, 0, 0, ctx2.chart.height);
                            gradient.addColorStop(0, 'rgba(255, 213, 79, 0.25)');
                            gradient.addColorStop(1, 'rgba(255, 213, 79, 0.02)');
                            return gradient;
                        },
                        fill: true,
                        tension: 0.4,
                        pointRadius: npData.solarData.map((_, i) => i === selIdx ? 6 : 2),
                        pointBackgroundColor: npData.solarData.map((_, i) =>
                            i === selIdx ? '#ffffff' : '#ffd54f'),
                        pointBorderColor: npData.solarData.map((_, i) =>
                            i === selIdx ? '#ffd54f' : 'transparent'),
                        pointBorderWidth: 2,
                        borderWidth: 2,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                onClick: (event, elements) => this._handleChartClick(elements),
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#9ab0c6', font: { size: 10 }, boxWidth: 16, padding: 8 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(23, 42, 58, 0.95)',
                        titleColor: '#e8edf2',
                        bodyColor: '#9ab0c6',
                        borderColor: 'rgba(66, 165, 245, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return npData.dates[idx] || items[0].label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#6a8299', font: { size: 10 }, maxRotation: 0,
                            callback: (value, index) => npData.labels[index] || ''
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        position: 'left', min: 0,
                        title: { display: true, text: 'mm/day', color: '#6a8299', font: { size: 10 } },
                        ticks: { color: '#6a8299', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right', min: 0,
                        title: { display: true, text: 'MJ/m²', color: '#6a8299', font: { size: 10 } },
                        ticks: { color: '#6a8299', font: { size: 9 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ─── 차트 클릭 → 해당 날짜로 이동 ─────────────
    _handleChartClick(elements) {
        if (!elements || elements.length === 0 || !this.yearlyTsData) return;

        const idx = elements[0].index;
        const clickedDate = this.yearlyTsData.dates[idx];
        if (!clickedDate) return;

        console.log(`[InfoPanel] 차트 클릭 → ${clickedDate} 로 이동`);

        // 이벤트 발행 → sidebar가 날짜 변경 + 지도 갱신
        document.dispatchEvent(new CustomEvent('chartDateClicked', {
            detail: { date: clickedDate }
        }));
    }

    // ─── 설명 탭 ───────────────────────────────
    updateDescriptionTab() {
        const container = document.getElementById('description-content');
        if (!this.currentPest) {
            container.innerHTML = `<div class="empty-state"><span class="material-icons">info</span><p>병해충을 선택하면<br>상세 설명이 표시됩니다.</p></div>`;
            return;
        }

        // 즉시 로컬 데이터로 렌더링
        const localDesc = PEST_DESCRIPTIONS[this.currentPest.id] || PEST_DESCRIPTIONS['default'];
        const pesticides = RELATED_PESTICIDES[this.currentPest.id] || RELATED_PESTICIDES['default'];
        this._renderDescription(localDesc, pesticides, 'local');

        // API에서 상세정보 비동기 시도
        this._fetchPestInfoFromApi();
    }

    async _fetchPestInfoFromApi() {
        if (!this.currentPest) return;
        const pestId = this.currentPest.id;
        const pestType = this.currentPest.type;

        try {
            const apiData = await ncpmsApi.fetchPestInfo(pestId, pestType);
            // pest가 바뀌지 않았는지 확인
            if (!apiData || !this.currentPest || this.currentPest.id !== pestId) return;

            // API 데이터가 충분하면 병합하여 재렌더링
            const localDesc = PEST_DESCRIPTIONS[pestId] || PEST_DESCRIPTIONS['default'];
            const merged = {
                name: apiData.name || localDesc.name || this.currentPest.name,
                nameEn: apiData.nameEn || '',
                cropName: apiData.cropName || '',
                summary: apiData.summary || localDesc.summary,
                symptoms: apiData.symptoms || localDesc.symptoms,
                conditions: apiData.conditions || localDesc.conditions,
                prevention: apiData.prevention || localDesc.prevention,
                infectionRoute: apiData.infectionRoute || '',
                pathogen: apiData.pathogen || '',
                biologyInfo: apiData.biologyInfo || '',
                images: apiData.images || [],
                _source: 'api'
            };

            const pesticides = RELATED_PESTICIDES[pestId] || RELATED_PESTICIDES['default'];
            this._renderDescription(merged, pesticides, 'api');
        } catch (err) {
            console.warn('[InfoPanel] API 병해충 정보 조회 실패:', err.message);
        }
    }

    _renderDescription(desc, pesticides, source) {
        const container = document.getElementById('description-content');
        const name = desc.name || (this.currentPest ? this.currentPest.name : '');
        const typeBadge = this.currentPest
            ? `<span class="pest-type-badge ${this.currentPest.type === '병해' ? 'disease' : 'pest'}" style="font-size:10px;">${this.currentPest.type}</span>`
            : '';
        const apiTag = source === 'api'
            ? '<span style="font-size:9px;color:var(--accent-primary);background:rgba(0,188,212,0.1);padding:1px 6px;border-radius:4px;margin-left:6px;">API</span>'
            : '';

        // 추가 정보 (API 전용)
        let extraSections = '';
        if (desc.nameEn) {
            extraSections += `<div style="font-size:11px;color:var(--text-muted);margin-top:-6px;margin-bottom:8px;">${desc.nameEn}${desc.cropName ? ` · ${desc.cropName}` : ''}</div>`;
        }
        if (desc.pathogen) {
            extraSections += `
                <div class="desc-section">
                    <h4><span class="material-icons">biotech</span>병원체</h4>
                    <p>${desc.pathogen}</p>
                </div>`;
        }
        if (desc.infectionRoute) {
            extraSections += `
                <div class="desc-section">
                    <h4><span class="material-icons">route</span>전염경로</h4>
                    <p>${desc.infectionRoute}</p>
                </div>`;
        }
        if (desc.biologyInfo) {
            extraSections += `
                <div class="desc-section">
                    <h4><span class="material-icons">pest_control</span>생태정보</h4>
                    <p>${desc.biologyInfo}</p>
                </div>`;
        }

        // 이미지 (API 전용)
        let imageSection = '';
        if (desc.images && desc.images.length > 0) {
            imageSection = `
                <div class="desc-section">
                    <h4><span class="material-icons">image</span>참고 이미지</h4>
                    <div class="desc-images">${desc.images.map(url =>
                        `<img src="${url}" alt="${name}" class="desc-pest-img" onerror="this.style.display='none'">`
                    ).join('')}</div>
                </div>`;
        }

        container.innerHTML = `
            <div class="animate-fade-in">
                <div class="desc-section">
                    <h4>${typeBadge}<span class="material-icons">bug_report</span>${name}${apiTag}</h4>
                    ${extraSections.startsWith('<div style="font-size:11px') ? '' : ''}
                    <p>${desc.summary}</p>
                </div>
                ${desc.nameEn ? `<div style="font-size:11px;color:var(--text-muted);margin-top:-8px;margin-bottom:10px;">${desc.nameEn}${desc.cropName ? ` · ${desc.cropName}` : ''}</div>` : ''}
                <div class="desc-section">
                    <h4><span class="material-icons">medical_information</span>증상</h4>
                    <p>${desc.symptoms}</p>
                </div>
                <div class="desc-section">
                    <h4><span class="material-icons">thermostat</span>발생 조건</h4>
                    <p>${desc.conditions}</p>
                </div>
                <div class="desc-section">
                    <h4><span class="material-icons">shield</span>예방 및 방제</h4>
                    <p>${desc.prevention}</p>
                </div>
                ${desc.pathogen ? `<div class="desc-section"><h4><span class="material-icons">biotech</span>병원체</h4><p>${desc.pathogen}</p></div>` : ''}
                ${desc.infectionRoute ? `<div class="desc-section"><h4><span class="material-icons">route</span>전염경로</h4><p>${desc.infectionRoute}</p></div>` : ''}
                ${desc.biologyInfo ? `<div class="desc-section"><h4><span class="material-icons">pest_control</span>생태정보</h4><p>${desc.biologyInfo}</p></div>` : ''}
                ${imageSection}
                <div class="pesticide-section">
                    <h4><span class="material-icons">science</span>관련 농약 (${pesticides.length})</h4>
                    <table class="pesticide-table">
                        <thead><tr><th>약제명</th><th>용법</th><th>시기</th></tr></thead>
                        <tbody>
                            ${pesticides.map(p => `<tr><td>${p.name}</td><td>${p.usage}</td><td>${p.timing}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}

// 전역 인스턴스
const infoPanel = new InfoPanel();
