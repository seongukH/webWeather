/**
 * 병해충 발생 이력 모듈
 * NCPMS SVC51(예찰 목록) + SVC52(상세 결과) → 시도별 발생 현황 표시
 */

class PestHistory {
    constructor() {
        this.surveyList = [];
        this.currentDetail = null;
        this.visible = false;
    }

    async toggle() {
        this.visible = !this.visible;
        const btn = document.getElementById('history-toggle');
        if (btn) btn.classList.toggle('active', this.visible);

        if (this.visible) {
            await this.load();
        } else {
            this._clearOverlay();
        }
    }

    async load() {
        const apiKey = ncpmsApi.apiKey || settingsModal.load().ncpmsKey;
        if (!apiKey) {
            this._showStatus('NCPMS API 키를 설정해주세요');
            return;
        }
        if (!ncpmsApi.apiKey) ncpmsApi.setApiKey(apiKey);

        this._showStatus('예찰 조사 목록 조회 중...');

        this.surveyList = await ncpmsApi.fetchSurveyList();

        if (this.surveyList.length === 0) {
            this._showStatus('예찰 조사 데이터가 없습니다');
            return;
        }

        const cropCode = sidebar.selectedCrop || 'FC010101';
        const cropSurveys = this.surveyList.filter(s => s.cropCode === cropCode && s.surveyType === '기본조사');
        const target = cropSurveys.length > 0 ? cropSurveys[0] : this.surveyList.find(s => s.cropCode === cropCode) || this.surveyList[0];

        this._showStatus(`${target.cropName} ${target.round}차 조사 상세 로딩 중...`);

        this.currentDetail = await ncpmsApi.fetchSurveyDetail(target.key);

        if (!this.currentDetail) {
            this._showStatus('상세 데이터 로드 실패');
            return;
        }

        this._renderOnMap();
        this._showPanel();
    }

    _renderOnMap() {
        if (!this.currentDetail) return;

        const selectedPests = PESTS[sidebar.selectedCrop] || [];
        const selectedPestName = selectedPests.find(p => p.id === sidebar.selectedPest)?.name || '';

        const predictions = {};
        const regions = this.currentDetail.regions;

        PROVINCES.forEach(p => {
            const regionData = regions[p.code];
            if (!regionData) {
                predictions[p.code] = { riskLevel: 0, probability: 0, temperature: '-', humidity: '-', source: 'history' };
                return;
            }

            let maxAreaRate = 0;
            let matchedPest = null;
            const pestEntries = Object.entries(regionData.pests);

            for (const [pestName, metrics] of pestEntries) {
                if (selectedPestName && pestName.includes(selectedPestName.replace(/병$/, ''))) {
                    matchedPest = { name: pestName, ...metrics };
                    break;
                }
            }

            if (!matchedPest) {
                for (const [pestName, metrics] of pestEntries) {
                    const rate = metrics.areaRate || 0;
                    if (rate > maxAreaRate) {
                        maxAreaRate = rate;
                        matchedPest = { name: pestName, ...metrics };
                    }
                }
            }

            const areaRate = matchedPest?.areaRate || 0;
            let riskLevel = 0;
            if (areaRate > 5) riskLevel = 4;
            else if (areaRate > 2) riskLevel = 3;
            else if (areaRate > 0.5) riskLevel = 2;
            else if (areaRate > 0.05) riskLevel = 1;

            const live = _liveWeatherCache && _liveWeatherCache[p.code];
            predictions[p.code] = {
                riskLevel,
                probability: Math.min(100, Math.round(areaRate * 10)),
                temperature: live ? live.temperature.toFixed(1) : '-',
                humidity: live ? Math.round(live.humidity) : '-',
                source: live ? 'open-meteo' : 'history',
                historyPest: matchedPest?.name || '-',
                historyArea: matchedPest?.area || 0,
                historyAreaRate: areaRate,
                historyDamageRate: matchedPest?.damageRate || 0,
            };
        });

        mapManager.updatePredictions(predictions);
    }

    _showPanel() {
        const detail = this.currentDetail;
        const date = detail.surveyDate;
        const dateStr = `${date.slice(0,4)}.${date.slice(4,6)}.${date.slice(6,8)}`;

        let html = `<div style="padding:8px 12px;font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <div style="font-size:13px;font-weight:600;color:#ff9800;margin-bottom:6px;">
                📊 ${detail.cropName} 발생 이력 (${dateStr}, ${detail.round}차)
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">
                조사구분: ${detail.surveyType} | 출처: NCPMS 예찰조사
            </div>
            <table style="width:100%;font-size:11px;border-collapse:collapse;">
                <tr style="color:var(--text-muted);border-bottom:1px solid var(--border-color);">
                    <th style="text-align:left;padding:3px 4px;">시도</th>
                    <th style="text-align:left;padding:3px 4px;">주요 병해충</th>
                    <th style="text-align:right;padding:3px 4px;">면적률</th>
                </tr>`;

        const sortedRegions = Object.entries(detail.regions)
            .map(([code, data]) => {
                const topPest = Object.entries(data.pests)
                    .filter(([, m]) => (m.areaRate || 0) > 0)
                    .sort((a, b) => (b[1].areaRate || 0) - (a[1].areaRate || 0))[0];
                return { code, name: data.name, topPest };
            })
            .filter(r => r.topPest)
            .sort((a, b) => (b.topPest[1].areaRate || 0) - (a.topPest[1].areaRate || 0));

        sortedRegions.forEach(r => {
            const rate = r.topPest[1].areaRate || 0;
            const color = rate > 5 ? '#f44336' : rate > 2 ? '#ff9800' : rate > 0.5 ? '#ffc107' : '#4caf50';
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:3px 4px;white-space:nowrap;">${r.name.replace(/특별자치|광역|특별/g, '')}</td>
                <td style="padding:3px 4px;">${r.topPest[0]}</td>
                <td style="text-align:right;padding:3px 4px;color:${color};font-weight:600;">${rate.toFixed(2)}%</td>
            </tr>`;
        });

        if (sortedRegions.length === 0) {
            html += `<tr><td colspan="3" style="text-align:center;padding:12px;color:var(--text-muted);">발생 기록 없음</td></tr>`;
        }

        html += '</table></div>';

        const container = document.getElementById('region-info');
        if (container) container.innerHTML = html;
    }

    _showStatus(msg) {
        const container = document.getElementById('region-info');
        if (container) {
            container.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">
                <span class="material-icons" style="font-size:24px;display:block;margin-bottom:4px;">history</span>
                ${msg}
            </div>`;
        }
    }

    _clearOverlay() {
        const container = document.getElementById('region-info');
        if (container) container.innerHTML = '';
    }
}

const pestHistory = new PestHistory();
