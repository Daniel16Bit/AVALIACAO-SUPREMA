'use strict';
/* V11.7: read-only student dashboard and visual radar enhancement. No grade writes. */
(function () {
  const $ = id => document.getElementById(id);
  const safe = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
    );
  const num = v => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const pct = v => (v === null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%');
  const score = v => (v === null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits: 2}));
  const grade = v =>
    v === null ? '—' : v.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const clamp = v => Math.max(0, Math.min(100, v));
  const quarter = a => String(a.semester || '').match(/\d+/)?.[0] || String(a.semester || '');
  const title = a => `${a.year}.${quarter(a)} · ${a.discipline} · ${a.type}`;
  let seq = 0,
    cache = new Map(),
    filter = {year: '', semester: '', period: '', discipline: ''},
    filtersReady = false;
  // Complementos da tela do aluno, registrados em window.SupremaHooks (shared/ui.js).
  window.SupremaHooks.on('student.boot', () => {
    cache = new Map();
    filter = {year: '', semester: '', period: '', discipline: ''};
    filtersReady = false;
  });
  window.SupremaHooks.on('student.result', () => {
    const key = ++seq;
    buildStudent(key).catch(e => {
      const el = $('studentV117');
      if (el) el.innerHTML = '<p class="v117-muted">Painel adicional indisponível: ' + safe(e.message) + '</p>';
    });
  });
  async function fetchAssessment(a) {
    if (cache.has(a.id)) return cache.get(a.id);
    const d = await api('/api/student/assessment/' + encodeURIComponent(a.id));
    cache.set(a.id, d);
    return d;
  }
  function radar(points) {
    if (points.length < 3)
      return '<div class="v117-empty">O gráfico em teia exige pelo menos três questões, áreas ou modalidades publicadas com pontuação máxima conhecida.</div>';
    const hasClass = points.some(p => p.classPct !== null); // turma pequena: sem números da turma
    const c = 190,
      r = 125,
      n = points.length,
      at = (i, v) => {
        const x = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return [c + Math.cos(x) * r * v, c + Math.sin(x) * r * v];
      };
    const poly = key =>
      points
        .map((p, i) =>
          at(i, clamp(p[key] ?? 0) / 100)
            .map(v => v.toFixed(1))
            .join(',')
        )
        .join(' ');
    const rings = [20, 40, 60, 80, 100]
      .map(
        v =>
          '<polygon points="' +
          points.map((_, i) => at(i, v / 100).join(',')).join(' ') +
          '" fill="none" stroke="' +
          (v === 60 ? '#dca54f' : '#dbe5f0') +
          '" ' +
          (v === 60 ? 'stroke-dasharray="5 4"' : '') +
          '/>'
      )
      .join('');
    const axes = points
      .map((p, i) => {
        const q = at(i, 1),
          label = at(i, 1.21);
        return (
          '<line x1="190" y1="190" x2="' +
          q[0] +
          '" y2="' +
          q[1] +
          '" stroke="#dbe5f0"/><text x="' +
          label[0] +
          '" y="' +
          label[1] +
          '" text-anchor="middle" fill="#2b496b" font-size="11">' +
          safe(p.key.length > 14 ? p.key.slice(0, 12) + '…' : p.key) +
          '</text>'
        );
      })
      .join('');
    const circles = (field, color) =>
      points
        .map((p, i) =>
          p[field] === null
            ? ''
            : (() => {
                const z = at(i, clamp(p[field]) / 100);
                return (
                  '<circle cx="' +
                  z[0] +
                  '" cy="' +
                  z[1] +
                  '" r="4" fill="' +
                  color +
                  '"><title>' +
                  safe(p.key) +
                  ': ' +
                  pct(p[field]) +
                  '</title></circle>'
                );
              })()
        )
        .join('');
    return (
      '<div class="v117-radar-layout"><svg class="v117-radar-svg" viewBox="0 0 380 380" role="img" aria-label="Gráfico em teia: onde estou' +
      (hasClass ? ' e média da turma' : '') +
      '">' +
      rings +
      axes +
      (hasClass
        ? '<polygon points="' +
          poly('classPct') +
          '" fill="#2563c51c" stroke="#2563c5" stroke-width="2.5"/>' +
          circles('classPct', '#2563c5')
        : '') +
      '<polygon points="' +
      poly('studentPct') +
      '" fill="#169c7130" stroke="#169c71" stroke-width="2.5"/>' +
      circles('studentPct', '#169c71') +
      '</svg><div class="v117-radar-legend"><strong>Aluno/turma</strong><span><i style="background:#169c71"></i>Onde estou</span>' +
      (hasClass ? '<span><i style="background:#2563c5"></i>Média da turma</span>' : '') +
      '<span><i style="background:#dfa347"></i>Referência de 60%</span><small>Percentuais sobre o valor máximo publicado. Pontos sem dados não são considerados nos indicadores.</small></div></div>'
    );
  }
  // Do total para as partes, da esquerda para a direita: a primeira barra é a média da seleção.
  // Cada barra traz o nome da disciplina; a linha pontilhada marca 60% (referência visual).
  function barChart(data, total) {
    if (!data.length) return '<div class="v117-empty">Nenhum resultado com escala válida nesta seleção.</div>';
    const bar = (percent, label, sub, name, tip, first) =>
      '<div class="v117-baritem' +
      (first ? ' v117-bartotal' : '') +
      '"><div class="v117-bararea">' +
      (first ? '<i class="v117-ref60" aria-hidden="true">60%</i>' : '') +
      '<div class="v117-bar" style="height:' +
      clamp(percent || 0) +
      '%;background:' +
      (percent === null ? '#d9e2ee' : percent >= 60 ? '#16a279' : '#e27b7c') +
      '" title="' +
      safe(tip) +
      ' · ' +
      pct(percent) +
      '"></div></div><b>' +
      pct(percent) +
      '</b><span>' +
      safe(label) +
      '</span><small>' +
      safe(sub) +
      '</small>' +
      (name ? '<small class="v117-barname" title="' + safe(name) + '">' + safe(name) + '</small>' : '') +
      '</div>';
    return (
      '<div class="v117-bars v117-bars-ref">' +
      bar(total, 'Total', 'média da seleção', '', 'Média das avaliações exibidas', true) +
      data.map(a => bar(a.percent, a.type, a.year + '.' + quarter(a), a.discipline, title(a), false)).join('') +
      '</div>'
    );
  }
  function trend(data) {
    const valid = data.filter(a => a.percent !== null);
    if (!valid.length) return '<div class="v117-empty">Sem dados comparáveis.</div>';
    if (valid.length === 1)
      return (
        '<div class="v117-empty">Um resultado disponível: ' +
        pct(valid[0].percent) +
        '. A linha de evolução aparecerá com mais avaliações publicadas.</div>'
      );
    const pts = valid.map((a, i) => [34 + (i * 312) / (valid.length - 1), 190 - clamp(a.percent) * 1.55]);
    return (
      '<svg viewBox="0 0 390 235" class="v117-trend" role="img" aria-label="Evolução do aproveitamento ao longo de avaliações publicadas"><line x1="25" y1="97" x2="375" y2="97" stroke="#e1a248" stroke-dasharray="5 4"/><text x="26" y="91" fill="#996918" font-size="10">60%</text><polyline points="' +
      pts.map(p => p.join(',')).join(' ') +
      '" fill="none" stroke="#2268d0" stroke-width="3"/>' +
      pts
        .map(
          (p, i) =>
            '<circle cx="' +
            p[0] +
            '" cy="' +
            p[1] +
            '" r="5" fill="#2268d0"><title>' +
            safe(valid[i].type + ' ' + valid[i].year + '.' + quarter(valid[i].semester)) +
            ': ' +
            pct(valid[i].percent) +
            '</title></circle><text x="' +
            p[0] +
            '" y="218" text-anchor="middle" fill="#47627d" font-size="11">' +
            safe(valid[i].type) +
            '</text>'
        )
        .join('') +
      '</svg>'
    );
  }
  async function buildStudent(key) {
    if (!studentCurrent || !studentResult || !studentResult.available) return;
    const root = $('studentResultBody');
    if (!root) return;
    const all = (studentAssessments || [])
      .filter(a => a.sent)
      .sort(
        (a, b) =>
          a.year - b.year || Number(quarter(a)) - Number(quarter(b)) || String(a.type).localeCompare(String(b.type))
      );
    const current = studentCurrent;
    if (!filtersReady) {
      filter = {
        year: String(current.year),
        semester: quarter(current),
        period: String(current.period),
        discipline: String(current.discipline)
      };
      filtersReady = true;
    }
    const years = [...new Set(all.map(a => String(a.year)))];
    const disciplines = [...new Set(all.map(a => a.discipline))];
    const periods = [...new Set(all.map(a => String(a.period)))];
    let panel = $('studentV117');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'studentV117';
      root.prepend(panel);
    }
    // Keep the existing detailed table under the new summary instead of removing features.
    const choices = (list, selected) =>
      '<option value="">Todos</option>' +
      list
        .map(v => '<option value="' + safe(v) + '" ' + (selected === v ? 'selected' : '') + '>' + safe(v) + '</option>')
        .join('');
    panel.innerHTML =
      '<div class="v117-intro"><h2>Meu Desempenho Acadêmico</h2><p>Resultados publicados, separados por disciplina e ao longo de semestres e anos.</p></div><div class="v117-filters">' +
      '<label>Ano<select id="v117Year">' +
      choices(years, filter.year) +
      '</select></label><label>Semestre<select id="v117Sem">' +
      choices(['1', '2'], filter.semester) +
      '</select></label><label>Período<select id="v117Period">' +
      choices(periods, filter.period) +
      '</select></label><label>Disciplina<select id="v117Discipline">' +
      choices(disciplines, filter.discipline) +
      '</select></label></div><div class="v118-actions"><nav id="v118Assessments" class="v118-assessments" aria-label="Selecionar avaliação"></nav><div id="v118PrintSlot" class="v118-print-slot"></div></div><div id="v117Dashboard"><p class="v117-muted">Carregando histórico publicado...</p></div>';
    ['Year', 'Sem', 'Period', 'Discipline'].forEach(
      (s, i) =>
        ($('v117' + s).onchange = e => {
          filter[['year', 'semester', 'period', 'discipline'][i]] = e.target.value;
          draw();
        })
    );
    const results = await Promise.all(
      all.map(async a => {
        try {
          const d = await fetchAssessment(a);
          const max = num(d.stats?.provaMax);
          const note = num(d.row?.nota_prova);
          return {...a, details: d, scaleMax: max, note, percent: max > 0 && note !== null ? (note / max) * 100 : null};
        } catch {
          return {...a, details: null, scaleMax: null, note: null, percent: null};
        }
      })
    );
    if (key !== seq || !$('studentV117')) return;
    draw();
    function draw() {
      const div = $('v117Dashboard');
      if (!div) return;
      const selected = results.filter(
        a =>
          (!filter.year || String(a.year) === filter.year) &&
          (!filter.semester || quarter(a) === filter.semester) &&
          (!filter.period || String(a.period) === filter.period) &&
          (!filter.discipline || a.discipline === filter.discipline)
      );
      // A avaliação é escolhida no topo; nenhuma disciplina é listada como botão lateral.
      const available = all.filter(
        a =>
          (!filter.year || String(a.year) === filter.year) &&
          (!filter.semester || quarter(a) === filter.semester) &&
          (!filter.period || String(a.period) === filter.period) &&
          (!filter.discipline || a.discipline === filter.discipline)
      );
      const nav = $('v118Assessments');
      if (nav) {
        nav.innerHTML = ['A1', 'A2', 'A3']
          .map(type => {
            const candidates = available.filter(a => a.type === type);
            const chosen =
              candidates.find(a => String(a.id) === String(studentCurrent?.id)) || candidates[candidates.length - 1];
            return (
              '<button type="button" class="v118-tab ' +
              (String(chosen?.id) === String(studentCurrent?.id) ? 'active' : '') +
              '" ' +
              (!chosen
                ? 'disabled title="Sem resultado publicado para esta avaliação"'
                : 'data-assessment="' + safe(chosen.id) + '"') +
              '>' +
              type +
              '</button>'
            );
          })
          .join('');
        nav.querySelectorAll('button[data-assessment]').forEach(
          btn =>
            (btn.onclick = () => {
              const id = Number(btn.dataset.assessment);
              if (!Number.isFinite(id)) return;
              if (Number(studentCurrent?.id) === id) return;
              loadStudentAssessment(id);
            })
        );
      }
      const print = $('studentPrintBtn'),
        slot = $('v118PrintSlot');
      if (print && slot) {
        slot.appendChild(print);
        print.textContent = 'Exportar PDF / Imprimir';
        print.classList.add('v118-print-btn');
      }
      const valid = selected.filter(a => a.percent !== null);
      const avg = valid.length ? valid.reduce((s, a) => s + a.percent, 0) / valid.length : null;
      const below = valid.filter(a => a.percent < 60).length;
      const subjects = [...new Set(selected.map(a => a.discipline))];
      const subjectStats = subjects.map(name => {
        const d = valid.filter(a => a.discipline === name),
          ten = d.length > 0 && d.every(a => a.scaleMax === 10);
        return {
          name,
          count: d.length,
          mean: d.length ? d.reduce((s, a) => s + a.percent, 0) / d.length : null,
          grade: ten ? d.reduce((s, a) => s + a.note, 0) / d.length : null
        };
      });
      const currentSelection =
        selected.find(a => String(a.id) === String(current.id)) || selected.find(a => a.details) || null;
      let radarBlock =
        '<div class="v117-empty">Selecione uma avaliação publicada com pelo menos três questões configuradas.</div>';
      if (currentSelection?.details) {
        const d = currentSelection.details;
        const pts = (d.questionStats || [])
          .filter(q => q.used && num(q.max_value) > 0)
          .map(q => ({
            key: q.field_key.toUpperCase(),
            area: q.area || '',
            classPct: num(q.mean) === null ? null : (num(q.mean) / Number(q.max_value)) * 100,
            studentPct:
              num(d.row?.[q.field_key]) === null ? null : (num(d.row[q.field_key]) / Number(q.max_value)) * 100
          }));
        const byArea = new Map();
        pts.forEach(p => {
          if (!p.area) return;
          const k = p.area.trim();
          if (!byArea.has(k)) byArea.set(k, []);
          byArea.get(k).push(p);
        });
        const mode = div.dataset.radarMode || 'questoes';
        const used =
          mode === 'modalidades'
            ? window.SupremaUI.modalities(
                {questionStats: d.questionStats, instrumentStats: d.stats?.instrumentStats},
                d.row
              ).map(m => ({
                key: m.label,
                classPct: m.classPct === null ? null : m.classPct * 100,
                studentPct: m.studentPct === null ? null : m.studentPct * 100
              }))
            : mode === 'areas'
              ? [...byArea].map(([name, v]) => ({
                  key: name,
                  classPct: v.filter(x => x.classPct !== null).length
                    ? v.filter(x => x.classPct !== null).reduce((sum, x) => sum + x.classPct, 0) /
                      v.filter(x => x.classPct !== null).length
                    : null,
                  studentPct: v.filter(x => x.studentPct !== null).length
                    ? v.filter(x => x.studentPct !== null).reduce((sum, x) => sum + x.studentPct, 0) /
                      v.filter(x => x.studentPct !== null).length
                    : null
                }))
              : pts;
        radarBlock =
          '<div class="v117-radar-tools"><span>' +
          safe(currentSelection.type + ' · ' + currentSelection.discipline) +
          '</span><select id="v117RadarMode"><option value="questoes" ' +
          (mode === 'questoes' ? 'selected' : '') +
          '>Por questão</option><option value="areas" ' +
          (mode === 'areas' ? 'selected' : '') +
          '>Por área de conhecimento</option><option value="modalidades" ' +
          (mode === 'modalidades' ? 'selected' : '') +
          '>Por modalidade</option></select></div>' +
          radar(used);
      }
      // "Minhas notas": em escala de nota (6,2) só quando toda avaliação da disciplina vale 10; senão, percentual.
      const blocks = subjectStats
        .map(
          s =>
            '<div class="v117-subject ' +
            (s.mean !== null && s.mean < 60 ? 'needs' : '') +
            '"><div><strong>' +
            safe(s.name) +
            '</strong><small>' +
            s.count +
            ' avaliação(ões) com escala válida · ' +
            (s.grade !== null ? 'nota em escala de 0 a 10' : 'aproveitamento sobre o valor máximo') +
            '</small></div><b>' +
            (s.grade !== null ? grade(s.grade) : pct(s.mean)) +
            '</b><button type="button" class="btn v117-open" data-subject="' +
            safe(s.name) +
            '">Ver gráficos</button>' +
            (s.mean !== null && s.mean < 60
              ? '<span class="v117-attention">↓ Abaixo de 60% do valor máximo</span>'
              : '') +
            '</div>'
        )
        .join('');
      div.innerHTML =
        '<div class="v117-metrics v117-metrics-3"><div><small>Meu aproveitamento médio</small><strong>' +
        pct(avg) +
        '</strong></div><div><small>Avaliações abaixo de 60%</small><strong>' +
        below +
        '</strong></div><div><small>Referência visual</small><strong>60%</strong></div></div>' +
        '<section class="v117-card v117-discipline"><h3>Minhas notas</h3>' +
        (blocks || '<div class="v117-empty">Nenhum resultado publicado nesta seleção.</div>') +
        '</section>' +
        '<div class="v117-grid" id="v117Charts"><section class="v117-card"><h3>Meus resultados por avaliação</h3><p class="v117-muted">Do total para cada avaliação, em percentual do valor máximo. A linha pontilhada marca 60%.</p>' +
        barChart(valid.slice(-12), avg) +
        '</section><section class="v117-card"><h3>Evolução acadêmica</h3>' +
        trend(selected) +
        '</section></div>' +
        '<section class="v117-card"><h3>Desempenho em gráfico de teia</h3>' +
        radarBlock +
        '</section>' +
        '<section class="v117-card"><h3>Histórico de resultados</h3><div class="v117-table-scroll"><table class="detail-table"><thead><tr><th>Ano/Semestre</th><th>Período</th><th>Disciplina</th><th>Avaliação</th><th>Nota da avaliação</th><th>Aproveitamento</th><th>Situação analítica</th></tr></thead><tbody>' +
        selected
          .map(
            a =>
              '<tr><td>' +
              safe(a.year + '.' + quarter(a)) +
              '</td><td>' +
              safe(a.period) +
              '</td><td>' +
              safe(a.discipline) +
              '</td><td>' +
              safe(a.type) +
              '</td><td>' +
              score(num(a.details?.row?.nota_prova)) +
              '</td><td>' +
              pct(a.percent) +
              '</td><td>' +
              (a.percent === null ? 'Sem escala' : a.percent >= 60 ? '≥ 60%' : 'Abaixo de 60%') +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table></div></section>' +
        '<div class="v117-note">Os percentuais consideram somente a Nota da Avaliação e sua pontuação máxima publicada; não substituem a média final institucional. A marca de 60% é referência visual, não critério de aprovação. Notas ausentes não são zero. Os dados de outros alunos não são exibidos.</div>';
      // Abrir uma disciplina leva direto aos gráficos dela.
      div.querySelectorAll('.v117-open').forEach(
        b =>
          (b.onclick = () => {
            filter.discipline = b.dataset.subject;
            const select = $('v117Discipline');
            if (select) select.value = filter.discipline;
            draw();
            $('v117Charts')?.scrollIntoView({behavior: 'smooth', block: 'start'});
          })
      );
      const selector = $('v117RadarMode');
      if (selector)
        selector.onchange = e => {
          div.dataset.radarMode = e.target.value;
          draw();
        };
    }
  }
})();
