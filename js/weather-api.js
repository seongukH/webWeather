/**
 * Open-Meteo 기상 데이터 모듈
 * 전국 시도별 실시간 기온/습도 조회 (API 키 불필요)
 */

class WeatherApi {
    constructor() {
        this.baseUrl = 'https://api.open-meteo.com/v1/forecast';
        this.cache = {};
        this.cacheTTL = 15 * 60 * 1000; // 15분
        this.lastFetch = 0;
    }

    /**
     * 전국 시도별 현재 기온/습도 조회
     * @returns {Object} { '11': {temperature, humidity}, '26': {...}, ... }
     */
    async fetchCurrentWeather() {
        const cacheKey = 'current';
        if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].time < this.cacheTTL) {
            console.log('[Weather] 캐시 사용');
            return this.cache[cacheKey].data;
        }

        const lats = PROVINCES.map(p => p.center[1]).join(',');
        const lngs = PROVINCES.map(p => p.center[0]).join(',');

        const url = `${this.baseUrl}?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m&timezone=Asia/Seoul`;

        try {
            console.log('[Weather] Open-Meteo API 호출...');
            const resp = await fetch(url);
            const raw = await resp.json();

            const results = {};
            const items = Array.isArray(raw) ? raw : [raw];

            items.forEach((item, i) => {
                if (i < PROVINCES.length && item.current) {
                    results[PROVINCES[i].code] = {
                        temperature: item.current.temperature_2m,
                        humidity: item.current.relative_humidity_2m,
                    };
                }
            });

            this.cache[cacheKey] = { data: results, time: Date.now() };
            console.log(`[Weather] ${Object.keys(results).length}개 시도 기상 데이터 수신`);
            return results;
        } catch (err) {
            console.warn('[Weather] API 호출 실패:', err.message);
            return null;
        }
    }

    /**
     * 특정 좌표의 시간별 예보 조회 (차트용)
     * @param {number} lat
     * @param {number} lng
     * @param {number} days 예보 일수 (기본 7)
     */
    async fetchHourlyForecast(lat, lng, days = 7) {
        const cacheKey = `hourly_${lat.toFixed(2)}_${lng.toFixed(2)}`;
        if (this.cache[cacheKey] && Date.now() - this.cache[cacheKey].time < this.cacheTTL) {
            return this.cache[cacheKey].data;
        }

        const url = `${this.baseUrl}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m&forecast_days=${days}&timezone=Asia/Seoul`;

        try {
            const resp = await fetch(url);
            const data = await resp.json();

            if (data.hourly) {
                this.cache[cacheKey] = { data: data.hourly, time: Date.now() };
                return data.hourly;
            }
            return null;
        } catch (err) {
            console.warn('[Weather] 시간별 예보 실패:', err.message);
            return null;
        }
    }
}

const weatherApi = new WeatherApi();
