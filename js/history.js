/**
 * 병해충 발생 이력 탭 모듈
 * NCPMS SVC51(예찰 목록) + SVC52(상세 결과) → 우측 패널 탭에서 조회
 */

class PestHistory {
    constructor() {
        this.surveyList = [];
        this.currentDetail = null;
        this.loaded = false;
    }

    async onTabActive() {
        const container = document.getElementById('history-content');
        if (!container) return;

        let apiKey = ncpmsApi.apiKey;
        if (!apiKey) {
            try {
                const stored = JSON.parse(localStorage.getItem('pestmap_settings') || '{}');
                apiKey = stored.ncpmsKey || '';
                if (apiKey) ncpmsApi.setApiKey(apiKey);
            } catch {}
        }

        if (!apiKey) {
            container.innerHTML = `<div class="empty-state">
                <span class="material-icons">vpn_key</span>
                <p>설정에서 NCPMS API 키를<br>입력해주세요.</p>
            </div>`;
            return;
        }

        if (!this.loaded) {
            await this._loadSurveyList(container);
        }
    }

    async _loadSurveyList(container) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            <div class="loading-spinner" style="width:24px;height:24px;margin:0 auto 8px;border:2px solid var(--border-color);border-top-color:var(--accent-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            예찰 조사 목록 조회 중...
        </div>`;

        this.surveyList = await ncpmsApi.fetchSurveyList();

        if (this.surveyList.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <span class="material-icons">search_off</span>
                <p>예찰 조사 데이터가 없습니다.<br>API 키를 확인해주세요.</p>
            </div>`;
            return;
        }

        this.loaded = true;
        this._renderSurveyList(container);
    }

    _renderSurveyList(container) {
        const grouped = {};
        this.surveyList.forEach(s => {
            const key = s.cropName || s.cropCode;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
        });

        let html = `<div style="padding:8px 12px;">
            <div style="font-size:13px;font-weight:600;color:var(--accent-primary);margin-bottom:8px;">
                <span class="material-icons" style="font-size:16px;vertical-align:middle;">history</span>
                예찰 조사 목록 (${this.surveyList.length}건)
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">
                조사를 선택하면 시도별 발생 현황이 표시됩니다.
            </div>`;

        for (const [cropName, surveys] of Object.entries(grouped)) {
            html += `<div style="margin-bottom:8px;">
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;padding:4px 0;border-bottom:1px solid var(--border-color);">
                    🌾 ${cropName}
                </div>`;

            surveys.forEach(s => {
                const dateStr = s.surveyDate ? `${s.surveyDate.slice(0,4)}.${s.surveyDate.slice(4,6)}.${s.surveyDate.slice(6,8)}` : '';
                html += `<div class="pest-item" style="cursor:pointer;padding:6px 8px;margin:2px 0;border-radius:4px;font-size:11px;" 
                    onclick="pestHistory.loadDetail('${s.key}')">
                    <span style="color:var(--text-muted);margin-right:6px;">${dateStr}</span>
                    <span>${s.surveyType}</span>
                    <span style="color:var(--text-muted);margin-left:4px;">${s.round}차</span>
                </div>`;
            });
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    async loadDetail(insectKey) {
        const container = document.getElementById('history-content');
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            <div class="loading-spinner" style="width:24px;height:24px;margin:0 auto 8px;border:2px solid var(--border-color);border-top-color:var(--accent-primary);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            시도별 발생 현황 조회 중...
        </div>`;

        this.currentDetail = await ncpmsApi.fetchSurveyDetail(insectKey);

        if (!this.currentDetail || Object.keys(this.currentDetail.regions).length === 0) {
            container.innerHTML = `<div class="empty-state">
                <span class="material-icons">error_outline</span>
                <p>상세 데이터를 불러올 수 없습니다.</p>
            </div>
            <div style="text-align:center;padding:8px;">
                <button onclick="pestHistory._renderSurveyList(document.getElementById('history-content'))" 
                    style="background:rgba(66,165,245,0.2);color:var(--accent-primary);border:1px solid rgba(66,165,245,0.3);padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;">
                    ← 목록으로 돌아가기
                </button>
            </div>`;
            return;
        }

        this._renderDetail(container);
    }

    _renderDetail(container) {
        const d = this.currentDetail;
        const dateStr = d.surveyDate ? `${d.surveyDate.slice(0,4)}.${d.surveyDate.slice(4,6)}.${d.surveyDate.slice(6,8)}` : '';

        let html = `<div style="padding:8px 12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <button onclick="pestHistory._renderSurveyList(document.getElementById('history-content'))" 
                    style="background:none;border:none;color:var(--accent-primary);cursor:pointer;padding:2px;font-size:18px;">
                    <span class="material-icons">arrow_back</span>
                </button>
                <div>
                    <div style="font-size:13px;font-weight:600;color:#ff9800;">
                        📊 ${d.cropName} 발생 현황
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);">
                        ${dateStr} | ${d.round}차 ${d.surveyType} | NCPMS 예찰조사
                    </div>
                </div>
            </div>`;

        const allPests = new Set();
        Object.values(d.regions).forEach(r => {
            Object.keys(r.pests).forEach(p => allPests.add(p));
        });

        const sortedPests = [...allPests].sort();

        sortedPests.forEach(pestName => {
            const rows = [];
            Object.entries(d.regions).forEach(([code, region]) => {
                const metrics = region.pests[pestName];
                if (!metrics) return;
                const areaRate = metrics.areaRate || 0;
                const area = metrics.area || 0;
                const damageRate = metrics.damageRate || 0;
                if (areaRate === 0 && area === 0 && damageRate === 0) return;

                rows.push({ code, name: region.name, area, areaRate, damageRate, lossRate: metrics.lossRate || 0 });
            });

            if (rows.length === 0) return;
            rows.sort((a, b) => b.areaRate - a.areaRate);

            html += `<div style="margin-bottom:12px;">
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);padding:4px 0;margin-bottom:4px;border-bottom:1px solid var(--border-color);">
                    🦠 ${pestName}
                </div>
                <table style="width:100%;font-size:11px;border-collapse:collapse;">
                    <tr style="color:var(--text-muted);">
                        <th style="text-align:left;padding:3px 4px;">시도</th>
                        <th style="text-align:right;padding:3px 4px;">발생면적</th>
                        <th style="text-align:right;padding:3px 4px;">면적률</th>
                        <th style="text-align:right;padding:3px 4px;">피해율</th>
                    </tr>`;

            rows.forEach(r => {
                const color = r.areaRate > 5 ? '#f44336' : r.areaRate > 2 ? '#ff9800' : r.areaRate > 0.5 ? '#ffc107' : '#4caf50';
                const shortName = r.name.replace(/특별자치도|특별자치시|광역시|특별시|도$/g, '');
                html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:3px 4px;">${shortName}</td>
                    <td style="text-align:right;padding:3px 4px;">${r.area.toFixed(1)}ha</td>
                    <td style="text-align:right;padding:3px 4px;color:${color};font-weight:600;">${r.areaRate.toFixed(3)}%</td>
                    <td style="text-align:right;padding:3px 4px;">${r.damageRate.toFixed(3)}%</td>
                </tr>`;
            });

            html += '</table></div>';
        });

        if (sortedPests.length === 0 || html.indexOf('🦠') === -1) {
            html += `<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">
                이 조사에서 발생 기록이 없습니다.
            </div>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }
}

const pestHistory = new PestHistory();
