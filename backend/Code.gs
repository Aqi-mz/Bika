/**
 * Rotas Bika+ — backend em Google Apps Script (Google Sheets como base de dados)
 * 1) Crie um Google Sheet novo → Extensões → Apps Script → cole este ficheiro.
 * 2) Execute a função setup() uma vez (autorize).
 * 3) Implementar → Nova implementação → Aplicação Web
 *      Executar como: Eu · Quem tem acesso: Qualquer pessoa
 *    Copie o URL /exec para o ficheiro config.js da app.
 */

var FOLHAS = {
  Tecnicos:     ['Nome', 'PIN', 'Zona', 'Ativo'],
  Objetivos:    ['Tecnico', 'Visitas', 'Novos', 'Sacos', 'Recompras'],
  Visitas:      ['ID', 'Tecnico', 'Cliente', 'Tipo', 'Contacto', 'Localidade',
                 'Entrada', 'Lat entrada', 'Lng entrada', 'Precisao entrada (m)',
                 'Saida', 'Lat saida', 'Lng saida', 'Precisao saida (m)', 'Duracao (min)',
                 'Sacos', 'Comprou', 'Notas', 'Foto', 'Mapa', 'GPS simulado', 'Registado no telemovel', 'Recebido no servidor'],
  Clientes:     ['ID', 'Nome', 'Contacto', 'Localidade', 'Tecnico', 'Latitude', 'Longitude', 'Atualizado em'],
  Confirmacoes: ['ID', 'Visita ID', 'Tecnico', 'Cliente', 'Resultado', 'Nota', 'Data'],
  Config:       ['Chave', 'Valor']
};

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Africa/Maputo');
  Object.keys(FOLHAS).forEach(function (n) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if (sh.getLastRow() === 0) {
      sh.appendRow(FOLHAS[n]);
      sh.getRange(1, 1, 1, FOLHAS[n].length).setFontWeight('bold').setBackground('#1F5C2E').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
  });
  var cfg = ss.getSheetByName('Config');
  if (cfg.getLastRow() < 2) {
    var pasta = DriveApp.createFolder('Rotas Bika+ — Fotos');
    cfg.appendRow(['SUPERVISOR_PIN', '0000']);
    cfg.appendRow(['PASTA_FOTOS_ID', pasta.getId()]);
  }
  var t = ss.getSheetByName('Tecnicos');
  if (t.getLastRow() < 2) t.appendRow(['Técnico Exemplo', '1234', 'Nampula', 'Sim']);
  ss.getSheetByName('Tecnicos').getRange('B:B').setNumberFormat('@');
  ss.getSheetByName('Config').getRange('B:B').setNumberFormat('@');
  ss.getSheetByName('Clientes').getRange('C:C').setNumberFormat('@');
}

function doGet() { return json({ ok: true, app: 'Rotas Bika+' }); }

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'tecnicos':   return json({ ok: true, tecnicos: tecnicos().map(function (t) { return { nome: t.nome, zona: t.zona }; }) });
      case 'login':      var t = authTec(req); return json({ ok: true, zona: t.zona, objetivos: objetivos()[t.nome] || null, clientes: clientesDoTecnico(t) });
      case 'sync':       return json(sync(req));
      case 'todos':      authSup(req); return json(todos());
      case 'objetivos':  authSup(req); guardarObjetivos(req.objetivos); return json({ ok: true });
      case 'clientes':   authSup(req); return json(importarClientes(req.clientes || [], req.modo));
      case 'confirmar':  authSup(req); guardarConfirmacao(req.item); return json({ ok: true });
    }
    return json({ ok: false, erro: 'Ação desconhecida' });
  } catch (err) {
    return json({ ok: false, erro: String(err.message || err) });
  }
}

/* ---------- autenticação simples por PIN ---------- */
function tecnicos() {
  return rows('Tecnicos').filter(function (r) { return String(r.Ativo).toLowerCase() !== 'não' && String(r.Ativo).toLowerCase() !== 'nao'; })
    .map(function (r) { return { nome: String(r.Nome).trim(), pin: String(r.PIN).trim(), zona: r.Zona }; })
    .filter(function (t) { return t.nome; });
}
function authTec(req) {
  var t = tecnicos().filter(function (x) { return x.nome === req.tecnico; })[0];
  if (!t || t.pin !== String(req.pin)) throw new Error('Nome ou PIN errado.');
  return t;
}
function cfg(k) {
  var r = rows('Config').filter(function (x) { return x.Chave === k; })[0];
  return r ? String(r.Valor) : '';
}
function authSup(req) { if (String(req.pin) !== cfg('SUPERVISOR_PIN')) throw new Error('PIN de supervisor errado.'); }

/* ---------- visitas ---------- */
function sync(req) {
  var t = authTec(req);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet('Visitas'), last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    var ok = [], fotos = {};
    (req.visitas || []).forEach(function (v) {
      if (v.tecnico !== t.nome) return;                       // um técnico só envia as suas visitas
      var foto = '';
      var pos = ids.indexOf(v.id);
      if (v.foto && v.foto.indexOf('data:image') === 0) { foto = guardarFoto(v); fotos[v.id] = foto; }
      else if (pos >= 0) foto = sh.getRange(pos + 2, 19).getValue();
      var e = v.entrada || {}, s = v.saida || {};
      var dur = v.saida ? Math.round((new Date(s.ts) - new Date(e.ts)) / 60000) : '';
      var row = [v.id, t.nome, v.cliente, v.tipo, "'" + (v.contacto || ''), v.localidade,
        new Date(e.ts), e.lat, e.lng, e.acc,
        v.saida ? new Date(s.ts) : '', s.lat || '', s.lng || '', s.acc || '', dur,
        Number(v.sacos) || 0, v.comprou ? 'Sim' : 'Não', v.notas || '', foto,
        'https://www.google.com/maps?q=' + e.lat + ',' + e.lng, e.simulado ? 'Sim' : '',
        v.criado ? new Date(v.criado) : '', new Date()];
      if (pos >= 0) sh.getRange(pos + 2, 1, 1, row.length).setValues([row]);
      else { sh.appendRow(row); ids.push(v.id); }
      ok.push(v.id);
    });
    return { ok: true, ids: ok, fotos: fotos, objetivos: objetivos()[t.nome] || null, clientes: clientesDoTecnico(t) };
  } finally { lock.releaseLock(); }
}

function guardarFoto(v) {
  var pastaId = cfg('PASTA_FOTOS_ID'); if (!pastaId) return '';
  var m = v.foto.match(/^data:(image\/\w+);base64,(.*)$/); if (!m) return '';
  var nome = Utilities.formatDate(new Date(v.entrada.ts), 'Africa/Maputo', 'yyyy-MM-dd_HHmm') + '_' + v.tecnico + '_' + v.cliente + '.jpg';
  var f = DriveApp.getFolderById(pastaId).createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nome));
  return f.getUrl();
}

/* ---------- supervisor ---------- */
function todos() {
  var visitas = rows('Visitas').filter(function (r) { return r.ID; }).map(function (r) {
    return {
      id: String(r.ID), tecnico: r.Tecnico, cliente: String(r.Cliente), tipo: r.Tipo, contacto: String(r.Contacto), localidade: r.Localidade,
      entrada: { ts: iso(r.Entrada), lat: Number(r['Lat entrada']), lng: Number(r['Lng entrada']), acc: Number(r['Precisao entrada (m)']) || 0, simulado: r['GPS simulado'] === 'Sim' },
      saida: r.Saida ? { ts: iso(r.Saida), lat: Number(r['Lat saida']), lng: Number(r['Lng saida']), acc: Number(r['Precisao saida (m)']) || 0 } : null,
      sacos: Number(r.Sacos) || 0, comprou: r.Comprou === 'Sim', notas: r.Notas, foto: r.Foto
    };
  });
  var conf = rows('Confirmacoes').filter(function (r) { return r.ID; }).map(function (r) {
    return { id: r.ID, visitaId: String(r['Visita ID']), tecnico: r.Tecnico, cliente: r.Cliente, resultado: r.Resultado, nota: r.Nota, data: iso(r.Data) };
  });
  return { ok: true, clientes: clientes(), visitas: visitas, tecnicos: tecnicos().map(function (t) { return { nome: t.nome, zona: t.zona }; }), objetivos: objetivos(), confirmacoes: conf };
}

/* ---------- carteira de clientes ---------- */
function chave(nome, contacto) { var d = String(contacto || '').replace(/\D/g, ''); return d ? d.slice(-9) : String(nome || '').trim().toLowerCase(); }
function clientes() {
  return rows('Clientes').filter(function (r) { return r.Nome; }).map(function (r) {
    return { id: String(r.ID), nome: String(r.Nome), contacto: String(r.Contacto), localidade: String(r.Localidade || ''), tecnico: String(r.Tecnico || ''),
             lat: r.Latitude === '' ? '' : Number(r.Latitude), lng: r.Longitude === '' ? '' : Number(r.Longitude) };
  });
}
// Um técnico recebe os clientes atribuídos a ele, ou sem técnico atribuído e da sua zona.
function clientesDoTecnico(t) {
  var z = String(t.zona || '').toLowerCase();
  return clientes().filter(function (c) {
    return c.tecnico === t.nome || (!c.tecnico && (!z || !c.localidade || c.localidade.toLowerCase() === z));
  });
}
function importarClientes(lista, modo) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var atual = modo === 'substituir' ? [] : clientes(), idx = {};
    atual.forEach(function (c, i) { idx[chave(c.nome, c.contacto)] = i; });
    lista.forEach(function (c) {
      var k = chave(c.nome, c.contacto);
      var novo = { id: c.id || Utilities.getUuid(), nome: c.nome, contacto: c.contacto || '', localidade: c.localidade || '', tecnico: c.tecnico || '', lat: c.lat, lng: c.lng };
      if (idx[k] != null) { var o = atual[idx[k]]; novo.id = o.id; ['contacto', 'localidade', 'tecnico', 'lat', 'lng'].forEach(function (f) { if (novo[f] === '' || novo[f] == null) novo[f] = o[f]; }); atual[idx[k]] = novo; }
      else { idx[k] = atual.length; atual.push(novo); }
    });
    var sh = sheet('Clientes'), agora = new Date();
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 8).clearContent();
    var data = atual.map(function (c) { return [c.id, c.nome, c.contacto, c.localidade, c.tecnico, c.lat === '' ? '' : c.lat, c.lng === '' ? '' : c.lng, agora]; });
    if (data.length) sh.getRange(2, 1, data.length, 8).setValues(data);
    return { ok: true, total: data.length };
  } finally { lock.releaseLock(); }
}

function objetivos() {
  var o = {};
  rows('Objetivos').forEach(function (r) { if (r.Tecnico) o[r.Tecnico] = { visitas: +r.Visitas || 0, novos: +r.Novos || 0, sacos: +r.Sacos || 0, recompras: +r.Recompras || 0 }; });
  return o;
}
function guardarObjetivos(o) {
  var sh = sheet('Objetivos');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).clearContent();
  var data = Object.keys(o).map(function (k) { return [k, o[k].visitas, o[k].novos, o[k].sacos, o[k].recompras]; });
  if (data.length) sh.getRange(2, 1, data.length, 5).setValues(data);
}
function guardarConfirmacao(c) {
  sheet('Confirmacoes').appendRow([c.id, c.visitaId, c.tecnico, c.cliente, c.resultado, c.nota || '', new Date(c.data)]);
}

/* ---------- utilitários ---------- */
function sheet(n) { return SpreadsheetApp.getActive().getSheetByName(n); }
function rows(n) {
  var sh = sheet(n); if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(), h = v.shift();
  return v.map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}
function iso(d) { return d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : ''); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
