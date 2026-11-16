'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const esc = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
    );
  const num = v => Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 1, minimumFractionDigits: 1});
  const pct = v => (v === null || !Number.isFinite(v) ? '—' : num(v) + '%');
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const usable = v => v !== null && v !== undefined && Number.isFinite(Number(v));
  const safe = v => Math.max(0, Math.min(100, Number(v) || 0));
  const sem = v => String(v).match(/^\d+/)?.[0] || String(v);
  const order = {A1: 1, A2: 2, A3: 3};
  const panel = (title, body, klass = '') =>
    '<section class="v114-card ' + klass + '"><h3>' + esc(title) + '</h3>' + body + '</section>';
  const note = v => '<p class="v114-note">' + esc(v) + '</p>';
  const empty = note('Sem resultados publicados suficientes para esta análise.');
  function chartLine(series, labels) {
    if (!labels.length || series.every(s => s.values.every(v => !usable(v)))) return empty;
    const W = 440,
      H = 218,
      ml = 39,
      mr = 15,
      mt = 15,
      mb = 35,
      cw = W - ml - mr,
      ch = H - mt - mb;
    let svg =
      '<svg class="v114-svg" viewBox="0 0 ' +
      W +
      ' ' +
      H +
      '" role="img" aria-label="Evolução de aproveitamento em percentual">';
    for (let p = 0; p <= 100; p += 20) {
      const y = mt + ch * (1 - p / 100);
      svg +=
        '<line x1="' +
        ml +
        '" x2="' +
        (W - mr) +
        '" y1="' +
        y +
        '" y2="' +
        y +
        '" stroke="#e5edf6"/><text x="' +
        (ml - 7) +
        '" y="' +
        (y + 4) +
        '" text-anchor="end" font-size="10" fill="#68809a">' +
        p +
        '%</text>';
    }
    labels.forEach((l, i) => {
      const x = ml + cw * (labels.length === 1 ? 0.5 : i / (labels.length - 1));
      svg +=
        '<text x="' +
        x +
        '" y="' +
        (H - 9) +
        '" text-anchor="middle" font-size="10" fill="#68809a">' +
        esc(l) +
        '</text>';
    });
    series.forEach((s, j) => {
      let segment = [];
      const flush = () => {
        if (segment.length) {
          svg +=
            '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.8" points="' + segment.join(' ') + '"/>';
          segment = [];
        }
      };
      s.values.forEach((v, i) => {
        if (!usable(v)) {
          flush();
          return;
        }
        const x = ml + cw * (labels.length === 1 ? 0.5 : i / (labels.length - 1)),
          y = mt + ch * (1 - safe(v) / 100);
        segment.push(x + ',' + y);
        svg +=
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="3.5" fill="' +
          s.color +
          '"><title>' +
          esc(s.label + ' ' + labels[i] + ': ' + pct(Number(v))) +
          '</title></circle>';
      });
      flush();
    });
    return svg + '</svg>' + legend(series);
  }
  function legend(series) {
    return (
      '<div class="v114-legend">' +
      series.map(s => '<span><i style="background:' + s.color + '"></i>' + esc(s.label) + '</span>').join('') +
      '</div>'
    );
  }
  function bars(groups, student) {
    if (!groups.length) return empty;
    const W = 440,
      H = 220,
      ml = 38,
      mr = 12,
      mt = 15,
      mb = 36,
      cw = W - ml - mr,
      ch = H - mt - mb;
    let svg = '<svg class="v114-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Média por avaliação">';
    for (let p = 0; p <= 100; p += 20) {
      let y = mt + ch * (1 - p / 100);
      svg +=
        '<line x1="' +
        ml +
        '" y1="' +
        y +
        '" x2="' +
        (W - mr) +
        '" y2="' +
        y +
        '" stroke="#e8eff7"/><text x="' +
        (ml - 6) +
        '" y="' +
        (y + 4) +
        '" text-anchor="end" fill="#68809a" font-size="10">' +
        p +
        '</text>';
    }
    groups.forEach((g, i) => {
      const center = ml + (cw * (i + 0.5)) / groups.length,
        barw = Math.min(35, cw / groups.length / 4),
        items = student
          ? [
              {v: g.classMean, color: '#9b87e5', label: 'Turma'},
              {v: g.studentMean, color: '#307fe3', label: 'Estudante'}
            ]
          : [{v: g.classMean, color: '#307fe3', label: 'Turma'}];
      items.forEach((it, j) => {
        if (!usable(it.v)) return;
        const x = center + (j - (items.length - 1) / 2) * (barw + 4) - barw / 2,
          y = mt + ch * (1 - safe(it.v) / 100),
          h = mt + ch - y;
        svg +=
          '<rect x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          barw +
          '" height="' +
          Math.max(h, 1) +
          '" rx="3" fill="' +
          it.color +
          '"><title>' +
          esc(it.label + ': ' + pct(it.v)) +
          '</title></rect>';
      });
      svg +=
        '<text x="' +
        center +
        '" y="' +
        (H - 11) +
        '" text-anchor="middle" font-size="11" fill="#405c7d">' +
        esc(g.type) +
        '</text>';
    });
    return (
      svg +
      '</svg>' +
      legend(
        student
          ? [
              {label: 'Turma', color: '#9b87e5'},
              {label: 'Estudante', color: '#307fe3'}
            ]
          : [{label: 'Turma', color: '#307fe3'}]
      )
    );
  }
  function radar(groups, student) {
    const gs = ['A1', 'A2', 'A3'].map(
      k => groups.find(g => g.type === k) || {type: k, classMean: null, studentMean: null}
    );
    const valid = gs.filter(g => usable(g.classMean));
    if (!valid.length) return note('Sem resultados publicados com pontuação máxima definida para exibir o gráfico.');
    const W = 420,
      H = 365,
      cx = 204,
      cy = 170,
      R = 120,
      n = gs.length;
    const point = (i, v) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + (Math.cos(a) * R * safe(v)) / 100, cy + (Math.sin(a) * R * safe(v)) / 100];
    };
    const poly = vs =>
      vs
        .map((v, i) =>
          point(i, v)
            .map(x => x.toFixed(1))
            .join(',')
        )
        .join(' ');
    let svg =
      '<svg class="v114-svg v114-radar v117-evo-radar" viewBox="0 0 ' +
      W +
      ' ' +
      H +
      '" role="img" aria-label="Gráfico em teia de aproveitamento publicado de A1, A2 e A3">';
    [20, 40, 60, 80, 100].forEach(
      level =>
        (svg +=
          '<polygon points="' +
          poly(gs.map(() => level)) +
          '" fill="none" stroke="' +
          (level === 60 ? '#dca54f' : '#dce6f1') +
          '" ' +
          (level === 60 ? 'stroke-dasharray="5 4" stroke-width="2"' : '') +
          '/>')
    );
    gs.forEach((g, i) => {
      const end = point(i, 100),
        label = point(i, 118);
      svg +=
        '<line x1="' +
        cx +
        '" y1="' +
        cy +
        '" x2="' +
        end[0] +
        '" y2="' +
        end[1] +
        '" stroke="#dce6f1"/><text x="' +
        label[0] +
        '" y="' +
        label[1] +
        '" text-anchor="middle" font-size="13" fill="#244669">' +
        g.type +
        '</text>';
    });
    const draw = (field, color, fill) => {
      const present = gs.filter(g => usable(g[field]));
      if (present.length === 3)
        svg +=
          '<polygon points="' +
          poly(gs.map(g => g[field])) +
          '" fill="' +
          fill +
          '" stroke="' +
          color +
          '" stroke-width="2.7"/>';
      gs.forEach((g, i) => {
        if (!usable(g[field])) return;
        const p = point(i, g[field]);
        svg +=
          '<circle cx="' +
          p[0] +
          '" cy="' +
          p[1] +
          '" r="5" fill="' +
          color +
          '"><title>' +
          esc(g.type + ': ' + pct(Number(g[field]))) +
          '</title></circle>';
      });
    };
    draw('classMean', '#8261ce', '#9276d52c');
    if (student) draw('studentMean', '#2670d4', '#307fe32c');
    svg += '<text x="' + (cx + 13) + '" y="' + (cy - R * 0.6 - 5) + '" fill="#a47726" font-size="11">60%</text></svg>';
    return (
      '<div class="v117-radar-layout">' +
      svg +
      '<div class="v117-radar-legend"><strong>A1 × A2 × A3</strong><span><i style="background:#8261ce"></i>Média da turma</span>' +
      (student ? '<span><i style="background:#2670d4"></i>Aluno selecionado</span>' : '') +
      '<span><i style="background:#dca54f"></i>Referência de 60%</span><small>Passe o mouse sobre os pontos para ver os percentuais. ' +
      (valid.length < 3
        ? 'As avaliações faltantes aparecem sem notas. O polígono será formado quando A1, A2 e A3 estiverem disponíveis.'
        : 'Somente resultados publicados.') +
      '</small></div></div>'
    );
  }
  function histogram(values) {
    if (!values.length) return empty;
    const ranges = [0, 40, 50, 60, 70, 80, Infinity],
      labels = ['< 40', '40–49', '50–59', '60–69', '70–79', '≥ 80'],
      counts = labels.map((_, i) => values.filter(n => n >= ranges[i] && n < ranges[i + 1]).length),
      max = Math.max(...counts, 1);
    return (
      '<div class="v114-histo">' +
      counts
        .map(
          (n, i) =>
            '<div class="v114-histo-col"><strong>' +
            n +
            '</strong><div class="v114-histo-track"><i style="height:' +
            Math.max(n ? 3 : 0, (n / max) * 100) +
            '%;background:' +
            (i < 3 ? '#ed858c' : '#6da5ed') +
            '"></i></div><small>' +
            labels[i] +
            '</small></div>'
        )
        .join('') +
      '</div>' +
      note(
        'Considera a avaliação publicada mais recente de cada matrícula na seleção, sem contar o mesmo aluno duas vezes.'
      )
    );
  }
  function donut(values) {
    if (!values.length) return empty;
    const above = values.filter(v => v >= 60).length,
      share = (above / values.length) * 100;
    return (
      '<div class="v114-donut-row"><div class="v114-donut" style="background:conic-gradient(#3caf7b ' +
      share +
      '%,#e9838b ' +
      share +
      '%)"><span><b>' +
      pct(share) +
      '</b><small>≥ 60%</small></span></div><div class="v114-donut-label"><p><i style="background:#3caf7b"></i> Acima ou igual a 60%: <b>' +
      above +
      '</b></p><p><i style="background:#e9838b"></i> Abaixo de 60%: <b>' +
      (values.length - above) +
      '</b></p><p>Total: <b>' +
      values.length +
      ' alunos</b></p></div></div>'
    );
  }
  function dashboard(host, records, prefix) {
    const years = [...new Set(records.map(r => String(r.year)))].sort((a, b) => b.localeCompare(a));
    const subjects = [...new Set(records.map(r => String(r.discipline || '')))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    const opts = arr => arr.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
    host.innerHTML =
      '<div class="v114-filters v113-panel">' +
      '<label>Ano<select id="' +
      prefix +
      'year">' +
      opts([['', 'Todos os anos'], ...years.map(y => [y, y])]) +
      '</select></label>' +
      '<label>Semestre<select id="' +
      prefix +
      'term">' +
      opts([
        ['', 'Todos os semestres'],
        ['1', '1º semestre'],
        ['2', '2º semestre']
      ]) +
      '</select></label>' +
      '<label>Período<select id="' +
      prefix +
      'period"><option value="">Todos os períodos</option></select></label>' +
      '<label>Disciplina<select id="' +
      prefix +
      'subject">' +
      opts([['', 'Todas as disciplinas'], ...subjects.map(s => [s, s])]) +
      '</select></label>' +
      '<label>Estudante<select id="' +
      prefix +
      'student"><option value="">Todos os estudantes</option></select></label></div>' +
      '<p class="v114-note">Indicadores calculados somente a partir de resultados publicados com pontuação máxima conhecida. Dados ausentes não são considerados zero.</p><div id="' +
      prefix +
      'body"></div>';
    const get = k => $(prefix + k).value;
    const filters = ['year', 'term', 'period', 'subject'];
    function base() {
      return records.filter(
        r =>
          (!get('year') || String(r.year) === get('year')) &&
          (!get('term') || sem(r.semester) === get('term')) &&
          (!get('period') || String(r.period || '') === get('period')) &&
          (!get('subject') || String(r.discipline) === get('subject'))
      );
    }
    function refill(k, list, label, fn) {
      const el = $(prefix + k),
        previous = el.value;
      el.innerHTML = opts([['', label], ...list.map(x => [x, fn ? fn(x) : x])]);
      el.value = list.includes(previous) ? previous : '';
    }
    function updateOptions() {
      // A period selector constrains the student list; available periods come from year/term selection.
      const options = records.filter(
        r =>
          (!get('year') || String(r.year) === get('year')) &&
          (!get('term') || sem(r.semester) === get('term')) &&
          (!get('subject') || r.discipline === get('subject'))
      );
      refill(
        'period',
        [...new Set(options.map(r => String(r.period || '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
        'Todos os períodos',
        v => v + 'º período'
      );
      const students = new Map();
      base().forEach(a =>
        (a.students || []).forEach(s => {
          if (s.matricula) students.set(String(s.matricula), String(s.name || s.matricula));
        })
      );
      const el = $(prefix + 'student'),
        old = el.value;
      el.innerHTML = opts([
        ['', 'Todos os estudantes'],
        ...[...students].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([m, n]) => [m, n + ' · ' + m])
      ]);
      el.value = students.has(old) ? old : '';
    }
    filters.forEach(k =>
      $(prefix + k).addEventListener('change', () => {
        updateOptions();
        draw();
      })
    );
    $(prefix + 'student').addEventListener('change', draw);
    updateOptions();
    draw();
    function draw() {
      const mat = get('student'),
        data = base(),
        samples = [];
      // Use distinct enrollment for student-facing class comparisons; never count ungraded entries as zero.
      const groups = new Map(),
        cohorts = new Map(),
        latest = new Map(),
        totalEvaluations = new Set();
      for (const a of data) {
        const members = (a.students || []).filter(s => !mat || String(s.matricula) === mat);
        if (!members.length) continue;
        if (!groups.has(a.type)) groups.set(a.type, {type: a.type, all: [], sel: []});
        totalEvaluations.add(a.id);
        for (const s of members) {
          if (!usable(s.percent)) continue;
          const value = Number(s.percent);
          samples.push({a, s, value});
          groups.get(a.type).all.push(value);
          const rank = [Number(a.year) || 0, Number(sem(a.semester)) || 0, order[a.type] || 0, Number(a.id) || 0];
          const prev = latest.get(String(s.matricula));
          if (
            !prev ||
            rank.some(
              (n, i) => n !== prev.rank[i] && rank.slice(0, i).every((x, j) => x === prev.rank[j]) && n > prev.rank[i]
            )
          )
            latest.set(String(s.matricula), {value, rank});
        }
        const cohortKey = JSON.stringify([
          a.year,
          sem(a.semester),
          a.period,
          a.discipline,
          a.class_name,
          a.professor_id
        ]);
        if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, {a, types: {}});
        const c = cohorts.get(cohortKey);
        c.types[a.type] = members
          .map(s => s.percent)
          .filter(usable)
          .map(Number);
      }
      const fullRows = data.filter(a => (a.students || []).some(s => usable(s.percent)));
      const groupBars = ['A1', 'A2', 'A3'].map(type => {
        const whole = fullRows
          .filter(a => a.type === type)
          .flatMap(a =>
            (a.students || [])
              .map(s => s.percent)
              .filter(usable)
              .map(Number)
          );
        const sel = mat
          ? fullRows
              .filter(a => a.type === type)
              .flatMap(a =>
                (a.students || [])
                  .filter(s => String(s.matricula) === mat)
                  .map(s => s.percent)
                  .filter(usable)
                  .map(Number)
              )
          : [];
        return {type, classMean: mean(whole), studentMean: mean(sel)};
      });
      // Overall selection values, one published score per student per assessment. Metrics never average an average.
      const values = samples.map(x => x.value),
        average = mean(values),
        highest = values.length ? Math.max(...values) : null,
        lowest = values.length ? Math.min(...values) : null,
        below = values.filter(x => x < 60).length;
      const hist = [...latest.values()].map(x => x.value);
      const first = groupBars.find(g => usable(mat ? g.studentMean : g.classMean)),
        last = [...groupBars].reverse().find(g => usable(mat ? g.studentMean : g.classMean)),
        delta =
          first && last && first.type !== last.type
            ? mat
              ? last.studentMean - first.studentMean
              : last.classMean - first.classMean
            : null;
      const metric = (label, value, tone, sub = '') =>
        '<div class="v114-kpi ' +
        tone +
        '"><small>' +
        esc(label) +
        '</small><strong>' +
        esc(value) +
        '</strong>' +
        (sub ? '<em>' + esc(sub) + '</em>' : '') +
        '</div>';
      let out =
        '<div class="v114-kpis">' +
        metric('Avaliações com resultado', String(totalEvaluations.size), 'blue') +
        metric('Aproveitamento médio', pct(average), average === null ? 'blue' : average >= 60 ? 'green' : 'red') +
        metric(
          'Registros abaixo de 60%',
          String(below),
          'red',
          values.length ? num((below / values.length) * 100) + '% dos lançamentos válidos' : ''
        ) +
        metric('Melhor resultado', pct(highest), 'green') +
        metric('Pior resultado', pct(lowest), 'red') +
        metric(
          first && last && first.type !== last.type
            ? 'Evolução ' + first.type + ' → ' + last.type
            : 'Evolução entre avaliações',
          delta === null ? '—' : (delta > 0 ? '+' : '') + num(delta) + ' p.p.',
          'blue',
          delta === null ? 'Exige avaliações comparáveis' : 'Comparação por avaliação'
        ) +
        '</div>';
      // Each semester is a separate time point; no synthetic semesters or scores.
      const timeMap = new Map();
      for (const a of fullRows) {
        const key = String(a.year) + '.' + sem(a.semester);
        if (!timeMap.has(key)) timeMap.set(key, {all: [], sel: []});
        const t = timeMap.get(key);
        (a.students || []).forEach(s => {
          if (!usable(s.percent)) return;
          t.all.push(Number(s.percent));
          if (mat && String(s.matricula) === mat) t.sel.push(Number(s.percent));
        });
      }
      const labels = [...timeMap.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const trendSeries = mat
        ? [
            {label: 'Estudante', color: '#307fe3', values: labels.map(k => mean(timeMap.get(k).sel))},
            {label: 'Turma', color: '#9479dc', values: labels.map(k => mean(timeMap.get(k).all))}
          ]
        : [{label: 'Turma', color: '#307fe3', values: labels.map(k => mean(timeMap.get(k).all))}];
      const insights = [];
      if (!values.length)
        insights.push([
          'neutral',
          'Nenhum resultado válido',
          'Escolha outro período ou aguarde a publicação de avaliações.'
        ]);
      else {
        insights.push([
          below ? 'warning' : 'positive',
          below + ' de ' + values.length + ' notas abaixo de 60%',
          'Contagem de resultados publicados no filtro atual.'
        ]);
        if (delta !== null)
          insights.push([
            delta > 0 ? 'positive' : delta < 0 ? 'warning' : 'neutral',
            delta > 0
              ? 'Houve evolução entre avaliações'
              : delta < 0
                ? 'Houve queda entre avaliações'
                : 'Desempenho estável',
            'Diferença de ' + (delta > 0 ? '+' : '') + num(delta) + ' pontos percentuais.'
          ]);
        if (!mat)
          insights.push([
            'neutral',
            'Análise consolidada',
            'Selecione um estudante para comparar a trajetória individual com a turma.'
          ]);
        else
          insights.push([
            'neutral',
            'Comparação individual',
            'Os gráficos contrastam o estudante com os resultados da seleção.'
          ]);
      }
      const insightHtml =
        '<div class="v114-insights">' +
        insights
          .map(
            ([tone, title, description]) =>
              '<div class="v114-insight ' +
              tone +
              '"><b>' +
              esc(title) +
              '</b><span>' +
              esc(description) +
              '</span></div>'
          )
          .join('') +
        '</div>';
      out +=
        '<div class="v114-chartgrid">' +
        panel('Gráfico em teia · A1 × A2 × A3', radar(groupBars, !!mat)) +
        panel('Médias por avaliação', bars(groupBars, !!mat)) +
        panel('Evolução por semestre e ano', chartLine(trendSeries, labels)) +
        panel('Distribuição das notas', histogram(hist)) +
        panel('Principais indicadores', insightHtml, 'v114-insights-card') +
        '</div>';
      const comparisons = [...cohorts.values()]
        .sort((x, y) => Number(y.a.year) - Number(x.a.year) || Number(sem(y.a.semester)) - Number(sem(x.a.semester)))
        .map(c => {
          const a = c.a,
            one = mean(c.types.A1 || []),
            two = mean(c.types.A2 || []),
            three = mean(c.types.A3 || []),
            change = (a, b) => (a === null || b === null ? '—' : (b - a > 0 ? '+' : '') + num(b - a) + ' p.p.');
          return (
            '<tr><td>' +
            esc(a.year + '.' + sem(a.semester)) +
            '</td><td>' +
            esc(a.period || '—') +
            '</td><td>' +
            esc(a.discipline) +
            '</td><td>' +
            pct(one) +
            '</td><td>' +
            pct(two) +
            '</td><td>' +
            pct(three) +
            '</td><td>' +
            change(one, two) +
            '</td><td>' +
            change(two, three) +
            '</td><td>' +
            change(one, three) +
            '</td></tr>'
          );
        });
      out +=
        '<div class="v114-lower">' +
        panel(
          'Comparativo A1 × A2 × A3',
          '<div class="v114-table-scroll"><table class="v113-table"><thead><tr><th>Ano/Semestre</th><th>Período</th><th>Disciplina</th><th>A1</th><th>A2</th><th>A3</th><th>A1 → A2</th><th>A2 → A3</th><th>A1 → A3</th></tr></thead><tbody>' +
            (comparisons.join('') || '<tr><td colspan="9">Sem comparações disponíveis.</td></tr>') +
            '</tbody></table></div>'
        ) +
        panel('Aproveitamento dos estudantes', donut(hist)) +
        '</div>';
      const distinct = new Set(samples.map(({s}) => s.matricula)).size;
      const follow = mat
        ? 'Estudante selecionado: ' +
          (samples[0]?.s.name || mat) +
          '. ' +
          samples.length +
          ' lançamentos válidos na seleção. '
        : 'Visão consolidada de ' + distinct + ' estudantes com resultado válido. ';
      out += panel(
        'Acompanhamento acadêmico',
        '<p class="v114-follow">' +
          esc(follow) +
          'As análises usam o histórico disponível sem presumir notas para avaliações ausentes.</p><div class="v114-follow-grid"><div><small>Média dos resultados</small><strong>' +
          pct(average) +
          '</strong></div><div><small>Resultados válidos</small><strong>' +
          values.length +
          '</strong></div><div><small>Alunos distintos</small><strong>' +
          distinct +
          '</strong></div><div><small>Referência de desempenho</small><strong>60%</strong></div></div>'
      );
      if (data.length >= 300) out += note('A consulta pode estar limitada às avaliações mais recentes pelo servidor.');
      $(prefix + 'body').innerHTML = out;
    }
  }
  const view = $('academicEvolutionView'),
    back = $('backToAssessmentBtn'),
    open = $('academicEvolutionBtn');
  if (view && back && open) {
    back.addEventListener('click', () => {
      view.classList.add('hidden');
      $('mainView').classList.remove('hidden');
    });
    document.querySelectorAll('#appScreen .sidebar [data-view]').forEach(b =>
      b.addEventListener('click', () => {
        view.classList.add('hidden');
        $('mainView').classList.remove('hidden');
      })
    );
    open.addEventListener('click', async () => {
      if (typeof dirty !== 'undefined' && dirty) {
        alert('Salve o rascunho antes de abrir a Evolução Acadêmica.');
        return;
      }
      $('mainView').classList.add('hidden');
      view.classList.remove('hidden');
      const root = $('academicEvolutionContent');
      root.textContent = 'Carregando resultados publicados...';
      try {
        const r = await fetch('/api/evolution', {credentials: 'same-origin'});
        if (!r.ok) throw Error('Falha ao consultar resultados.');
        const d = await r.json();
        dashboard(root, d.assessments || [], 'v114-t-');
        if (d.partial) root.insertAdjacentHTML('beforeend', note('Consulta parcial: muitos registros no banco.'));
      } catch (e) {
        root.textContent = e.message;
      }
    });
  }
  // Coordination receives the same filtered dashboard, respecting existing server-side permissions.
  const adminButton = $('adminEvolutionBtn'),
    adminContent = $('adminContent'),
    adminEvolution = $('adminEvolutionContent');
  if (adminButton && adminContent && adminEvolution) {
    const nav = $('adminNav');
    adminButton.addEventListener('click', async e => {
      e.stopImmediatePropagation();
      adminContent.classList.add('hidden');
      adminEvolution.classList.remove('hidden');
      adminEvolution.innerHTML =
        '<div class="v113-admin-head"><h2>Evolução Acadêmica</h2><button type="button" class="btn" id="adminEvolutionBack">Voltar</button></div><div id="adminEvolutionResults">Carregando...</div>';
      $('adminEvolutionBack').onclick = () => {
        adminEvolution.classList.add('hidden');
        adminContent.classList.remove('hidden');
      };
      try {
        const r = await fetch('/api/evolution', {credentials: 'same-origin'});
        if (!r.ok) throw Error('Não foi possível consultar a evolução.');
        const d = await r.json();
        dashboard($('adminEvolutionResults'), d.assessments || [], 'v114-a-');
      } catch (e) {
        $('adminEvolutionResults').textContent = e.message;
      }
    });
    if (nav)
      nav.addEventListener('click', e => {
        if (e.target.closest('[data-admin-view]')) {
          adminEvolution.classList.add('hidden');
          adminContent.classList.remove('hidden');
        }
      });
  }
})();
