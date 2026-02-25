/**
 * 농작물 병해충 분포/예측 지도 - 지도 모듈
 * OpenLayers + VWorld API 연동 + IDW 래스터 히트맵
 */

const VWORLD_API_KEY = '';

// 지도 레이어 URL 템플릿
const VWORLD_LAYERS = {
    base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
    satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
    hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`
};

// ─── IDW 보간 엔진 ──────────────────────────
class IDWInterpolator {
    constructor(points, power = 2.5) {
        this.points = points; // [{lon, lat, value}, ...]
        this.power = power;
    }

    interpolate(lon, lat) {
        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const dx = lon - p.lon;
            const dy = lat - p.lat;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.001) return p.value; // 포인트 위에 있으면 그대로

            const w = 1 / Math.pow(dist, this.power);
            numerator += w * p.value;
            denominator += w;
        }

        return denominator > 0 ? numerator / denominator : 0;
    }
}

// ─── 남한 경계 내부 판별 (Ray Casting) ────────
function isPointInPolygon(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isInsideSouthKorea(lon, lat) {
    return isPointInPolygon(lon, lat, SOUTH_KOREA_OUTLINE) ||
           isPointInPolygon(lon, lat, JEJU_OUTLINE);
}

// ─── 맵 매니저 ────────────────────────────────
class MapManager {
    constructor() {
        this.map = null;
        this.baseLayer = null;
        this.satelliteLayer = null;
        this.hybridLayer = null;
        this.regionLayer = null;
        this.heatmapLayer = null;
        this.markerLayer = null;
        this.noFlyLayer = null;        // 드론 비행금지구역 레이어
        this.noFlyVisible = false;     // 비행금지구역 표시 여부
        this.noFlyLoaded = false;      // 데이터 로드 완료 여부
        this.ndviLayer = null;         // NDVI 위성 타일 레이어
        this.ndviBoundaryLayer = null; // NDVI 폴리곤 경계 레이어
        this.ndviVisible = false;      // NDVI 표시 여부
        this.ndviPolygonId = null;     // Agromonitoring 폴리곤 ID
        this.agroApiKey = '';          // Agromonitoring API Key
        this.popupOverlay = null;
        this.currentLayerType = 'base';
        this.predictionData = {};
        this.selectedRegion = null;
        this.selectedCoord = null; // 클릭된 좌표 [lon, lat]
        this.heatmapPoints = [];
        this.heatmapOpacity = 0.65;
        this._heatmapCache = null;
        this._cacheExtent = null;
        this._idw = null; // 현재 IDW 보간기 (클릭 질의용)
        this._onRenderComplete = null; // 히트맵 렌더 완료 콜백
    }

    init() {
        // 기본 VWorld 배경지도 레이어
        this.baseLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: VWORLD_LAYERS.base,
                crossOrigin: 'anonymous',
                attributions: '© VWorld'
            }),
            visible: true,
            zIndex: 0
        });

        // 위성 레이어
        this.satelliteLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: VWORLD_LAYERS.satellite,
                crossOrigin: 'anonymous'
            }),
            visible: false,
            zIndex: 0
        });

        // 하이브리드 레이어
        this.hybridLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: VWORLD_LAYERS.hybrid,
                crossOrigin: 'anonymous'
            }),
            visible: false,
            zIndex: 1
        });

        // ── 래스터 히트맵 레이어 (캔버스 기반) ──
        this.heatmapLayer = new ol.layer.Image({
            source: new ol.source.ImageCanvas({
                canvasFunction: (extent, resolution, pixelRatio, size) => {
                    return this._renderHeatmapCanvas(extent, resolution, pixelRatio, size);
                },
                ratio: 1,
                projection: 'EPSG:3857'
            }),
            zIndex: 5,
            opacity: this.heatmapOpacity
        });

        // 지역별 경계선 레이어 (히트맵 위에 반투명 경계만 표시)
        this.regionLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 10,
            style: (feature) => this.getRegionStyle(feature)
        });

        // NDVI 위성 타일 레이어
        this.ndviLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({ url: '' }),
            zIndex: 3,
            visible: false,
            opacity: 0.85
        });

        // NDVI 폴리곤 경계 레이어
        this.ndviBoundaryLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 12,
            visible: false
        });

        // 드론 비행금지구역 레이어
        this.noFlyLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 15,
            visible: false,
            style: (feature) => this.getNoFlyStyle(feature)
        });

        // 마커 레이어
        this.markerLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 20
        });

        // 팝업 오버레이
        const popupEl = document.getElementById('map-popup');
        this.popupOverlay = new ol.Overlay({
            element: popupEl,
            autoPan: true,
            autoPanAnimation: { duration: 250 },
            positioning: 'bottom-center',
            offset: [0, -12]
        });

        // 맵 생성
        this.map = new ol.Map({
            target: 'map',
            layers: [
                this.baseLayer,
                this.satelliteLayer,
                this.hybridLayer,
                this.ndviLayer,
                this.heatmapLayer,
                this.regionLayer,
                this.ndviBoundaryLayer,
                this.noFlyLayer,
                this.markerLayer
            ],
            overlays: [this.popupOverlay],
            view: new ol.View({
                center: ol.proj.fromLonLat([127.5, 36.0]),
                zoom: 7,
                minZoom: 6,
                maxZoom: 18,
                projection: 'EPSG:3857'
            }),
            controls: ol.control.defaults.defaults({ attribution: true, zoom: true })
        });

        // 지도 클릭 이벤트
        this.map.on('click', (evt) => this.handleMapClick(evt));

        // 마우스 커서 변경
        this.map.on('pointermove', (evt) => {
            const pixel = this.map.getEventPixel(evt.originalEvent);
            const hit = this.map.hasFeatureAtPixel(pixel, {
                layerFilter: (layer) => layer === this.regionLayer || layer === this.noFlyLayer
            });
            this.map.getTargetElement().style.cursor = hit ? 'pointer' : '';
        });

        console.log('[MapManager] 지도 초기화 완료 (히트맵 모드)');
    }

    // ── 히트맵 캔버스 렌더링 ────────────────────
    _renderHeatmapCanvas(extent, resolution, pixelRatio, size) {
        const canvas = document.createElement('canvas');
        const width = Math.round(size[0]);
        const height = Math.round(size[1]);
        canvas.width = width;
        canvas.height = height;

        if (this.heatmapPoints.length === 0) return canvas;

        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        // 보간기 생성
        const idw = new IDWInterpolator(this.heatmapPoints, 2.5);

        // extent → [minX, minY, maxX, maxY] in EPSG:3857
        const [minX, minY, maxX, maxY] = extent;

        // 성능: 스텝 크기 결정 (줌에 따라 해상도 조절)
        const step = Math.max(1, Math.round(2 / pixelRatio));

        for (let py = 0; py < height; py += step) {
            for (let px = 0; px < width; px += step) {
                // 픽셀 → 맵 좌표 (EPSG:3857)
                const mapX = minX + (px / width) * (maxX - minX);
                const mapY = maxY - (py / height) * (maxY - minY);

                // EPSG:3857 → EPSG:4326 (lon/lat)
                const lonLat = ol.proj.toLonLat([mapX, mapY]);
                const lon = lonLat[0];
                const lat = lonLat[1];

                // 남한 경계 내부인지 체크
                if (!isInsideSouthKorea(lon, lat)) continue;

                // IDW 보간값 계산
                const value = idw.interpolate(lon, lat);
                const color = getHeatmapColor(value);

                // 블록 단위로 픽셀 채우기 (step > 1일 때)
                for (let dy = 0; dy < step && (py + dy) < height; dy++) {
                    for (let dx = 0; dx < step && (px + dx) < width; dx++) {
                        const idx = ((py + dy) * width + (px + dx)) * 4;
                        data[idx] = color[0];
                        data[idx + 1] = color[1];
                        data[idx + 2] = color[2];
                        data[idx + 3] = 200; // 투명도
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // 렌더 완료 콜백 실행
        if (this._onRenderComplete) {
            const cb = this._onRenderComplete;
            this._onRenderComplete = null;
            // 다음 프레임에서 콜백 실행 (캔버스가 화면에 반영된 후)
            requestAnimationFrame(() => cb());
        }

        return canvas;
    }

    // 히트맵 새로고침
    refreshHeatmap() {
        if (this.heatmapLayer) {
            this.heatmapLayer.getSource().changed();
        }
    }

    // 히트맵 투명도 설정
    setHeatmapOpacity(opacity) {
        this.heatmapOpacity = opacity;
        if (this.heatmapLayer) {
            this.heatmapLayer.setOpacity(opacity);
        }
    }

    // 배경지도 전환
    switchLayer(type) {
        this.currentLayerType = type;
        this.baseLayer.setVisible(type === 'base');
        this.satelliteLayer.setVisible(type === 'satellite' || type === 'hybrid');
        this.hybridLayer.setVisible(type === 'hybrid');
    }

    // 시/도 경계 폴리곤 로드
    loadRegions(geojson) {
        const source = this.regionLayer.getSource();
        source.clear();

        const format = new ol.format.GeoJSON();
        const features = format.readFeatures(geojson, {
            featureProjection: 'EPSG:3857'
        });

        source.addFeatures(features);
        console.log(`[MapManager] ${features.length}개 지역 경계 로드됨`);
    }

    // 예측 데이터 업데이트 → 히트맵 갱신 (렌더 완료 시 resolve)
    updatePredictions(predictionData) {
        return new Promise((resolve) => {
            this.predictionData = predictionData;

            // 폴리곤 데이터 업데이트 (클릭 인터랙션용)
            const source = this.regionLayer.getSource();
            source.getFeatures().forEach(feature => {
                const code = feature.get('code');
                if (predictionData[code]) {
                    feature.set('riskLevel', predictionData[code].riskLevel);
                    feature.set('probability', predictionData[code].probability);
                    feature.set('temperature', predictionData[code].temperature);
                    feature.set('humidity', predictionData[code].humidity);
                }
            });
            source.changed();

            // 히트맵 포인트 생성
            this.heatmapPoints = generateHeatmapPoints(predictionData);

            // IDW 보간기 저장 (클릭 질의용)
            this._idw = this.heatmapPoints.length > 0
                ? new IDWInterpolator(this.heatmapPoints, 2.5)
                : null;

            // 렌더 완료 콜백 등록 후 리프레시
            this._onRenderComplete = resolve;
            this.refreshHeatmap();

            // 안전장치: 3초 후에도 콜백이 안 왔으면 강제 resolve
            setTimeout(() => {
                if (this._onRenderComplete) {
                    this._onRenderComplete = null;
                    resolve();
                }
            }, 3000);

            console.log(`[MapManager] 히트맵 업데이트: ${this.heatmapPoints.length}개 보간 포인트`);
        });
    }

    // 클릭된 위경도의 IDW 보간 데이터 조회
    queryPointData(lon, lat) {
        if (!this._idw || this.heatmapPoints.length === 0) return null;

        // 남한 경계 밖이면 null
        if (!isInsideSouthKorea(lon, lat)) return null;

        const riskValue = this._idw.interpolate(lon, lat);
        const riskLevel = Math.min(4, Math.max(0, Math.round(riskValue)));

        // 가장 가까운 포인트에서 기상 데이터 근사
        const nearest = ncpmsApi.findNearestProvince(lon, lat);
        const provData = nearest ? this.predictionData[nearest.code] : null;

        // 확률은 위험도에 비례하여 보간
        const probability = Math.min(100, Math.round((riskValue / 4) * 100));

        return {
            riskLevel,
            riskValue: parseFloat(riskValue.toFixed(2)),
            probability,
            temperature: provData ? provData.temperature : '-',
            humidity: provData ? provData.humidity : '-',
            source: provData ? provData.source : 'simulation',
            province: nearest,
            lon: lon.toFixed(5),
            lat: lat.toFixed(5)
        };
    }

    // 지역 스타일 (히트맵 위에 경계선만 표시 + 지역명 라벨)
    getRegionStyle(feature) {
        const isSelected = this.selectedRegion === feature.get('code');

        return new ol.style.Style({
            fill: new ol.style.Fill({
                color: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0)'
            }),
            stroke: new ol.style.Stroke({
                color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.4)',
                width: isSelected ? 2.5 : 0.8
            }),
            text: new ol.style.Text({
                text: feature.get('name'),
                font: 'bold 11px Pretendard, sans-serif',
                fill: new ol.style.Fill({ color: '#ffffff' }),
                stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
                overflow: true
            })
        });
    }

    // 지도 클릭 이벤트 핸들러 (위경도 기반 IDW 보간값)
    handleMapClick(evt) {
        // 비행금지구역 클릭 감지
        if (this.noFlyVisible) {
            const noFlyFeature = this.map.forEachFeatureAtPixel(
                this.map.getEventPixel(evt.originalEvent),
                (feature) => feature,
                { layerFilter: (layer) => layer === this.noFlyLayer }
            );
            if (noFlyFeature) {
                this.showNoFlyPopup(evt.coordinate, noFlyFeature);
                return;
            }
        }

        // 클릭 좌표 → lon/lat
        const lonLat = ol.proj.toLonLat(evt.coordinate);
        const lon = lonLat[0];
        const lat = lonLat[1];

        // IDW 보간으로 클릭 지점의 위험도 질의
        const pointData = this.queryPointData(lon, lat);

        if (pointData) {
            const province = pointData.province;
            this.selectedRegion = province ? province.code : null;
            this.selectedCoord = [lon, lat];
            this.regionLayer.getSource().changed();

            const displayName = province
                ? `${province.name} (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`
                : `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;

            this.showPopup(evt.coordinate, {
                code: province ? province.code : '',
                name: displayName,
                riskLevel: pointData.riskLevel,
                riskValue: pointData.riskValue,
                probability: pointData.probability,
                temperature: pointData.temperature,
                humidity: pointData.humidity,
                source: pointData.source
            });

            document.dispatchEvent(new CustomEvent('regionSelected', {
                detail: {
                    code: province ? province.code : '',
                    name: displayName,
                    riskLevel: pointData.riskLevel,
                    probability: pointData.probability,
                    temperature: pointData.temperature,
                    humidity: pointData.humidity
                }
            }));
        } else {
            this.closePopup();
            this.selectedRegion = null;
            this.selectedCoord = null;
            this.regionLayer.getSource().changed();
        }
    }

    // 팝업 표시
    showPopup(coordinate, data) {
        const riskInfo = RISK_LEVELS[data.riskLevel] || RISK_LEVELS[0];
        const riskClasses = ['safe', 'interest', 'caution', 'warning', 'danger'];

        // 보간 위험값이 있으면 소수점 표시
        const riskValueDisplay = data.riskValue !== undefined
            ? `<div class="popup-info-row"><span class="popup-info-label">보간값</span><span class="popup-info-value">${data.riskValue.toFixed(2)}</span></div>`
            : '';

        const popupEl = document.getElementById('map-popup');
        popupEl.innerHTML = `
            <button class="popup-close" onclick="mapManager.closePopup()">×</button>
            <div class="popup-title">${data.name}</div>
            <div class="popup-info">
                <div class="popup-info-row">
                    <span class="popup-info-label">위험수준</span>
                    <span class="risk-badge ${riskClasses[data.riskLevel]}">
                        <span class="risk-dot ${riskClasses[data.riskLevel]}"></span>
                        ${riskInfo.grade} ${riskInfo.label}
                    </span>
                </div>
                ${riskValueDisplay}
                <div class="popup-info-row">
                    <span class="popup-info-label">발생확률</span>
                    <span class="popup-info-value">${data.probability}%</span>
                </div>
                <div class="popup-info-row">
                    <span class="popup-info-label">기온</span>
                    <span class="popup-info-value">${data.temperature}°C</span>
                </div>
                <div class="popup-info-row">
                    <span class="popup-info-label">습도</span>
                    <span class="popup-info-value">${data.humidity}%</span>
                </div>
                ${data.source === 'open-meteo' ? '<div style="text-align:right;font-size:10px;color:#4fc3f7;margin-top:4px;">📡 Open-Meteo 실측</div>' : ''}
            </div>
            <button class="popup-json-btn" onclick="infoPanel.showJsonData()">
                <span class="material-icons" style="font-size:14px;vertical-align:middle;">data_object</span>
                전체 데이터 (JSON)
            </button>
        `;
        popupEl.style.display = 'block';
        this.popupOverlay.setPosition(coordinate);
    }

    // 팝업 닫기
    closePopup() {
        document.getElementById('map-popup').style.display = 'none';
        this.popupOverlay.setPosition(undefined);
    }

    // 팝업 갱신 (예측 데이터 변경 시 - 날짜/작물/병해충 변경)
    refreshPopup() {
        if (!this.selectedCoord || !this.popupOverlay.getPosition()) return;

        const lon = this.selectedCoord[0];
        const lat = this.selectedCoord[1];
        const pointData = this.queryPointData(lon, lat);

        if (pointData) {
            const province = pointData.province;
            const displayName = province
                ? `${province.name} (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`
                : `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;

            this.showPopup(this.popupOverlay.getPosition(), {
                code: province ? province.code : '',
                name: displayName,
                riskLevel: pointData.riskLevel,
                riskValue: pointData.riskValue,
                probability: pointData.probability,
                temperature: pointData.temperature,
                humidity: pointData.humidity,
                source: pointData.source
            });
        }
    }

    // 좌표로 이동
    flyTo(lon, lat, zoom = 12) {
        this.map.getView().animate({
            center: ol.proj.fromLonLat([lon, lat]),
            zoom: zoom,
            duration: 1200
        });
    }

    // 검색 마커 추가
    addSearchMarker(lon, lat, label) {
        const source = this.markerLayer.getSource();
        source.clear();

        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            name: label
        });

        feature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({ color: 'rgba(0, 188, 212, 0.8)' }),
                stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
            }),
            text: new ol.style.Text({
                text: label,
                font: 'bold 12px Pretendard, sans-serif',
                offsetY: -20,
                fill: new ol.style.Fill({ color: '#ffffff' }),
                stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.6)', width: 3 }),
                backgroundFill: new ol.style.Fill({ color: 'rgba(0, 188, 212, 0.7)' }),
                padding: [4, 8, 4, 8]
            })
        }));

        source.addFeature(feature);
    }

    // ── 드론 비행금지구역 ─────────────────────────

    // 비행금지구역 토글
    toggleNoFlyZone() {
        this.noFlyVisible = !this.noFlyVisible;
        this.noFlyLayer.setVisible(this.noFlyVisible);

        if (this.noFlyVisible && !this.noFlyLoaded) {
            this.loadNoFlyZones();
        }

        console.log(`[MapManager] 비행금지구역 ${this.noFlyVisible ? 'ON' : 'OFF'}`);
        return this.noFlyVisible;
    }

    // VWorld API에서 비행금지구역 데이터 로드
    async loadNoFlyZones() {
        const apiKey = window.VWORLD_API_KEY || VWORLD_API_KEY;
        const format = new ol.format.GeoJSON();
        const source = this.noFlyLayer.getSource();
        source.clear();

        if (!apiKey) {
            console.warn('[NoFly] VWorld API Key 없음 → 정적 데이터 사용');
            await this._loadNoFlyFallback(source, format);
            this.noFlyLoaded = source.getFeatures().length > 0;
            console.log(`[NoFly] 완료: ${source.getFeatures().length}개 구역`);
            return;
        }

        console.log('[NoFly] 비행금지구역 데이터 로드 시작...');

        // PHP 프록시 URL (NAS에서 PHP 활성화 시 최우선 사용)
        const phpProxyUrl = 'api/proxy_vworld.php';

        // CORS 프록시 목록 (PHP 프록시 실패 시 fallback)
        const corsProxies = [
            { name: 'corsproxy.io', prefix: 'https://corsproxy.io/?' },
            { name: 'allorigins', prefix: 'https://api.allorigins.win/raw?url=' },
            { name: 'codetabs', prefix: 'https://api.codetabs.com/v1/proxy?quest=' }
        ];

        let page = 1;
        let totalLoaded = 0;

        while (true) {
            const rawParams = `data=LT_C_AISPRHC&key=${apiKey}&size=1000&page=${page}&geomFilter=BOX(124.0,33.0,132.0,43.0)`;
            const rawUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&format=json&crs=EPSG:4326&${rawParams}`;

            let json = null;

            // 1) PHP 프록시 시도
            try {
                const phpUrl = `${phpProxyUrl}?${rawParams}`;
                console.log(`[NoFly] 요청 (PHP 프록시):`, phpUrl);
                const resp = await fetch(phpUrl);
                const text = await resp.text();
                if (!text.startsWith('<?php')) {
                    json = JSON.parse(text);
                    console.log(`[NoFly] PHP 프록시 성공, status:`, json.response?.status);
                } else {
                    console.warn('[NoFly] PHP 미실행 (raw source 반환), 외부 프록시로 전환');
                }
            } catch (err) {
                console.warn(`[NoFly] PHP 프록시 실패:`, err.message);
            }

            // 2) 외부 CORS 프록시 fallback
            if (!json) {
                for (const proxy of corsProxies) {
                    try {
                        const fetchUrl = proxy.prefix + encodeURIComponent(rawUrl);
                        console.log(`[NoFly] 요청 (${proxy.name}):`, rawUrl.substring(0, 80) + '...');
                        const resp = await fetch(fetchUrl);
                        json = await resp.json();
                        console.log(`[NoFly] ${proxy.name} 성공, status:`, json.response?.status);
                        break;
                    } catch (err) {
                        console.warn(`[NoFly] ${proxy.name} 실패:`, err.message);
                    }
                }
            }

            if (!json) {
                console.error('[NoFly] 모든 프록시 실패');
                break;
            }

            if (json.response?.status !== 'OK' || !json.response?.result?.featureCollection) {
                console.warn('[NoFly] API 응답 실패:', JSON.stringify(json.response?.error || json.response?.status));
                break;
            }

            const fc = json.response.result.featureCollection;
            const features = format.readFeatures(fc, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });

            source.addFeatures(features);
            totalLoaded += features.length;
            console.log(`[NoFly] 페이지 ${page}: ${features.length}개 로드 (누적 ${totalLoaded})`);

            // 다음 페이지 확인
            const totalRecords = parseInt(json.response.record?.total || '0');
            if (totalLoaded >= totalRecords || features.length === 0) break;
            page++;
        }

        if (totalLoaded === 0) {
            console.log('[NoFly] VWorld API 실패 → 정적 GeoJSON 폴백 로드');
            await this._loadNoFlyFallback(source, format);
        }

        this.noFlyLoaded = source.getFeatures().length > 0;
        console.log(`[NoFly] 완료: ${source.getFeatures().length}개 구역`);
    }

    async _loadNoFlyFallback(source, format) {
        try {
            const resp = await fetch('data/nofly-zones.json');
            const geojson = await resp.json();
            const features = format.readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            source.addFeatures(features);
            console.log(`[NoFly] 정적 데이터 로드: ${features.length}개 비행금지구역`);
        } catch (err) {
            console.error('[NoFly] 정적 데이터 로드 실패:', err.message);
        }
    }

    // 비행금지구역 스타일
    getNoFlyStyle(feature) {
        return new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(244, 67, 54, 0.25)'
            }),
            stroke: new ol.style.Stroke({
                color: 'rgba(244, 67, 54, 0.8)',
                width: 1.5,
                lineDash: [6, 4]
            }),
            text: new ol.style.Text({
                text: feature.get('prh_lbl_1') || '',
                font: 'bold 10px Pretendard, sans-serif',
                fill: new ol.style.Fill({ color: '#ff5252' }),
                stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
                overflow: true
            })
        });
    }

    // 비행금지구역 팝업
    showNoFlyPopup(coordinate, feature) {
        const name = feature.get('prohibited') || feature.get('prh_lbl_1') || '비행금지구역';
        const label1 = feature.get('prh_lbl_1') || '';
        const label2 = feature.get('prh_lbl_2') || '';
        const label3 = feature.get('prh_lbl_3') || '';
        const label4 = feature.get('prh_lbl_4') || '';
        const type = feature.get('prh_typ') || '';

        const labels = [label1, label2, label3, label4].filter(l => l).join(' / ');

        const popupEl = document.getElementById('map-popup');
        popupEl.innerHTML = `
            <button class="popup-close" onclick="mapManager.closePopup()">×</button>
            <div class="popup-title" style="color:#ff5252;">
                <span class="material-icons" style="font-size:16px;vertical-align:middle;">flight</span>
                비행금지구역
            </div>
            <div class="popup-info">
                <div class="popup-info-row">
                    <span class="popup-info-label">구역명</span>
                    <span class="popup-info-value">${name}</span>
                </div>
                ${labels ? `<div class="popup-info-row"><span class="popup-info-label">구분</span><span class="popup-info-value">${labels}</span></div>` : ''}
                ${type ? `<div class="popup-info-row"><span class="popup-info-label">유형</span><span class="popup-info-value">${type}</span></div>` : ''}
            </div>
        `;
        popupEl.style.display = 'block';
        this.popupOverlay.setPosition(coordinate);
    }
    // ── NDVI 위성 지도 ──────────────────────────

    // NDVI 토글
    async toggleNDVI() {
        const btn = document.getElementById('ndvi-toggle');

        if (!this.agroApiKey) {
            // 설정에서 키 확인
            try {
                const raw = localStorage.getItem('pestmap_settings');
                const settings = raw ? JSON.parse(raw) : {};
                if (settings.agroKey) {
                    this.agroApiKey = settings.agroKey;
                }
            } catch (e) {}
        }

        if (!this.agroApiKey) {
            alert('Agromonitoring API Key가 설정되지 않았습니다.\n설정(⚙) 메뉴에서 API Key를 입력해주세요.');
            return;
        }

        this.ndviVisible = !this.ndviVisible;
        this.ndviLayer.setVisible(this.ndviVisible);

        if (btn) {
            btn.classList.toggle('active', this.ndviVisible);
        }

        if (this.ndviVisible) {
            await this.loadNDVI();
        } else {
            this._showNDVILegend(false);
            this._closeNDVIChart();
            this._removeNDVIPanel();
            this.ndviBoundaryLayer.getSource().clear();
            this.ndviBoundaryLayer.setVisible(false);
        }

        console.log(`[NDVI] ${this.ndviVisible ? 'ON' : 'OFF'}`);
    }

    // NDVI 데이터 로드 (현재 지도 중심 기준)
    async loadNDVI() {
        const btn = document.getElementById('ndvi-toggle');
        if (btn) btn.classList.add('loading');

        try {
            // 1) 현재 지도 중심 좌표
            const center = ol.proj.toLonLat(this.map.getView().getCenter());
            const lon = center[0];
            const lat = center[1];

            // 2) 폴리곤 생성 (약 0.025도 ≈ 2.5km 사각형, 약 2500ha 이내)
            const d = 0.025;
            const coords = [
                [lon - d, lat - d],
                [lon + d, lat - d],
                [lon + d, lat + d],
                [lon - d, lat + d],
                [lon - d, lat - d]
            ];

            // 기존 폴리곤이 있으면 재사용 시도 (같은 위치)
            const polyKey = `${lon.toFixed(2)}_${lat.toFixed(2)}`;
            const cachedPolyId = sessionStorage.getItem(`ndvi_poly_${polyKey}`);

            let polyResult = null;
            if (cachedPolyId) {
                polyResult = { id: cachedPolyId, area: null };
            } else {
                polyResult = await this._createAgroPolygon(coords);
                if (polyResult) {
                    sessionStorage.setItem(`ndvi_poly_${polyKey}`, polyResult.id);
                }
            }

            if (!polyResult) {
                console.error('[NDVI] 폴리곤 생성 실패');
                this.ndviVisible = false;
                this.ndviLayer.setVisible(false);
                if (btn) btn.classList.remove('active', 'loading');
                return;
            }

            const polygonId = polyResult.id;
            this.ndviPolygonId = polygonId;

            // 폴리곤 경계를 지도에 표시
            this._drawNDVIBoundary(coords, polyResult.area);

            // 3) 위성 이미지 검색 (30일 → 90일 → 1년 → 3년 → 2019년부터 전체)
            const nowTs = Math.floor(Date.now() / 1000);
            const since2019 = Math.floor(new Date('2019-01-01').getTime() / 1000);
            const searchPeriods = [
                { days: 30, label: '30일' },
                { days: 90, label: '90일' },
                { days: 365, label: '1년' },
                { days: 365 * 3, label: '3년' },
                { start: since2019, label: '2019년~현재' }
            ];
            let tileUrl = null;

            for (const p of searchPeriods) {
                const start = p.start || (nowTs - (p.days * 24 * 3600));
                console.log(`[NDVI] ${p.label} 이내 이미지 검색...`);
                tileUrl = await this._searchNDVIImage(polygonId, start, nowTs);
                if (tileUrl) break;
            }

            if (tileUrl) {
                // 4) 타일 레이어에 URL 적용
                this.ndviLayer.setSource(new ol.source.XYZ({
                    url: tileUrl,
                    crossOrigin: 'anonymous',
                    maxZoom: 16
                }));
                this.ndviLayer.setVisible(true);
                this._showNDVILegend(true);
                console.log('[NDVI] 타일 레이어 활성화:', tileUrl);
            } else {
                alert('2019년 이후 NDVI 위성 이미지가 없습니다.');
                this.ndviVisible = false;
                this.ndviLayer.setVisible(false);
                if (btn) btn.classList.remove('active');
            }

            // 5) NDVI 히스토리 그래프 (2019년~현재 전체 기간)
            this._loadNDVIHistory(polygonId);
        } catch (err) {
            console.error('[NDVI] 로드 실패:', err);
            alert(`NDVI 로드 실패: ${err.message}`);
            this.ndviVisible = false;
            this.ndviLayer.setVisible(false);
            if (btn) btn.classList.remove('active');
        }

        if (btn) btn.classList.remove('loading');
    }

    // Agromonitoring 폴리곤 생성 (한도 초과 시 자동 정리)
    async _createAgroPolygon(coords) {
        const baseUrl = `http://api.agromonitoring.com/agro/1.0/polygons`;
        const url = `${baseUrl}?appid=${this.agroApiKey}`;
        const body = {
            name: 'NDVI_View',
            geo_json: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords]
                }
            }
        };

        // 요청 중심 좌표 계산
        const centerLon = (coords[0][0] + coords[2][0]) / 2;
        const centerLat = (coords[0][1] + coords[2][1]) / 2;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            // 409: 중복 폴리곤 또는 413: 개수 한도 초과 → 기존 목록에서 처리
            if (res.status === 409 || res.status === 413) {
                console.log(`[NDVI] ${res.status} 오류 → 기존 폴리곤 목록 확인`);
                return await this._reuseOrRecyclePolygon(coords, centerLon, centerLat);
            }

            if (!res.ok) {
                const errText = await res.text();
                console.error('[NDVI] 폴리곤 생성 오류:', res.status, errText);
                return null;
            }

            const data = await res.json();
            console.log(`[NDVI] 폴리곤 생성 완료: ${data.id} (${data.area?.toFixed(1)}ha)`);
            return { id: data.id, area: data.area };
        } catch (err) {
            console.error('[NDVI] 폴리곤 API 오류:', err);
            return null;
        }
    }

    // 기존 폴리곤 재사용 또는 가장 오래된 것 삭제 후 재생성
    async _reuseOrRecyclePolygon(coords, centerLon, centerLat) {
        const baseUrl = `http://api.agromonitoring.com/agro/1.0/polygons`;

        try {
            // 기존 폴리곤 목록 가져오기
            const listRes = await fetch(`${baseUrl}?appid=${this.agroApiKey}`);
            const list = await listRes.json();

            if (!list || list.length === 0) return null;

            // 1) 현재 위치에 가장 가까운 폴리곤 찾기
            let closest = null;
            let closestDist = Infinity;

            for (const poly of list) {
                if (poly.center) {
                    const dx = poly.center[0] - centerLon;
                    const dy = poly.center[1] - centerLat;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = poly;
                    }
                }
            }

            // 0.03도 이내(~3km) → 기존 폴리곤 재사용
            if (closest && closestDist < 0.03) {
                console.log(`[NDVI] 근처 기존 폴리곤 재사용: ${closest.id} (거리: ${(closestDist * 111).toFixed(1)}km)`);
                return { id: closest.id, area: closest.area };
            }

            // 2) 가까운 게 없으면 → 가장 오래된 폴리곤 삭제 후 재생성
            const oldest = list.reduce((a, b) =>
                (a.created_at || 0) < (b.created_at || 0) ? a : b
            );

            console.log(`[NDVI] 폴리곤 한도 초과 → 가장 오래된 폴리곤 삭제: ${oldest.id} (${oldest.name})`);
            const delRes = await fetch(`${baseUrl}/${oldest.id}?appid=${this.agroApiKey}`, {
                method: 'DELETE'
            });

            if (!delRes.ok) {
                console.warn('[NDVI] 폴리곤 삭제 실패:', delRes.status);
                // 삭제 실패 시 가장 가까운 폴리곤이라도 사용
                if (closest) {
                    console.log(`[NDVI] 삭제 실패, 가장 가까운 폴리곤 사용: ${closest.id}`);
                    return { id: closest.id, area: closest.area };
                }
                return null;
            }

            console.log('[NDVI] 삭제 완료, 새 폴리곤 생성 재시도...');

            // 새 폴리곤 생성 재시도
            const retryRes = await fetch(`${baseUrl}?appid=${this.agroApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'NDVI_View',
                    geo_json: {
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'Polygon', coordinates: [coords] }
                    }
                })
            });

            if (!retryRes.ok) {
                const errText = await retryRes.text();
                console.error('[NDVI] 재생성도 실패:', retryRes.status, errText);
                // 최후의 수단: 아직 남아있는 가장 가까운 폴리곤 사용
                if (closest && closest.id !== oldest.id) {
                    return { id: closest.id, area: closest.area };
                }
                return null;
            }

            const data = await retryRes.json();
            console.log(`[NDVI] 폴리곤 재생성 완료: ${data.id} (${data.area?.toFixed(1)}ha)`);
            return { id: data.id, area: data.area };
        } catch (err) {
            console.error('[NDVI] 폴리곤 재활용 오류:', err);
            return null;
        }
    }

    // NDVI 위성 이미지 검색
    async _searchNDVIImage(polygonId, start, end) {
        const url = `http://api.agromonitoring.com/agro/1.0/image/search?start=${start}&end=${end}&polyid=${polygonId}&appid=${this.agroApiKey}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.error('[NDVI] 이미지 검색 오류:', res.status);
                return null;
            }

            const images = await res.json();
            if (!images || images.length === 0) {
                console.warn('[NDVI] 해당 기간에 이미지 없음');
                return null;
            }

            // 가장 최신 이미지 (구름 커버리지 낮은 것 우선)
            const sorted = images
                .filter(img => img.tile && img.tile.ndvi)
                .sort((a, b) => {
                    // 구름 적고, 날짜 최신 순
                    const cloudDiff = (a.cl || 0) - (b.cl || 0);
                    if (Math.abs(cloudDiff) > 20) return cloudDiff;
                    return b.dt - a.dt;
                });

            if (sorted.length === 0) {
                console.warn('[NDVI] NDVI 타일이 포함된 이미지 없음');
                return null;
            }

            const best = sorted[0];
            const date = new Date(best.dt * 1000).toLocaleDateString('ko-KR');
            console.log(`[NDVI] 선택된 이미지: ${date}, 구름 ${best.cl}%, 해상도 ${best.dc}m`);

            // 타일 URL 반환 (ZXY 패턴)
            return best.tile.ndvi;
        } catch (err) {
            console.error('[NDVI] 이미지 검색 오류:', err);
            return null;
        }
    }

    // NDVI 폴리곤 경계를 지도에 그리기
    _drawNDVIBoundary(coords, areaHa) {
        const source = this.ndviBoundaryLayer.getSource();
        source.clear();

        // 좌표 변환 (EPSG:4326 → EPSG:3857)
        const olCoords = coords.map(c => ol.proj.fromLonLat(c));

        const feature = new ol.Feature({
            geometry: new ol.geom.Polygon([olCoords])
        });

        // 면적 라벨 텍스트
        const areaText = areaHa ? `NDVI 영역 (${areaHa.toFixed(0)}ha)` : 'NDVI 영역';

        feature.setStyle(new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(76, 175, 80, 0.08)'
            }),
            stroke: new ol.style.Stroke({
                color: '#4caf50',
                width: 2.5,
                lineDash: [8, 5]
            }),
            text: new ol.style.Text({
                text: areaText,
                font: 'bold 12px Pretendard, sans-serif',
                fill: new ol.style.Fill({ color: '#4caf50' }),
                stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
                overflow: true
            })
        }));

        source.addFeature(feature);
        this.ndviBoundaryLayer.setVisible(true);
        console.log(`[NDVI] 경계 표시: ${areaText}`);
    }

    // NDVI 히스토리 로드 및 차트 그리기
    async _loadNDVIHistory(polygonId) {
        const end = Math.floor(Date.now() / 1000);
        const start = Math.floor(new Date('2019-01-01').getTime() / 1000); // 2019년부터
        const url = `http://api.agromonitoring.com/agro/1.0/ndvi/history?start=${start}&end=${end}&polyid=${polygonId}&appid=${this.agroApiKey}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('[NDVI] 히스토리 API 오류:', res.status);
                return;
            }

            const history = await res.json();
            if (!history || history.length === 0) {
                console.warn('[NDVI] 히스토리 데이터 없음');
                return;
            }

            // 날짜순 정렬
            history.sort((a, b) => a.dt - b.dt);

            console.log(`[NDVI] 히스토리 ${history.length}건 로드 완료`);
            this._renderNDVIChart(history);
        } catch (err) {
            console.error('[NDVI] 히스토리 로드 실패:', err);
        }
    }

    // NDVI 히스토리 차트 렌더링
    _renderNDVIChart(history) {
        // 차트 컨테이너 생성 (NDVI 패널 안에 배치)
        let chartContainer = document.getElementById('ndvi-chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.id = 'ndvi-chart-container';
            chartContainer.className = 'ndvi-chart-container';
            const panel = this._getNDVIPanel();
            panel.appendChild(chartContainer);
        }

        chartContainer.innerHTML = `
            <div class="ndvi-chart-header">
                <span class="material-icons">show_chart</span>
                <span>NDVI 시계열 (2019~현재)</span>
                <button class="ndvi-chart-close" onclick="mapManager._closeNDVIChart()">
                    <span class="material-icons">close</span>
                </button>
            </div>
            <canvas id="ndvi-history-chart"></canvas>
        `;
        chartContainer.style.display = 'block';

        const ctx = document.getElementById('ndvi-history-chart').getContext('2d');

        const labels = history.map(h => {
            const d = new Date(h.dt * 1000);
            const yr = String(d.getFullYear()).slice(2);
            return `${yr}.${d.getMonth() + 1}`;
        });
        const meanData = history.map(h => h.data?.mean ?? null);
        const maxData = history.map(h => h.data?.max ?? null);
        const minData = history.map(h => h.data?.min ?? null);
        const sources = history.map(h => h.source || '');

        // 기존 차트 파괴
        if (this._ndviChart) {
            this._ndviChart.destroy();
        }

        this._ndviChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'NDVI 평균',
                        data: meanData,
                        borderColor: '#4caf50',
                        backgroundColor: 'rgba(76, 175, 80, 0.15)',
                        fill: false,
                        borderWidth: 2,
                        pointRadius: 2.5,
                        pointBackgroundColor: '#4caf50',
                        tension: 0.3
                    },
                    {
                        label: 'NDVI 최대',
                        data: maxData,
                        borderColor: 'rgba(76, 175, 80, 0.4)',
                        borderWidth: 1,
                        borderDash: [4, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3
                    },
                    {
                        label: 'NDVI 최소',
                        data: minData,
                        borderColor: 'rgba(244, 67, 54, 0.4)',
                        borderWidth: 1,
                        borderDash: [4, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#ccc',
                            font: { size: 10, family: 'Pretendard' },
                            boxWidth: 12,
                            padding: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30,30,30,0.95)',
                        titleFont: { size: 11, family: 'Pretendard' },
                        bodyFont: { size: 11, family: 'Pretendard' },
                        callbacks: {
                            afterBody: (items) => {
                                const idx = items[0]?.dataIndex;
                                return idx !== undefined && sources[idx]
                                    ? `위성: ${sources[idx]}`
                                    : '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#999', font: { size: 9 }, maxTicksLimit: 12 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        min: -0.2,
                        max: 1.0,
                        ticks: { color: '#999', font: { size: 10 }, stepSize: 0.2 },
                        grid: { color: 'rgba(255,255,255,0.08)' }
                    }
                }
            }
        });
    }

    // NDVI 차트 닫기
    _closeNDVIChart() {
        const el = document.getElementById('ndvi-chart-container');
        if (el) el.style.display = 'none';
        if (this._ndviChart) {
            this._ndviChart.destroy();
            this._ndviChart = null;
        }
    }

    // NDVI 패널 wrapper 가져오기 (없으면 생성)
    _getNDVIPanel() {
        let panel = document.getElementById('ndvi-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ndvi-panel';
            panel.className = 'ndvi-panel';
            document.getElementById('map-container').appendChild(panel);
        }
        return panel;
    }

    // NDVI 패널 제거
    _removeNDVIPanel() {
        const panel = document.getElementById('ndvi-panel');
        if (panel) panel.remove();
    }

    // NDVI 범례 표시/숨기기
    _showNDVILegend(show) {
        let legendEl = document.getElementById('ndvi-legend');
        if (show) {
            const panel = this._getNDVIPanel();
            if (!legendEl) {
                legendEl = document.createElement('div');
                legendEl.id = 'ndvi-legend';
                legendEl.className = 'ndvi-legend';
                // 범례를 패널 맨 앞에 삽입 (차트보다 위에 위치)
                panel.insertBefore(legendEl, panel.firstChild);
            }
            legendEl.innerHTML = `
                <div class="ndvi-legend-title">
                    <span class="material-icons">satellite_alt</span> NDVI
                </div>
                <div class="ndvi-legend-bar"></div>
                <div class="ndvi-legend-labels">
                    <span>-1 (물/나지)</span>
                    <span>0</span>
                    <span>+1 (건강한 식생)</span>
                </div>
            `;
            legendEl.style.display = 'block';
        } else if (legendEl) {
            legendEl.style.display = 'none';
        }
    }
}

// 전역 인스턴스
const mapManager = new MapManager();

