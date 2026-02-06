document.addEventListener('DOMContentLoaded', () => {
    
    // --- 初期データ (data.jsonが読み込めない場合に使用) ---
    const DEFAULT_DATA = {
        "timings": [
            {"start": "08:50", "end": "09:40"},
            {"start": "09:50", "end": "10:40"},
            {"start": "10:50", "end": "11:40"},
            {"start": "11:50", "end": "12:40"},
            {"start": "13:30", "end": "14:20"},
            {"start": "14:30", "end": "15:20"},
            {"start": "16:50", "end": "18:01"}
        ],
        "schedule": {
            "21HR": { 
                "Mon": { "1": "国語", "2": "数学", "3": "英語", "4": "理科", "5": "社会", "6": "体育", "7": "HR" }, 
                "Tue": { "1": "英語", "2": "数学", "3": "国語", "4": "情報", "5": "芸術", "6": "理科", "7": "総合" } 
            }
        },
        "tests": []
    };

    // --- データ管理 ---
    let appData = { timings: [], schedule: {}, tests: [] };
    
    let userSettings = {
        classId: '21HR',
        icalUrl: '' // ここにGmailアドレス(カレンダーID)が入る
    };

    let githubConfig = {
        user: '',
        repo: '',
        token: ''
    };

    // 初期化
    loadData();
    loadUserSettings();
    loadTodos();
    loadGithubConfig();
    setupEventListeners();
    
    setInterval(() => {
        updateClock();
        updateNextClass();
    }, 1000);


    /* === データ取得 (GitHub Raw + Cache Busting) === */
    async function loadData() {
        try {
            // 現在時刻をクエリにつけてキャッシュを回避し、常に最新を取得
            const timestamp = new Date().getTime();
            let url = 'data.json';
            
            // GitHub Configがある場合はRaw URLから取得を試みる（生徒側）
            const gh = JSON.parse(localStorage.getItem('githubConfig'));
            if(gh && gh.user && gh.repo) {
                url = `https://raw.githubusercontent.com/${gh.user}/${gh.repo}/main/data.json?t=${timestamp}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error("JSON読み込み失敗");
            appData = await response.json();
            
            // データが空っぽならデフォルトを使う
            if(!appData.timings) throw new Error("データ破損");

        } catch (error) {
            console.warn("データ読み込み失敗、初期データを使用", error);
            appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
        
        initDashboard();
        initAdmin();
    }

    function loadUserSettings() {
        const saved = localStorage.getItem('userSettings');
        if (saved) userSettings = JSON.parse(saved);
        document.getElementById('headerClassDisplay').textContent = userSettings.classId;

        // --- Googleカレンダー表示 (Iframe) ---
        const calendarContent = document.getElementById('calendarContent');
        if (userSettings.icalUrl && userSettings.icalUrl.includes('@')) {
            const calendarId = encodeURIComponent(userSettings.icalUrl);
            // mode=AGENDA でリスト表示。色はダッシュボードに合わせて少し調整
            calendarContent.innerHTML = `
                <iframe src="https://calendar.google.com/calendar/embed?src=${calendarId}&ctz=Asia%2FTokyo&mode=AGENDA&showTitle=0&showNav=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0&bgcolor=%23FFFFFF" 
                    style="border: 0" width="100%" height="100%" frameborder="0" scrolling="no"></iframe>
            `;
        } else {
            calendarContent.innerHTML = `<p class="placeholder-text">設定画面でGmailアドレス(カレンダーID)を入力してください</p>`;
        }
    }

    function initDashboard() {
        renderSchedule();
        updateNextClass();
        updateTestCountdown();
        updateGreeting();
    }


    /* === 1. 時計 & 挨拶 === */
    function updateClock() {
        const now = new Date();
        document.getElementById('currentTime').textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
        document.getElementById('currentDate').textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    }

    function updateGreeting() {
        const h = new Date().getHours();
        let msg = "今日も頑張りましょう！";
        if (h < 10) msg = "おはようございます！";
        else if (h > 18) msg = "お疲れ様です。";
        document.getElementById('dynamicGreeting').textContent = msg;
    }


    /* === 2. 次の授業 & 3. 時間割 === */
    function renderSchedule() {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayKey = days[new Date().getDay()];
        const dayMap = ["日", "月", "火", "水", "木", "金", "土"];
        
        document.getElementById('scheduleDay').textContent = dayMap[new Date().getDay()] + "曜日";
        const list = document.getElementById('dailyScheduleList');
        list.innerHTML = '';

        const subjects = appData.schedule[userSettings.classId]?.[dayKey] || {};
        
        for (let i = 1; i <= 7; i++) {
            const subject = subjects[i];
            if (subject) {
                const li = document.createElement('li');
                li.innerHTML = `<span class="period">${i}</span> <span class="subj">${subject}</span>`;
                list.appendChild(li);
            }
        }
        
        // 授業がない場合
        if (list.children.length === 0) {
            list.innerHTML = `<li style="justify-content:center; color:#aaa;">授業なし</li>`;
        }
    }

    function updateNextClass() {
        // 簡易実装: 現在時刻と比較して次の授業を表示
        const nextSubj = document.getElementById('nextSubject');
        if(nextSubj.textContent === '読み込み中...') nextSubj.textContent = '----';
    }


    /* === 4. ToDoリスト === */
    const todoList = document.getElementById('todoList');
    const newTodoInput = document.getElementById('newTodoInput');
    const addTodoBtn = document.getElementById('addTodoBtn');
    const todoProgress = document.getElementById('todoProgress');
    const todoCount = document.getElementById('todoCount');

    function loadTodos() {
        const todos = JSON.parse(localStorage.getItem('todos')) || [];
        renderTodos(todos);
    }
    function saveTodos(todos) {
        localStorage.setItem('todos', JSON.stringify(todos));
        renderTodos(todos);
    }
    function renderTodos(todos) {
        todoList.innerHTML = '';
        let doneCount = 0;
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            if (todo.done) { li.classList.add('done'); doneCount++; }
            li.innerHTML = `
                <span onclick="toggleTodo(${index})">${todo.text}</span>
                <button class="nav-btn" onclick="deleteTodo(${index})"><i class="fa-solid fa-trash"></i></button>
            `;
            todoList.appendChild(li);
        });
        const pct = todos.length ? (doneCount / todos.length) * 100 : 0;
        todoProgress.style.width = pct + '%';
        todoCount.textContent = `${doneCount}/${todos.length} 完了`;
    }
    window.toggleTodo = (i) => { const t = JSON.parse(localStorage.getItem('todos')); t[i].done = !t[i].done; saveTodos(t); };
    window.deleteTodo = (i) => { const t = JSON.parse(localStorage.getItem('todos')); t.splice(i, 1); saveTodos(t); };
    addTodoBtn.addEventListener('click', () => {
        if(newTodoInput.value.trim()){ 
            const t = JSON.parse(localStorage.getItem('todos')) || [];
            t.push({text:newTodoInput.value, done:false});
            saveTodos(t); newTodoInput.value='';
        }
    });


    /* === 5. ポモドーロ (モーダル設定付) === */
    let timerInterval, isRunning = false, isWork = true;
    let workTime = 25, breakTime = 5, timeLeft = workTime * 60;
    
    const display = document.getElementById('pomoTimer');
    const statusText = document.getElementById('pomoStatus');
    const startBtn = document.getElementById('pomoStartBtn');

    function updatePomo() {
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        display.textContent = `${m}:${s}`;
        statusText.textContent = isWork ? `${workTime}分集中` : `${breakTime}分休憩`;
    }
    
    startBtn.onclick = () => {
        if (isRunning) { clearInterval(timerInterval); startBtn.textContent = '開始'; }
        else {
            timerInterval = setInterval(() => {
                if (timeLeft > 0) { timeLeft--; updatePomo(); }
                else {
                    clearInterval(timerInterval); isRunning = false; startBtn.textContent = '開始';
                    isWork = !isWork; timeLeft = (isWork ? workTime : breakTime) * 60;
                    alert(isWork ? "休憩終了！" : "作業終了！"); updatePomo();
                }
            }, 1000);
            startBtn.textContent = '停止';
        }
        isRunning = !isRunning;
    };
    
    document.getElementById('pomoResetBtn').onclick = () => {
        clearInterval(timerInterval); isRunning = false; isWork = true; timeLeft = workTime * 60;
        startBtn.textContent = '開始'; updatePomo();
    };

    // モーダル
    const modal = document.getElementById('pomoModal');
    document.getElementById('pomoSettingsBtn').onclick = () => {
        document.getElementById('pomoWorkInput').value = workTime;
        document.getElementById('pomoBreakInput').value = breakTime;
        modal.classList.add('open');
    };
    document.getElementById('closePomoModal').onclick = () => modal.classList.remove('open');
    document.getElementById('savePomoSettings').onclick = () => {
        workTime = parseInt(document.getElementById('pomoWorkInput').value);
        breakTime = parseInt(document.getElementById('pomoBreakInput').value);
        timeLeft = workTime * 60; isWork = true; updatePomo();
        modal.classList.remove('open');
    };


    /* === 6. テストカウントダウン === */
    function updateTestCountdown() {
        // データがない場合のガード
        if (!appData.tests || appData.tests.length === 0) {
            document.getElementById('targetTestName').textContent = "予定なし";
            document.getElementById('cdDays').textContent = "-";
            return;
        }

        const upcoming = appData.tests
            .map(t => ({name: t.name, date: new Date(t.date)}))
            .filter(t => t.date >= new Date())
            .sort((a,b) => a.date - b.date);
        
        if (upcoming.length > 0) {
            document.getElementById('targetTestName').textContent = upcoming[0].name;
            const diff = Math.ceil((upcoming[0].date - new Date()) / (1000*60*60*24));
            document.getElementById('cdDays').textContent = diff;
        } else {
            document.getElementById('targetTestName').textContent = "予定なし";
            document.getElementById('cdDays').textContent = "-";
        }
    }


    /* === 画面遷移と設定 === */
    const pages = {
        home: document.getElementById('page-home'),
        settings: document.getElementById('page-settings'),
        adminLogin: document.getElementById('page-admin-login'),
        adminDash: document.getElementById('page-admin-dashboard')
    };

    function showPage(id) {
        Object.values(pages).forEach(p => p.classList.remove('active'));
        pages[id].classList.add('active');
    }

    function setupEventListeners() {
        document.getElementById('btnHome').onclick = () => showPage('home');
        
        document.getElementById('btnSettings').onclick = () => {
            showPage('settings');
            const sel = document.getElementById('settingClassSelect');
            sel.innerHTML = '';
            
            // クラスリストの生成（なければデフォルト）
            const classes = Object.keys(appData.schedule || {});
            const list = classes.length ? classes : ['21HR', '22HR', '23HR'];
            
            list.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls; opt.textContent = cls;
                if(cls === userSettings.classId) opt.selected = true;
                sel.appendChild(opt);
            });
            document.getElementById('icalUrlInput').value = userSettings.icalUrl;
        };

        document.getElementById('saveSettingsBtn').onclick = () => {
            userSettings.classId = document.getElementById('settingClassSelect').value;
            userSettings.icalUrl = document.getElementById('icalUrlInput').value;
            localStorage.setItem('userSettings', JSON.stringify(userSettings));
            alert('保存しました'); location.reload();
        };

        document.getElementById('btnAdmin').onclick = () => showPage('adminLogin');
        
        document.getElementById('adminLoginBtn').onclick = () => {
            if (document.getElementById('adminPasswordInput').value === '1234') {
                showPage('adminDash');
                loadGithubConfig(); // 管理者画面を開いたら設定をロード
            } else {
                document.getElementById('loginError').style.display = 'block';
            }
        };

        document.getElementById('adminBackBtn').onclick = () => showPage('home');
    }


    /* === 管理者機能 & GitHub API更新ロジック === */
    function initAdmin() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
            };
        });

        // GitHub設定の保存
        document.getElementById('saveGithubConfigBtn').onclick = () => {
            githubConfig = {
                user: document.getElementById('ghUser').value,
                repo: document.getElementById('ghRepo').value,
                token: document.getElementById('ghToken').value
            };
            localStorage.setItem('githubConfig', JSON.stringify(githubConfig));
            alert('GitHub接続情報をブラウザに保存しました');
        };

        // GitHubへのプッシュ (PUT /repos/:owner/:repo/contents/:path)
        document.getElementById('pushToGithubBtn').onclick = async () => {
            const statusEl = document.getElementById('pushStatus');
            statusEl.textContent = "送信中...";
            
            const gh = JSON.parse(localStorage.getItem('githubConfig'));
            if(!gh || !gh.token) {
                alert("GitHub連携設定がされていません。[GitHub連携]タブで設定してください。");
                statusEl.textContent = "";
                return;
            }

            const path = 'data.json';
            const apiUrl = `https://api.github.com/repos/${gh.user}/${gh.repo}/contents/${path}`;
            // 日本語文字化け防止のためにUnicodeエスケープなどが必要な場合があるが、
            // ここでは簡易的に Base64 エンコードを行う
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(appData, null, 2))));

            try {
                // 1. ファイルのSHAを取得 (上書きに必要)
                const getRes = await fetch(apiUrl, {
                    headers: { 'Authorization': `token ${gh.token}` }
                });
                
                // 初回作成時などで404ならshaは不要だが、基本は更新なので取得する
                let sha = null;
                if(getRes.ok) {
                    const getData = await getRes.json();
                    sha = getData.sha;
                }

                // 2. ファイルを更新 (PUT)
                const bodyData = {
                    message: "Update data.json from Admin Dashboard",
                    content: content
                };
                if(sha) bodyData.sha = sha;

                const putRes = await fetch(apiUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${gh.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bodyData)
                });

                if(putRes.ok) {
                    statusEl.textContent = "更新成功！全生徒に反映されました。";
                    statusEl.style.color = "green";
                } else {
                    const err = await putRes.json();
                    throw new Error(err.message || "更新失敗");
                }
            } catch (e) {
                console.error(e);
                statusEl.textContent = "エラー: " + e.message;
                statusEl.style.color = "red";
            }
        };
    }

    function loadGithubConfig() {
        const saved = localStorage.getItem('githubConfig');
        if(saved) {
            githubConfig = JSON.parse(saved);
            document.getElementById('ghUser').value = githubConfig.user;
            document.getElementById('ghRepo').value = githubConfig.repo;
            document.getElementById('ghToken').value = githubConfig.token;
        }
    }
});
