'use strict';
/* Patch 11.2: additive analysis only; never changes scores or publication. */
(function () {
  const byId = id => document.getElementById(id);
  const exists = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const escV = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
    );
  const f = v => (exists(v) ? Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 2}) : '—');
  const make = (parent, id, title, subtitle) => {
    let el = byId(id);
    if (!el) {
      el = document.createElement('section');
      el.className = 'panel v112-panel';
      el.id = id;
      parent.appendChild(el);
    }
    el.innerHTML =
      '<div class="panel-title"><div><h3>' +
      title +
      '</h3><p>' +
      subtitle +
      '</p></div></div><div class="v112-body" id="' +
      id +
      '-body"></div>';
    return byId(id + '-body');
  };
  const BY_QUESTION = {
    empty: 'São necessárias pelo menos três questões publicadas com valor máximo definido.',
    title: 'Desempenho por questão',
    scale: 'Escala de 0% a 100% do valor máximo de cada questão.',
    label: 'Gráfico em teia de aproveitamento por questão, com referência de 60 por cento'
  };
  const BY_MODALITY = {
    empty:
      'São necessárias pelo menos três modalidades publicadas com valor máximo declarado (por exemplo: discursivas, múltipla escolha e OSCE). Declare o valor máximo dos instrumentos no cabeçalho da planilha.',
    title: 'Desempenho por modalidade',
    scale: 'Escala de 0% a 100% da soma dos valores máximos de cada modalidade. "Prática" corresponde ao OSCE.',
    label: 'Gráfico em teia de aproveitamento por modalidade, com referência de 60 por cento'
  };
  function radar(points, text = BY_QUESTION) {
    if (points.length < 3) return '<div class="empty-inline">' + text.empty + '</div>';
    const cx = 205,
      cy = 185,
      r = 120,
      n = points.length;
    const at = (i, p) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + Math.cos(a) * r * p, cy + Math.sin(a) * r * p];
    };
    const poly = vals =>
      vals
        .map((p, i) =>
          at(i, p)
            .map(v => v.toFixed(1))
            .join(',')
        )
        .join(' ');
    const rings = [0.2, 0.4, 0.6, 0.8, 1]
      .map(
        q =>
          '<polygon points="' +
          poly(points.map(() => q)) +
          '" fill="none" stroke="' +
          (q === 0.6 ? '#ecab52' : '#dbe3ed') +
          '" ' +
          (q === 0.6 ? 'stroke-dasharray="5 4"' : '') +
          ' stroke-width="' +
          (q === 0.6 ? '2' : '1') +
          '"/>'
      )
      .join('');
    const axes = points
      .map((p, i) => {
        const a = at(i, 1),
          lab = at(i, 1.22);
        return (
          '<line x1="' +
          cx +
          '" y1="' +
          cy +
          '" x2="' +
          a[0] +
          '" y2="' +
          a[1] +
          '" stroke="#dbe3ed"/><text x="' +
          lab[0] +
          '" y="' +
          lab[1] +
          '" text-anchor="middle" font-size="11" fill="#304766">' +
          escV(p.short) +
          '</text>'
        );
      })
      .join('');
    const plot = (field, color, fill) =>
      '<polygon points="' +
      poly(points.map(p => Math.max(0, Math.min(1, p[field] ?? 0)))) +
      '" fill="' +
      fill +
      '" stroke="' +
      color +
      '" stroke-width="2.7"/>' +
      points
        .map((p, i) =>
          p[field] === null || p[field] === undefined
            ? ''
            : (() => {
                const c = at(i, Math.max(0, Math.min(1, p[field])));
                return (
                  '<circle cx="' +
                  c[0] +
                  '" cy="' +
                  c[1] +
                  '" r="4" fill="' +
                  color +
                  '"><title>' +
                  escV(p.short) +
                  ': ' +
                  (Number(p[field]) * 100).toFixed(1) +
                  '%</title></circle>'
                );
              })()
        )
        .join('');
    const student = points.some(p => p.studentPct !== null);
    return (
      '<div class="v117-radar-layout"><svg role="img" aria-label="' +
      text.label +
      '" viewBox="0 0 410 380" class="v117-radar-svg">' +
      rings +
      axes +
      plot('classPct', '#2563c5', 'rgba(37,99,197,.15)') +
      (student ? plot('studentPct', '#0e9f76', 'rgba(14,159,118,.12)') : '') +
      '<text x="' +
      (cx + 13) +
      '" y="' +
      (cy - r * 0.6 - 6) +
      '" font-size="11" fill="#ae791c">60%</text></svg><div class="v117-radar-legend"><strong>' +
      text.title +
      '</strong><span><i style="background:#2563c5"></i>Média da turma</span>' +
      (student ? '<span><i style="background:#0e9f76"></i>Estudante selecionado</span>' : '') +
      '<span><i style="background:#e4ae5b"></i>Referência: 60%</span><small>' +
      text.scale +
      ' Passe o mouse sobre os pontos para ver os percentuais.</small></div></div>'
    );
  }

  function getPoints(s, student) {
    return (s.questionStats || [])
      .filter(q => q.used && Number(q.max_value) > 0)
      .map((q, i) => ({
        short: q.field_key?.toUpperCase() || 'Q' + (i + 1),
        classPct: Number(q.mean || 0) / Number(q.max_value),
        studentPct: student && exists(student[q.field_key]) ? Number(student[q.field_key]) / Number(q.max_value) : null
      }));
  }
  // Teórica discursiva, múltipla escolha, prática (OSCE) e demais instrumentos com máximo declarado.
  function modalityPoints(s, student) {
    return window.SupremaUI.modalities(s, student).map(m => ({
      short: m.label,
      classPct: m.classPct ?? 0,
      studentPct: m.studentPct
    }));
  }
  function renderExtras() {
    const root = byId('resultsTab'),
      s = typeof currentStats !== 'undefined' ? currentStats : null;
    if (!root || !s) return;
    const resultArea = make(
      root,
      'v112-quadrants',
      'Classificação em quatro grupos',
      'Comparação pela nota da prova, média da turma e referência visual de 60% da pontuação máxima.'
    );
    const max = Number(s.provaMax || 0),
      rows = (s.rows || []).filter(x => exists(x.nota_prova));
    if (!(max > 0) || !rows.length) {
      resultArea.innerHTML =
        '<div class="empty-inline">Sem notas da prova publicadas ou sem valor máximo definido para calcular os 60%.</div>';
    } else {
      const mean = rows.reduce((a, r) => a + Number(r.nota_prova), 0) / rows.length,
        cut = 0.6 * max;
      const counts = [0, 0, 0, 0];
      rows.forEach(r => {
        const v = Number(r.nota_prova);
        counts[(v >= mean ? 0 : 2) + (v >= cut ? 0 : 1)]++;
      });
      const labels = [
        'Acima/igual à média · ≥ 60%',
        'Acima/igual à média · < 60%',
        'Abaixo da média · ≥ 60%',
        'Abaixo da média · < 60%'
      ];
      resultArea.innerHTML =
        '<div class="v112-grid">' +
        counts
          .map(
            (v, i) =>
              '<div class="v112-quadrant v112-q' +
              i +
              '"><span>' +
              escV(labels[i]) +
              '</span><strong>' +
              v +
              '</strong><small>' +
              Math.round((v / rows.length) * 100) +
              '% dos alunos com nota</small></div>'
          )
          .join('') +
        '</div><p class="v112-note">Média da prova: ' +
        f(mean) +
        ' · Referência de 60%: ' +
        f(cut) +
        ' de ' +
        f(max) +
        ' · A igualdade com a média pertence ao grupo “acima/igual”. Classificação apenas analítica, não critério de aprovação.</p>';
    }
    const rbody = make(
      root,
      'v112-radar-class',
      'Gráfico em teia — turma',
      'Aproveitamento médio por questão, usando apenas questões publicadas com valor máximo.'
    );
    rbody.innerHTML = radar(getPoints(s, null));
    const mbody = make(
      root,
      'v112-radar-modalities',
      'Gráfico em teia — modalidades',
      'Aproveitamento médio da turma por modalidade: teórica discursiva, múltipla escolha, prática e demais instrumentos.'
    );
    mbody.innerHTML = radar(modalityPoints(s, null), BY_MODALITY);
    let host = byId('v112-history');
    if (!host) {
      host = document.createElement('section');
      host.id = 'v112-history';
      host.className = 'v113-history-control';
      root.append(host);
    }
    host.innerHTML = '<button type="button" class="btn v113-history-btn">◷ Histórico de operações</button>';
    const aid = currentAssessment?.id;
    host.querySelector('button').onclick = () => {
      if (!aid) return;
      const overlay = document.createElement('div');
      overlay.className = 'v113-history-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Histórico de operações');
      overlay.innerHTML =
        '<section class="v113-history-dialog"><div class="v113-history-top"><div><h3>Histórico de operações</h3><p>Salvamentos, publicações e configurações, seguidos de cada nota alterada e de cada versão publicada.</p></div><button type="button" class="btn v113-history-close">Fechar</button></div><div class="v113-history-content">Carregando...</div></section>';
      const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      };
      const onKey = e => {
        if (e.key === 'Escape') close();
      };
      overlay.querySelector('button').onclick = close;
      overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('button').focus();
      fetch('/api/assessment/' + encodeURIComponent(aid) + '/audit-history', {credentials: 'same-origin'})
        .then(r => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then(d => {
          if (!overlay.isConnected) return;
          overlay.querySelector('.v113-history-content').innerHTML = d.length
            ? '<div class="v112-history-list">' +
              d
                .map(
                  e =>
                    '<div><time>' +
                    escV(window.SupremaUI.when(e.created_at)) +
                    '</time><strong>' +
                    escV(
                      {
                        'SALVAR_RASCUNHO': 'Rascunho salvo',
                        'PUBLICAR_NOTAS': 'Resultados publicados',
                        'ENCERRAR_AVALIACAO': 'Edição encerrada',
                        'CONFIGURAR_QUESTAO': 'Configuração de questão alterada',
                        'CONFIGURAR_INSTRUMENTO': 'Valor máximo de instrumento alterado',
                        'ALTERAR_CABECALHOS': 'Cabeçalhos alterados',
                        'IMPORTAR_EXCEL': 'Notas importadas do Excel',
                        'ADMIN_BLOQUEIO_AVALIACAO': 'Edição bloqueada ou reaberta pelo administrador'
                      }[e.action] || e.action
                    ) +
                    '</strong><span>' +
                    escV(e.actor_name || 'Usuário não identificado') +
                    '</span></div>'
                )
                .join('') +
              '</div>'
            : 'Nenhuma operação registrada.';
          // Segunda parte: o que mudou em cada nota e o que foi publicado em cada versão.
          const grades = document.createElement('div');
          overlay.querySelector('.v113-history-content').append(grades);
          return fetch('/api/assessment/' + encodeURIComponent(aid) + '/score-history', {credentials: 'same-origin'})
            .then(r => {
              if (!r.ok) throw Error();
              return r.json();
            })
            .then(h => {
              if (overlay.isConnected) grades.innerHTML = window.SupremaUI.gradeHistory(h);
            })
            .catch(() => {
              if (overlay.isConnected) grades.textContent = 'Histórico de notas indisponível.';
            });
        })
        .catch(() => {
          if (overlay.isConnected)
            overlay.querySelector('.v113-history-content').textContent = 'Histórico indisponível.';
        });
    };
  }
  function renderStudentRadar() {
    const root = byId('individualTab'),
      s = typeof currentStats !== 'undefined' ? currentStats : null;
    if (!root || !s) return;
    const rows = s.rows || [],
      id = byId('studentSelect')?.value,
      student = rows.find(r => String(r.id) === String(id));
    const body = make(
      root,
      'v112-radar-individual',
      'Gráfico em teia — estudante x turma',
      'Comparação percentual do aproveitamento por questão publicada.'
    );
    body.innerHTML = student
      ? radar(getPoints(s, student))
      : '<div class="empty-inline">Selecione um estudante com resultado publicado.</div>';
    const modalities = make(
      root,
      'v112-radar-individual-modalities',
      'Gráfico em teia — estudante x turma por modalidade',
      'Teórica discursiva, múltipla escolha, prática e demais instrumentos com valor máximo declarado.'
    );
    modalities.innerHTML = student
      ? radar(modalityPoints(s, student), BY_MODALITY)
      : '<div class="empty-inline">Selecione um estudante com resultado publicado.</div>';
  }
  // Complementos das abas do professor, registrados em window.SupremaHooks (shared/ui.js).
  window.SupremaHooks.on('teacher.results', renderExtras);
  window.SupremaHooks.on('teacher.individual', renderStudentRadar);
})();
