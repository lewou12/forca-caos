/** Orquestrador do cliente: sessao, polling versionado e acoes. */

import { ApiError, api, clearSession, loadSession, newActionId, saveSession } from './api.js';
import { $, clamp } from './dom.js';
import { isSoundEnabled, setSoundEnabled, sfx } from './sound.js';
import {
  renderFinished,
  renderGame,
  renderHomeHint,
  renderLobby,
  renderRound,
  renderTargets,
  setTopbar,
  showScreen,
  updateTimer,
} from './views.js';

const state = {
  session: null,
  snap: null,
  busy: false,
  selectedPowerup: null,
  offset: 0,
  lastVersion: -1,
  lastStatus: null,
  pollTimer: null,
  abort: null,
  backoff: 700,
  blindWasActive: false,
  leaving: false,
};

const SOUND_KEY = 'forca.som.v1';
const NAME_KEY = 'forca.nome.v1';

function now() {
  return Date.now() + state.offset;
}

/* ------------------------------------------------------------------ */
/* inicializacao                                                       */
/* ------------------------------------------------------------------ */

function boot() {
  try {
    const storedSound = localStorage.getItem(SOUND_KEY);
    if (storedSound === 'off') setSoundEnabled(false);
  } catch {
    /* ignora */
  }
  paintSoundIcon();

  const lastName = safeGet(NAME_KEY);
  if (lastName) {
    $('#create-name').value = lastName;
    $('#join-name').value = lastName;
  }

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('sala');
  if (codeParam) {
    $('#join-code').value = codeParam.toUpperCase().slice(0, 5);
  }

  wireEvents();

  const session = loadSession();
  renderHomeHint(session);
  if (session) {
    state.session = session;
    resume(session);
  } else {
    showScreen('home');
    setTopbar({ inRoom: false });
  }
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignora */
  }
}

async function resume(session) {
  showScreen('loading');
  $('#loading-text').textContent = `Voltando para a sala ${session.code}…`;
  setTopbar({ inRoom: true });
  try {
    const { snapshot } = await api.state(session);
    state.snap = snapshot;
    state.lastVersion = snapshot.version;
    state.lastStatus = snapshot.status;
    state.offset = snapshot.serverNow - Date.now();
    render();
    startPolling();
  } catch (error) {
    handleFatal(error);
  }
}

/* ------------------------------------------------------------------ */
/* eventos                                                             */
/* ------------------------------------------------------------------ */

function wireEvents() {
  $('#create-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#create-name').value.trim();
    const wordLength = Number($('#create-length').value);
    if (name.length < 2) return toast('Escolha um nome com pelo menos 2 caracteres.', 'error');
    createRoom(name, wordLength);
  });

  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#join-name').value.trim();
    const code = $('#join-code').value.trim().toUpperCase();
    if (name.length < 2) return toast('Escolha um nome com pelo menos 2 caracteres.', 'error');
    if (code.length !== 5) return toast('O código da sala tem 5 caracteres.', 'error');
    joinRoom(code, name);
  });

  $('#resume-btn').addEventListener('click', () => {
    const session = loadSession();
    if (session) {
      state.session = session;
      resume(session);
    } else {
      renderHomeHint(null);
    }
  });

  $('#start-btn').addEventListener('click', startMatch);
  $('#copy-code').addEventListener('click', () => copy(state.snap?.code ?? '', 'Código copiado!'));
  $('#copy-link').addEventListener('click', () => {
    if (!state.snap) return;
    copy(`${window.location.origin}/?sala=${state.snap.code}`, 'Link de convite copiado!');
  });

  $('#sound-toggle').addEventListener('click', () => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    safeSet(SOUND_KEY, next ? 'on' : 'off');
    paintSoundIcon();
    if (next) sfx('correct');
  });

  $('#leave-btn').addEventListener('click', () => leaveRoom(true));
  $('#brand-link').addEventListener('click', (event) => {
    if (state.session) {
      event.preventDefault();
      leaveRoom(true);
    }
  });

  $('#rematch-btn').addEventListener('click', startMatch);
  $('#home-btn').addEventListener('click', () => leaveRoom(true));

  $('#target-cancel').addEventListener('click', closeTargetModal);
  $('#target-modal').addEventListener('click', (event) => {
    if (event.target === $('#target-modal')) closeTargetModal();
  });

  $('#pano-toggle').addEventListener('click', () => {
    const pano = $('#panorama');
    const open = pano.classList.toggle('open');
    $('#pano-toggle').setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTargetModal();
      closePanorama();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (state.snap?.status !== 'playing') return;
    const letter = event.key.toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return;
    event.preventDefault();
    submitGuess(letter);
  });

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.session && !state.pollTimer) {
      startPolling();
    }
  });
}

function paintSoundIcon() {
  const button = $('#sound-toggle');
  button.setAttribute('aria-pressed', String(isSoundEnabled()));
  $('#sound-icon').textContent = isSoundEnabled() ? '♪' : '♪̸';
}

function closePanorama() {
  const pano = $('#panorama');
  if (!pano) return;
  pano.classList.remove('open');
  $('#pano-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ------------------------------------------------------------------ */
/* acoes                                                               */
/* ------------------------------------------------------------------ */

async function createRoom(name, wordLength) {
  state.busy = true;
  try {
    const data = await api.createRoom({ name, wordLength });
    adoptSession({ code: data.code, playerId: data.playerId, token: data.token }, name);
    applySnapshot(data.snapshot);
    startPolling();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busy = false;
  }
}

async function joinRoom(code, name) {
  state.busy = true;
  try {
    const existing = loadSession();
    const session = existing && existing.code === code ? existing : null;
    const data = await api.joinRoom(code, name, session);
    adoptSession({ code: data.code, playerId: data.playerId, token: data.token }, name);
    applySnapshot(data.snapshot);
    startPolling();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busy = false;
  }
}

function adoptSession(session, name) {
  state.session = session;
  saveSession(session);
  safeSet(NAME_KEY, name);
  state.lastVersion = -1;
  state.lastStatus = null;
  setTopbar({ inRoom: true });
  renderHomeHint(null);
}

async function startMatch() {
  if (!state.session || state.busy) return;
  state.busy = true;
  try {
    const { snapshot } = await api.start(state.session);
    applySnapshot(snapshot);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busy = false;
    if (state.snap) render();
  }
}

async function submitGuess(letter) {
  if (!state.session || state.busy) return;
  const snap = state.snap;
  if (!snap || snap.status !== 'playing' || !snap.you.canAct) return;
  state.busy = true;
  try {
    const { snapshot } = await api.guess(state.session, letter, newActionId());
    const guessedBefore = snap.you.guessed?.length ?? 0;
    const wrongBefore = snap.you.wrong;
    applySnapshot(snapshot);
    if (snapshot.you.wrong > wrongBefore) sfx('wrong');
    else if ((snapshot.you.guessed?.length ?? 0) > guessedBefore) sfx('correct');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busy = false;
    if (state.snap) render();
  }
}

function onPowerup(id, needsTarget) {
  const snap = state.snap;
  if (!snap || snap.status !== 'playing' || state.busy) return;
  if (needsTarget) {
    state.selectedPowerup = id;
    renderTargets(snap, id, (targetId) => {
      closeTargetModal();
      usePowerup(id, targetId);
    });
    $('#target-modal').hidden = false;
    render();
    return;
  }
  usePowerup(id, null);
}

async function usePowerup(id, targetId) {
  if (!state.session || state.busy) return;
  state.busy = true;
  try {
    const { snapshot } = await api.powerup(state.session, id, targetId, newActionId());
    applySnapshot(snapshot);
    sfx(targetId ? 'attack' : 'power');
    toast(`${snapshot.log.at(-1)?.message ?? 'Power-up usado.'}`, 'info');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.busy = false;
    state.selectedPowerup = null;
    closeTargetModal();
    if (state.snap) render();
  }
}

async function leaveRoom(goHome) {
  if (state.leaving) return;
  const session = state.session;
  state.leaving = true;
  stopPolling();
  if (session) {
    try {
      await api.leave(session);
    } catch {
      /* sair e best-effort */
    }
  }
  clearSession();
  state.session = null;
  state.snap = null;
  state.lastVersion = -1;
  state.lastStatus = null;
  renderHomeHint(null);
  showScreen('home');
  setTopbar({ inRoom: false });
  state.leaving = false;
  if (goHome) window.history.replaceState({}, '', '/');
}

function closeTargetModal() {
  $('#target-modal').hidden = true;
  if (state.selectedPowerup) {
    state.selectedPowerup = null;
    if (state.snap) render();
  }
}

/* ------------------------------------------------------------------ */
/* polling                                                             */
/* ------------------------------------------------------------------ */

function startPolling() {
  stopPolling();
  state.backoff = 700;
  state.pollTimer = setTimeout(poll, 300);
}

function stopPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
  if (state.abort) state.abort.abort();
  state.abort = null;
}

async function poll() {
  state.pollTimer = null;
  if (!state.session) return;
  const controller = new AbortController();
  state.abort = controller;
  try {
    const { snapshot } = await api.state(state.session, controller.signal);
    state.backoff = 700;
    applySnapshot(snapshot);
    schedulePoll(700);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (error?.code === 'INVALID_SESSION' || error?.code === 'ROOM_NOT_FOUND' || error?.code === 'PLAYER_NOT_FOUND') {
      handleFatal(error);
      return;
    }
    state.backoff = clamp(Math.round(state.backoff * 1.8), 900, 6000);
    schedulePoll(state.backoff);
  }
}

function schedulePoll(delay) {
  if (!state.session) return;
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(poll, delay);
}

function handleFatal(error) {
  stopPolling();
  clearSession();
  state.session = null;
  state.snap = null;
  state.lastVersion = -1;
  state.lastStatus = null;
  showScreen('home');
  setTopbar({ inRoom: false });
  renderHomeHint(null);
  toast(error?.code === 'ROOM_NOT_FOUND' ? 'Sala não encontrada.' : 'Sessão expirada. Crie ou entre em outra sala.', 'error');
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function applySnapshot(snapshot) {
  const previousStatus = state.lastStatus;
  const previousVersion = state.lastVersion;

  state.snap = snapshot;
  state.offset = snapshot.serverNow - Date.now();
  state.lastVersion = snapshot.version;
  state.lastStatus = snapshot.status;

  render();

  if (previousStatus && previousStatus !== snapshot.status) {
    if (snapshot.status === 'round_over') {
      sfx('round');
      toast(`Rodada ${snapshot.roundSummary?.round ?? snapshot.round} encerrada.`, 'info');
    } else if (snapshot.status === 'finished') {
      sfx(snapshot.winnerId === snapshot.you.id ? 'win' : 'round');
      const winner = snapshot.finalStandings?.[0];
      toast(winner ? `${winner.name} venceu a partida!` : 'Partida encerrada.', 'success');
    } else if (snapshot.status === 'playing' && previousStatus !== 'playing') {
      toast(`Rodada ${snapshot.round} começou!`, 'info');
    }
  } else if (previousVersion === -1) {
    /* primeira renderizacao */
  }
}

function render() {
  const snap = state.snap;
  if (!snap) return;
  setTopbar({ inRoom: Boolean(state.session) });

  const ctx = {
    now: now(),
    busy: state.busy,
    selectedPowerup: state.selectedPowerup,
    onGuess: submitGuess,
    onPowerup,
    onTarget: (targetId) => {
      const id = state.selectedPowerup;
      closeTargetModal();
      if (id) usePowerup(id, targetId);
    },
  };

  if (snap.status === 'lobby') {
    showScreen('lobby');
    renderLobby(snap, ctx);
  } else if (snap.status === 'playing') {
    showScreen('game');
    renderGame(snap, ctx);
    renderHomeHint(null);
  } else if (snap.status === 'round_over') {
    showScreen('round');
    renderRound(snap);
  } else if (snap.status === 'finished') {
    showScreen('finished');
    renderFinished(snap);
  }

  updateTimer(snap, ctx.now);
  state.blindWasActive = snap.you?.effects?.blindUntil > ctx.now;
}

/* ------------------------------------------------------------------ */
/* relogio local                                                       */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const snap = state.snap;
  if (!snap) return;
  updateTimer(snap, now());

  if (snap.status === 'playing') {
    const blind = snap.you?.effects?.blindUntil > now();
    if (state.blindWasActive && !blind) {
      state.blindWasActive = false;
      render();
    } else if (!state.blindWasActive && blind) {
      state.blindWasActive = true;
      render();
    }
  }
}, 250);

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

let toastSeq = 0;

export function toast(message, type = 'info') {
  if (!message) return;
  const host = document.getElementById('toasts');
  if (!host) return;
  toastSeq += 1;
  const id = `toast-${toastSeq}`;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.id = id;
  node.textContent = message;
  host.append(node);
  while (host.children.length > 4) host.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 320);
  }, 3800);
}

async function copy(text, successMessage) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, 'success');
  } catch {
    toast(`Copie manualmente: ${text}`, 'info');
  }
}

/* expõe para debug sem poluir o escopo global de forma perigosa */
window.__forca = { version: 1 };

boot();
