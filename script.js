(function () {
    'use strict';

    // ---------- ТЕМА (загружаем ДО отрисовки) ----------
    const THEME_KEY = 'jp-cards-theme';
    const htmlEl = document.documentElement;
    const savedTheme = localStorage.getItem(THEME_KEY);

    let currentTheme = savedTheme
        || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    htmlEl.setAttribute('data-theme', currentTheme);

    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    function applyThemeIcon(theme) {
        if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    function setTheme(theme) {
        currentTheme = theme;
        htmlEl.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        applyThemeIcon(theme);
    }

    applyThemeIcon(currentTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // ---------- НАПРАВЛЕНИЕ ----------
    const DIRECTION_KEY = 'jp-cards-direction';
    let currentDirection = localStorage.getItem(DIRECTION_KEY) || 'char-to-romaji';

    const directionToggle = document.getElementById('directionToggle');
    const directionLabel = document.getElementById('directionLabel');

    function updateDirectionLabel() {
        if (!directionLabel) return;
        directionLabel.textContent = currentAlphabet === 'hiragana' ? 'あ-a' : 'ロ-ro';
    }

    function applyDirection(direction) {
        currentDirection = direction;
        localStorage.setItem(DIRECTION_KEY, direction);
        updateDirectionLabel();
    }

    if (directionToggle) {
        directionToggle.addEventListener('click', () => {
            setDirection(currentDirection === 'char-to-romaji' ? 'romaji-to-char' : 'char-to-romaji');
        });
    }

    // ---------- СОСТОЯНИЕ ----------
    let allData = { hiragana: [], katakana: [] };
    let currentAlphabet = 'hiragana';
    let currentMode = 'all';
    let currentItem = null;
    let currentShownWord = null;
    let correctRomaji = '';
    let options = [];
    let answered = false;
    let correctAnswerIndex = -1;

    // ---------- СОСТОЯНИЕ ЭКЗАМЕНА ----------
    let contestActive = false;
    let contestOnAnswer = null;
    let contestStopHandler = null;
    let contestTimer = null;
    let toastTimer = null;

    // ---------- DOM ----------
    const glyphDisplay = document.getElementById('glyphDisplay');
    const soundBtn = document.getElementById('soundBtn');
    const optionButtons = document.querySelectorAll('.option-btn');
    const nextBtn = document.getElementById('nextBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const alphabetBtns = document.querySelectorAll('.alphabet-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const wordCard = document.getElementById('wordCard');
    const wordMain = document.getElementById('wordMain');
    const wordSyllables = document.getElementById('wordSyllables');
    const wordTranslation = document.getElementById('wordTranslation');
    const wordSoundBtn = document.getElementById('wordSoundBtn');

    // DOM экзамена
    const contestToggle = document.getElementById('contestToggle');
    const contestModal = document.getElementById('contestModal');
    const contestCloseBtn = document.getElementById('contestCloseBtn');
    const resultBase = document.getElementById('resultBase');
    const resultDakuten = document.getElementById('resultDakuten');
    const resultHandakuten = document.getElementById('resultHandakuten');
    const resultTotal = document.getElementById('resultTotal');

    // ---------- ВСПОМОГАТЕЛЬНЫЕ ----------
    function getRandomItem(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function getActiveData() {
        const list = allData[currentAlphabet] || [];
        if (currentMode === 'base') {
            return list.filter(item => item.type === 'base');
        }
        return list;
    }

    // ---------- ГЕНЕРАЦИЯ ВАРИАНТОВ ----------
    function generateOptionsFor(correctItem, fullPool) {
        const isCharToRomaji = currentDirection === 'char-to-romaji';
        const wantedType = correctItem.type || 'base';

        let typedPool = fullPool.filter(item => (item.type || 'base') === wantedType);

        const allValues = [...new Set(
            typedPool.map(item => isCharToRomaji ? item.romaji : item.char)
        )];
        const correctValue = isCharToRomaji ? correctItem.romaji : correctItem.char;

        let candidates = allValues.filter(v => v !== correctValue);

        if (candidates.length < 3) {
            const extraValues = fullPool
                .filter(item => (item.type || 'base') !== wantedType)
                .map(item => isCharToRomaji ? item.romaji : item.char);
            for (const v of extraValues) {
                if (v !== correctValue && !candidates.includes(v)) {
                    candidates.push(v);
                }
                if (candidates.length >= 3) break;
            }
        }

        const distractors = [];
        const poolCopy = [...candidates];
        while (distractors.length < 3 && poolCopy.length > 0) {
            const idx = Math.floor(Math.random() * poolCopy.length);
            distractors.push(poolCopy[idx]);
            poolCopy.splice(idx, 1);
        }

        while (distractors.length < 3) {
            distractors.push('?');
        }

        return shuffleArray([correctValue, ...distractors]);
    }

    // ---------- ОЗВУЧКА ----------
    function speakJapanese(text) {
        if (!window.speechSynthesis || !text) return;
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoice = voices.find(v => v.lang && v.lang.startsWith('ja'));
        if (japaneseVoice) utterance.voice = japaneseVoice;
        window.speechSynthesis.speak(utterance);
    }

    function playCharSound() {
        if (currentItem) speakJapanese(currentItem.char);
    }

    function playWordSound() {
        if (currentShownWord) speakJapanese(currentShownWord.word);
    }

    // ---------- БЕЙДЖ ТИПА ЗНАКА ----------
    function updateTypeBadge() {
        const container = document.getElementById('badgeContainer');
        if (container) container.innerHTML = '';

        if (!currentItem || !currentItem.type || currentItem.type === 'base') return;

        const badge = document.createElement('span');
        badge.className = 'type-badge ' + currentItem.type;
        badge.textContent = currentItem.type === 'dakuten' ? 'дакутэн ゛' : 'хандакутэн ゜';

        if (currentItem.rare) {
            badge.textContent += ' · редкий';
            badge.style.opacity = '0.85';
        }

        if (container) container.appendChild(badge);
    }

    // ---------- УПРАВЛЕНИЕ КНОПКОЙ 🔊 ----------
    function updateSoundBtnVisibility() {
        if (!soundBtn) return;
        const isCharToRomaji = currentDirection === 'char-to-romaji';
        const show = isCharToRomaji && !contestActive;
        soundBtn.style.display = show ? '' : 'none';
    }

    // ---------- ТОСТ ----------
    function showToast(message, duration = 2000) {
        let toast = document.getElementById('toastEl');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toastEl';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;

        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');

        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    // ---------- БЛОКИРОВКА ВЕРХНИХ КНОПОК ----------
    function setControlsDisabled(disabled) {
        alphabetBtns.forEach(b => b.disabled = disabled);
        modeBtns.forEach(b => b.disabled = disabled);
        if (directionToggle) directionToggle.disabled = disabled;
    }

    // ---------- ЛОГИКА КАРТОЧКИ ----------
    function loadNewCard() {
        if (contestActive) return;

        const data = getActiveData();
        if (!data.length) return;

        answered = false;
        correctAnswerIndex = -1;
        currentShownWord = null;

        currentItem = getRandomItem(data);
        const isCharToRomaji = currentDirection === 'char-to-romaji';
        correctRomaji = currentItem.romaji;

        glyphDisplay.textContent = isCharToRomaji ? currentItem.char : currentItem.romaji;
        glyphDisplay.classList.toggle('glyph-romaji', !isCharToRomaji);

        updateSoundBtnVisibility();

        const optionPool = allData[currentAlphabet] || data;
        options = generateOptionsFor(currentItem, optionPool);

        const correctValue = isCharToRomaji ? currentItem.romaji : currentItem.char;
        correctAnswerIndex = options.indexOf(correctValue);

        optionButtons.forEach((btn, idx) => {
            btn.textContent = options[idx];
            btn.classList.toggle('option-btn-kanji', !isCharToRomaji);
            btn.disabled = false;
            btn.classList.remove('correct', 'wrong');
        });

        nextBtn.disabled = true;
        feedbackMessage.textContent = '';
        wordCard.hidden = true;
        updateTypeBadge();

        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    }

    function showWord() {
        if (!currentItem || !Array.isArray(currentItem.words) || !currentItem.words.length) return;

        const randomWord = currentItem.words[Math.floor(Math.random() * currentItem.words.length)];
        currentShownWord = randomWord;

        wordMain.textContent = randomWord.word;
        const syllables = (randomWord.syllables || '').split(/\s+/).filter(Boolean);
        wordSyllables.textContent = syllables.length ? `[ ${syllables.join(' · ')} ]` : '';
        wordTranslation.textContent = randomWord.translation || '';

        wordCard.hidden = false;
    }

    function handleOptionClick(clickedIndex) {
        if (contestActive && contestOnAnswer) {
            contestOnAnswer(clickedIndex);
            return;
        }

        if (answered || !currentItem) return;
        answered = true;

        const isCorrect = clickedIndex === correctAnswerIndex;

        optionButtons.forEach((btn, idx) => {
            btn.disabled = true;
            if (idx === correctAnswerIndex) btn.classList.add('correct');
            else if (idx === clickedIndex && !isCorrect) btn.classList.add('wrong');
        });

        if (isCorrect) {
            feedbackMessage.textContent = '✔️ Верно!';
            feedbackMessage.style.color = '#2b6b2b';
        } else {
            feedbackMessage.textContent = `❌ Ошибка, правильно: ${currentItem.char} (${currentItem.romaji})`;
            feedbackMessage.style.color = '#a13d2f';
        }

        showWord();
        nextBtn.disabled = false;
    }

    function setDirection(direction) {
        if (currentDirection === direction) return;
        applyDirection(direction);
        loadNewCard();
        updateSoundBtnVisibility();
    }

    function setAlphabet(alphabet) {
        if (currentAlphabet === alphabet) return;
        currentAlphabet = alphabet;
        alphabetBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.alphabet === alphabet);
        });
        updateDirectionLabel();
        loadNewCard();
    }

    function setMode(mode) {
        if (currentMode === mode) return;
        currentMode = mode;
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        loadNewCard();
    }

    // ---------- ЭКЗАМЕН ----------
    const CONTEST_ICON_PLAY = '🥇';
    const CONTEST_ICON_STOP = '🛑';

    function runContest() {
        if (contestActive) return;

        const data = getActiveData();
        if (!data.length) return;

        const isCharToRomaji = currentDirection === 'char-to-romaji';

        const seen = new Set();
        let questions = [];
        for (const item of data) {
            if (seen.has(item.char)) continue;
            seen.add(item.char);
            questions.push({
                item,
                type: item.type || 'base',
                correctAnswer: isCharToRomaji ? item.romaji : item.char
            });
        }
        if (!questions.length) return;

        questions = shuffleArray(questions);

        const stats = {
            base: { correct: 0, total: 0 },
            dakuten: { correct: 0, total: 0 },
            handakuten: { correct: 0, total: 0 }
        };
        for (const q of questions) {
            if (stats[q.type]) stats[q.type].total++;
        }

        showToast('Начинаем экзамен...', 2000);
        setControlsDisabled(true);
        if (contestToggle) contestToggle.textContent = CONTEST_ICON_STOP;

        contestActive = true;
        updateSoundBtnVisibility();

        let currentIdx = 0;
        let answeredThis = false;
        let correctIdxThis = -1;
        let typeThis = 'base';

        function clearContestTimer() {
            if (contestTimer) {
                clearTimeout(contestTimer);
                contestTimer = null;
            }
        }

        function cleanup() {
            contestActive = false;
            contestOnAnswer = null;
            contestStopHandler = null;
            clearContestTimer();
            setControlsDisabled(false);
            if (contestToggle) contestToggle.textContent = CONTEST_ICON_PLAY;
            updateSoundBtnVisibility();
        }

        contestStopHandler = () => {
            cleanup();
            feedbackMessage.textContent = '';
            wordCard.hidden = true;
            loadNewCard();
        };

        function renderQuestion() {
            if (!contestActive) return;
            if (currentIdx >= questions.length) {
                finishContest();
                return;
            }

            const q = questions[currentIdx];
            typeThis = q.type;
            answeredThis = false;

            glyphDisplay.textContent = isCharToRomaji ? q.item.char : q.item.romaji;
            glyphDisplay.classList.toggle('glyph-romaji', !isCharToRomaji);
            updateSoundBtnVisibility();

            currentItem = q.item;
            updateTypeBadge();

            const pool = allData[currentAlphabet] || data;
            const opts = generateOptionsFor(q.item, pool);
            correctIdxThis = opts.indexOf(q.correctAnswer);

            optionButtons.forEach((btn, idx) => {
                btn.textContent = opts[idx];
                btn.classList.toggle('option-btn-kanji', !isCharToRomaji);
                btn.disabled = false;
                btn.classList.remove('correct', 'wrong');
            });

            feedbackMessage.textContent = '';
            wordCard.hidden = true;
            nextBtn.disabled = true;
        }

        contestOnAnswer = (clickedIdx) => {
            if (answeredThis || !contestActive) return;
            answeredThis = true;

            const isCorrect = clickedIdx === correctIdxThis;
            if (isCorrect) stats[typeThis].correct++;

            optionButtons.forEach((btn, idx) => {
                btn.disabled = true;
                if (idx === correctIdxThis) btn.classList.add('correct');
                else if (idx === clickedIdx && !isCorrect) btn.classList.add('wrong');
            });

            feedbackMessage.textContent = isCorrect
                ? '✔️ Верно!'
                : `❌ (${questions[currentIdx].item.char} · ${questions[currentIdx].item.romaji})`;
            feedbackMessage.style.color = isCorrect ? '#2b6b2b' : '#a13d2f';

            clearContestTimer();
            contestTimer = setTimeout(() => {
                contestTimer = null;
                if (!contestActive) return;
                currentIdx++;
                renderQuestion();
            }, 400);
        };

        function finishContest() {
            cleanup();

            resultBase.textContent = `${stats.base.correct} / ${stats.base.total}`;
            resultDakuten.textContent = `${stats.dakuten.correct} / ${stats.dakuten.total}`;
            resultHandakuten.textContent = `${stats.handakuten.correct} / ${stats.handakuten.total}`;
            const totalCorrect = stats.base.correct + stats.dakuten.correct + stats.handakuten.correct;
            const totalAll = stats.base.total + stats.dakuten.total + stats.handakuten.total;
            resultTotal.textContent = `${totalCorrect} / ${totalAll}`;

            contestModal.hidden = false;

            loadNewCard();
        }

        renderQuestion();
    }

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    async function init() {
        try {
            const res = await fetch('data.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            allData = await res.json();
        } catch (err) {
            console.error('Не удалось загрузить data.json:', err);
            glyphDisplay.textContent = '?!';
            feedbackMessage.textContent = 'Ошибка загрузки данных. Запустите через локальный сервер.';
            feedbackMessage.style.color = '#a13d2f';
            return;
        }

        if (window.speechSynthesis) window.speechSynthesis.getVoices();

        alphabetBtns.forEach(btn =>
            btn.addEventListener('click', () => setAlphabet(btn.dataset.alphabet))
        );
        modeBtns.forEach(btn =>
            btn.addEventListener('click', () => setMode(btn.dataset.mode))
        );
        soundBtn.addEventListener('click', playCharSound);
        wordSoundBtn.addEventListener('click', playWordSound);
        optionButtons.forEach((btn, idx) =>
            btn.addEventListener('click', () => handleOptionClick(idx))
        );
        nextBtn.addEventListener('click', loadNewCard);

        if (contestToggle) {
            contestToggle.addEventListener('click', () => {
                if (contestActive && contestStopHandler) {
                    contestStopHandler();
                } else {
                    runContest();
                }
            });
        }

        if (contestCloseBtn) {
            contestCloseBtn.addEventListener('click', () => {
                contestModal.hidden = true;
            });
        }

        updateDirectionLabel();
        loadNewCard();
    }

    init();
})();