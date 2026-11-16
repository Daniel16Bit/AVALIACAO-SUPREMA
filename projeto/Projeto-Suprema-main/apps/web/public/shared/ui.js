'use strict';
window.SupremaUI = {
  esc: v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]
    ),
  modal({title, body, button = 'Salvar', onSubmit}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'suprema-dialog';
    dialog.setAttribute('aria-label', title);
    const esc = window.SupremaUI.esc;
    dialog.innerHTML = `<form class="dialog-form"><div class="dialog-heading"><h2>${esc(title)}</h2><button type="button" class="dialog-close" aria-label="Fechar">×</button></div><div class="dialog-body">${body}</div><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="btn cancel">Cancelar</button><button type="submit" class="btn primary">${esc(button)}</button></div></form>`;
    document.body.append(dialog);
    dialog.querySelector('.dialog-close').onclick = () => dialog.close();
    dialog.querySelector('.cancel').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), {once: true});
    dialog.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const submit = dialog.querySelector('[type=submit]'),
        error = dialog.querySelector('.form-error');
      submit.disabled = true;
      error.hidden = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(e.target)), e.target);
        dialog.close();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    };
    dialog.showModal();
    return dialog;
  },
  // The server stores UTC ("2026-11-12 14:03:00"); people read local time.
  when(utc) {
    const date = new Date(String(utc ?? '').replace(' ', 'T') + 'Z');
    return Number.isNaN(date.getTime())
      ? String(utc ?? '')
      : date.toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
  },
  // Wide read-only window for long tables. `load` receives the content element.
  overlay({title, subtitle = '', load}) {
    const esc = window.SupremaUI.esc,
      overlay = document.createElement('div');
    overlay.className = 'v113-history-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `<section class="v113-history-dialog"><div class="v113-history-top"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><button type="button" class="btn v113-history-close">Fechar</button></div><div class="v113-history-content">Carregando...</div></section>`;
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
    const content = overlay.querySelector('.v113-history-content');
    Promise.resolve()
      .then(() => load(content))
      .catch(err => {
        if (overlay.isConnected) content.textContent = err?.message || 'Histórico indisponível.';
      });
    return overlay;
  },
  // Renders the answer of /score-history and /admin/assessments/:id/history.
  gradeHistory(data) {
    const {esc, when} = window.SupremaUI;
    const grade = v =>
      v === null || v === undefined
        ? '<span class="muted">vazio</span>'
        : esc(Number(v).toLocaleString('pt-BR', {maximumFractionDigits: 2}));
    const actions = {SALVAR_RASCUNHO: 'Lançamento', IMPORTAR_EXCEL: 'Importação do Excel'};
    const changes = data.changes || [],
      publications = data.publications || [];
    const changeRows = changes
      .map(
        c =>
          `<tr><td>${esc(when(c.created_at))}</td><td>${esc(c.student_name)}<small class="cell-sub">${esc(c.matricula)}</small></td><td>${esc(c.field_label)}</td><td>${grade(c.old_value)}</td><td><b>${grade(c.new_value)}</b></td><td>${esc(c.actor_name || 'Não identificado')}<small class="cell-sub">${esc(actions[c.action] || c.action)}</small></td></tr>`
      )
      .join('');
    const publicationBlocks = publications
      .map(p => {
        const title =
          p.source === 'MIGRACAO'
            ? 'Resultados que já estavam publicados quando o histórico começou'
            : `Publicação de ${when(p.created_at)} · ${p.actor_name || 'Não identificado'}`;
        return `<details class="import-details"><summary>${esc(title)} · ${p.students.length} aluno(s)</summary><div class="admin-scroll"><table class="detail-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Nota da prova</th><th>Nota final</th></tr></thead><tbody>${p.students.map(s => `<tr><td>${esc(s.student_name)}</td><td>${esc(s.matricula)}</td><td>${grade(s.nota_prova)}</td><td><b>${grade(s.nota_final)}</b></td></tr>`).join('')}</tbody></table></div></details>`;
      })
      .join('');
    return (
      `<h4>Alterações de notas</h4>` +
      (changes.length
        ? `<div class="admin-scroll"><table class="detail-table"><thead><tr><th>Quando</th><th>Aluno</th><th>Componente</th><th>De</th><th>Para</th><th>Quem</th></tr></thead><tbody>${changeRows}</tbody></table></div>${data.changes_truncated ? '<p class="muted">Exibindo as 1.000 alterações mais recentes.</p>' : ''}`
        : '<p class="muted">Nenhuma alteração de nota registrada desde que o histórico foi ativado.</p>') +
      `<h4>Versões publicadas</h4>` +
      (publications.length
        ? publicationBlocks +
          '<p class="muted">Cada publicação lista somente os alunos cujo resultado mudou nela. Versões anteriores não são apagadas.</p>'
        : '<p class="muted">Nenhuma publicação registrada.</p>')
    );
  }
};

// Aproveitamento por modalidade, a partir do que foi publicado. Um grupo só entra quando todos os
// componentes em uso nele têm valor máximo: sem denominador não existe percentual.
// "Prática" corresponde ao OSCE, o único instrumento prático registrado na A1/A2/A3.
// Devolve frações de 0 a 1; studentPct é null quando não há linha do estudante ou nota no grupo.
window.SupremaUI.modalities = function (stats, row) {
  const present = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const questions = prefix =>
    (stats?.questionStats || []).filter(q => q.used && String(q.field_key).startsWith(prefix));
  const instruments = keys => (stats?.instrumentStats || []).filter(i => i.used && keys.includes(i.field_key));
  const groups = [
    ['Teórica discursiva', questions('c')],
    ['Múltipla escolha', questions('me')],
    ['Prática (OSCE)', instruments(['osce'])],
    ['SAI', instruments(['pbl1', 'pbl2'])],
    ['Trabalho', instruments(['trabalho'])],
    ['Outros', instruments(['q7', 'q8', 'q9'])]
  ];
  const ratio = (items, value) => {
    const usable = items.filter(i => present(value(i)));
    return usable.length
      ? usable.reduce((s, i) => s + Number(value(i)), 0) / usable.reduce((s, i) => s + Number(i.max_value), 0)
      : null;
  };
  return groups
    .filter(([, items]) => items.length && items.every(i => Number(i.max_value) > 0))
    .map(([label, items]) => ({
      label,
      classPct: ratio(items, i => i.mean),
      studentPct: row ? ratio(items, i => row[i.field_key]) : null
    }));
};

// Utilitários de tela dos módulos novos (OSCE, Avaliação Docente): uma implementação só.
window.SupremaUI.toast = function (message, ms = 6000) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
};
// Executa uma ação de tela e mostra a recusa do servidor em vez de falhar em silêncio.
window.SupremaUI.guard =
  fn =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      window.SupremaUI.toast(err.message, 9000);
    }
  };
window.SupremaUI.panel = (title, body, description = '') =>
  `<section class="panel admin-panel"><div class="panel-title"><div><h3>${title}</h3>${description ? `<p>${description}</p>` : ''}</div></div>${body}</section>`;
window.SupremaUI.table = (head, rows, empty = '') =>
  `<div class="admin-scroll"><table class="admin-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td class="empty-inline" colspan="${head.length}">${empty}</td></tr>`}</tbody></table></div>`;

// Registro dos módulos por perfil. Cada módulo acrescenta os seus itens e o app monta o menu:
//  - CSTI, COORDENACAO, NUCLEO_AVALIACAO, OPERACIONAL e ADMIN: {label, glyph, start(container)};
//  - ALUNO: {boot(slot)}: desenha a própria entrada na barra lateral, dentro de `slot`.
// Um perfil pode receber itens de vários módulos, na ordem em que os arquivos são carregados.
window.SupremaModules = {
  items: {},
  add(role, item) {
    (this.items[role] = this.items[role] || []).push(item);
  },
  of(role) {
    return this.items[role] || [];
  }
};
// Complementos das telas de features/avaliacoes/app.js. Um arquivo que acrescenta algo a uma
// tela registra-se aqui, e o app chama os registrados no momento certo. Assim ninguém substitui
// funções do app, e a ordem dos <script> deixa de decidir o que aparece. Momentos:
//  - 'teacher.results'    depois de desenhar a aba Resultados do professor;
//  - 'teacher.individual' depois de desenhar a aba Individual do professor;
//  - 'student.boot'       antes de recarregar as avaliações do aluno;
//  - 'student.result'     depois de desenhar o resultado do aluno.
// Um complemento que falha não impede os outros; o primeiro erro é relançado no final.
window.SupremaHooks = {
  list: {},
  on(moment, fn) {
    (this.list[moment] = this.list[moment] || []).push(fn);
  },
  run(moment) {
    let failure = null;
    for (const fn of this.list[moment] || []) {
      try {
        fn();
      } catch (err) {
        failure = failure || err;
      }
    }
    if (failure) throw failure;
  }
};
// Na tela do aluno, alterna entre as notas e a tela de um módulo (#studentModuleView).
window.SupremaUI.studentView = show => {
  const view = document.getElementById('studentModuleView');
  view.classList.toggle('hidden', !show);
  document.getElementById('studentResultBody').classList.toggle('hidden', show);
  return view;
};
