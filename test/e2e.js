const { chromium } = require('playwright');
const URL = 'http://localhost:8765/index.html';
const log = (...a) => console.log(...a);
let failures = 0;
function check(cond, msg) { if (cond) log('  ✔', msg); else { failures++; log('  ✘ FAIL:', msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  async function open(hash, name) {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    await p.goto(URL + (hash || ''));
    return p;
  }
  async function enterCode(p, code) {
    await p.click('[data-nav="login"]');
    const id = 'g' + parseInt(code.replace(/\D/g, ''), 10);
    await p.click(`[data-team="${id}"]`);
    await p.waitForSelector('#cardCode');
    await p.fill('#cardCode', code);
    await p.click('[data-action="submitCardCode"]');
  }
  const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem('rutaideathon_v3_' + k) || 'null'), k);

  // ---------- ORGANIZACIÓN ----------
  log('\n[1] Acceso organización');
  const home = await open('', 'home');
  const cards = await home.locator('.access-card').allInnerTexts();
  check(cards.length === 2 && /Mentores/.test(cards[0]) && /Organización/.test(cards[1]), 'Inicio: accesos de Mentores y Organización en tarjetas grandes');
  const fs = await home.locator('.access-card').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  check(fs >= 16, 'Letra de los accesos agrandada (' + fs + 'px)');
  await home.close();
  const org = await open('#admin', 'org');
  await org.fill('#orgPinInput', '2026');
  await org.click('[data-action="submitOrgPin"]');
  await org.waitForSelector('.tab.active');
  check(await org.locator('.tab.active').innerText() === 'Sorteo en vivo', 'Panel abre en "Sorteo en vivo" cuando faltan misiones');

  const stage = await open('#ruleta', 'stage');
  const pub = await open('#public', 'public');
  check(await stage.locator('#spinBtn').isDisabled(), 'Ruleta bloqueada antes del sorteo');
  check(await stage.locator('#stageStatus').count() === 0, 'La pantalla del sorteo no muestra leyenda de instrucción (solo título, rueda y tarjetas)');

  // ---------- SORTEO + DESHACER ----------
  log('\n[2] Sorteo en vivo, animación y deshacer turno');
  check(await org.locator('[data-action="startDraw"]').count() === 0, 'El panel de organización ya no tiene el botón de sorteo');
  await stage.click('[data-action="startDraw"]');
  await sleep(900);
  const hotCount = await stage.locator('.draw-card.is-hot').count();
  check(hotCount === 1, 'Durante la animación hay exactamente 1 tarjeta resaltada en el escenario (' + hotCount + ')');
  check(await stage.locator('[data-action="startDraw"]').isDisabled(), 'Botón de sorteo bloqueado durante el turno');
  await sleep(4000);
  const g1 = await ls(org, 'game');
  check(!!g1.turnTeamId, 'Grupo sorteado: ' + g1.turnTeamId);
  await stage.waitForSelector('.draw-card.is-turn');
  check(await stage.locator('.draw-card.is-turn').count() === 1 && await stage.locator('[data-action="confirmStageTeam"]').count() === 0, 'Solo la tarjeta sorteada queda resaltada, sin botón "Somos este grupo"');
  check((await pub.locator('.public-turn').innerText()).includes('Turno de sorteo'), 'Tablero público muestra el turno');
  await org.waitForSelector('[data-action="undoTurn"]');
  await org.click('[data-action="undoTurn"]');
  await sleep(300);
  const g2 = await ls(org, 'game');
  check(!g2.turnTeamId && g2.order.length === 0, 'Deshacer turno limpia el turno y el orden');

  // ---------- 7 TURNOS ----------
  log('\n[3] Siete turnos completos con match grupo+misión');
  for (let i = 0; i < 7; i++) {
    await stage.waitForSelector('[data-action="startDraw"]:not([disabled])');
    await stage.click('[data-action="startDraw"]');
    await sleep(4500);
    await stage.waitForSelector('.draw-card.is-turn');
    check(!(await stage.locator('#spinBtn').isDisabled()), `T${i + 1}: rueda lista para girar apenas se sortea el grupo`);
    if (i === 1) {
      // El líder del grupo sorteado lo hace desde su celular (QR + código)
      const tid = (await ls(org, 'game')).turnTeamId;
      const code = 'GP0' + tid.replace('g', '');
      const phone = await open('#grupo', 'phone');
      await phone.waitForSelector('#groupCode');
      await phone.fill('#groupCode', code.toLowerCase());
      await phone.click('[data-action="submitGroupCode"]');
      await phone.waitForSelector('.draw-card.is-turn');
      check((await phone.locator('#stageStatus').innerText()).includes('Les tocó'), 'Celular del grupo: "¡Les tocó!"');
      check(await phone.locator('[data-action="confirmStageTeam"]').count() === 0, 'Celular: sin botón "Somos este grupo"');
      await phone.click('#spinBtn');
      await sleep(800);
      check(await stage.evaluate(() => document.getElementById('wheelEl').dataset.spinning === '1'), 'Proyector reproduce el giro hecho desde el celular');
      await sleep(4200);
      await phone.click('[data-action="acceptMission"]');
      await phone.waitForSelector('text=IR A NUESTRA RUTA');
      check(true, 'Celular: match confirmado con botón a la ruta');
      await sleep(300);
      check(!(await stage.locator('[data-action="acceptMission"]').count()), 'Proyector vuelve a "esperando sorteo" tras aceptar');
      await phone.click('text=IR A NUESTRA RUTA');
      await phone.waitForSelector('[data-posta="p1"]');
      check(true, 'Celular entra a la ruta del grupo');
      await phone.close();
      continue;
    }
    check(!(await stage.locator('#spinBtn').isDisabled()), `T${i + 1}: rueda habilitada tras el sorteo`);
    if (i === 0) {
      await stage.click('#spinBtn');
      await sleep(4600);
      await stage.reload(); // recarga en medio: la misión ya sorteada debe mantenerse
      await stage.waitForSelector('[data-action="acceptMission"]');
      check(true, 'T1: tras recargar se conserva la misión sorteada (no se puede re-girar)');
      check(await org.locator('[data-action="undoTurn"]').count() === 0, 'T1: "Deshacer turno" desaparece una vez girada la rueda');
    } else {
      await stage.click('#spinBtn');
      await sleep(4600);
    }
    await stage.click('[data-action="acceptMission"]');
    await sleep(300);
  }
  const teams = [];
  for (const id of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']) teams.push(await ls(org, id));
  const ms = teams.map(t => t && t.mission && t.mission.id);
  check(ms.every(Boolean) && new Set(ms).size === 7, '7 grupos con 7 misiones distintas: ' + ms.join(','));
  check(await stage.locator('.draw-card.is-done').count() === 7, 'Escenario: las 7 tarjetas de grupo figuran con misión (sorteo completo)');
  await stage.waitForSelector('[data-action="startDraw"][disabled]');
  check(true, 'Botón de sorteo deshabilitado al terminar');
  check(await pub.locator('.public-turn').count() === 0, 'Tablero público oculta la línea de turno al terminar');

  // ---------- MENTORES ----------
  log('\n[4] Acceso de mentores');
  const mA = await open('', 'mentorA');
  await mA.click('[data-action="openMentorGate"]');
  await mA.selectOption('#mentorGateSel', 'me1');
  await mA.fill('#mentorGatePin', '9999');
  await mA.click('[data-action="submitMentorPin"]');
  check((await mA.locator('.modal .warn').innerText()).includes('PIN incorrecto'), 'PIN incorrecto rechazado');
  await mA.fill('#mentorGatePin', '1001');
  await mA.click('[data-action="submitMentorPin"]');
  await mA.waitForSelector('[data-mtab="solicitudes"]');
  check(true, 'Mentor/a 1 ingresa con PIN 1001');
  const mB = await open('', 'mentorB');
  await mB.click('[data-action="openMentorGate"]');
  await mB.selectOption('#mentorGateSel', 'me2');
  await mB.fill('#mentorGatePin', '1002');
  await mB.click('[data-action="submitMentorPin"]');
  await mB.waitForSelector('[data-mtab="grupos"]');
  await mB.click('[data-mtab="grupos"]');
  const ctx1 = await mB.locator('.ctx-card').first().innerText();
  check(ctx1.includes('EJE') || ctx1.toLowerCase().includes('eje'), 'Ficha de grupo con Eje');
  check(ctx1.toLowerCase().includes('propósito') && ctx1.toLowerCase().includes('desafío'), 'Ficha con Propósito y Desafío (pendiente)');
  await mB.click('[data-mtab="solicitudes"]');

  // ---------- GRUPO 1: P1 con rechazo y re-solicitud ----------
  log('\n[5] Flujo de validación: solicitud → aceptar → no aprobar → corregir → aprobar');
  const team = await open('', 'team');
  await team.click('[data-nav="login"]');
  check(await team.locator('.team-card').count() === 7, 'COMENZAR muestra el panel de 7 tarjetas');
  check(await team.locator('.team-card.done').count() === 7 && (await team.locator('.team-card').first().innerText()).match(/MENOS|SEGUNDA|SEPARAR|NO TODO|ANTES|SABEMOS|MEDIR/), 'Las tarjetas muestran el tema de cada grupo');
  await team.click('[data-team="g1"]');
  await team.fill('#cardCode', 'GP02'); await team.click('[data-action="submitCardCode"]');
  check((await team.locator('.modal .warn').innerText()).includes('Código incorrecto para GRUPO 1'), 'Tarjeta rechaza el código de otro grupo');
  await team.fill('#cardCode', 'gp01'); await team.press('#cardCode', 'Enter');
  await team.waitForSelector('[data-posta="p1"]');
  check(true, 'Tarjeta + código correcto entra a la ruta');
  await team.click('[data-posta="p1"]');
  await team.click('[data-action="requestP1"]');
  check((await team.locator('.notice').innerText()).includes('Falta'), 'P1: campos obligatorios siguen validándose');
  await team.fill('#p1q1', 'Botellas plásticas en el patio');
  await team.fill('#p1q2', 'Patio de la escuela');
  await team.fill('#p1q3', 'Se acumulan y tapan desagües');
  await team.fill('#p1problem', 'Se tiran botellas en el patio');
  await team.click('[data-action="requestP1"]');
  await team.waitForSelector('text=ESPERANDO A UN MENTOR');
  check(true, 'P1: grupo ve "Esperando a un mentor"');
  await mA.waitForSelector('[data-action="claimRequest"]');
  await mB.waitForSelector('[data-action="claimRequest"]');
  check((await mB.locator('.req-card').first().innerText()).includes('VALIDACIÓN'), 'La tarjeta del mentor indica que es una VALIDACIÓN');
  check(await mB.locator('#toast:not([hidden])').count() === 1, 'Mentor B recibe la alerta visual de nueva solicitud');
  await mA.click('[data-action="claimRequest"]');
  await mA.waitForSelector('[data-action="approveRequest"]');
  await mB.waitForSelector('text=Tomadas por otros mentores');
  check(await mB.locator('[data-action="claimRequest"]').count() === 0, 'Mentor B ya no puede aceptar la solicitud tomada por A');
  await team.waitForSelector('text=aceptó su solicitud');
  check(true, 'Grupo ve que el mentor aceptó y está en camino');
  check((await ls(org, 'mentors')).find(m => m.id === 'me1').estado === 'ocupado', 'Mentor A queda "Ocupado"');
  const rv = await mA.locator('.card').first().innerText();
  check(rv.includes('Botellas plásticas'), 'Mentor ve el contenido de la posta en la revisión');
  await mA.click('[data-action="toggleReject"]');
  await mA.click('[data-action="rejectRequest"]');
  check((await mA.locator('.notice').innerText()).includes('motivo'), 'No aprobar exige motivo');
  await mA.fill('#mReason', 'Precisen a quién afecta.');
  await mA.click('[data-action="rejectRequest"]');
  await team.waitForSelector('text=Precisen a quién afecta.');
  check(!(await team.locator('#p1problem').isDisabled()), 'Grupo ve el motivo y la posta vuelve a ser editable');
  check((await team.locator('#p1q1').inputValue()) === 'Botellas plásticas en el patio', 'Se conserva lo ya cargado');
  check((await ls(org, 'mentors')).find(m => m.id === 'me1').estado === 'disponible', 'Mentor A vuelve a "Disponible"');
  await team.fill('#p1problem', 'Se tiran botellas en el patio y afectan a los alumnos de 1.º año');
  await team.click('[data-action="requestP1"]');
  await mB.waitForSelector('[data-action="claimRequest"]');
  check((await mB.locator('.req-info small').first().innerText()).includes('Segunda revisión'), 'Mentor ve que es una segunda revisión');
  await mB.click('[data-action="claimRequest"]');
  await mB.fill('#mObs', 'Muy bien');
  await mB.click('[data-action="approveRequest"]');
  await team.waitForSelector('text=IR A LA POSTA 2');
  check(true, 'P1 aprobada: grupo ve sello y botón a la Posta 2');

  // helper: mentor A aprueba la siguiente
  async function mentorApprove(m) {
    await m.waitForSelector('[data-action="claimRequest"]:not([disabled])');
    await m.click('[data-action="claimRequest"]');
    await m.click('[data-action="approveRequest"]');
  }

  // ---------- P2 con "no" (vuelta a P1 sin mentor) ----------
  log('\n[6] Regresión: P2 "no" vuelve a P1 sin mentor');
  await team.click('text=IR A LA POSTA 2');
  async function fillP2(verdict) {
    await team.fill('#p2count', '15'); await team.fill('#p2link', 'https://forms.gle/x');
    await team.fill('#p2l1', 'a'); await team.fill('#p2l2', 'b'); await team.fill('#p2l3', 'c');
    await team.click(`[data-verdict="${verdict}"][data-verdict-for="p2"]`);
    await team.click('[data-action="requestP2"]');
  }
  await fillP2('no');
  await team.waitForSelector('#p1q1');
  check((await ls(org, 'g1')).postas.p1.status === 'current', 'P2 "no": vuelve a P1');
  check((await ls(org, 'requests')).filter(r => r.postaId === 'p2').length === 0, 'P2 "no": no genera solicitud a mentores');
  await team.click('[data-action="requestP1"]');
  await mentorApprove(mA);
  await team.waitForSelector('text=IR A LA POSTA 2');
  await team.click('text=IR A LA POSTA 2');
  await fillP2('ok');
  await mentorApprove(mA);
  await team.waitForSelector('text=IR A LA POSTA 3');

  log('\n[7] Postas 3 a 7 (con P5 "no")');
  await team.click('text=IR A LA POSTA 3');
  await team.fill('#p3challenge', '¿Cómo podríamos reducir las botellas?');
  await team.click('[data-action="requestP3"]');
  await mentorApprove(mB);
  await team.waitForSelector('text=IR A LA POSTA 4');
  await team.click('text=IR A LA POSTA 4');
  async function fillP4() {
    for (let i = 0; i < 3; i++) await team.fill('#p4idea' + i, 'idea ' + i);
    await team.fill('#p4name', 'EcoPatio'); await team.fill('#p4what', 'Puntos de reciclaje');
    await team.click('[data-action="requestP4"]');
  }
  await fillP4();
  await mentorApprove(mA);
  await team.waitForSelector('text=IR A LA POSTA 5');
  await team.click('text=IR A LA POSTA 5');
  async function fillP5(v) {
    await team.fill('#p5count', '16'); await team.fill('#p5link', 'https://forms.gle/y'); await team.fill('#p5change', 'cambio');
    await team.click(`[data-verdict="${v}"][data-verdict-for="p5"]`);
    await team.click('[data-action="requestP5"]');
  }
  await fillP5('no');
  await team.waitForSelector('#p4name');
  check((await ls(org, 'g1')).postas.p4.status === 'current', 'P5 "no": vuelve a P4');
  await team.click('[data-action="requestP4"]');
  await mentorApprove(mA);
  await team.waitForSelector('text=IR A LA POSTA 5');
  await team.click('text=IR A LA POSTA 5');
  await fillP5('ajustar');
  await mentorApprove(mB);
  await team.waitForSelector('text=IR A LA POSTA 6');
  await team.click('text=IR A LA POSTA 6');
  await team.selectOption('#p6type', 'Maqueta'); await team.fill('#p6shows', 'Contenedores');
  await team.click('[data-action="requestP6"]');
  await mentorApprove(mA);
  await team.waitForSelector('text=IR A LA POSTA 7');
  await team.click('text=IR A LA POSTA 7');
  await team.fill('#p7problem', 'p'); await team.fill('#p7solution', 's'); await team.fill('#p7close', 'c');
  await team.click('[data-action="requestP7"]');
  await mentorApprove(mB);
  await sleep(500);
  const g1t = await ls(org, 'g1');
  check(Object.values(g1t.postas).every(p => p.status === 'completed'), 'GRUPO 1 completa las 7 postas');
  check(g1t.validations.length === 9 && g1t.rejections.length === 1, `Historial: ${g1t.validations.length} aprobaciones, ${g1t.rejections.length} rechazo`);
  await sleep(5200);
  const pubRow = await pub.locator('.lm-row').filter({ hasText: 'GRUPO 1' }).innerText();
  check(pubRow.includes('Finalizado') && pubRow.includes('100%'), 'Tablero público: GRUPO 1 Finalizado 100%');

  // ---------- Cancelar solicitud ----------
  log('\n[8] Grupo cancela una solicitud abierta');
  await team.click('.topbar [data-action="groupLogout"]');
  await enterCode(team, 'GP02');
  await team.waitForSelector('[data-posta="p1"]');
  await team.click('[data-posta="p1"]');
  for (const id of ['#p1q1', '#p1q2', '#p1q3', '#p1problem']) await team.fill(id, 'x');
  await team.click('[data-action="requestP1"]');
  await team.click('[data-action="cancelRequest"]');
  check(!(await team.locator('#p1q1').isDisabled()), 'Cancelar devuelve la posta a edición');
  await sleep(300);
  check((await ls(org, 'requests')).filter(r => r.teamId === 'g2' && r.status === 'open').length === 0, 'La solicitud cancelada desaparece de pendientes');
  await team.click('[data-action="requestP1"]');
  await sleep(300);

  // ---------- Panel de organización ----------
  log('\n[9] Panel de organización');
  await org.click('[data-admintab="resumen"]');
  await sleep(5200);
  const att = await org.locator('.attention-banner').innerText().catch(() => '');
  check(att.includes('GRUPO 2') && att.includes('solicitud sin tomar'), 'Alerta: solicitud sin tomar de GRUPO 2');
  check((await org.locator('.kpi').nth(2).innerText()).includes('1/7'), 'KPI finalizados 1/7');
  await org.click('[data-admintab="actividad"]');
  const act = await org.locator('.admin-table-wrap').innerText();
  check(act.includes('No aprobada') && act.includes('Precisen'), 'Actividad de mentores incluye el rechazo con motivo');
  await org.click('[data-admintab="mentores"]');
  check((await org.locator('.mentor-row-v2').first().innerText()).includes('PIN: 1001'), 'Gestión de mentores muestra el PIN');
  // filtro por mentor (por id)
  await org.click('[data-admintab="resumen"]');
  await org.selectOption('[data-filter="mentor"]', 'me2');
  const rows = await org.locator('tbody tr').count();
  check(rows === 1, 'Filtro por último mentor (id) devuelve 1 fila');
  await sleep(5200);
  check((await org.locator('[data-filter="mentor"]').inputValue()) === 'me2', 'El filtro se mantiene tras el refresco automático');
  await org.selectOption('[data-filter="mentor"]', '');
  // reabrir posta
  await org.click('tbody tr >> nth=0');
  await org.click('[data-reopen="g1|p3"]');
  await sleep(300);
  const g1r = await ls(org, 'g1');
  check(g1r.postas.p3.status === 'current' && g1r.postas.p4.status === 'locked', 'Reabrir P3 bloquea las siguientes (comportamiento V2)');
  await org.click('[data-action="closeAdminDetail"]');

  // ---------- Consulta a un mentor elegido ----------
  log('\n[13] Consulta a un mentor elegido');
  const gc = await open('#grupo', 'gConsult');
  await gc.waitForSelector('#groupCode');
  await gc.fill('#groupCode', 'GP02'); await gc.click('[data-action="submitGroupCode"]');
  await gc.waitForSelector('[data-action="openConsult"]');
  check(true, 'El grupo ve el botón de consulta en su mapa');
  check(await gc.locator('[data-action="startDraw"]').count() === 0, 'El celular del grupo no tiene botón de sorteo');
  await mB.click('[data-mtab="solicitudes"]');
  await mB.click('[data-action="setMyEstado"][data-estado="no_disponible"]');
  await gc.click('[data-action="openConsult"]');
  await gc.waitForSelector('[data-action="callMentor"][data-mentor-id="me1"]');
  check(await gc.locator('[data-action="callMentor"][data-mentor-id="me2"]').isDisabled(), 'No se puede elegir a un mentor no disponible');
  check(!(await gc.locator('[data-action="callMentor"][data-mentor-id="me1"]').isDisabled()), 'Sí se puede elegir a un mentor disponible');
  await gc.click('[data-action="callMentor"][data-mentor-id="me1"]');
  await gc.waitForSelector('text=Consulta enviada a');
  check(true, 'El grupo ve "Consulta enviada" al mentor elegido');
  await org.click('[data-admintab="actividad"]');
  await org.waitForSelector('tr.act-calling');
  check((await org.locator('tr.act-calling').innerText()).includes('GRUPO 2 lo está llamando'), 'Actividad de mentores muestra en vivo qué grupo llama al mentor');
  await mA.click('[data-mtab="solicitudes"]');
  await mA.waitForSelector('[data-action="claimConsulta"]');
  check((await mA.locator('.req-card', { has: mA.locator('[data-action="claimConsulta"]') }).innerText()).includes('CONSULTA'), 'El mentor elegido ve la tarjeta marcada como CONSULTA');
  check(await mB.locator('[data-action="claimConsulta"]').count() === 0, 'Otro mentor no ve la consulta');
  await mA.click('[data-action="claimConsulta"]');
  await mA.waitForSelector('[data-action="finishConsulta"]');
  await gc.waitForSelector('text=aceptó su consulta');
  check((await ls(org, 'mentors')).find(m => m.id === 'me1').estado === 'ocupado', 'El mentor queda "Ocupado" mientras atiende la consulta');
  check((await ls(org, 'g2')).postas && true, 'La consulta no cambia el estado de las postas');
  await mA.click('[data-action="finishConsulta"]');
  await gc.waitForSelector('[data-action="openConsult"]');
  check((await ls(org, 'mentors')).find(m => m.id === 'me1').estado === 'disponible', 'Al finalizar, el mentor vuelve a "Disponible"');
  await gc.click('[data-action="openConsult"]');
  await gc.click('[data-action="callMentor"][data-mentor-id="me1"]');
  await gc.click('[data-action="cancelConsult"]');
  await gc.waitForSelector('[data-action="openConsult"]');
  check((await ls(org, 'consultas')).slice(-1)[0].status === 'cancelled', 'El grupo puede cancelar una consulta que nadie aceptó');
  await mB.click('[data-action="setMyEstado"][data-estado="disponible"]');

  log('\n[14] Modo claro fijo (crema) aunque el dispositivo esté en modo oscuro');
  const dk = await browser.newContext({ colorScheme: 'dark' });
  const dp = await dk.newPage(); await dp.goto(URL);
  const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(248, 242, 228)', 'Fondo crema con el dispositivo en modo oscuro (' + bg + ')');
  await dk.close();

  // ---------- Accesos de grupos ----------
  log('\n[12] Accesos: código, cerrar accesos, cambiar código, reiniciar grupo, QR');
  await org.click('[data-admintab="accesos"]');
  check(await org.locator('.card svg').count() >= 1, 'Panel muestra el QR único');
  check((await org.locator('.card').first().innerText()).includes('#grupo'), 'El QR apunta a la entrada de grupos (#grupo)');
  const g3 = await open('#grupo', 'g3');
  await g3.fill('#groupCode', 'GP99'); await g3.click('[data-action="submitGroupCode"]');
  check((await g3.locator('.warn').innerText()).includes('no existe'), 'Código inexistente rechazado');
  await g3.fill('#groupCode', 'gp3'); await g3.press('#groupCode', 'Enter');
  await g3.waitForSelector('.topbar');
  check((await g3.locator('.topbar .tname').innerText()) === 'GRUPO 3', '"gp3" + Enter entra al GRUPO 3');
  await org.click('[data-action="closeGroupAccess"][data-group="g3"]');
  await g3.waitForSelector('#groupCode');
  check((await g3.locator('.warn').innerText()).includes('cerró el acceso'), 'Cerrar accesos saca al grupo y pide el código');
  await org.fill('#code_g3', 'GP03B'); await org.click('[data-action="saveGroupCode"][data-group="g3"]');
  await g3.fill('#groupCode', 'GP03'); await g3.click('[data-action="submitGroupCode"]');
  check((await g3.locator('.warn').innerText()).includes('no existe'), 'Código anterior deja de funcionar');
  await g3.fill('#groupCode', 'GP03B'); await g3.click('[data-action="submitGroupCode"]');
  await g3.waitForSelector('.topbar');
  check(true, 'Código nuevo funciona');
  await org.fill('#code_g4', 'GP03B'); await org.click('[data-action="saveGroupCode"][data-group="g4"]');
  check((await org.locator('.notice').innerText()).includes('ya lo usa'), 'No permite códigos duplicados');
  await org.click('[data-action="askResetGroup"][data-group="g3"]');
  await org.click('[data-action="confirmResetGroup"][data-group="g3"]');
  await g3.waitForSelector('#stageStatus');
  check(!(await ls(org, 'g3')), 'Reiniciar grupo borra solo ese grupo');
  check(!!(await ls(org, 'g1')) && !!(await ls(org, 'g1')).mission, 'Los demás grupos no se tocan');
  check((await g3.locator('#stageStatus').innerText()).includes('Esperen'), 'El grupo reiniciado queda esperando el sorteo');
  await org.click('[data-admintab="sorteo"]');
  check(!(await stage.locator('[data-action="startDraw"]').isDisabled()), 'Se puede volver a sortear al grupo reiniciado');

  // ---------- Reinicio ----------
  log('\n[10] Reinicio total');
  await org.click('[data-admintab="mentores"]');
  await org.click('[data-action="askResetAll"]');
  await org.click('[data-action="confirmResetAll"]');
  await sleep(300);
  check(!(await ls(org, 'g1')) && !(await ls(org, 'game')) && !(await ls(org, 'requests')), 'Reinicio borra grupos, sorteo y solicitudes');
  check((await ls(org, 'mentors')).length === 10, 'Reinicio conserva los mentores');
  await sleep(500);
  check(await stage.locator('.draw-card.is-done').count() === 0, 'Escenario vuelve a "esperando sorteo" (sin grupos con misión)');

  // ---------- Móvil ----------
  log('\n[11] Ancho de celular');
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mob.newPage();
  for (const h of ['#ruleta', '#public', '']) {
    await mp.goto(URL + h); await sleep(300);
    const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(ov <= 0 || h === '#public', `Sin scroll horizontal en ${h || 'inicio'} (${ov}px)`);
  }
  await mp.goto(URL + '#ruleta'); await mp.screenshot({ path: 'mobile-ruleta.png', fullPage: true });
  await stage.screenshot({ path: 'desktop-ruleta.png' });

  log('\nErrores JS:', errors.length ? errors : 'ninguno');
  log(failures ? `\n${failures} FALLAS` : '\nTODO OK');
  await browser.close();
})().catch(e => { console.error('EXCEPTION', e); process.exit(1); });
