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
        this._aiLoading = false;
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
        this.updateJsonSection();
    }

    onPredictionUpdated(detail) {
        if (detail.date) this.selectedDate = detail.date;
        this.refreshYearlyCharts();
        this.updateJsonSection();
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

        // JSON 섹션 갱신
        this.updateJsonSection();
    }

    // ─── 설명 탭 하단 JSON 섹션 ─────────────────
    showJsonData() {
        this.switchTab('desc');
        this.updateJsonSection();
        setTimeout(() => {
            const el = document.getElementById('json-data-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 200);
    }

    updateJsonSection() {
        const container = document.getElementById('json-data-section');
        if (!container) return;
        if (this._aiLoading) return; // AI 응답 중에는 갱신하지 않음

        const coord = mapManager.selectedCoord;
        const cropId = this.currentCropId || sidebar.selectedCrop;
        const pestId = this.currentPest ? this.currentPest.id : sidebar.selectedPest;
        const date = this.selectedDate || sidebar.selectedDate;

        if (!cropId || !pestId) {
            container.innerHTML = `
                <div class="json-section">
                    <h4><span class="material-icons">data_object</span>전체 데이터 (JSON)</h4>
                    <p style="color:var(--text-muted);font-size:12px;padding:8px 0;">
                        작물, 병해충을 선택하고 지도에서 위치를 클릭하면<br>전체 데이터가 JSON으로 표시됩니다.
                    </p>
                </div>`;
            return;
        }

        // 기본 정보
        const crop = CROPS.find(c => c.id === cropId);
        const pests = PESTS[cropId] || [];
        const pest = pests.find(p => p.id === pestId);
        const province = coord ? ncpmsApi.findNearestProvince(coord[0], coord[1]) : null;

        // 현재 포인트 데이터
        const pointData = coord ? mapManager.queryPointData(coord[0], coord[1]) : null;
        const riskInfo = pointData ? RISK_LEVELS[pointData.riskLevel] : null;

        // 최근 3년 위험도
        const currentYear = new Date(date).getFullYear();
        const past3YearsRisk = {};
        const provCode = province ? province.code : (this.selectedProvince || '41');
        for (let y = currentYear - 3; y < currentYear; y++) {
            const yearDate = date.replace(/^\d{4}/, String(y));
            const yearPred = generatePredictionData(cropId, pestId, yearDate);
            const provData = yearPred[provCode];
            if (provData) {
                const rl = RISK_LEVELS[provData.riskLevel];
                past3YearsRisk[y + '년'] = {
                    등급: rl ? rl.grade : '-',
                    수준: rl ? rl.label : '-',
                    위험도레벨: provData.riskLevel,
                    발생확률: provData.probability + '%',
                    기온: provData.temperature + '°C',
                    습도: provData.humidity + '%'
                };
            }
        }

        // 최근 3년 고위험 월 분석 (4등급 경고, 5등급 위험)
        const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        const highRiskMonths = {};
        for (let y = currentYear - 3; y < currentYear; y++) {
            const tsData = generateYearlyTimeSeriesData(y, cropId, pestId, provCode);
            const yearHighRisk = [];
            for (let m = 0; m < 12; m++) {
                // 각 월의 1일(idx=m*2)과 15일(idx=m*2+1) 중 최대값
                const idx1 = m * 2;
                const idx2 = m * 2 + 1;
                const maxRisk = Math.max(tsData.riskData[idx1], tsData.riskData[idx2]);
                const riskLevel = Math.floor(Math.min(4, maxRisk));
                if (riskLevel >= 3) { // 4등급(3) 또는 5등급(4)
                    const rl = RISK_LEVELS[riskLevel];
                    yearHighRisk.push({
                        월: monthNames[m],
                        등급: rl.grade,
                        수준: rl.label,
                        위험도값: parseFloat(maxRisk.toFixed(2)),
                        평균기온: ((tsData.tempData[idx1] + tsData.tempData[idx2]) / 2).toFixed(1) + '°C',
                        평균습도: Math.round((tsData.humidityData[idx1] + tsData.humidityData[idx2]) / 2) + '%'
                    });
                }
            }
            if (yearHighRisk.length > 0) {
                highRiskMonths[y + '년'] = yearHighRisk;
            } else {
                highRiskMonths[y + '년'] = '고위험 월 없음';
            }
        }

        // 설명 데이터
        const desc = PEST_DESCRIPTIONS[pestId] || PEST_DESCRIPTIONS['default'];
        const pesticides = RELATED_PESTICIDES[pestId] || RELATED_PESTICIDES['default'];

        // NASA POWER 데이터
        let solarRadiation = null;
        let precipitation = null;
        if (this.nasaPowerData) {
            const npData = this.nasaPowerData;
            const selDate = new Date(date);
            const idx = selDate.getMonth() * 2 + (selDate.getDate() >= 16 ? 1 : 0);
            if (idx < npData.solarData.length) {
                solarRadiation = npData.solarData[idx] + ' MJ/m²/day';
                precipitation = npData.precipData[idx] + ' mm/day';
            }
        }

        // JSON 객체 구성
        const fullData = {
            선택정보: {
                작물: crop ? { 코드: crop.id, 이름: crop.name, 영문명: crop.nameEn } : null,
                병해충: pest ? { 코드: pest.id, 이름: pest.name, 유형: pest.type } : null,
                날짜: date,
                위치: coord ? {
                    위도: parseFloat(coord[1].toFixed(5)),
                    경도: parseFloat(coord[0].toFixed(5)),
                    가까운시도: province ? province.name : null,
                    시도코드: province ? province.code : null
                } : null
            },
            현재_위험도: pointData ? {
                등급: riskInfo ? riskInfo.grade : '-',
                수준: riskInfo ? riskInfo.label : '-',
                위험도레벨: pointData.riskLevel,
                보간값: pointData.riskValue,
                발생확률: pointData.probability + '%',
                설명: riskInfo ? riskInfo.description : '-'
            } : '위치를 클릭해주세요',
            최근_3년_위험도: past3YearsRisk,
            최근_3년_고위험_월: highRiskMonths,
            기상데이터: {
                기온: pointData ? pointData.temperature + '°C' : null,
                습도: pointData ? pointData.humidity + '%' : null,
                일사량: solarRadiation,
                강수량: precipitation
            },
            병해충_상세: {
                이름: desc.name || (pest ? pest.name : ''),
                설명: desc.summary,
                증상: desc.symptoms,
                발생조건: desc.conditions,
                예방_및_방제법: desc.prevention
            },
            관련_농약: pesticides.map(p => ({
                약제명: p.name,
                용법: p.usage,
                시기: p.timing
            }))
        };

        const jsonStr = JSON.stringify(fullData, null, 2);
        const savedPrompt = this._loadSavedPrompt();

        container.innerHTML = `
            <div class="json-section">
                <h4>
                    <span class="material-icons">data_object</span>
                    전체 데이터 (JSON)
                </h4>
                <div class="json-toolbar">
                    <button class="json-tool-btn" onclick="infoPanel.copyJson()">
                        <span class="material-icons" style="font-size:14px;">content_copy</span> 복사
                    </button>
                    <button class="json-tool-btn" onclick="infoPanel.downloadJson()">
                        <span class="material-icons" style="font-size:14px;">download</span> 다운로드
                    </button>
                </div>
                <textarea id="json-textarea" readonly spellcheck="false">${jsonStr.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <div class="ai-prompt-section">
                    <h4>
                        <span class="material-icons">smart_toy</span>
                        AI에게 질문하기
                    </h4>
                    <div class="ai-model-selector">
                        <label>AI 모델:</label>
                        <select id="ai-model-select" onchange="infoPanel._saveSelectedModel(this.value); infoPanel._toggleApiKeyField();">
                            <option value="gemini" ${this._getSelectedModel() === 'gemini' ? 'selected' : ''}>Gemini (gemini-2.0-flash-lite)</option>
                            <option value="ollama-llama" ${this._getSelectedModel() === 'ollama-llama' ? 'selected' : ''}>Ollama (llama3.1:70b)</option>
                            <option value="ollama-qwen" ${this._getSelectedModel() === 'ollama-qwen' ? 'selected' : ''}>Ollama (qwen2.5:72b)</option>
                        </select>
                    </div>
                    <div class="ai-apikey-field" id="ai-apikey-field" style="display:${this._getSelectedModel() === 'gemini' ? 'flex' : 'none'}">
                        <label>API Key:</label>
                        <div class="ai-apikey-input-wrapper">
                            <input type="password" id="ai-apikey-input" value="${this._loadApiKey()}"
                                placeholder="Gemini API 키를 입력하세요"
                                oninput="infoPanel._saveApiKey(this.value)" spellcheck="false" />
                            <button class="ai-apikey-toggle" onclick="infoPanel._toggleApiKeyVisibility()" title="키 표시/숨기기">
                                <span class="material-icons" id="ai-apikey-eye">visibility_off</span>
                            </button>
                        </div>
                    </div>
                    <div class="ai-prompt-wrapper">
                        <textarea class="ai-prompt-input" id="ai-prompt-input" placeholder="예: 농약 사용 방법을 요약해달라, 이 병해충의 방제 시기를 알려줘..."
                            spellcheck="false" oninput="infoPanel._savePrompt(this.value)">${savedPrompt}</textarea>
                        <button class="ai-send-btn" id="ai-send-btn" onclick="infoPanel.askAI()">
                            <span class="material-icons">send</span>
                            전송
                        </button>
                    </div>
                    <div class="ai-history-toolbar">
                        <button class="ai-history-btn" id="ai-history-toggle" onclick="infoPanel.toggleAiHistory()">
                            <span class="material-icons">history</span>
                            기록
                            <span class="ai-history-count" id="ai-history-count">${this._getAiHistoryCount()}</span>
                        </button>
                        <button class="ai-clear-all-btn" onclick="infoPanel.clearAiHistory()" title="전체 삭제">전체 삭제</button>
                    </div>
                    <div id="ai-history-container" style="display:none;"></div>
                </div>
            </div>
        `;
    }

    copyJson() {
        const textarea = document.getElementById('json-textarea');
        if (!textarea) return;
        navigator.clipboard.writeText(textarea.value).then(() => {
            const btn = document.querySelector('.json-tool-btn');
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = '<span class="material-icons" style="font-size:14px;">check</span> 복사됨';
                setTimeout(() => { btn.innerHTML = orig; }, 1500);
            }
        });
    }

    downloadJson() {
        const textarea = document.getElementById('json-textarea');
        if (!textarea) return;
        const blob = new Blob([textarea.value], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const date = this.selectedDate || 'data';
        const cropId = this.currentCropId || '';
        const pestId = this.currentPest ? this.currentPest.id : '';
        a.download = `pest_data_${date}_${cropId}_${pestId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ─── AI API 키 저장/복원 (localStorage) ─────────
    _saveApiKey(value) {
        try { localStorage.setItem('pest_ai_apikey', value); } catch (e) {}
    }

    _loadApiKey() {
        try {
            return localStorage.getItem('pest_ai_apikey') || '';
        } catch (e) {
            return '';
        }
    }

    _toggleApiKeyVisibility() {
        const input = document.getElementById('ai-apikey-input');
        const eye = document.getElementById('ai-apikey-eye');
        if (!input || !eye) return;
        if (input.type === 'password') {
            input.type = 'text';
            eye.textContent = 'visibility';
        } else {
            input.type = 'password';
            eye.textContent = 'visibility_off';
        }
    }

    _toggleApiKeyField() {
        const field = document.getElementById('ai-apikey-field');
        const select = document.getElementById('ai-model-select');
        if (!field || !select) return;
        field.style.display = select.value === 'gemini' ? 'flex' : 'none';
    }

    // ─── AI 모델 선택 저장/복원 (localStorage) ──────
    _saveSelectedModel(value) {
        try { localStorage.setItem('pest_ai_model', value); } catch (e) {}
    }

    _getSelectedModel() {
        try {
            return localStorage.getItem('pest_ai_model') || 'gemini';
        } catch (e) {
            return 'gemini';
        }
    }

    // ─── 통합 AI 질문 메서드 ──────────────────────
    async askAI() {
        const textarea = document.getElementById('json-textarea');
        if (!textarea) {
            this.switchTab('desc');
            this.updateJsonSection();
            return;
        }

        if (this._aiLoading) return;
        this._aiLoading = true;

        const sendBtn = document.getElementById('ai-send-btn');
        if (sendBtn) sendBtn.disabled = true;

        // 사용자 프롬프트 읽기
        const promptInput = document.getElementById('ai-prompt-input');
        const userPrompt = (promptInput && promptInput.value.trim())
            ? promptInput.value.trim()
            : '농약 사용 방법을 요약해달라';

        const jsonData = textarea.value;
        const message = `다음은 농작물 병해충 예측 데이터입니다:\n\n${jsonData}\n\n${userPrompt}`;

        // 선택된 모델 확인
        const modelSelect = document.getElementById('ai-model-select');
        const selectedModel = modelSelect ? modelSelect.value : this._getSelectedModel();

        const isGemini = selectedModel === 'gemini';
        const modelLabel = isGemini ? 'Gemini' : 'Ollama';

        // AI 응답 섹션 생성
        let aiSection = document.getElementById('ai-response-section');
        if (!aiSection) {
            aiSection = document.createElement('div');
            aiSection.id = 'ai-response-section';
            const jsonContainer = document.getElementById('json-data-section');
            if (jsonContainer) jsonContainer.appendChild(aiSection);
        }

        aiSection.innerHTML = `
            <div class="ai-section">
                <h4>
                    <span class="material-icons">smart_toy</span>
                    AI 농약 사용 분석 (${modelLabel})
                </h4>
                <div class="ai-typing-indicator" id="ai-typing">
                    <div class="ai-typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span class="ai-typing-text">${modelLabel}가 분석 중입니다...</span>
                </div>
                <div class="ai-response" id="ai-response-text" style="display:none;"></div>
            </div>
        `;
        aiSection.scrollIntoView({ behavior: 'smooth' });

        try {
            if (isGemini) {
                await this._askGemini(message, userPrompt);
            } else {
                const ollamaModel = selectedModel === 'ollama-qwen' ? 'qwen2.5:72b' : 'llama3.1:70b';
                await this._askOllama(message, userPrompt, ollamaModel);
            }
        } catch (err) {
            console.error('[AI] 요청 실패:', err);
        }

        this._aiLoading = false;
        if (sendBtn) sendBtn.disabled = false;
    }

    // ─── Gemini API ──────────────────────────────
    async _askGemini(message, userPrompt) {
        const GEMINI_API_KEY = this._loadApiKey();
        if (!GEMINI_API_KEY) {
            document.getElementById('ai-typing').style.display = 'none';
            const responseEl = document.getElementById('ai-response-text');
            responseEl.style.display = 'block';
            responseEl.innerHTML = '<span style="color:#ef5350;">Gemini API 키가 입력되지 않았습니다.</span><br><span style="color:var(--text-muted);font-size:11px;">위 API Key 입력란에 키를 입력해주세요.</span>';
            return;
        }
        const GEMINI_MODEL = 'gemini-2.0-flash-lite';
        const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
        const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

        const requestBody = {
            contents: [{ parts: [{ text: message }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
        };

        try {
            const res = await fetch(GEMINI_STREAM_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            document.getElementById('ai-typing').style.display = 'none';
            const responseEl = document.getElementById('ai-response-text');
            responseEl.style.display = 'block';

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) { fullText += text; responseEl.textContent = fullText; }
                    } catch (e) {}
                }
                responseEl.scrollTop = responseEl.scrollHeight;
            }

            if (!fullText) {
                responseEl.innerHTML = '<span style="color:var(--text-muted);">응답이 비어있습니다.</span>';
            } else {
                this._saveAiHistory(userPrompt, fullText);
            }
            console.log('[AI] Gemini 스트리밍 응답 완료');
        } catch (streamErr) {
            console.warn('[AI] Gemini 스트리밍 실패, 일반 요청 시도:', streamErr.message);
            try {
                const res = await fetch(GEMINI_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                const data = await res.json();
                document.getElementById('ai-typing').style.display = 'none';
                const responseEl = document.getElementById('ai-response-text');
                responseEl.style.display = 'block';

                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    responseEl.textContent = text;
                    this._saveAiHistory(userPrompt, text);
                } else if (data.error) {
                    responseEl.innerHTML = `<span style="color:#ef5350;">Gemini 오류: ${data.error.message || '알 수 없는 오류'}</span>`;
                } else {
                    responseEl.innerHTML = '<span style="color:var(--text-muted);">응답이 비어있습니다.</span>';
                }
            } catch (fallbackErr) {
                document.getElementById('ai-typing').style.display = 'none';
                const responseEl = document.getElementById('ai-response-text');
                responseEl.style.display = 'block';
                responseEl.innerHTML = `
                    <span style="color:#ef5350;">Gemini API 요청 실패</span><br>
                    <span style="color:var(--text-muted);font-size:11px;">
                        ${fallbackErr.message}<br>네트워크 연결 및 API 키를 확인해주세요.
                    </span>`;
            }
        }
    }

    // ─── Ollama API ──────────────────────────────
    async _askOllama(message, userPrompt, model) {
        const OLLAMA_URLS = [
            'http://localhost:5000',
            'http://172.17.3.220:5000'
        ];

        // 사용 가능한 서버 찾기
        let connectedUrl = null;
        for (const url of OLLAMA_URLS) {
            try {
                const healthRes = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
                if (healthRes.ok) { connectedUrl = url; console.log(`[AI] Ollama 서버 연결: ${url}`); break; }
            } catch (e) {
                console.warn(`[AI] ${url} 연결 실패:`, e.message);
            }
        }

        if (!connectedUrl) {
            document.getElementById('ai-typing').style.display = 'none';
            const responseEl = document.getElementById('ai-response-text');
            responseEl.style.display = 'block';
            responseEl.innerHTML = `
                <span style="color:#ef5350;">Ollama 서버 연결 실패</span><br>
                <span style="color:var(--text-muted);font-size:11px;">
                    다음 서버에 연결을 시도했으나 모두 실패했습니다:<br>
                    ${OLLAMA_URLS.map(u => `&bull; ${u}`).join('<br>')}<br><br>
                    Ollama 서버가 실행 중인지 확인해주세요.
                </span>`;
            return;
        }

        try {
            // 스트리밍 방식 시도
            const res = await fetch(`${connectedUrl}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, model })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            document.getElementById('ai-typing').style.display = 'none';
            const responseEl = document.getElementById('ai-response-text');
            responseEl.style.display = 'block';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.response) { fullText += data.response; responseEl.textContent = fullText; }
                    } catch (e) {}
                }
                responseEl.scrollTop = responseEl.scrollHeight;
            }

            if (!fullText) {
                responseEl.innerHTML = '<span style="color:var(--text-muted);">응답이 비어있습니다.</span>';
            } else {
                this._saveAiHistory(userPrompt, fullText);
            }
            console.log(`[AI] Ollama 스트리밍 응답 완료 (${connectedUrl}, ${model})`);
        } catch (streamErr) {
            console.warn('[AI] Ollama 스트리밍 실패, 일반 요청 시도:', streamErr.message);
            try {
                const res = await fetch(`${connectedUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, model, stream: false })
                });
                const data = await res.json();
                document.getElementById('ai-typing').style.display = 'none';
                const responseEl = document.getElementById('ai-response-text');
                responseEl.style.display = 'block';

                if (data.success && data.response) {
                    responseEl.textContent = data.response;
                    this._saveAiHistory(userPrompt, data.response);
                } else {
                    responseEl.innerHTML = `<span style="color:#ef5350;">오류: ${data.error || '알 수 없는 오류'}</span>`;
                }
            } catch (fallbackErr) {
                document.getElementById('ai-typing').style.display = 'none';
                const responseEl = document.getElementById('ai-response-text');
                responseEl.style.display = 'block';
                responseEl.innerHTML = `
                    <span style="color:#ef5350;">Ollama 요청 실패</span><br>
                    <span style="color:var(--text-muted);font-size:11px;">
                        ${fallbackErr.message}<br>서버: ${connectedUrl}
                    </span>`;
            }
        }
    }

    // ─── AI 프롬프트 저장/복원 (localStorage) ──────
    _savePrompt(value) {
        try { localStorage.setItem('pest_ai_prompt', value); } catch (e) {}
    }

    _loadSavedPrompt() {
        try {
            return localStorage.getItem('pest_ai_prompt') || '농약 사용 방법을 요약해달라';
        } catch (e) {
            return '농약 사용 방법을 요약해달라';
        }
    }

    // ─── AI 기록 저장/조회 (localStorage) ─────────
    _saveAiHistory(prompt, response) {
        try {
            const history = this._loadAiHistory();
            const crop = CROPS.find(c => c.id === (this.currentCropId || sidebar.selectedCrop));
            const pest = this.currentPest;
            const date = this.selectedDate || sidebar.selectedDate;
            const province = this.selectedProvince
                ? PROVINCES.find(p => p.code === this.selectedProvince)
                : null;

            history.unshift({
                id: Date.now(),
                timestamp: new Date().toLocaleString('ko-KR'),
                prompt: prompt,
                response: response,
                context: {
                    작물: crop ? crop.name : '-',
                    병해충: pest ? pest.name : '-',
                    날짜: date || '-',
                    지역: province ? province.name : '-'
                }
            });

            // 최대 50건 유지
            if (history.length > 50) history.length = 50;

            localStorage.setItem('pest_ai_history', JSON.stringify(history));
            this._updateHistoryCount();
            console.log('[AI] 기록 저장 완료');
        } catch (e) {
            console.warn('[AI] 기록 저장 실패:', e.message);
        }
    }

    _loadAiHistory() {
        try {
            const data = localStorage.getItem('pest_ai_history');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    _getAiHistoryCount() {
        return this._loadAiHistory().length;
    }

    _updateHistoryCount() {
        const el = document.getElementById('ai-history-count');
        if (el) el.textContent = this._getAiHistoryCount();
    }

    toggleAiHistory() {
        const container = document.getElementById('ai-history-container');
        const toggleBtn = document.getElementById('ai-history-toggle');
        if (!container) return;

        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        if (toggleBtn) toggleBtn.classList.toggle('active', isHidden);

        if (isHidden) this._renderAiHistory();
    }

    _renderAiHistory() {
        const container = document.getElementById('ai-history-container');
        if (!container) return;

        const history = this._loadAiHistory();

        if (history.length === 0) {
            container.innerHTML = '<div class="ai-history-empty"><span class="material-icons" style="font-size:24px;display:block;margin-bottom:6px;">chat_bubble_outline</span>저장된 기록이 없습니다.</div>';
            return;
        }

        container.innerHTML = `
            <div class="ai-history-list">
                ${history.map(item => `
                    <div class="ai-history-item" onclick="infoPanel.loadAiHistoryItem(${item.id})">
                        <div class="ai-history-item-header">
                            <span class="ai-history-item-date">${item.timestamp}</span>
                            <span class="ai-history-item-context">${item.context.작물} · ${item.context.병해충}</span>
                            <button class="ai-history-delete-btn" onclick="event.stopPropagation(); infoPanel.deleteAiHistoryItem(${item.id})" title="삭제">
                                <span class="material-icons">close</span>
                            </button>
                        </div>
                        <div class="ai-history-item-prompt">${item.prompt}</div>
                        <div class="ai-history-item-response">${item.response.substring(0, 100)}${item.response.length > 100 ? '...' : ''}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    loadAiHistoryItem(id) {
        const history = this._loadAiHistory();
        const item = history.find(h => h.id === id);
        if (!item) return;

        // 프롬프트 입력란에 질문 복원
        const promptInput = document.getElementById('ai-prompt-input');
        if (promptInput) promptInput.value = item.prompt;

        // AI 응답 섹션에 기록된 응답 표시
        let aiSection = document.getElementById('ai-response-section');
        if (!aiSection) {
            aiSection = document.createElement('div');
            aiSection.id = 'ai-response-section';
            const jsonContainer = document.getElementById('json-data-section');
            if (jsonContainer) jsonContainer.appendChild(aiSection);
        }

        aiSection.innerHTML = `
            <div class="ai-section">
                <h4>
                    <span class="material-icons">smart_toy</span>
                    AI 응답 기록
                    <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:auto;">${item.timestamp} · ${item.context.작물} · ${item.context.병해충}</span>
                </h4>
                <div class="ai-response" style="display:block;">${item.response}</div>
            </div>
        `;

        aiSection.scrollIntoView({ behavior: 'smooth' });
    }

    deleteAiHistoryItem(id) {
        try {
            let history = this._loadAiHistory();
            history = history.filter(h => h.id !== id);
            localStorage.setItem('pest_ai_history', JSON.stringify(history));
            this._updateHistoryCount();
            this._renderAiHistory();
        } catch (e) {
            console.warn('[AI] 기록 삭제 실패:', e.message);
        }
    }

    clearAiHistory() {
        if (!confirm('AI 질문 기록을 모두 삭제하시겠습니까?')) return;
        try {
            localStorage.removeItem('pest_ai_history');
            this._updateHistoryCount();
            this._renderAiHistory();

            // 히스토리 컨테이너 닫기
            const container = document.getElementById('ai-history-container');
            if (container) container.style.display = 'none';
            const toggleBtn = document.getElementById('ai-history-toggle');
            if (toggleBtn) toggleBtn.classList.remove('active');
        } catch (e) {
            console.warn('[AI] 기록 전체 삭제 실패:', e.message);
        }
    }
}

// 전역 인스턴스
const infoPanel = new InfoPanel();
