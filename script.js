const walkdata = { "中央教育棟": [10, 7, 9], "本部棟": [15, 9, 4], "教育学部棟": [4, 10, 13], "理工学部棟": [1, 15, 15] };
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('searchForm');
    const locationSelect = document.getElementById('locationSelect');
    const periodSelect = document.getElementById('periodSelect');
    const resultsArea = document.getElementById('resultsArea');
    const recommendRouteCard = document.getElementById('recommendRouteCard');
    const otherRoutesList = document.getElementById('otherRoutesList');
    // フォーム送信時のイベント処理
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const building = locationSelect.value;
        const period = periodSelect.value;
        if (building && period) {
            Promise.resolve(fetchRouteData(building, period));
        }
    });
    // fetch()によるバックエンドとの非同期通信
    async function fetchRouteData(building, period) {
        const bu = walkdata[building];
        if (bu === undefined) {
            throw new Error(`undefined ${building}`);
        }
        let time;
        let day = new Date().getDay();
        switch (period) {
            case "1限終わり":time = 37800;break;
            case "2限終わり":time = 44100;break;
            case "3限終わり":time = 52500;break;
            case "4限終わり":time = 58800;break;
            case "5限終わり":time = 65100;break;
            default:
                const n = new Date();
                time = n.getHours() * 3600 + n.getMinutes() * 60;
                if (time < 4*3600) {
                    time +=  24*3600;
                    day = (day+6)%7;
                }
                break;
        }
        try {
            const data = await findbus(time, bu, 4, day);
            renderAllRoutes(data, building, "JR八王子駅北口");
        }
        catch {
            console.error('データの取得に失敗しました');
        }
    }
    // 取得したルートデータを画面に反映させる関数
    function renderAllRoutes(data, from, to) {
        resultsArea.classList.remove('is-hidden');
        // ④ おすすめルートの描画（運賃を削除し、建物出発時刻と経由を追加）
        const recommend = data[0];
        if (recommend) {
            recommendRouteCard.innerHTML = `
        <div class="recommend-card">
          <div class="recommend-meta">
            <div class="meta-item">
              <span class="meta-label">⏱ 所要時間</span>
              <span class="meta-value">${toMinute(recommend.du)}分</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">🚶‍♂️ 徒歩時間</span>
              <span class="meta-value">${recommend.wt}分</span>
            </div>
            <div class="meta-item alert-item">
              <span class="meta-label">🚪 建物出発期限</span>
              <span class="meta-value">${toHourString(recommend.dw)} まで</span>
            </div>
          </div>

          <div class="route-timeline">
            <div class="timeline-node">
              <span class="node-time">${toHourString(recommend.dw)}</span>
              <span class="node-name">${from}</span>
            </div>
            <div class="timeline-link">徒歩 ${recommend.wt}分</div>
            <div class="timeline-node">
              <span class="node-time">${toHourString(recommend.dep)}</span>
              <span class="node-name">${recommend.from}</span>
            </div>
            <div class="timeline-link">
              <span class="via-badge">${recommend.type}</span>
              <span class="departure-time-text">${toHourString(recommend.dep)} 発</span> (バス乗車)
            </div>
            <div class="timeline-node">
              <span class="node-time">${toHourString(recommend.at)}</span>
              <span class="node-name">${to}</span>
            </div>
          </div>

          <div class="recommend-msg">✓ このルートが最短で到着できます。</div>
        </div>
      `;
        }
        // ⑤ その他のルートの描画（運賃を削除し、経由を追加）
        otherRoutesList.innerHTML = '';
        const others = data.slice(1);
        if (others && others.length > 0) {
            others.forEach(route => {
                const row = document.createElement('div');
                row.className = 'other-route-row';
                row.innerHTML = `
          <div class="other-route-main">
            <span class="other-bus-stop">${route.from}</span>
            <span class="other-flow">
              ${toHourString(route.dw)} 徒歩 ${route.wt}分 &rarr; <span class="other-via">[${route.type}]</span> ${toHourString(route.dep)}発 &rarr; ${toHourString(route.at)}着
            </span>
          </div>
          <div class="other-route-side">
            <span class="side-badge">所要時間 ${toMinute(route.du)}分</span>
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
async function loadTimetable() {
    const last_date = localStorage.getItem('data_base');
    const date = 20260626;
    const cachedData = localStorage.getItem('bus_timetable_cache');
    if (last_date === date && cachedData) {
        return JSON.parse(cachedData);
    }
    // 2. キャッシュがなければ、初めてGitHub PagesからJSONを取得する
    const response = await fetch('./timetable.json');
    const data = await response.json();
    localStorage.setItem('bus_timetable_cache', JSON.stringify(data));
    localStorage.setItem('data_base',date);
    return data;
}

function ttn(bustype) {
    switch (bustype) {
        case 0:
            return "直通";
        case 1:
            return "16号01";
        case 2:
            return "ひ02";
        case 3:
            return "ひ04";
        case 4:
            return "16号06";
        default:
            throw new Error(`unkown bustype:${bustype}`);
    }
}
async function findbus(time, from, limit, days) {
    const db = await loadTimetable();
    const r1 = db.filter(bus => bus[days + 5] && (bus[1] >= time));
    const r2 = [];
    let best;
    for (const bus of r1) {
        let besttime = time;
        if (bus[2] && (bus[2] - from[0] * 60 >= besttime)) {
            best = { from: "創価大学正門東京富士美術館", dep: bus[2], dw: bus[2] - from[0] * 60, wt: from[0], du: (bus[1] - bus[2] + from[0] * 60), type: ttn(bus[0]), at: bus[1] };
            besttime = bus[2] - from[0];
        }
        if (bus[3] && (bus[3] - from[1] * 60 >= besttime)) {
            best = { from: "創価大学創大門", dep: bus[3], dw: bus[3] - from[1] * 60, wt: from[1], du: (bus[1] - bus[3] + from[1] * 60), type: ttn(bus[0]), at: bus[1] };
            besttime = bus[3] - from[1];
        }
        if (bus[4] && (bus[4] - from[2] * 60 >= besttime)) {
            best = { from: "創価大学栄光門", dep: bus[4], dw: bus[4] - from[2] * 60, wt: from[2], du: (bus[1] - bus[4] + from[2] * 60), type: ttn(bus[0]), at: bus[1] };
            besttime = bus[4] - from[2];
        }
        if (!best) {
            continue;
        }
        r2.push(best);
        if (r2.length >= limit) {
            break;
        }
    }
    return r2;
}
function toMinute(time) {
    return `${Math.round(time / 60)}`;
}
function toHourString(time) {
    minute = Math.floor(time / 60);
    return `${(Math.floor(minute / 60)).toString().padStart(2,"0")}:${(minute % 60).toString().padStart(2,"0")}`;
}