/**
 * 농작물 병해충 분포/예측 지도 - 범례 모듈
 * 5등급 그라디언트 범례 (NCPMS 벤치마크 스타일)
 */

class Legend {
    constructor() {
        this.container = null;
    }

    init() {
        this.container = document.getElementById('map-legend');
        this.render();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="legend-title">위험등급</div>
            <div class="legend-gradient-bar">
                <div class="legend-gradient"></div>
                <div class="legend-gradient-labels">
                    ${RISK_LEVELS.map(risk => `
                        <span class="legend-grade-label">${risk.grade}</span>
                    `).join('')}
                </div>
            </div>
            <div class="legend-items-5">
                ${RISK_LEVELS.map(risk => `
                    <div class="legend-item-5">
                        <div class="legend-color-dot" style="background:${risk.color};box-shadow:0 0 6px ${risk.color}60;"></div>
                        <span class="legend-label-5">${risk.grade} ${risk.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

// 전역 인스턴스
const legend = new Legend();
