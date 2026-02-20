/**
 * 농작물 병해충 분포/예측 지도 - 지도 모듈
 * OpenLayers + VWorld API 연동 + IDW 래스터 히트맵
 */

const VWORLD_API_KEY = '43115ED3-2B2D-33B5-A2F6-0AA60BD281F7';

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
                this.heatmapLayer,
                this.regionLayer,
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
                humidity: pointData.humidity
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
            </div>
        `;
        popupEl.style.display = 'block';
        this.popupOverlay.setPosition(coordinate);
    }

    // 팝업 닫기
    closePopup() {
        document.getElementById('map-popup').style.display = 'none';
        this.popupOverlay.setPosition(undefined);
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
        if (!apiKey) {
            console.warn('[NoFly] VWorld API Key가 없습니다');
            return;
        }

        console.log('[NoFly] 비행금지구역 데이터 로드 시작...');
        const source = this.noFlyLayer.getSource();
        source.clear();

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
        const format = new ol.format.GeoJSON();

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

        this.noFlyLoaded = totalLoaded > 0;
        console.log(`[NoFly] 완료: ${totalLoaded}개 구역, 레이어 visible=${this.noFlyLayer.getVisible()}, features=${source.getFeatures().length}`);
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
}

// 전역 인스턴스
const mapManager = new MapManager();
