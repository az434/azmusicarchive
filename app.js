let tracks = [];
let activeIndex = 0;
let filter = 'all';
let mood = 'all';
let libraryView = 'all';
let favorites = new Set(JSON.parse(localStorage.getItem('az-favorites') || '[]'));
let history = JSON.parse(localStorage.getItem('az-history') || '[]');
let notes = (() => {
  try {
    return JSON.parse(localStorage.getItem('az-track-notes') || '{}');
  } catch (error) {
    return {};
  }
})();
let isSeeking = false;
let seekValue = 0;
let pendingSeekTarget = null;
let lyrics = [];
let lyricsRequestId = 0;
const audio = document.querySelector('#audioPlayer');
const turntable = document.querySelector('.turntable');
const record = document.querySelector('#record');
const lyricsPanel = document.querySelector('#lyricsPanel');
const lyricsLines = document.querySelector('.lyrics-lines');
const playButton = document.querySelector('#playButton');
const playlist = document.querySelector('#playlist');
const searchInput = document.querySelector('#searchInput');
const progressFill = document.querySelector('#progressFill');
const progressBar = document.querySelector('#progressBar');
const folderPicker = document.querySelector('#folderPicker');
const folderButton = document.querySelector('#folderButton');
const notePreview = document.createElement('div');
const notePopover = document.createElement('div');
let noteAnchor = null;
let noteDrag = null;
const time = (seconds) => Number.isFinite(seconds) ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '00:00';
const urlFor = (file) => `music/${encodeURIComponent(file)}`;
const THEME_BY_MOOD = {
  indie: { pageBg: '#1d2a31', paper: '#dfe7eb', paper2: '#edf3f6', ink: '#1b2a30', rust: '#507285', line: '#9bb5c0', yellow: '#c9dbe7', paperShadow: 'rgba(13, 19, 22, 0.28)' },
  folk: { pageBg: '#272116', paper: '#efe0ae', paper2: '#f7efcd', ink: '#2a2217', rust: '#a16229', line: '#c9af76', yellow: '#d7b864', paperShadow: 'rgba(32, 23, 13, 0.28)' },
  japan: { pageBg: '#202b39', paper: '#dfe7ef', paper2: '#edf4fa', ink: '#1c2b39', rust: '#597a8d', line: '#9fb6c6', yellow: '#d2dfe9', paperShadow: 'rgba(20, 26, 34, 0.25)' },
  electronic: { pageBg: '#1d182a', paper: '#d9d1eb', paper2: '#efeafc', ink: '#1f1a30', rust: '#7359c6', line: '#8e81be', yellow: '#bca9f2', paperShadow: 'rgba(17, 14, 28, 0.34)' },
  soundtrack: { pageBg: '#251b1d', paper: '#f0e4d6', paper2: '#f9f0e8', ink: '#2c1d1d', rust: '#a15f4d', line: '#d1b29c', yellow: '#d9b17a', paperShadow: 'rgba(33, 20, 18, 0.24)' },
  pop: { pageBg: '#2b1e22', paper: '#eadfd7', paper2: '#f7efe9', ink: '#2c211d', rust: '#9b4435', line: '#c0a694', yellow: '#e6c47a', paperShadow: 'rgba(32, 18, 16, 0.22)' }
};

function makeTrack(file, index) {
  const split = file.replace(/\.mp3$/i, '').split(' - ');
  const artist = split.shift() || 'Unknown Artist';
  const title = split.join(' - ') || file;
  const text = `${artist} ${title}`;
  const genre = /万能青年旅店|痛仰|Beyond|Linkin|Michael|摇滚|ONE MORE LIGHT/i.test(text) ? 'indie' : /赵雷|朴树|宋冬野|陈粒|马頔|民谣|Bob Dylan|John Denver|王杰|莫西子诗/.test(text) ? 'folk' : /米津|RADWIMPS|ヨルシカ|ずっと|ano|初音|笠原|中島|Lia|Matryoshka|Vaundy|Bôa|moumoon/.test(text) ? 'japan' : /Justin|Taylor|Maroon|Whitney|BIGBANG|梁静茹|林俊杰|蔡依林|邓紫棋|陈奕迅|王力宏|张韶涵|王菲|薛之谦/.test(text) ? 'pop' : /电影|TV|movie|Arcane|主题|Aqua|Merry Christmas|Call of Silence/.test(text) ? 'soundtrack' : /Au5|DAISHI|NewPiano|JINBAO|electronic|Lush/.test(text) ? 'electronic' : 'pop';
  return { file, artist, title, mood: genre, index };
}
function visibleTracks() { const query = searchInput.value.trim().toLowerCase(); const source = libraryView === 'favorites' ? tracks.filter((track) => favorites.has(track.file)) : libraryView === 'history' ? history.map((file) => tracks.find((track) => track.file === file)).filter(Boolean) : tracks; return source.filter((track) => (mood === 'all' || track.mood === mood) && (!query || `${track.artist}${track.title}`.toLowerCase().includes(query))); }
function saveLibrary() { localStorage.setItem('az-favorites', JSON.stringify([...favorites])); localStorage.setItem('az-history', JSON.stringify(history)); }
function saveNotes() { localStorage.setItem('az-track-notes', JSON.stringify(notes)); }
function getTrackNote(file) { const entry = notes[file] || {}; return { when: entry.when || '', scene: entry.scene || '', thought: entry.thought || '' }; }
function getTrackNoteSummary(file) { const note = getTrackNote(file); const values = [note.when, note.scene, note.thought].filter(Boolean); return values.join(' · '); }
function parseLyrics(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const content = line.replace(/(?:\[\d+:\d+(?:\.\d+)?\])+/, '').trim();
    return matches.map((match) => ({ time: Number(match[1]) * 60 + Number(match[2]), text: content || '♪' }));
  }).sort((a, b) => a.time - b.time);
}
function renderLyrics(message = '') {
  lyricsLines.replaceChildren();
  if (!lyrics.length) {
    const empty = document.createElement('div');
    empty.className = 'lyrics-empty';
    empty.textContent = message || '暂无歌词，可将同名 .lrc 文件放入 music 文件夹';
    lyricsLines.append(empty);
    return;
  }
  lyrics.forEach((line, index) => {
    const element = document.createElement('div');
    element.className = 'lyric-line';
    element.dataset.lyricIndex = index;
    element.textContent = line.text;
    lyricsLines.append(element);
  });
}
async function loadLyrics(track) {
  const requestId = ++lyricsRequestId;
  lyrics = [];
  renderLyrics('正在读取歌词…');
  try {
    const response = await fetch(urlFor(track.file).replace(/\.mp3$/i, '.lrc'));
    if (!response.ok) throw new Error('歌词不存在');
    const parsed = parseLyrics(await response.text());
    if (requestId !== lyricsRequestId) return;
    lyrics = parsed;
    renderLyrics();
  } catch {
    if (requestId === lyricsRequestId) renderLyrics();
  }
}
function syncLyrics() {
  if (!lyrics.length) return;
  let currentIndex = 0;
  lyrics.forEach((line, index) => { if (line.time <= audio.currentTime) currentIndex = index; });
  lyricsLines.querySelectorAll('.lyric-line').forEach((line, index) => line.classList.toggle('is-current', index === currentIndex));
  const currentLine = lyricsLines.querySelector(`[data-lyric-index="${currentIndex}"]`);
  if (currentLine) currentLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function applyThemeForMood(moodName) {
  const theme = THEME_BY_MOOD[moodName] || THEME_BY_MOOD.pop;
  Object.entries(theme).forEach(([key, value]) => document.documentElement.style.setProperty(`--${key}`, value));
}
function showTrackNotePreview(item) {
  const file = item.dataset.file;
  const summary = getTrackNoteSummary(file);
  if (!summary) return;
  notePreview.textContent = summary.length > 96 ? `${summary.slice(0, 92)}…` : summary;
  notePreview.classList.add('visible');
  const bounds = item.getBoundingClientRect();
  notePreview.style.left = `${Math.min(window.innerWidth - 220, bounds.right + 16)}px`;
  notePreview.style.top = `${Math.max(20, bounds.top + 10)}px`;
}
function hideTrackNotePreview() {
  notePreview.classList.remove('visible');
}
function openNotePopover(file, anchor) {
  const note = getTrackNote(file);
  const whenInput = notePopover.querySelector('[name="when"]');
  const sceneInput = notePopover.querySelector('[name="scene"]');
  const thoughtInput = notePopover.querySelector('[name="thought"]');
  notePopover.dataset.file = file;
  noteAnchor = anchor;
  whenInput.value = note.when;
  sceneInput.value = note.scene;
  thoughtInput.value = note.thought;
  notePopover.classList.add('visible');
  positionNotePopover();
}
function positionNotePopover() {
  if (!notePopover.classList.contains('visible') || !noteAnchor || noteDrag) return;
  const rect = noteAnchor.getBoundingClientRect();
  const card = notePopover.querySelector('.note-popover-card');
  const width = card ? card.offsetWidth : 330;
  const height = card ? card.offsetHeight : 300;
  const left = Math.max(14, Math.min(window.innerWidth - width - 14, rect.left + 12));
  const top = Math.max(14, rect.top - 10);
  if (card) {
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }
}
function closeNotePopover() {
  notePopover.classList.remove('visible');
  notePopover.dataset.file = '';
  noteAnchor = null;
  noteDrag = null;
}
function render() { const visible = visibleTracks(); playlist.innerHTML = visible.map((track) => { const index = tracks.indexOf(track); const note = getTrackNote(track.file); const hasNote = Boolean(note.when || note.scene || note.thought); return `<div class="track ${index === activeIndex ? 'current' : ''}" data-index="${index}" data-file="${track.file}"><span class="track-index">${String(index + 1).padStart(3, '0')}</span><span class="track-info"><strong>${track.title}</strong><span>${track.artist}</span></span><span class="track-time" data-duration="${index}">--:--</span><button class="favorite-button ${favorites.has(track.file) ? 'is-favorite' : ''}" data-file="${track.file}" aria-label="${favorites.has(track.file) ? '取消收藏' : '加入收藏'}">♥</button><button class="track-note-button ${hasNote ? 'has-note' : ''}" data-file="${track.file}" aria-label="记录这首歌的感受">✎</button><span class="track-play">▶</span></div>`; }).join('') || `<div class="empty-state">${libraryView === 'favorites' ? '还没有收藏唱片' : libraryView === 'history' ? '还没有播放历史' : '没有找到这类唱片'}</div>`; playlist.querySelectorAll('.track').forEach((item) => { item.addEventListener('click', () => select(Number(item.dataset.index), true)); item.addEventListener('mouseenter', () => showTrackNotePreview(item)); item.addEventListener('mouseleave', hideTrackNotePreview); }); playlist.querySelectorAll('.favorite-button').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const file = button.dataset.file; favorites.has(file) ? favorites.delete(file) : favorites.add(file); saveLibrary(); render(); })); playlist.querySelectorAll('.track-note-button').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openNotePopover(button.dataset.file, button); })); document.querySelector('#trackCount').textContent = libraryView === 'history' ? `${visible.length} HISTORY` : libraryView === 'favorites' ? `${visible.length} FAVORITES` : `${tracks.length} RECORDS`; }
function sync() { if (!tracks.length) return; const track = tracks[activeIndex]; applyThemeForMood(track.mood); document.querySelector('#nowTitle').textContent = track.title; document.querySelector('#nowArtist').textContent = track.artist; document.querySelector('#nowFormat').textContent = `${track.mood.toUpperCase()} · MP3`; document.querySelector('#nowTime').textContent = `${time(audio.currentTime)} / ${time(audio.duration)}`; const playing = !audio.paused; turntable.classList.toggle('is-playing', playing); playButton.classList.toggle('is-paused', !playing); playButton.textContent = playing ? 'Ⅱ' : '▶'; syncLyrics(); }
function select(index, autoPlay = false) { if (!tracks.length) return; activeIndex = (index + tracks.length) % tracks.length; audio.src = tracks[activeIndex].url || urlFor(tracks[activeIndex].file); audio.load(); turntable.classList.remove('show-lyrics'); loadLyrics(tracks[activeIndex]); sync(); render(); if (autoPlay) audio.play().catch(() => { document.querySelector('#nowArtist').textContent = `${tracks[activeIndex].artist} · 文件无法播放`; }); }
function toggle() { audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
const database = indexedDB.open('az-music-library', 1); database.onupgradeneeded = () => database.result.createObjectStore('settings');
function saveDirectoryHandle(handle) { return new Promise((resolve, reject) => { const request = database.result.transaction('settings', 'readwrite').objectStore('settings').put(handle, 'music-directory'); request.onsuccess = resolve; request.onerror = reject; }); }
function getDirectoryHandle() { return new Promise((resolve) => { database.onsuccess = () => { const request = database.result.transaction('settings').objectStore('settings').get('music-directory'); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); }; database.onerror = () => resolve(null); }); }
async function tracksFromDirectory(handle) { const files = []; for await (const entry of handle.values()) { if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.mp3')) files.push(await entry.getFile()); } return files.sort((a, b) => a.name.localeCompare(b.name)).map((file, index) => ({ ...makeTrack(file.name, index), url: URL.createObjectURL(file) })); }
async function importDirectory(handle) { if (!handle) return; if (handle.requestPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted' && (await handle.requestPermission({ mode: 'read' })) !== 'granted') return; tracks.forEach((track) => { if (track.url) URL.revokeObjectURL(track.url); }); tracks = await tracksFromDirectory(handle); activeIndex = 0; filter = 'all'; mood = 'all'; document.querySelector('#tasteResult').textContent = `正在展示全部 ${tracks.length} 首收藏`; render(); select(0); }
async function loadAllTracks() { try { const response = await fetch('music/'); const html = await response.text(); const names = [...html.matchAll(/href="([^"]+\.mp3)"/gi)].map((match) => decodeURIComponent(match[1])); tracks = names.map(makeTrack); } catch { const savedHandle = await getDirectoryHandle(); if (savedHandle) await importDirectory(savedHandle); } if (!tracks.length) { playlist.innerHTML = '<div class="empty-state">首次使用请选择 music 文件夹，之后网站会自动记住它。</div>'; return; } select(0); }
async function loadStaticTracks() {
  try {
    const response = await fetch('music.json');
    if (!response.ok) throw new Error('music.json unavailable');
    const library = await response.json();
    tracks = library.map((entry, index) => typeof entry === 'string' ? makeTrack(entry, index) : { ...makeTrack(entry.file, index), url: entry.url });
  } catch {
    const savedHandle = await getDirectoryHandle();
    if (savedHandle) await importDirectory(savedHandle);
  }
  if (!tracks.length) { playlist.innerHTML = '<div class="empty-state">请在 music.json 中配置音乐，或选择本地 music 文件夹。</div>'; return; }
  select(0);
}
function applyPendingSeek() { if (pendingSeekTarget === null || !audio.duration) return; audio.currentTime = pendingSeekTarget; if (Math.abs(audio.currentTime - pendingSeekTarget) < 1) { pendingSeekTarget = null; isSeeking = false; progressBar.value = seekValue; progressFill.style.width = `${seekValue / 10}%`; sync(); } }
audio.addEventListener('loadedmetadata', () => { const duration = document.querySelector(`[data-duration="${activeIndex}"]`); if (duration) duration.textContent = time(audio.duration); applyPendingSeek(); sync(); });
audio.addEventListener('loadeddata', applyPendingSeek); audio.addEventListener('canplay', applyPendingSeek); audio.addEventListener('playing', applyPendingSeek);
audio.addEventListener('timeupdate', () => { if (isSeeking) return; const ratio = audio.duration ? audio.currentTime / audio.duration : 0; progressFill.style.width = `${ratio * 100}%`; progressBar.value = Math.round(ratio * 1000); sync(); });
audio.addEventListener('play', () => { applyPendingSeek(); sync(); }); audio.addEventListener('pause', sync); audio.addEventListener('ended', () => select(activeIndex + 1, true));
audio.addEventListener('play', () => { const file = tracks[activeIndex]?.file; if (!file) return; history = [file, ...history.filter((item) => item !== file)].slice(0, 50); saveLibrary(); if (libraryView === 'history') render(); });
function previewSeek() { isSeeking = true; seekValue = Number(progressBar.value); progressFill.style.width = `${seekValue / 10}%`; }
function waitForMediaData() { if (audio.readyState >= 2) return Promise.resolve(); return new Promise((resolve) => { const done = () => { audio.removeEventListener('canplay', done); audio.removeEventListener('loadeddata', done); resolve(); }; audio.addEventListener('canplay', done, { once: true }); audio.addEventListener('loadeddata', done, { once: true }); setTimeout(done, 1500); }); }
async function finishSeek() { if (!audio.duration || !tracks.length) return; const target = (seekValue / 1000) * audio.duration; const wasPaused = audio.paused; const source = urlFor(tracks[activeIndex].file); isSeeking = true; pendingSeekTarget = target; audio.src = source; audio.load(); if (!wasPaused) await audio.play().catch(() => {}); else audio.play().catch(() => {}); setTimeout(() => { applyPendingSeek(); if (wasPaused && pendingSeekTarget === null) audio.pause(); }, 800); }
progressBar.addEventListener('pointerdown', previewSeek); progressBar.addEventListener('input', previewSeek); progressBar.addEventListener('change', finishSeek); progressBar.addEventListener('pointerup', finishSeek); progressBar.addEventListener('pointercancel', finishSeek); progressBar.addEventListener('touchend', finishSeek);
playButton.addEventListener('click', toggle); document.querySelector('#previousButton').addEventListener('click', () => select(activeIndex - 1, true)); document.querySelector('#nextButton').addEventListener('click', () => select(activeIndex + 1, true)); document.querySelector('#shuffleButton').addEventListener('click', () => select(Math.floor(Math.random() * tracks.length), true)); searchInput.addEventListener('input', render); document.querySelectorAll('.library-tab').forEach((button) => button.addEventListener('click', () => { libraryView = button.dataset.view; document.querySelectorAll('.library-tab').forEach((item) => item.classList.toggle('active', item === button)); render(); })); document.querySelectorAll('.taste-option').forEach((button) => button.addEventListener('click', () => { mood = button.dataset.mood; document.querySelectorAll('.taste-option').forEach((item) => item.classList.toggle('active', item === button)); const label = button.textContent; document.querySelector('#tasteResult').textContent = mood === 'all' ? `正在展示全部 ${tracks.length} 首收藏` : `正在为你推荐「${label}」风格`; render(); }));
function toggleLyrics(event) { event.stopPropagation(); turntable.classList.toggle('show-lyrics'); }
record.addEventListener('click', toggleLyrics);
lyricsPanel.addEventListener('click', toggleLyrics);
lyricsPanel.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') toggleLyrics(event); });
folderButton.addEventListener('click', async () => { if (window.showDirectoryPicker) { const handle = await window.showDirectoryPicker({ mode: 'read' }); await saveDirectoryHandle(handle); await importDirectory(handle); } else folderPicker.click(); });
folderPicker.addEventListener('change', () => { const selected = [...folderPicker.files].filter((file) => file.name.toLowerCase().endsWith('.mp3')); tracks.forEach((track) => { if (track.url) URL.revokeObjectURL(track.url); }); tracks = selected.map((file, index) => ({ ...makeTrack(file.name, index), url: URL.createObjectURL(file) })); activeIndex = 0; filter = 'all'; mood = 'all'; document.querySelector('#tasteResult').textContent = `正在展示全部 ${tracks.length} 首收藏`; render(); select(0); });
progressBar.style.position = 'absolute'; progressBar.style.inset = '-8px 0'; progressBar.style.width = '100%'; progressBar.style.height = '20px'; progressBar.style.opacity = '1'; progressBar.style.cursor = 'pointer';
notePreview.className = 'track-note-preview';
notePopover.className = 'note-popover';
notePopover.innerHTML = `
  <div class="note-popover-card">
    <div class="note-popover-header">
      <strong>这首歌的回忆</strong>
      <button class="note-close" aria-label="关闭">✕</button>
    </div>
    <label><span>什么时候听的</span><input name="when" type="text" placeholder="比如：雨天地铁、凌晨 2 点"></label>
    <label><span>什么场景</span><input name="scene" type="text" placeholder="比如：一个人走路、宿舍里"></label>
    <label><span>简短感想</span><textarea name="thought" rows="3" placeholder="写一句最想记住的话"></textarea></label>
    <div class="note-popover-actions"><button class="note-save" type="button">保存笔记</button></div>
  </div>
`;
document.body.appendChild(notePreview);
document.body.appendChild(notePopover);
const noteCard = notePopover.querySelector('.note-popover-card');
const noteHeader = notePopover.querySelector('.note-popover-header');
noteHeader.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button')) return;
  const rect = noteCard.getBoundingClientRect();
  noteDrag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  noteHeader.setPointerCapture(event.pointerId);
  noteHeader.classList.add('is-dragging');
  event.preventDefault();
});
noteHeader.addEventListener('pointermove', (event) => {
  if (!noteDrag) return;
  const maxLeft = Math.max(14, window.innerWidth - noteCard.offsetWidth - 14);
  const maxTop = Math.max(14, window.innerHeight - noteCard.offsetHeight - 14);
  noteCard.style.left = `${Math.max(14, Math.min(maxLeft, event.clientX - noteDrag.offsetX))}px`;
  noteCard.style.top = `${Math.max(14, Math.min(maxTop, event.clientY - noteDrag.offsetY))}px`;
});
noteHeader.addEventListener('pointerup', () => {
  noteDrag = null;
  noteHeader.classList.remove('is-dragging');
});
notePopover.addEventListener('click', (event) => { if (event.target === notePopover) closeNotePopover(); });
notePopover.querySelector('.note-close').addEventListener('click', closeNotePopover);
notePopover.querySelector('.note-save').addEventListener('click', () => {
  const file = notePopover.dataset.file;
  if (!file) return;
  notes[file] = {
    when: notePopover.querySelector('[name="when"]').value.trim(),
    scene: notePopover.querySelector('[name="scene"]').value.trim(),
    thought: notePopover.querySelector('[name="thought"]').value.trim()
  };
  saveNotes();
  render();
  closeNotePopover();
});
window.addEventListener('resize', () => {
  if (!notePopover.classList.contains('visible')) return;
  positionNotePopover();
});
window.addEventListener('scroll', positionNotePopover, { passive: true });
playlist.addEventListener('scroll', positionNotePopover, { passive: true });
loadStaticTracks();
