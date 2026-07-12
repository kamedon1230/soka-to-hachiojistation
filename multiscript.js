"use strict";
// ==========================================
// 1. 型定義 (Types & Interfaces)
// ==========================================
// 建物から各門への通常徒歩時間（分） [正門, 創大門, 栄光門]
const WALKING_DATA_MAP = {
    "中央教育棟": [10, 7, 9],
    "本部棟": [15, 9, 4],
    "教育学部棟": [4, 10, 13],
    "理工学部棟": [1, 15, 15],
    "看護学部棟": [12, 8, 5],
    "学生センター": [8, 5, 10]
};
const TIMETABLE_VERSION = "20260626";
// ==========================================
// 2. UI・イベント層 (Presentation)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('searchForm');
    const locationSelect = document.getElementById('locationSelect');
    const periodSelect = document.getElementById('periodSelect');
    const speedSelect = document.getElementById('speedSelect');
    const stationToggle = document.getElementById('stationToggle');
    const stationToggleInfo = document.getElementById('stationToggleInfo');
    const resultsArea = document.getElementById('resultsArea');
    const recommendRouteCard = document.getElementById('recommendRouteCard');
    const otherRoutesList = document.getElementById('otherRoutesList');
    // 1️⃣ 【状態の復元】ページを開いた時にローカルストレージから前回値を復元する
    restoreSavedState();
    // 駅名タップ切り替えイベント (advance用、通常ページに要素がなければスキップされる)
    stationToggle.addEventListener('click', () => {
        const currentDest = stationToggle.getAttribute('data-destination');
        let nextDest;
        if (currentDest === 'JR') {
            nextDest = 'Keio';
            stationToggle.setAttribute('data-destination', 'Keio');
            stationToggle.textContent = '京王八王子駅';
            stationToggleInfo.textContent = 'JR八王子駅';
        }
        else {
            nextDest = 'JR';
            stationToggle.setAttribute('data-destination', 'JR');
            stationToggle.textContent = 'JR八王子駅';
            stationToggleInfo.textContent = '京王八王子駅';
        }
        localStorage.setItem('bus_nav_last_destination', nextDest);
        // すでに検索結果が出ていれば自動で再検索
        if (!resultsArea.classList.contains('is-hidden')) {
            searchForm.requestSubmit();
        }
    });
    locationSelect?.addEventListener('change', () => {
        localStorage.setItem('bus_nav_last_building', locationSelect.value);
    });
    speedSelect?.addEventListener('change', () => {
        localStorage.setItem('bus_nav_last_speed', speedSelect.value);
    });
    // フォーム送信イベント
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const building = locationSelect.value;
        const period = periodSelect.value;
        const destination = stationToggle.getAttribute('data-destination');
        const speedFactor = parseFloat(speedSelect.value);
        const baseWalkTimes = WALKING_DATA_MAP[building];
        if (!baseWalkTimes)
            throw new Error(`undefined ${building}`);
        try {
            const limit = 4;
            // 司令塔関数を呼び出して探索を実行
            const { routes, isNextDay } = await searchRoutesWorkflow(period, baseWalkTimes, destination, speedFactor, limit);
            // 画面に描画
            renderAllRoutes(routes, building, destination === 'JR' ? "JR八王子駅北口" : "京王八王子駅", isNextDay);
        }
        catch (err) {
            console.error('ルート検索中にエラーが発生しました:', err);
        }
    });
    if (locationSelect.value) {
        searchForm.requestSubmit();
    }
    /** ローカルストレージから前回の選択状態を復元する関数 */
    function restoreSavedState() {
        // ① 現在地（建物）の復元
        const savedBuilding = localStorage.getItem('bus_nav_last_building');
        if (savedBuilding && locationSelect) {
            locationSelect.value = savedBuilding;
        }
        // ② 歩くペースの復元
        const savedSpeed = localStorage.getItem('bus_nav_last_speed');
        if (savedSpeed && speedSelect) {
            speedSelect.value = savedSpeed;
        }
        // ③ 行き先（駅名）の復元
        const savedDestination = localStorage.getItem('bus_nav_last_destination');
        if (savedDestination && stationToggle) {
            stationToggle.setAttribute('data-destination', savedDestination);
            if (savedDestination === 'Keio') {
                stationToggle.textContent = '京王八王子駅';
                stationToggleInfo.textContent = 'JR八王子駅';
                // 前回のCSS設定（data-destination="Keio"の時に色を変える等）がここでも自動適用されます
            }
            else {
                stationToggle.textContent = 'JR八王子駅';
                stationToggleInfo.textContent = '京王八王子駅';
            }
        }
    }
    function renderAllRoutes(data, from, to, isNextDay) {
        if (!resultsArea || !recommendRouteCard || !otherRoutesList)
            return;
        resultsArea.classList.remove('is-hidden');
        const recommend = data[0];
        if (recommend) {
            const msgText = isNextDay ? "始発ルートをご案内しています。" : "✓ このルートが最短で到着できます。";
            const cardClass = isNextDay ? "recommend-card next-day" : "recommend-card";
            let timelineHtml = `
        <div class="${cardClass}">
          <div class="recommend-meta">
            <div class="meta-item"><span class="meta-label">⏱ 所要時間</span><span class="meta-value">${recommend.totalDurationMinutes}分</span></div>
            <div class="meta-item"><span class="meta-label">🚶‍♂️ 徒歩時間</span><span class="meta-value">${recommend.walkTimeMinutes}分</span></div>
            <div class="meta-item alert-item"><span class="meta-label">🚪 建物出発期限</span><span class="meta-value">${toHourString(recommend.buildingLeaveDeadline)} まで</span></div>
          </div>
          <div class="route-timeline">
            <div class="timeline-node"><span class="node-time">${toHourString(recommend.buildingLeaveDeadline)}</span><span class="node-name">${from}</span></div>
            <div class="timeline-link">徒歩 ${recommend.walkTimeMinutes}分</div>
            <div class="timeline-node"><span class="node-time">${toHourString(recommend.busDepartureTime)}</span><span class="node-name">${recommend.busStopName}</span></div>
            <div class="timeline-link"><span class="via-badge">${recommend.busRouteName}</span>
            <span class="departure-time-text">${toHourString(recommend.busDepartureTime)} 発</span> (バス乗車)</div>`;
            if (recommend.afterBusWalkTimeMinutes > 0) {
                // JR止まり ➔ 京王まで歩くルートの場合
                const busArrivalSeconds = recommend.destinationArrivalTime - (recommend.afterBusWalkTimeMinutes * 60);
                timelineHtml += `
            <div class="timeline-node">
            <span class="node-time">${toHourString(busArrivalSeconds)}</span>
            <span class="node-name">JR八王子駅北口 (降車)</span>
            </div>
            <div class="timeline-link" style="font-weight: bold;">🚶‍♂️ 駅間徒歩 ${recommend.afterBusWalkTimeMinutes}分</div>
                <div class="timeline-node">
                <span class="node-time">${toHourString(recommend.destinationArrivalTime)}</span>
                <span class="node-name" style="color: #dd0077; font-weight: bold;">${to}</span>
                </div>
                `;
            }
            else {
                // バスが直接目的地（JR or 京王）に到着する場合
                timelineHtml += `
                <div class="timeline-node">
                <span class="node-time">${toHourString(recommend.destinationArrivalTime)}</span>
                <span class="node-name">${to}</span>
                </div>
                `;
            }
            timelineHtml += `
            </div>
            <div class="recommend-msg">${msgText}</div>
            </div>
            `;
            recommendRouteCard.innerHTML = timelineHtml;
        }
        otherRoutesList.innerHTML = '';
        const others = data.slice(1);
        if (others && others.length > 0) {
            others.forEach(route => {
                const row = document.createElement('div');
                row.className = 'other-route-row';
                // 🎯 降車後の徒歩（駅間徒歩）があるかどうかで、到着までのフローを切り替える
                let arrivalFlowHtml = '';
                if (route.afterBusWalkTimeMinutes > 0) {
                    // JRでバスを降りる時間（最終到着から5分引き算）
                    const jrArrivalSeconds = route.destinationArrivalTime - (route.afterBusWalkTimeMinutes * 60);
                    arrivalFlowHtml = `
            ${toHourString(jrArrivalSeconds)}着(JR) 
            <span class="other-walk-arrow">➔</span> 
            <span class="other-walk-text">🚶‍♂️${route.afterBusWalkTimeMinutes}分</span> 
            <span class="other-walk-arrow">➔</span> 
            <span class="dest-keio-time">${toHourString(route.destinationArrivalTime)}着</span>
          `;
                }
                else {
                    // 通常どおり直接駅に着く場合
                    arrivalFlowHtml = `${toHourString(route.destinationArrivalTime)}着`;
                }
                row.innerHTML = `
          <div class="other-route-main">
            <span class="other-bus-stop">${route.busStopName}</span>
            <span class="other-flow">
              ${toHourString(route.buildingLeaveDeadline)} 徒歩 ${route.walkTimeMinutes}分 &rarr; 
              <span class="other-via">[${route.busRouteName}]</span> ${toHourString(route.busDepartureTime)}発 &rarr; 
              ${arrivalFlowHtml}
            </span>
          </div>
          <div class="other-route-side">
            <span class="side-badge">所要時間 ${route.totalDurationMinutes}分</span>
          </div>
        `;
                otherRoutesList.appendChild(row);
            });
        }
        else {
            otherRoutesList.innerHTML = '<p class="placeholder-text">その他のルートはありません。</p>';
        }
        resultsArea.scrollIntoView({ behavior: 'smooth' });
    }
});
// ==========================================
// 3. アプリケーション・調整層 (Application)
// ==========================================
/** 選択された条件から基準となる時間（秒）と曜日インデックスを算出する */
function calculateSearchTimeAndDay(period) {
    let dayIndex = new Date().getDay(); // 0:日 〜 6:土
    switch (period) {
        case "1限終わり": return { baseSeconds: 10 * 3600 + 30 * 60, dayIndex }; // 10:30
        case "2限終わり": return { baseSeconds: 12 * 3600 + 15 * 60, dayIndex }; // 12:15
        case "3限終わり": return { baseSeconds: 14 * 3600 + 35 * 60, dayIndex }; // 14:35
        case "4限終わり": return { baseSeconds: 16 * 3600 + 20 * 60, dayIndex }; // 16:20
        case "5限終わり": return { baseSeconds: 18 * 3600 + 5 * 60, dayIndex }; // 18:05
        default: {
            // 「現在時刻」選択時
            const now = new Date();
            let currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            // 💡 深夜バス（0時〜4時前）の巻き戻し補正
            if (currentSeconds < 4 * 3600) {
                currentSeconds += 24 * 3600; // 24時間分の秒数を加算 (25時、26時...)
                dayIndex = (dayIndex + 6) % 7; // 曜日を前日に戻す
            }
            return { baseSeconds: currentSeconds, dayIndex };
        }
    }
}
/** 探索の全体の流れを管理する（空なら翌日始発へフォールバックする司令塔） */
async function searchRoutesWorkflow(period, baseWalkTimes, destination, speedFactor, limit) {
    // 1. 検索条件となる時間と曜日を計算
    const { baseSeconds, dayIndex } = calculateSearchTimeAndDay(period);
    // 2. まずは指定日の条件でバスを検索
    let routes = await findAvailableBusRoutes(baseSeconds, baseWalkTimes, dayIndex, destination, speedFactor, limit);
    let isNextDay = false;
    // 💡 スマートな空チェック：該当するバスが1件もない（終バス終了後）
    if (routes.length === 0) {
        const nextDayIndex = (dayIndex + 1) % 7; // 翌日に進める
        const nextDayMidnight = 0; // 翌朝の0時（始発から検索）
        routes = await findAvailableBusRoutes(nextDayMidnight, baseWalkTimes, nextDayIndex, destination, speedFactor, limit);
        isNextDay = true;
    }
    return { routes, isNextDay };
}
// ==========================================
// 4. ドメイン・探索ロジック層 (Domain)
// ==========================================
/** 条件に一致するバスルートを時刻表から純粋に探索する */
async function findAvailableBusRoutes(searchSeconds, baseWalkTimes, targetDayIndex, destination, speedFactor, limit) {
    const timetable = await loadTimetable();
    const walkSecondsSeimon = baseWalkTimes[0] * 60 * speedFactor;
    const walkSecondsSoudaimon = baseWalkTimes[1] * 60 * speedFactor;
    const walkSecondsEikoumon = baseWalkTimes[2] * 60 * speedFactor;
    // 曜日フラグチェック用のインデックス
    const filteredBuses = timetable.filter(bus => bus[targetDayIndex + 6] === 1 && (bus[1] >= searchSeconds));
    const matchedRoutes = [];
    for (const bus of filteredBuses) {
        let destinationArrivalTime = 0;
        let afterBusWalkTimeMinutes = 0;
        // 🎯 【新ロジック】行き先とバスの系統に応じた到着時刻・追加徒歩の判定
        if (destination === 'JR') {
            destinationArrivalTime = bus[1];
            afterBusWalkTimeMinutes = 0;
        }
        else {
            // 行き先が京王八王子のとき
            if (bus[2]) {
                // 京王八王子まで直接行くバスの場合
                destinationArrivalTime = bus[2];
                afterBusWalkTimeMinutes = 0;
            }
            else if (bus[1]) {
                // JR止まり（直通など）だけど、JRから京王まで5分歩くルートとして救済する場合
                destinationArrivalTime = bus[1] + 5 * 60; // JR着時刻に5分（300秒）足す
                afterBusWalkTimeMinutes = 5; // 降車後徒歩5分
            }
            else {
                continue; // どちらの駅にも行かないデータならスキップ
            }
        }
        // 検索時刻より前に駅に着いてしまうバスはスキップ
        if (destinationArrivalTime < searchSeconds)
            continue;
        let bestRouteForThisBus = null;
        let latestPossibleLeaveTime = searchSeconds;
        // 各門のデッドライン検証マクロ関数（共通化してスッキリさせてもOK）
        // 例として「正門」の処理。他2つの門も同様に destinationArrivalTime と afterBusWalkTimeMinutes を使用します
        if (bus[3] && (bus[3] - walkSecondsSeimon >= latestPossibleLeaveTime)) {
            bestRouteForThisBus = {
                busStopName: "創価大学正門東京富士美術館",
                busDepartureTime: bus[3],
                buildingLeaveDeadline: bus[3] - walkSecondsSeimon,
                walkTimeMinutes: Math.round(baseWalkTimes[0] * speedFactor),
                afterBusWalkTimeMinutes: afterBusWalkTimeMinutes, // 👈 ★ここで格納
                // 総所要時間の計算に「最終駅到着時刻」を使うので、駅間徒歩5分も自動で加算される！
                totalDurationMinutes: Math.round((destinationArrivalTime - (bus[3] - walkSecondsSeimon)) / 60),
                busRouteName: getBusRouteName(bus[0]),
                destinationArrivalTime: destinationArrivalTime
            };
            latestPossibleLeaveTime = bus[3] - walkSecondsSeimon;
        }
        /* --- (創大門(bus[4])、栄光門(bus[5]) も上記と同様に修正) --- */
        if (bus[4] && (bus[4] - walkSecondsSoudaimon >= latestPossibleLeaveTime)) {
            bestRouteForThisBus = {
                busStopName: "創価大学創大門",
                busDepartureTime: bus[4],
                buildingLeaveDeadline: bus[4] - walkSecondsSoudaimon,
                walkTimeMinutes: Math.round(baseWalkTimes[1] * speedFactor),
                afterBusWalkTimeMinutes: afterBusWalkTimeMinutes,
                totalDurationMinutes: Math.round((destinationArrivalTime - (bus[4] - walkSecondsSoudaimon)) / 60),
                busRouteName: getBusRouteName(bus[0]),
                destinationArrivalTime: destinationArrivalTime
            };
            latestPossibleLeaveTime = bus[4] - walkSecondsSoudaimon;
        }
        if (bus[5] && (bus[5] - walkSecondsEikoumon >= latestPossibleLeaveTime)) {
            bestRouteForThisBus = {
                busStopName: "創価大学栄光門",
                busDepartureTime: bus[5],
                buildingLeaveDeadline: bus[5] - walkSecondsEikoumon,
                walkTimeMinutes: Math.round(baseWalkTimes[2] * speedFactor),
                afterBusWalkTimeMinutes: afterBusWalkTimeMinutes,
                totalDurationMinutes: Math.round((destinationArrivalTime - (bus[5] - walkSecondsEikoumon)) / 60),
                busRouteName: getBusRouteName(bus[0]),
                destinationArrivalTime: destinationArrivalTime
            };
            latestPossibleLeaveTime = bus[5] - walkSecondsEikoumon;
        }
        if (!bestRouteForThisBus)
            continue;
        matchedRoutes.push(bestRouteForThisBus);
        if (matchedRoutes.length >= limit)
            break;
    }
    return matchedRoutes;
}
// ==========================================
// 5. インフラ・データ層 (Infrastructure)
// ==========================================
/** キャッシュ管理を含めて時刻表データをロードする */
async function loadTimetable() {
    const cachedVersion = localStorage.getItem('bus_timetable_version');
    const cachedData = localStorage.getItem('bus_timetable_cache');
    if (cachedVersion === TIMETABLE_VERSION && cachedData) {
        return JSON.parse(cachedData);
    }
    const response = await fetch('./timetable.json');
    const data = await response.json();
    localStorage.setItem('bus_timetable_cache', JSON.stringify(data));
    localStorage.setItem('bus_timetable_version', TIMETABLE_VERSION);
    return data;
}
/** 系統数値IDを表示用の文字列に変換する */
function getBusRouteName(routeType) {
    switch (routeType) {
        case 0: return "直通";
        case 1: return "16号01";
        case 2: return "ひ02";
        case 3: return "ひ04";
        case 4: return "16号06";
        default: throw new Error(`未定義のバス系統IDです: ${routeType}`);
    }
}
/** 秒数を通算分数文字列に丸める（UI用、今回は元のロジックをラップして使用） */
function toHourString(timeInSeconds) {
    const totalMinutes = Math.floor(timeInSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
