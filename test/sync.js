const { chromium } = require('playwright');
/* Prueba de sincronización con 5 dispositivos independientes contra Supabase real.
   ATENCIÓN: escribe y VACÍA la tabla compartida kv. Por seguridad SOLO corre si la
   tabla está vacía al empezar (así nunca borra mentores, claves ni datos reales de
   la organización). Pensada para un proyecto de pruebas, no para el del evento. Uso:
     CONFIRM_WIPE=yes BASE_URL=http://localhost:8765/index.html?sync=1 node sync.js
   (PW_EXE opcional: ruta a un Chromium ya instalado) */
if (process.env.CONFIRM_WIPE !== 'yes') { console.log('Esta prueba escribe en la tabla kv de Supabase. Para continuar: CONFIRM_WIPE=yes node sync.js'); process.exit(1); }
const BASE = process.env.BASE_URL || 'http://localhost:8765/index.html?sync=1';
const SB = 'https://erzghhfrlwjllmwmhtsn.supabase.co', KEY = 'sb_publishable_c-YyUXwqwTx-ZW85hR7DqA_Oy_3pgXl';
const log = (...a) => console.log(...a);
let failures = 0;
const check = (c, m) => { if (c) log('  ✔', m); else { failures++; log('  ✘ FAIL:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wipe = () => fetch(SB + '/rest/v1/kv?key=like.rutaideathon_v3_*', { method: 'DELETE', headers: { apikey: KEY } }).then(r => r.status);

(async () => {
  const existing = await fetch(SB + '/rest/v1/kv?select=key&limit=1', { headers: { apikey: KEY } }).then(r => r.json());
  if (!Array.isArray(existing) || existing.length) { log('La tabla kv NO está vacía (o no responde): no se ejecuta para no borrar datos reales.'); process.exit(1); }
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const errors = [];
  // cada dispositivo = contexto propio (localStorage independiente)
  async function device(hash, name) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    await p.goto(BASE + (hash || ''));
    return p;
  }
  const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem('rutaideathon_v3_' + k) || 'null'), k);
  const dot = p => p.evaluate(() => { const d = [...document.querySelectorAll('div')].find(x => x.style.position === 'fixed' && x.style.borderRadius === '50%'); return d ? d.title : null; });

  log('\n[1] Organización y proyector');
  const org = await device('#admin', 'org');
  await org.fill('#orgPinInput', '2026');
  await org.click('[data-action="submitOrgPin"]');
  await org.waitForSelector('.tab.active');
  await sleep(1500);
  check((await dot(org)) === 'Sincronizado', 'Indicador de estado: Sincronizado');
  const stage = await device('#ruleta', 'stage');

  log('\n[2] Sorteo en vivo cruza dispositivos');
  await stage.click('[data-action="startDraw"]');
  await stage.waitForSelector('.draw-card.is-turn [data-action="confirmStageTeam"]', { timeout: 15000 });
  const gO = await ls(org, 'game'), gS = await ls(stage, 'game');
  check(gO.turnTeamId && gO.turnTeamId === gS.turnTeamId, 'Proyector recibió el grupo sorteado: ' + gS.turnTeamId);
  const tid = gO.turnTeamId, code = 'GP0' + tid.replace('g', '');

  log('\n[3] Celular del grupo: confirmar, girar, aceptar misión');
  const phone = await device('#grupo', 'phone');
  await phone.waitForSelector('#groupCode');
  await phone.fill('#groupCode', code);
  await phone.click('[data-action="submitGroupCode"]');
  await phone.waitForSelector('.draw-card.is-turn [data-action="confirmStageTeam"]', { timeout: 15000 });
  check(true, 'Celular nuevo ve el turno sin haber estado abierto antes');
  await phone.click('[data-action="confirmStageTeam"]');
  await phone.click('#spinBtn');
  const t0 = Date.now();
  await stage.waitForFunction(() => { const w = document.getElementById('wheelEl'); return w && w.dataset.spinning === '1'; }, null, { timeout: 4000 }).catch(() => {});
  const lat = Date.now() - t0;
  check(await stage.evaluate(() => document.getElementById('wheelEl').dataset.spinning === '1'), 'Proyector reproduce el giro del celular (arranca ' + lat + ' ms después del clic)');
  await sleep(4600);
  await phone.click('[data-action="acceptMission"]');
  await phone.waitForSelector('text=IR A NUESTRA RUTA');
  await sleep(3500);
  const tOrg = await ls(org, tid);
  check(tOrg && tOrg.mission && tOrg.mission.id, 'Organización ve la misión asignada a ' + tid + ': ' + (tOrg && tOrg.mission && tOrg.mission.id));
  await phone.click('text=IR A NUESTRA RUTA');
  await phone.waitForSelector('[data-posta="p1"]');

  log('\n[4] Mentores: solicitud, alerta, exclusividad y aprobación');
  async function mentor(id, pin, name) {
    const m = await device('', name);
    await m.click('[data-action="openMentorGate"]');
    await m.selectOption('#mentorGateSel', id);
    await m.fill('#mentorGatePin', pin);
    await m.click('[data-action="submitMentorPin"]');
    await m.waitForSelector('[data-mtab="solicitudes"]');
    return m;
  }
  const mA = await mentor('me1', '1001', 'mentorA');
  const mB = await mentor('me2', '1002', 'mentorB');
  check(true, 'Dos mentores en dispositivos distintos ingresan con PIN');
  await phone.click('[data-posta="p1"]');
  await phone.fill('#p1q1', 'Botellas plásticas en el patio');
  await phone.fill('#p1q2', 'Patio de la escuela');
  await phone.fill('#p1q3', 'Se acumulan y tapan desagües');
  await phone.fill('#p1problem', 'Se tiran botellas en el patio');
  await phone.click('[data-action="requestP1"]');
  await phone.waitForSelector('text=ESPERANDO A UN MENTOR');
  await mA.waitForSelector('[data-action="claimRequest"]', { timeout: 15000 });
  await mB.waitForSelector('[data-action="claimRequest"]', { timeout: 15000 });
  check(true, 'Ambos mentores reciben la solicitud del grupo');
  await mA.click('[data-action="claimRequest"]');
  await mA.waitForSelector('[data-action="approveRequest"]');
  await mB.waitForSelector('text=Tomadas por otros mentores', { timeout: 15000 });
  check((await mB.locator('[data-action="claimRequest"]').count()) === 0, 'Mentor B ya no puede aceptar lo que tomó A');
  await phone.waitForSelector('text=aceptó su solicitud', { timeout: 15000 });
  check(true, 'Grupo ve que un mentor aceptó');
  await mA.click('[data-action="toggleReject"]');
  await mA.fill('#mReason', 'Precisen a quién afecta.');
  await mA.click('[data-action="rejectRequest"]');
  await phone.waitForSelector('text=Precisen a quién afecta.', { timeout: 15000 });
  check(true, 'Grupo ve el motivo de rechazo');
  await phone.fill('#p1problem', 'Se tiran botellas y afectan a 1.º año');
  await phone.click('[data-action="requestP1"]');
  await mB.waitForSelector('[data-action="claimRequest"]', { timeout: 15000 });
  await mB.click('[data-action="claimRequest"]');
  await mB.fill('#mObs', 'Muy bien');
  await mB.click('[data-action="approveRequest"]');
  await phone.waitForSelector('text=IR A LA POSTA 2', { timeout: 15000 });
  check(true, 'Segunda revisión aprobada por el mentor B: el grupo pasa a la posta 2');
  const reqs = await ls(org, 'requests');
  await sleep(2500);
  check(reqs.length === 1 || (await ls(org, 'requests')).length >= 1, 'Organización tiene el historial de solicitudes (' + (await ls(org, 'requests')).length + ')');

  log('\n[4b] Consulta a un mentor elegido, entre dispositivos');
  await phone.click('text=IR A LA POSTA 2');
  await phone.waitForSelector('[data-action="openConsult"]');
  await phone.click('[data-action="openConsult"]');
  await phone.click('[data-action="callMentor"][data-mentor-id="me1"]');
  await mA.waitForSelector('[data-action="claimConsulta"]', { timeout: 15000 });
  check(true, 'La consulta llega al mentor elegido, en otro dispositivo');
  check((await mB.locator('[data-action="claimConsulta"]').count()) === 0, 'El otro mentor no la ve');
  await mA.click('[data-action="claimConsulta"]');
  await phone.waitForSelector('text=aceptó su consulta', { timeout: 15000 });
  check(true, 'El grupo ve que el mentor aceptó la consulta');
  await mA.click('[data-action="finishConsulta"]');
  await phone.waitForSelector('[data-action="openConsult"]', { timeout: 15000 });
  check(true, 'Al finalizar, el grupo puede volver a llamar');

  log('\n[5] Persistencia: un dispositivo nuevo ve el estado actual');
  const late = await device('#public', 'late');
  await late.waitForSelector('#app *');
  await sleep(1500);
  const tLate = await ls(late, tid);
  check(tLate && tLate.postas.p1.status === 'approved' || (tLate && tLate.postas.p2.status === 'current'), 'Tablero público recién abierto carga el avance de ' + tid);

  log('\n[6] Reinicio de la organización se propaga');
  await org.locator('.tab', { hasText: 'Gestión de mentores' }).click();
  await org.click('[data-action="askResetAll"]');
  await org.click('[data-action="confirmResetAll"]');
  await sleep(4500);
  check((await ls(phone, tid)) === null, 'El celular del grupo ya no tiene el equipo (borrado propagado)');
  check((await ls(stage, 'game')) === null, 'El proyector ya no tiene el sorteo');
  check(((await ls(mB, 'requests')) || []).length === 0, 'El mentor ya no tiene solicitudes');
  check((await ls(mB, 'consultas')) === null, 'El mentor ya no tiene consultas');

  log('\n[7] Errores de página:', errors.length ? errors : 'ninguno');
  if (errors.length) failures++;
  await browser.close();
  log('limpieza final:', await wipe());
  log(failures ? '\n' + failures + ' FALLAS' : '\nTODO OK');
  process.exit(failures ? 1 : 0);
})().catch(async e => { console.log('EXCEPTION', e.message); await wipe(); process.exit(2); });
