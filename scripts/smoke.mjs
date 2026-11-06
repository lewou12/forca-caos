#!/usr/bin/env node
/**
 * Smoke test ponta a ponta contra um servidor Pages local ou remoto.
 *
 *   BASE_URL=http://127.0.0.1:8788 node scripts/smoke.mjs
 *
 * Cobre: health, criacao, entrada, inicio, estado, chute, power-up,
 * anti-vazamento, sessao invalida, idempotencia e saida.
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const results = [];
let failures = 0;

function ok(name, detail = '') {
  results.push(`  \u2713 ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failures += 1;
  results.push(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
}

function check(condition, name, detail = '') {
  if (condition) ok(name, detail);
  else fail(name, detail || 'condicao falsa');
}

async function http(method, path, { body, session, headers = {} } = {}) {
  const requestHeaders = { accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (session) {
    requestHeaders['x-player-id'] = session.playerId;
    requestHeaders['x-player-token'] = session.token;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data, headers: response.headers };
}

function actionId(label) {
  return `${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertNoSecrets(label, payload, secrets) {
  const json = JSON.stringify(payload);
  const leaked = secrets.filter((secret) => secret && json.includes(secret));
  check(leaked.length === 0, `${label}: sem vazamento de palavra/token`, leaked.join(', '));
  check(!json.includes('"word"'), `${label}: campo "word" ausente`);
}

async function main() {
  console.log(`\nForca Caos — smoke test em ${BASE_URL}\n`);

  const health = await http('GET', '/api/health');
  check(health.status === 200 && health.data?.ok === true, 'health responde 200', `db=${health.data?.db}`);

  const badName = await http('POST', '/api/rooms', { body: { name: '<>&', wordLength: 6 } });
  check(badName.status === 400 && badName.data?.error?.code === 'INVALID_NAME', 'rejeita nome sem letras');

  const xssName = await http('POST', '/api/rooms', { body: { name: '<script>Ana</script>', wordLength: 5 } });
  check(xssName.status === 201, 'aceita nome sanitizavel');
  const cleanName = xssName.data?.snapshot?.you?.name ?? '';
  check(!/[<>/"]/.test(cleanName), 'remove tags do nome', JSON.stringify(cleanName));

  const create = await http('POST', '/api/rooms', { body: { name: 'Ana', wordLength: 6 } });
  check(create.status === 201, 'cria sala', `status=${create.status}`);
  if (create.status !== 201) return finish();

  const code = create.data.code;
  const host = { code, playerId: create.data.playerId, token: create.data.token };
  check(/^[A-HJ-NP-Z2-9]{5}$/.test(code), 'codigo de sala valido', code);
  assertNoSecrets('criacao', create.data.snapshot, [host.token]);

  const join = await http('POST', `/api/rooms/${code}/join`, { body: { name: 'Bia' } });
  check(join.status === 200, 'segundo jogador entra', `status=${join.status}`);
  if (join.status !== 200) return finish();
  const guest = { code, playerId: join.data.playerId, token: join.data.token };
  check(join.data.snapshot.players.length === 2, 'lobby com 2 jogadores');

  const earlyStart = await http('POST', `/api/rooms/${code}/start`, { body: {}, session: guest });
  check(earlyStart.status === 403, 'convidado nao inicia', earlyStart.data?.error?.code);

  const start = await http('POST', `/api/rooms/${code}/start`, { body: {}, session: host });
  check(start.status === 200 && start.data?.snapshot?.status === 'playing', 'host inicia partida');
  assertNoSecrets('inicio', start.data?.snapshot, [host.token, guest.token]);

  const words = start.data.snapshot.players.map((player) => player.maskHidden);
  check(words.every((hidden) => hidden === false), 'mascaras visiveis no inicio');

  const guessLetter = 'A';
  const guess = await http('POST', `/api/rooms/${code}/guess`, {
    body: { letter: guessLetter, actionId: actionId('guess') },
    session: host,
  });
  check(guess.status === 200, 'chute aceito', `status=${guess.status}`);
  assertNoSecrets('chute', guess.data?.snapshot, [host.token, guest.token]);

  const guessId = actionId('dup');
  const first = await http('POST', `/api/rooms/${code}/guess`, {
    body: { letter: 'B', actionId: guessId },
    session: guest,
  });
  const duplicate = await http('POST', `/api/rooms/${code}/guess`, {
    body: { letter: 'C', actionId: guessId },
    session: guest,
  });
  check(first.status === 200 && duplicate.status === 200, 'chute duplicado e idempotente');

  const invalidAction = await http('POST', `/api/rooms/${code}/guess`, {
    body: { letter: 'D', actionId: 'x' },
    session: host,
  });
  check(invalidAction.status === 400 && invalidAction.data?.error?.code === 'INVALID_ACTION', 'rejeita actionId invalido');

  await sleep(5400);
  const hasOraculo = start.data.snapshot.you.powerups?.oraculo > 0;
  if (hasOraculo) {
    const power = await http('POST', `/api/rooms/${code}/powerup`, {
      body: { powerupId: 'oraculo', targetId: null, actionId: actionId('pow') },
      session: host,
    });
    check(power.status === 200, 'usa Oraculo', `status=${power.status}`);
    assertNoSecrets('power-up', power.data?.snapshot, [host.token, guest.token]);
  } else {
    fail('usa Oraculo', 'host nao recebeu carga inicial');
  }

  await sleep(700);
  const noCharge = await http('POST', `/api/rooms/${code}/powerup`, {
    body: { powerupId: 'vendaval', targetId: host.playerId, actionId: actionId('self') },
    session: host,
  });
  check(
    noCharge.status === 409 && noCharge.data?.error?.code === 'NO_CHARGE',
    'rejeita poder sem carga',
    noCharge.data?.error?.code,
  );

  const proto = await http('POST', `/api/rooms/${code}/powerup`, {
    body: { powerupId: '__proto__', targetId: null, actionId: actionId('proto') },
    session: host,
  });
  check(proto.status === 400, 'bloqueia poluicao de prototipo', proto.data?.error?.code);

  const noSession = await http('GET', `/api/rooms/${code}/state`, {
    session: { playerId: 'p_0000000000000000', token: 'a'.repeat(64) },
  });
  check(noSession.status === 401, 'sessao forjada rejeitada', noSession.data?.error?.code);

  const missingRoom = await http('GET', '/api/rooms/ZZZZZ/state', { session: host });
  check(missingRoom.status === 404, 'sala inexistente retorna 404');

  const state = await http('GET', `/api/rooms/${code}/state`, { session: host });
  check(state.status === 200 && state.data?.snapshot?.status === 'playing', 'estado consistente');
  check(state.headers.get('cache-control') === 'no-store', 'estado sem cache');
  check(state.headers.get('x-content-type-options') === 'nosniff', 'cabecalho nosniff presente');

  const leaveHost = await http('POST', `/api/rooms/${code}/leave`, { body: {}, session: host });
  check(leaveHost.status === 200, 'host sai da sala');
  const leaveGuest = await http('POST', `/api/rooms/${code}/leave`, { body: {}, session: guest });
  check(leaveGuest.status === 200 && leaveGuest.data?.deleted === true, 'sala vazia e apagada');

  finish();
}

function finish() {
  console.log(results.join('\n'));
  const total = results.length;
  console.log(`\n${total - failures}/${total} verificacoes passaram.`);
  if (failures > 0) {
    console.error(`\n${failures} falha(s) no smoke test.`);
    process.exitCode = 1;
  } else {
    console.log('Smoke test OK.\n');
  }
}

main().catch((error) => {
  console.error('\nSmoke test interrompido:', error);
  process.exitCode = 1;
});
