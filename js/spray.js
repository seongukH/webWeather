/**
 * 방제 기록 지도 레이어 모듈
 * 논지 바운더리(폴리곤) + 비행 경로(라인) + 팝업 표시
 */

class SprayLayer {
    constructor() {
        this.API_URL = 'api/spray.php';
        this.records = [];
        this.boundaryLayer = null;
        this.flightLayer = null;
        this.visible = false;
    }

    init(map) {
        this.map = map;

        this.boundarySource = new ol.source.Vector();
        this.boundaryLayer = new ol.layer.Vector({
            source: this.boundarySource,
            style: (feature) => this._boundaryStyle(feature),
            zIndex: 50,
        });

        this.flightSource = new ol.source.Vector();
        this.flightLayer = new ol.layer.Vector({
            source: this.flightSource,
            style: (feature) => this._flightStyle(feature),
            zIndex: 51,
        });

        this.map.addLayer(this.boundaryLayer);
        this.map.addLayer(this.flightLayer);

        this.boundaryLayer.setVisible(false);
        this.flightLayer.setVisible(false);

        this.map.on('singleclick', (e) => this._handleClick(e));
    }

    _boundaryStyle(feature) {
        return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(0, 230, 118, 0.9)', width: 2.5 }),
            fill: new ol.style.Fill({ color: 'rgba(0, 230, 118, 0.15)' }),
        });
    }

    _flightStyle(feature) {
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(255, 167, 38, 0.9)',
                width: 2.5,
                lineDash: [8, 4],
            }),
        });
    }

    async toggle() {
        this.visible = !this.visible;
        if (this.visible) {
            await this.load();
        }
        this.boundaryLayer.setVisible(this.visible);
        this.flightLayer.setVisible(this.visible);

        const btn = document.getElementById('spray-toggle');
        if (btn) btn.classList.toggle('active', this.visible);
    }

    async load() {
        try {
            const resp = await fetch(this.API_URL);
            const data = await resp.json();
            if (!data.success) {
                console.warn('[Spray] 데이터 로드 실패:', data.error);
                return;
            }
            this.records = data.records || [];
            this._render();
            console.log(`[Spray] ${this.records.length}건 방제 기록 로드`);
        } catch (err) {
            console.warn('[Spray] API 호출 실패:', err.message);
        }
    }

    _render() {
        this.boundarySource.clear();
        this.flightSource.clear();

        this.records.forEach((rec) => {
            const boundary = rec.field_boundary;
            if (boundary && boundary.length >= 3) {
                const coords = boundary.map(c => ol.proj.fromLonLat(c));
                coords.push(coords[0]);
                const polygon = new ol.geom.Polygon([coords]);
                const feature = new ol.Feature({ geometry: polygon });
                feature.set('sprayRecord', rec);
                feature.set('featureType', 'boundary');
                this.boundarySource.addFeature(feature);
            }

            const path = rec.flight_path;
            if (path && path.length >= 2) {
                const coords = path.map(c => ol.proj.fromLonLat(c));
                const line = new ol.geom.LineString(coords);
                const feature = new ol.Feature({ geometry: line });
                feature.set('sprayRecord', rec);
                feature.set('featureType', 'flight');
                this.flightSource.addFeature(feature);
            }
        });
    }

    _handleClick(e) {
        if (!this.visible) return;

        const features = [];
        this.map.forEachFeatureAtPixel(e.pixel, (f) => {
            if (f.get('sprayRecord')) features.push(f);
        }, { layerFilter: (l) => l === this.boundaryLayer || l === this.flightLayer });

        if (features.length === 0) return;

        const rec = features[0].get('sprayRecord');
        this._showPopup(rec, e.coordinate);
    }

    _showPopup(rec, coordinate) {
        const lonLat = ol.proj.toLonLat(coordinate);
        const start = this._formatDateTime(rec.spray_start);
        const end = this._formatDateTime(rec.spray_end);
        const duration = this._calcDuration(rec.spray_start, rec.spray_end);
        const area = this._calcArea(rec.field_boundary);

        const popup = document.getElementById('map-popup');
        if (!popup) return;

        popup.innerHTML = `
            <div class="popup-header" style="font-weight:600;font-size:14px;margin-bottom:8px;color:#00e676;">
                🚁 방제 기록 #${rec.id}
            </div>
            <div class="popup-row"><span class="popup-label">농약 종류</span><span class="popup-value">${rec.pesticide_type}</span></div>
            <div class="popup-row"><span class="popup-label">사용량</span><span class="popup-value">${rec.pesticide_amount} L</span></div>
            <div class="popup-row"><span class="popup-label">방제 면적</span><span class="popup-value">≈ ${area} m²</span></div>
            <div class="popup-row"><span class="popup-label">시작</span><span class="popup-value">${start}</span></div>
            <div class="popup-row"><span class="popup-label">완료</span><span class="popup-value">${end}</span></div>
            <div class="popup-row"><span class="popup-label">소요 시간</span><span class="popup-value">${duration}</span></div>
            ${rec.memo ? `<div class="popup-row"><span class="popup-label">비고</span><span class="popup-value">${rec.memo}</span></div>` : ''}
            <div style="margin-top:8px;text-align:center;">
                <button onclick="sprayLayer.flyTo(${rec.id})" style="background:rgba(0,230,118,0.2);color:#00e676;border:1px solid rgba(0,230,118,0.4);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11px;">
                    📍 논지 확대
                </button>
            </div>
        `;

        popup.style.display = 'block';
        const pixel = this.map.getPixelFromCoordinate(coordinate);
        popup.style.left = pixel[0] + 'px';
        popup.style.top = (pixel[1] - 10) + 'px';
        popup.style.transform = 'translate(-50%, -100%)';
    }

    flyTo(recordId) {
        const rec = this.records.find(r => r.id === recordId);
        if (!rec || !rec.field_boundary) return;

        const coords = rec.field_boundary.map(c => ol.proj.fromLonLat(c));
        coords.push(coords[0]);
        const polygon = new ol.geom.Polygon([coords]);
        const extent = polygon.getExtent();

        this.map.getView().fit(extent, {
            padding: [80, 80, 80, 80],
            duration: 800,
            maxZoom: 18,
        });
    }

    _formatDateTime(dt) {
        if (!dt) return '-';
        const d = new Date(dt);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${mm}/${dd} ${hh}:${mi}`;
    }

    _calcDuration(start, end) {
        const ms = new Date(end) - new Date(start);
        if (ms <= 0) return '-';
        const min = Math.floor(ms / 60000);
        if (min < 60) return `${min}분`;
        return `${Math.floor(min / 60)}시간 ${min % 60}분`;
    }

    _calcArea(boundary) {
        if (!boundary || boundary.length < 3) return '0';
        const R = 6371000;
        let area = 0;
        for (let i = 0; i < boundary.length; i++) {
            const [lng1, lat1] = boundary[i];
            const [lng2, lat2] = boundary[(i + 1) % boundary.length];
            const phi1 = lat1 * Math.PI / 180;
            const phi2 = lat2 * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            area += dLng * (2 + Math.sin(phi1) + Math.sin(phi2));
        }
        area = Math.abs(area * R * R / 2);
        return area.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
    }
}

const sprayLayer = new SprayLayer();
