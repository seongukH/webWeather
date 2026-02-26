/**
 * 농작물 병해충 분포/예측 지도 - NCPMS API 연동 모듈
 * 
 * NCPMS(국가농작물병해충관리시스템) 병해충예측지도 API (GIS 기반)
 * API 문서: https://ncpms.rda.go.kr/npms/apiDtlPopup31.np
 * 
 * ▶ 요청 URL: http://ncpms.rda.go.kr/npmsAPI/service
 * ▶ 서비스코드: SVC31 (병해충예측지도)
 * ▶ 요청 파라미터:
 *   - apiKey       : 발급받은 API 인증키
 *   - serviceCode  : SVC31
 *   - cropCode     : 작물 코드 (예: FC010101 = 논벼)
 *   - diseaseWeedCode : 병해충 코드
 *   - displayDate  : 예측 날짜 (YYYYMMDD)
 *
 * ▶ 응답 (XML):
 *   - <item> 내 필드:
 *     sidoCode, sidoName, warningGrade, 
 *     temperature(평균기온), humidity(평균습도),
 *     probability(발생확률) 등
 */

class NcpmsApi {
    constructor() {
        this.apiKey = '';
        this.baseUrl = 'http://ncpms.rda.go.kr/npmsAPI/service';
        this.isConnected = false;
        this.lastResponse = null;
        this.lastRawResponse = null;

        // CORS 프록시 목록 (NCPMS 서버는 CORS 미지원이므로 프록시 필요)
        this.corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        this.currentProxyIndex = 0;

        // ===== 실제 NCPMS 병해충 코드 (diseaseWeedCode) =====
        // fnKncrClick → 작물 선택 후 NCPMS 웹 시스템에서 사용되는 코드
        this.diseaseCodeMap = {
            // 논벼 (FC010101)
            'P001': { code: 'D00100101', name: '도열병' },
            'P002': { code: 'D00100102', name: '잎집무늬마름병' },
            'P003': { code: 'D00100103', name: '깨씨무늬병' },
            'P004': { code: 'I00100201', name: '벼멸구' },
            'P005': { code: 'I00100202', name: '흰등멸구' },
            'P006': { code: 'I00100203', name: '혹명나방' },

            // 감자 (FC050501)
            'P101': { code: 'D00500101', name: '역병' },
            'P102': { code: 'D00500102', name: '풋마름병' },
            'P103': { code: 'I00500201', name: '감자뿔나방' },
            'P104': { code: 'I00500202', name: '진딧물' },

            // 사과 (FT010601)
            'P201': { code: 'D01000101', name: '탄저병' },
            'P202': { code: 'D01000102', name: '갈색무늬병' },
            'P203': { code: 'D01000103', name: '붉은별무늬병' },
            'P204': { code: 'I01000201', name: '사과굴나방' },
            'P205': { code: 'I01000202', name: '복숭아심식나방' },
            'P206': { code: 'I01000203', name: '점박이응애' },

            // 배 (FT010602)
            'P301': { code: 'D01100101', name: '검은별무늬병' },
            'P302': { code: 'D01100102', name: '붉은별무늬병' },
            'P303': { code: 'I01100201', name: '배나무이' },
            'P304': { code: 'I01100202', name: '꼬마배나무이' },

            // 포도 (FT040603)
            'P401': { code: 'D01200101', name: '탄저병' },
            'P402': { code: 'D01200102', name: '노균병' },
            'P403': { code: 'D01200103', name: '새눈무늬병' },
            'P404': { code: 'I01200201', name: '꽃매미' },
            'P405': { code: 'I01200202', name: '포도유리나방' },

            // 감귤 (FT060614)
            'P501': { code: 'D01300101', name: '더뎅이병' },
            'P502': { code: 'D01300102', name: '궤양병' },
            'P503': { code: 'I01300201', name: '귤응애' },
            'P504': { code: 'I01300202', name: '귤굴나방' },

            // 고추 (VC011205)
            'P601': { code: 'D02000101', name: '탄저병' },
            'P602': { code: 'D02000102', name: '역병' },
            'P603': { code: 'D02000103', name: '점무늬병' },
            'P604': { code: 'I02000201', name: '담배나방' },
            'P605': { code: 'I02000202', name: '진딧물' },
            'P606': { code: 'I02000203', name: '총채벌레' },

            // 파 (VC041202)
            'P701': { code: 'D02100101', name: '노균병' },
            'P702': { code: 'D02100102', name: '검은무늬병' },
            'P703': { code: 'I02100201', name: '파굴파리' },
            'P704': { code: 'I02100202', name: '파밤나방' },

            // 마늘 (VC041209)
            'P801': { code: 'D02200101', name: '잎마름병' },
            'P802': { code: 'D02200102', name: '흑색썩음균핵병' },
            'P803': { code: 'I02200201', name: '파총채벌레' },
            'P804': { code: 'I02200202', name: '뿌리응애' }
        };

        // 시도코드 매핑 (NCPMS GIS 응답 → 앱 내 코드)
        this.sidoNameToCode = {};
        PROVINCES.forEach(p => {
            // "서울특별시" → "서울", "경기도" → "경기" 등 축약 매핑
            this.sidoNameToCode[p.name] = p.code;
            // 축약형도 매핑
            const shortName = p.name.replace(/특별시|광역시|특별자치시|특별자치도|도$/g, '');
            this.sidoNameToCode[shortName] = p.code;
        });
    }

    // ─── API Key 설정 ─────────────────────────
    setApiKey(key) {
        this.apiKey = key;
        this.updateStatus(!!key);
        console.log(`[NCPMS API] API Key ${key ? '설정됨' : '제거됨'}`);
    }

    // ─── API 상태 UI 업데이트 ──────────────────
    updateStatus(connected) {
        this.isConnected = connected;
        const dot = document.getElementById('api-status-dot');
        const text = document.getElementById('api-status-text');

        if (dot && text) {
            if (connected) {
                dot.style.background = 'var(--risk-safe)';
                dot.style.boxShadow = '0 0 6px var(--risk-safe)';
                text.textContent = 'API 연결됨';
                text.style.color = 'var(--risk-safe)';
            } else {
                dot.style.background = 'var(--risk-caution)';
                dot.style.boxShadow = '0 0 6px var(--risk-caution)';
                text.textContent = this.apiKey ? 'API 연결 실패' : 'API 연결 대기중';
                text.style.color = 'var(--text-muted)';
            }
        }
    }

    // ─── 병해충 예측지도 데이터 조회 (SVC31) ────
    async fetchPrediction(cropCode, pestCode, date) {
        if (!this.apiKey) {
            console.log('[NCPMS API] API Key 미설정 → 시뮬레이션 데이터');
            return this.generateFallbackData(cropCode, pestCode, date);
        }

        // 내부 코드 → NCPMS 코드 변환
        const diseaseInfo = this.diseaseCodeMap[pestCode];
        const ncpmsDiseaseCode = diseaseInfo ? diseaseInfo.code : pestCode;
        const displayDate = date ? date.replace(/-/g, '') : this.getTodayString();

        const params = new URLSearchParams({
            apiKey: this.apiKey,
            serviceCode: 'SVC31',
            cropCode: cropCode,
            diseaseWeedCode: ncpmsDiseaseCode,
            displayDate: displayDate
        });

        const requestUrl = `${this.baseUrl}?${params.toString()}`;
        console.log(`[NCPMS API] 요청 URL: ${requestUrl}`);
        console.log(`[NCPMS API] 작물: ${cropCode}, 병해충: ${ncpmsDiseaseCode} (${diseaseInfo?.name || pestCode}), 날짜: ${displayDate}`);

        // PHP 프록시 → 직접 요청 → CORS 프록시 순차 시도
        const attempts = [
            () => this._fetchViaPhpProxy(params),
            () => this._fetchDirect(requestUrl),
            ...this.corsProxies.map((proxy, i) => () => this._fetchViaProxy(requestUrl, proxy, i))
        ];

        for (const attempt of attempts) {
            try {
                const data = await attempt();
                if (data) {
                    this.lastResponse = data;
                    this.updateStatus(true);
                    const predictions = this.transformResponse(data);
                    if (predictions && Object.keys(predictions).length > 0) {
                        console.log(`[NCPMS API] ${Object.keys(predictions).length}개 시/도 예측 데이터 수신`);
                        return predictions;
                    }
                }
            } catch (err) {
                // 다음 시도로 넘어감
                console.warn('[NCPMS API] 요청 방식 실패, 다음 시도...', err.message);
            }
        }

        // 모든 시도 실패 → 폴백 데이터
        console.log('[NCPMS API] 모든 요청 실패 → 시뮬레이션 데이터 사용');
        this.updateStatus(false);
        return this.generateFallbackData(cropCode, pestCode, date);
    }

    // ─── PHP 프록시 경유 fetch (로컬 백엔드) ──
    async _fetchViaPhpProxy(params) {
        const proxyUrl = `api/proxy_ncpms.php?${params.toString()}`;
        console.log('[NCPMS API] PHP 프록시 시도...');
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`PHP Proxy HTTP ${response.status}`);
        return this._parseResponse(response);
    }

    // ─── 직접 fetch (Same-Origin 또는 CORS 허용 시) ─
    async _fetchDirect(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/xml, application/json, text/xml, */*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return this._parseResponse(response);
    }

    // ─── CORS 프록시 경유 fetch ────────────────
    async _fetchViaProxy(originalUrl, proxy, index) {
        const proxyUrl = proxy + encodeURIComponent(originalUrl);
        console.log(`[NCPMS API] CORS 프록시 ${index + 1} 시도...`);

        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
        return this._parseResponse(response);
    }

    // ─── 응답 파싱 (XML / JSON 자동 감지) ──────
    async _parseResponse(response) {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        this.lastRawResponse = text;

        if (!text || text.trim().length === 0) {
            throw new Error('빈 응답');
        }

        // XML 응답
        if (contentType.includes('xml') || text.trim().startsWith('<?xml') || text.trim().startsWith('<')) {
            return this.parseXmlResponse(text);
        }

        // JSON 응답
        try {
            return JSON.parse(text);
        } catch {
            // XML로 재시도
            if (text.includes('<')) {
                return this.parseXmlResponse(text);
            }
            throw new Error('응답 파싱 실패');
        }
    }

    // ─── XML → JSON 변환 ──────────────────────
    parseXmlResponse(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // 파싱 에러 체크
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.warn('[NCPMS API] XML 파싱 에러:', parseError.textContent);
                return null;
            }

            // API 에러 응답 체크
            const errorCode = xmlDoc.querySelector('errorCode');
            if (errorCode) {
                const errorMsg = xmlDoc.querySelector('errorMessage');
                console.warn(`[NCPMS API] API 에러 ${errorCode.textContent}: ${errorMsg?.textContent || ''}`);
                return null;
            }

            // 결과 아이템 파싱
            const items = xmlDoc.querySelectorAll('item');
            const results = [];

            items.forEach(item => {
                const result = {};
                item.childNodes.forEach(node => {
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        result[node.nodeName] = node.textContent.trim();
                    }
                });
                results.push(result);
            });

            // <list> 하위 요소도 체크
            if (results.length === 0) {
                const listItems = xmlDoc.querySelectorAll('list > *');
                listItems.forEach(item => {
                    if (item.children.length > 0) {
                        const result = {};
                        item.childNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                result[node.nodeName] = node.textContent.trim();
                            }
                        });
                        results.push(result);
                    }
                });
            }

            console.log(`[NCPMS API] XML 파싱 완료: ${results.length}개 아이템`);
            return { items: results };

        } catch (e) {
            console.error('[NCPMS API] XML 파싱 실패:', e);
            return null;
        }
    }

    // ─── API 응답 → 앱 내부 예측 데이터 포맷 변환 ─
    transformResponse(data) {
        if (!data) return null;

        const items = data.items || data.list || [];
        if (!Array.isArray(items) || items.length === 0) return null;

        const predictions = {};

        items.forEach(item => {
            // GIS 기반 응답 필드 매핑 (다양한 필드명 대응)
            const sidoCode = item.sidoCode || item.sido_code || item.regionCode || item.areaCode || '';
            const sidoName = item.sidoName || item.sido_name || item.regionName || item.areaName || '';

            // 위험수준 (warningGrade: 0=안전, 1=주의, 2=경고, 3=위험)
            const warningGrade = parseInt(
                item.warningGrade || item.warning_grade ||
                item.riskLevel || item.risk_level ||
                item.wrnngGrad || item.grade || 0
            );

            // 발생확률 (%)
            const probability = parseFloat(
                item.probability || item.occurProbability ||
                item.occr_prblty || item.predictPer || 0
            );

            // 기온 (°C)
            const temperature = parseFloat(
                item.temperature || item.avgTemp || item.avg_temp ||
                item.tmpr || item.temp || 0
            );

            // 습도 (%)
            const humidity = parseFloat(
                item.humidity || item.avgHumidity || item.avg_hmdt ||
                item.hmdt || item.humi || 0
            );

            // 시/도 코드 결정 (코드 또는 이름으로)
            let provinceCode = null;

            // 1) 직접 코드 매칭
            if (sidoCode) {
                const p = PROVINCES.find(p => p.code === sidoCode);
                if (p) provinceCode = p.code;
            }

            // 2) 이름으로 매칭
            if (!provinceCode && sidoName) {
                for (const [name, code] of Object.entries(this.sidoNameToCode)) {
                    if (sidoName.includes(name) || name.includes(sidoName)) {
                        provinceCode = code;
                        break;
                    }
                }
            }

            if (provinceCode) {
                predictions[provinceCode] = {
                    riskLevel: Math.min(4, Math.max(0, warningGrade)),
                    probability: Math.min(100, Math.max(0, Math.round(probability))),
                    temperature: temperature ? temperature.toFixed(1) : '0.0',
                    humidity: humidity ? Math.round(humidity) : 0
                };
            }
        });

        return predictions;
    }

    // ─── 시뮬레이션 데이터 (API 실패 시 폴백) ──────
    generateFallbackData(cropCode, pestCode, dateStr) {
        const predictions = {};
        const targetDate = parseDate(dateStr);
        const month = targetDate.getMonth() + 1;
        const day = targetDate.getDate();

        // 월별 위험도 가중치 (5~8월 고위험)
        const monthWeight = [0.1, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 0.9, 0.7, 0.4, 0.2, 0.1];
        // 월 내 일자 보간 (부드러운 전환)
        const w1 = monthWeight[month - 1];
        const w2 = monthWeight[month % 12];
        const dayFrac = (day - 1) / 30;
        const baseWeight = w1 + (w2 - w1) * dayFrac;

        // 작물별 보정 계수
        const cropFactor = {
            'FC010101': 1.0,   // 논벼 - 기준
            'FC050501': 0.8,   // 감자
            'FT010601': 0.9,   // 사과
            'FT010602': 0.85,  // 배
            'FT040603': 0.95,  // 포도
            'FT060614': 0.7,   // 감귤 (제주 특화)
            'VC011205': 1.1,   // 고추 (탄저병 고위험)
            'VC041202': 0.75,  // 파
            'VC041209': 0.8    // 마늘
        };
        const cFactor = cropFactor[cropCode] || 1.0;

        // 결정적 시드 (같은 조건 → 같은 결과)
        const baseSeed = hashCode(`${dateStr || 'today'}_${cropCode}_${pestCode}`);

        PROVINCES.forEach((p, idx) => {
            const seed = baseSeed + idx * 137;
            const lat = p.center[1];
            const lng = p.center[0];

            // Open-Meteo 실측 데이터 우선, 없으면 기후 평균 사용
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const isToday = !dateStr || dateStr === todayStr;
            const live = (typeof _liveWeatherCache !== 'undefined') && _liveWeatherCache && _liveWeatherCache[p.code];

            let temperature, humidity, source;
            if (live && isToday) {
                temperature = live.temperature.toFixed(1);
                humidity = Math.round(live.humidity);
                source = 'open-meteo';
            } else {
                const monthIdx = month - 1;
                const nextIdx = month % 12;
                const df = (day - 1) / 30;
                const [baseTemp, baseHumid] = KOREAN_CLIMATE_AVG[monthIdx];
                const [nextTemp, nextHumid] = KOREAN_CLIMATE_AVG[nextIdx];
                const interpTemp = baseTemp + (nextTemp - baseTemp) * df;
                const interpHumid = baseHumid + (nextHumid - baseHumid) * df;
                const latOffset = -(lat - 36) * 1.5;
                const coastFactor = (lng < 127 || lng > 129) ? 3 : 0;
                temperature = (interpTemp + latOffset + (seededRandom(seed) - 0.5) * 2.5).toFixed(1);
                humidity = Math.max(30, Math.min(95,
                    Math.round(interpHumid + coastFactor + (seededRandom(seed + 1) - 0.5) * 6)));
                source = 'simulation';
            }

            // 위험도 계산
            const tempOptimal = 1 - Math.abs(parseFloat(temperature) - 25) / 20;
            const humidFactor = Math.max(0, (humidity - 50) / 40);
            const rawRisk = baseWeight * cFactor * (
                Math.max(0, tempOptimal) * 0.35 +
                humidFactor * 0.35 +
                seededRandom(seed + 2) * 0.3
            );
            const riskLevel = Math.min(4, Math.floor(rawRisk * 5));
            const probability = Math.min(100, Math.round(rawRisk * 100));

            predictions[p.code] = {
                riskLevel,
                probability,
                temperature,
                humidity,
                source
            };
        });

        return predictions;
    }

    // ─── 월별 시계열 데이터 수집 (12개월 병렬) ─────
    async fetchMonthlyTimeSeries(cropCode, pestCode, year, provinceCode) {
        if (!this.apiKey) return null;

        const diseaseInfo = this.diseaseCodeMap[pestCode];
        const ncpmsDiseaseCode = diseaseInfo ? diseaseInfo.code : pestCode;
        const results = new Array(12).fill(null);

        const fetchMonth = async (m) => {
            const displayDate = `${year}${String(m).padStart(2, '0')}15`;
            const params = new URLSearchParams({
                apiKey: this.apiKey,
                serviceCode: 'SVC31',
                cropCode: cropCode,
                diseaseWeedCode: ncpmsDiseaseCode,
                displayDate: displayDate
            });
            const url = `${this.baseUrl}?${params.toString()}`;

            // 빠른 단일 시도 (프록시 1개만, 타임아웃 8초)
            try {
                const proxyUrl = this.corsProxies[0] + encodeURIComponent(url);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                const resp = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                const data = await this._parseResponse(resp);
                if (data) {
                    const predictions = this.transformResponse(data);
                    if (predictions && predictions[provinceCode]) {
                        results[m - 1] = {
                            date: `${year}-${String(m).padStart(2, '0')}-15`,
                            month: m,
                            ...predictions[provinceCode]
                        };
                    }
                }
            } catch {
                // 실패 시 null 유지
            }
        };

        // 3개씩 병렬 처리 (프록시 부하 분산)
        for (let i = 0; i < 12; i += 3) {
            await Promise.allSettled([
                fetchMonth(i + 1),
                fetchMonth(Math.min(i + 2, 12)),
                fetchMonth(Math.min(i + 3, 12))
            ]);
        }

        const successCount = results.filter(r => r !== null).length;
        console.log(`[NCPMS API] 월별 시계열: ${successCount}/12개월 수신`);
        return successCount > 0 ? results : null;
    }

    // ─── 날짜 유틸 ────────────────────────────
    getTodayString() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }

    // ─── 병해충 상세정보 조회 (SVC05=병, SVC09=해충) ─
    async fetchPestInfo(pestCode, type = '병해') {
        if (!this.apiKey) return null;

        const serviceCode = type === '병해' ? 'SVC05' : 'SVC09';
        const keyParam = type === '병해' ? 'sickKey' : 'insectKey';
        const diseaseInfo = this.diseaseCodeMap[pestCode];
        const ncpmsCode = diseaseInfo ? diseaseInfo.code : pestCode;

        const params = new URLSearchParams({
            apiKey: this.apiKey,
            serviceCode: serviceCode,
            [keyParam]: ncpmsCode
        });

        const requestUrl = `${this.baseUrl}?${params.toString()}`;
        console.log(`[NCPMS API] 병해충 상세정보 조회: ${serviceCode}, 코드: ${ncpmsCode}`);

        // 직접 → 프록시 순차 시도
        const attempts = [
            () => fetch(requestUrl).then(r => this._parseResponse(r)),
            ...this.corsProxies.map(proxy => () =>
                fetch(proxy + encodeURIComponent(requestUrl)).then(r => this._parseResponse(r))
            )
        ];

        for (const attempt of attempts) {
            try {
                const data = await attempt();
                if (data) {
                    const parsed = this.parsePestInfoResponse(data, type);
                    if (parsed) {
                        console.log(`[NCPMS API] 병해충 상세정보 수신 완료: ${parsed.name}`);
                        return parsed;
                    }
                }
            } catch { continue; }
        }

        console.warn('[NCPMS API] 병해충 상세정보 조회 실패');
        return null;
    }

    // ─── SVC05/SVC09 응답 파싱 → 앱 내부 형식 ──
    parsePestInfoResponse(data, type) {
        if (!data) return null;

        const items = data.items || data.list || [];
        const item = Array.isArray(items) ? items[0] : items;
        if (!item) return null;

        // 병해 (SVC05) 필드
        if (type === '병해') {
            return {
                name: item.sickNameKor || item.sickNm || item.cropName || '',
                nameEn: item.sickNameEng || item.sickNmEng || '',
                cropName: item.cropName || item.kncrNm || '',
                summary: item.stleInfo || item.sickDtl || '',
                symptoms: item.symptoms || item.symptm || item.sickDc || '',
                conditions: item.developmentCondition || item.occrrEnvt || item.devlopCnd || '',
                prevention: item.preventionMethod || item.preventnMth || item.prventMth || '',
                infectionRoute: item.infectionRoute || item.infctRt || '',
                pathogen: item.pathogenName || item.pthmOrgnm || '',
                images: this._extractImages(item),
                _source: 'api'
            };
        }

        // 충해 (SVC09) 필드
        return {
            name: item.insectNameKor || item.insectNm || item.pstNm || '',
            nameEn: item.insectNameEng || item.insectNmEng || '',
            cropName: item.cropName || item.kncrNm || '',
            summary: item.stleInfo || item.eclgyInfo || '',
            symptoms: item.symptoms || item.dmgInfo || item.symptm || '',
            conditions: item.developmentCondition || item.occrrEnvt || item.devlopCnd || '',
            prevention: item.preventionMethod || item.preventnMth || item.prventMth || '',
            biologyInfo: item.biologyInfo || item.eclgyInfo || '',
            images: this._extractImages(item),
            _source: 'api'
        };
    }

    // 이미지 URL 추출
    _extractImages(item) {
        const images = [];
        // imageList 또는 개별 image 필드
        if (item.imageList) {
            const list = Array.isArray(item.imageList) ? item.imageList : [item.imageList];
            list.forEach(img => {
                const url = img.imagePath || img.imgUrl || img.image || img;
                if (typeof url === 'string' && url.startsWith('http')) images.push(url);
            });
        }
        // 개별 이미지 필드
        for (let i = 1; i <= 5; i++) {
            const url = item[`image${i}`] || item[`img${i}`] || item[`imgUrl${i}`];
            if (url && typeof url === 'string' && url.startsWith('http')) images.push(url);
        }
        return images;
    }

    // ─── 주소 좌표 → 가장 가까운 시/도 찾기 ──────
    findNearestProvince(lon, lat) {
        let nearest = null;
        let minDist = Infinity;

        PROVINCES.forEach(p => {
            const dx = p.center[0] - lon;
            const dy = p.center[1] - lat;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearest = p;
            }
        });

        return nearest;
    }

    // ─── 디버그: 마지막 응답 확인 ──────────────
    getLastResponse() {
        return {
            parsed: this.lastResponse,
            raw: this.lastRawResponse
        };
    }

    // ─── 예찰 조사 목록 조회 (SVC51) ─────────────
    async fetchSurveyList(cropCode) {
        if (!this.apiKey) return [];

        const params = new URLSearchParams({
            apiKey: this.apiKey,
            serviceCode: 'SVC51',
            displayCount: '100',
        });
        if (cropCode) params.set('kncrCode', cropCode);

        const url = `api/proxy_ncpms.php?${params.toString()}`;
        console.log('[NCPMS] SVC51 요청:', url);
        try {
            const resp = await fetch(url);
            const text = await resp.text();
            console.log('[NCPMS] SVC51 응답 길이:', text.length, '앞부분:', text.slice(0, 100));
            let data;
            try { data = JSON.parse(text); } catch { console.warn('[NCPMS] SVC51 JSON 파싱 실패:', text.slice(0, 200)); return []; }
            let list = data?.service?.list || [];
            if (!Array.isArray(list)) list = [list];
            console.log(`[NCPMS] SVC51 응답: ${list.length}건`);
            return list.map(item => ({
                key: item.insectKey,
                cropCode: item.kncrCode,
                cropName: decodeURIComponent(item.kncrNm || ''),
                surveyType: decodeURIComponent(item.examinSpchcknNm || ''),
                surveyDate: item.inputStdrDatetm,
                round: item.examinTmrd,
                year: item.examinYear,
            }));
        } catch (err) {
            console.warn('[NCPMS] SVC51 조회 실패:', err.message);
            return [];
        }
    }

    // ─── 예찰 상세 결과 조회 (SVC52) ─────────────
    async fetchSurveyDetail(insectKey) {
        if (!this.apiKey || !insectKey) return null;

        const params = new URLSearchParams({
            apiKey: this.apiKey,
            serviceCode: 'SVC52',
            insectKey: insectKey,
        });

        const url = `api/proxy_ncpms.php?${params.toString()}`;
        try {
            const resp = await fetch(url);
            const data = await resp.json();
            const svc = data?.service || {};
            const items = svc.structList || [];

            const result = {
                cropCode: svc.kncrCode,
                cropName: decodeURIComponent(svc.kncrNm || ''),
                surveyDate: svc.inputStdrDatetm,
                surveyType: decodeURIComponent(svc.examinSpchcknNm || ''),
                year: svc.examinYear,
                round: svc.examinTmrd,
                regions: {},
            };

            items.forEach(item => {
                const sidoCode = String(item.sidoCode);
                const sidoName = decodeURIComponent(item.sidoNm || '');
                const pestName = decodeURIComponent(item.dbyhsNm || '');
                const metric = item.inqireCnClCode;
                const value = item.inqireValue || 0;

                if (!result.regions[sidoCode]) {
                    result.regions[sidoCode] = { name: sidoName, pests: {} };
                }
                if (!result.regions[sidoCode].pests[pestName]) {
                    result.regions[sidoCode].pests[pestName] = {};
                }

                const metricMap = {
                    'SF0001': 'area', 'SF0002': 'lossRate', 'SF0003': 'damageRate', 'SF0004': 'areaRate',
                    'SF0005': 'area', 'SF0006': 'lossRate', 'SF0007': 'damageRate', 'SF0008': 'areaRate',
                };
                const fieldName = metricMap[metric] || metric;
                result.regions[sidoCode].pests[pestName][fieldName] = value;
            });

            return result;
        } catch (err) {
            console.warn('[NCPMS] SVC52 조회 실패:', err.message);
            return null;
        }
    }
}

// 전역 인스턴스
const ncpmsApi = new NcpmsApi();

// ═══════════════════════════════════════════════
// NASA POWER API - 일사량 / 강수량 데이터
// https://power.larc.nasa.gov/docs/services/api/
// ═══════════════════════════════════════════════
class NasaPowerApi {
    constructor() {
        this.baseUrl = 'https://power.larc.nasa.gov/api/temporal/daily/point';
        this._cache = {};
    }

    /**
     * 년간 일사량·강수량 데이터 조회
     * @param {number} year - 조회 연도
     * @param {number} lon - 경도
     * @param {number} lat - 위도
     * @returns {Promise<{labels, dates, solarData, precipData}|null>}
     */
    async fetchYearlyData(year, lon, lat) {
        const cacheKey = `${year}_${lon.toFixed(1)}_${lat.toFixed(1)}`;
        if (this._cache[cacheKey]) return this._cache[cacheKey];

        // NASA POWER는 현재년도 NRT 데이터까지 지원하나 미래 날짜는 없음
        // 과거~올해 초까지 요청, 올해 이후는 작년 데이터 활용
        const now = new Date();
        const dataYear = (year > now.getFullYear()) ? now.getFullYear() - 1 : year;
        const startDate = `${dataYear}0101`;
        const endDate = `${dataYear}1231`;

        const url = `${this.baseUrl}?parameters=ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=AG&longitude=${lon.toFixed(2)}&latitude=${lat.toFixed(2)}&start=${startDate}&end=${endDate}&format=JSON`;

        console.log(`[NASA POWER] 요청: ${dataYear}년, lon=${lon.toFixed(2)}, lat=${lat.toFixed(2)}`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();

            const result = this._parseResponse(json, dataYear);
            if (result) {
                this._cache[cacheKey] = result;
                console.log(`[NASA POWER] 데이터 수신: ${result.solarData.length}개 포인트`);
            }
            return result;
        } catch (err) {
            console.warn('[NASA POWER] API 조회 실패:', err.message);
            return null;
        }
    }

    _parseResponse(json, year) {
        if (!json || !json.properties) return null;

        const solar = json.properties.parameter?.ALLSKY_SFC_SW_DWN
                    || json.properties.ALLSKY_SFC_SW_DWN
                    || json.properties.parameter?.['ALLSKY_SFC_SW_DWN'];
        const precip = json.properties.parameter?.PRECTOTCORR
                     || json.properties.PRECTOTCORR
                     || json.properties.parameter?.['PRECTOTCORR'];

        if (!solar || !precip) return null;

        // 24개 bi-weekly 포인트로 집계 (기존 차트와 동일 간격)
        const labels = [];
        const dates = [];
        const solarData = [];
        const precipData = [];
        const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

        for (let m = 0; m < 12; m++) {
            for (let half = 0; half < 2; half++) {
                const startDay = half === 0 ? 1 : 16;
                const endDay = half === 0 ? 15 : new Date(year, m + 1, 0).getDate();
                const midDay = half === 0 ? 8 : 23;

                labels.push(half === 0 ? monthNames[m] : '');
                dates.push(`${year}-${String(m + 1).padStart(2, '0')}-${String(midDay).padStart(2, '0')}`);

                // 반월 평균 집계
                let solarSum = 0, precipSum = 0, count = 0;
                for (let d = startDay; d <= endDay; d++) {
                    const key = `${year}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
                    const sv = solar[key];
                    const pv = precip[key];
                    if (sv !== undefined && sv >= 0 && pv !== undefined && pv >= 0) {
                        solarSum += sv;
                        precipSum += pv;
                        count++;
                    }
                }

                solarData.push(count > 0 ? parseFloat((solarSum / count).toFixed(2)) : 0);
                precipData.push(count > 0 ? parseFloat((precipSum / count).toFixed(2)) : 0);
            }
        }

        return { labels, dates, solarData, precipData };
    }
}

// 전역 인스턴스
const nasaPowerApi = new NasaPowerApi();
